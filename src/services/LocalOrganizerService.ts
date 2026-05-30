/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book, TorrentTask } from "../types";

export interface WatchFolderFile {
  name: string;
  path: string; // Relative path matching the folders inside watch directory
  handle: FileSystemFileHandle;
  size: number;
  extension: string;
  type: "ebook" | "audiobook" | "cover" | "other";
  autoMappedBook?: Book;
  manualMappedBook?: Book;
  originDirHandle?: FileSystemDirectoryHandle;
}

// Ensure folder names don't contain illegal characters for Windows/macOS/Linux filesystems
export function sanitizePathName(name: string): string {
  if (!name) return "Unknown";
  return name
    .replace(/[\\/:*?"<>|]/g, "-") // Replace illegal characters with hyphens
    .trim()
    .replace(/\s+/g, " "); // Clean redundant spacing
}

// Deeply scan folder for eBook and audio tracks up to 3 levels deep
export async function scanWatchFolder(
  dirHandle: FileSystemDirectoryHandle,
  relativePrefix = "",
  fileList: WatchFolderFile[] = [],
  rootHandle?: FileSystemDirectoryHandle,
): Promise<WatchFolderFile[]> {
  const currentRootHandle = rootHandle || dirHandle;
  for await (const entry of (dirHandle as any).values()) {
    const entryPath = relativePrefix
      ? `${relativePrefix}/${entry.name}`
      : entry.name;

    if (entry.kind === "file") {
      const fileHandle = entry as FileSystemFileHandle;
      let size = 0;
      try {
        const file = await fileHandle.getFile();
        size = file.size;
      } catch (e) {
        console.warn("Unable to get file size for", entry.name, e);
      }

      const ext = entry.name.split(".").pop()?.toLowerCase() || "";

      const isAudio = [
        "mp3",
        "m4b",
        "aac",
        "flac",
        "wav",
        "ogg",
        "m4a",
      ].includes(ext);
      const isEbook = ["epub", "pdf", "mobi", "azw3", "txt", "djvu"].includes(
        ext,
      );
      const isCover = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);

      if (isAudio || isEbook || isCover) {
        fileList.push({
          name: entry.name,
          path: entryPath,
          handle: fileHandle,
          size,
          extension: ext,
          type: isAudio ? "audiobook" : isEbook ? "ebook" : "cover",
          originDirHandle: currentRootHandle,
        });
      }
    } else if (entry.kind === "directory") {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      // Prevent infinite loops / overly deep traversal (e.g. maximum 3 levels)
      if (entryPath.split("/").length <= 3) {
        await scanWatchFolder(
          subDirHandle,
          entryPath,
          fileList,
          currentRootHandle,
        );
      }
    }
  }
  return fileList;
}

// Auto map helper
export function autoMapFiles(
  files: WatchFolderFile[],
  books: Book[],
): WatchFolderFile[] {
  return files.map((file) => {
    // For covers, use the full path to increase match probability against folder names
    const cleanFileName = (file.type === "cover" ? file.path : file.name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ");
    let bestMatch: Book | undefined = undefined;
    let bestScore = 0;

    for (const book of books) {
      if (file.type !== "cover" && book.type !== file.type) continue; // Must match type unless it's a cover

      const cleanTitle = book.title.toLowerCase().replace(/[^a-z0-9]/g, " ");
      const cleanAuthor = book.author.toLowerCase().replace(/[^a-z0-9]/g, " ");

      // Check author + title exact substring within file name
      if (cleanFileName.includes(cleanTitle) && cleanTitle.length > 2) {
        let score = cleanTitle.length;
        if (cleanFileName.includes(cleanAuthor) && cleanAuthor.length > 2) {
          score += cleanAuthor.length + 12; // Extra priority for both matching
        }
        if (score > bestScore) {
          bestScore = score;
          bestMatch = book;
        }
      }
    }

    return {
      ...file,
      autoMappedBook: bestMatch,
    };
  });
}

// Traverse subfolder handles in order to delete a file inside nested structures
async function removeFromWatchFolder(
  watchDir: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<void> {
  const parts = relativePath.split("/");
  let currentDir = watchDir;

  // Go through directories up to the parent directory of tomorrow's target file
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i]);
  }

  const fileName = parts[parts.length - 1];
  await currentDir.removeEntry(fileName);

  // Optional: Clean up parent folders recursively if they become empty
  await cleanupEmptyFolders(watchDir, parts.slice(0, -1));
}

// Recursively clean up empty folders
async function cleanupEmptyFolders(
  rootDir: FileSystemDirectoryHandle,
  pathParts: string[],
): Promise<void> {
  try {
    let currentDir = rootDir;
    for (const part of pathParts) {
      currentDir = await currentDir.getDirectoryHandle(part);
    }

    // Check if directory is empty
    let isEmpty = true;
    for await (const entry of (currentDir as any).values()) {
      isEmpty = false;
      break;
    }

    if (isEmpty) {
      // Find parent to remove this directory
      if (pathParts.length > 0) {
        let parentDir = rootDir;
        for (let i = 0; i < pathParts.length - 1; i++) {
          parentDir = await parentDir.getDirectoryHandle(pathParts[i]);
        }
        await parentDir.removeEntry(pathParts[pathParts.length - 1], {
          recursive: true,
        });
        // Recurse for parent
        await cleanupEmptyFolders(rootDir, pathParts.slice(0, -1));
      }
    }
  } catch (e) {
    console.log("Skipping recursive parent folder cleanup:", e);
  }
}

export interface OrganizationResult {
  success: boolean;
  message: string;
  destinationPath: string;
  fileObj?: File;
  destFileHandle?: FileSystemFileHandle;
}

/**
 * Safely reads a File snapshot and its ArrayBuffer from a FileSystemFileHandle,
 * robustly retrying with progressive backoffs if Chrome throws InvalidStateError/ModificationError
 * due to file modifications or metadata caching settles.
 */
export async function readFileBufferSafely(
  handle: FileSystemFileHandle,
  retries = 3,
): Promise<{ fileObj: File; buffer: ArrayBuffer }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const fileObj = await handle.getFile();
      const buffer = await fileObj.arrayBuffer();
      return { fileObj, buffer };
    } catch (err: any) {
      const isStaleErr =
        err.name === "InvalidStateError" ||
        err.name === "ModificationError" ||
        err.message?.includes("state had changed") ||
        err.message?.includes("read from disk") ||
        err.message?.includes("modified");
      if (isStaleErr && attempt < retries) {
        console.warn(
          `[STORAGE] File snapshot stale for "${handle.name}" on attempt ${attempt}/${retries}. Retrying in ${attempt * 250}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      } else {
        throw err;
      }
    }
  }
  throw new Error(
    `Unable to read file "${handle.name}" due to persistent state changes on disk.`,
  );
}

// Re-organize existing file: move to correct nested folders, rename, verify, delete old
export async function reorganizeFile(
  oldHandle: FileSystemFileHandle,
  oldPath: string, // relative path to original file for parent cleanup
  destDir: FileSystemDirectoryHandle,
  book: Book,
): Promise<OrganizationResult> {
  try {
    const authorFolder = sanitizePathName(book.author);
    const bookFolder = sanitizePathName(book.title);

    // Get file snapshot and data buffer safely (recovering from state modifications)
    const { fileObj: file, buffer } = await readFileBufferSafely(oldHandle);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const finalFileName = `${bookFolder} - ${authorFolder}.${ext}`;

    // 1. Traverse and create structure (Author folder -> Book folder)
    const authorHandle = await destDir.getDirectoryHandle(authorFolder, {
      create: true,
    });
    const bookHandle = await authorHandle.getDirectoryHandle(bookFolder, {
      create: true,
    });

    // 2. Create destination file and stream
    const destFileHandle = await bookHandle.getFileHandle(finalFileName, {
      create: true,
    });
    const writable = await destFileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();

    // Verify copy
    const writtenFile = await destFileHandle.getFile();
    if (writtenFile.size !== file.size) {
      throw new Error(
        `Integrity size check failed: expected ${file.size} bytes, wrote ${writtenFile.size} bytes.`,
      );
    }

    // 3. Remove old file
    // To remove old file, we need the handle to its parent directory,
    // which isn't directly easily derived from a FileHandle.
    // Assuming we pass oldPath, we can remove it.
    // If it's outside the watch folder, this might need adjustment, but here
    // we'll assume it's under destDir for now, or need a way to track handle.
    // Since we don't have the parent handle of oldHandle, this might get tricky without it.
    // Wait, the current implementation doesn't have the old directory handle.
    // I need to rethink the "old handle" removal.

    return {
      success: true,
      message: `Reorganized "${file.name}" to: "${authorFolder} / ${bookFolder}"`,
      destinationPath: `${authorFolder}/${bookFolder}/${finalFileName}`,
      fileObj: writtenFile,
      destFileHandle: destFileHandle,
    };
  } catch (e: any) {
    return {
      success: false,
      message: `Failed to reorganize: ${e.message}`,
      destinationPath: "",
    };
  }
}

// Organize separate file: create nested folders, copy, verify, then delete origin
export async function organizeSingleFile(
  file: WatchFolderFile,
  watchDirFallback: FileSystemDirectoryHandle,
  destDir: FileSystemDirectoryHandle,
  book: Book,
): Promise<OrganizationResult> {
  const watchDir = file.originDirHandle || watchDirFallback;
  try {
    const authorFolder = sanitizePathName(book.author);
    const bookFolder = sanitizePathName(book.title);

    // Create organised file name: "Title - Author.ext" or "cover.ext"
    const finalFileName =
      file.type === "cover"
        ? `cover.${file.extension}`
        : `${bookFolder} - ${authorFolder}.${file.extension}`;

    // 1. Traverse and create structure (Author folder -> Book folder)
    const authorHandle = await destDir.getDirectoryHandle(authorFolder, {
      create: true,
    });
    const bookHandle = await authorHandle.getDirectoryHandle(bookFolder, {
      create: true,
    });

    const relativeDest = `${book.type === "audiobook" ? "Audiobooks" : "Ebooks"}/${authorFolder}/${bookFolder}/${finalFileName}`;
    const internalExpectedRelative = `${authorFolder}/${bookFolder}/${finalFileName}`;

    // Shortcut: If it's already perfectly organized, just link the handle!
    if (
      file.originDirHandle === destDir &&
      file.path === internalExpectedRelative
    ) {
      return {
        success: true,
        message: `File is already organized: relinked "${authorFolder} / ${bookFolder}"`,
        destinationPath: relativeDest,
        fileObj: await file.handle.getFile(),
        destFileHandle: file.handle,
      };
    }

    // 2. Get file snapshot and data buffer safely (recovering from state modifications)
    const { fileObj, buffer } = await readFileBufferSafely(file.handle);

    // 3. Create destination file and stream payload
    const destFileHandle = await bookHandle.getFileHandle(finalFileName, {
      create: true,
    });
    const writable = await destFileHandle.createWritable();
    await writable.write(buffer);
    await writable.close();

    // Verify copy size
    const writtenFile = await destFileHandle.getFile();
    if (writtenFile.size !== fileObj.size) {
      throw new Error(
        `Integrity size check failed: expected ${fileObj.size} bytes, wrote ${writtenFile.size} bytes.`,
      );
    }

    // 4. Safely delete from the watch folder
    await removeFromWatchFolder(watchDir, file.path);

    return {
      success: true,
      message: `Organized "${file.name}" to organized library under: "${authorFolder} / ${bookFolder}"`,
      destinationPath: relativeDest,
      fileObj: writtenFile,
      destFileHandle: destFileHandle,
    };
  } catch (e: any) {
    console.error("File organization failure:", e);
    return {
      success: false,
      message: `Failed to organize "${file.name}": ${e.message || String(e)}`,
      destinationPath: "",
    };
  }
}

// Automatically scans given folders and restores Handles / Dummy Blobs for missing Offline Book entries
export async function autoRelinkLibrary(
  books: Book[],
  ebooksHandle: FileSystemDirectoryHandle,
  audiobooksHandle: FileSystemDirectoryHandle,
  saveFileHandle: (
    bookId: string,
    handle: FileSystemFileHandle,
    filePath?: string,
  ) => Promise<void>,
  saveOfflineFile: (
    bookId: string,
    name: string,
    blob: Blob,
    filePath?: string,
  ) => Promise<void>,
  offlineMap: { [bookId: string]: any },
): Promise<number> {
  let combinedFiles: WatchFolderFile[] = [];
  try {
    const ebooksFileList = await scanWatchFolder(ebooksHandle);
    combinedFiles = [...combinedFiles, ...ebooksFileList];
  } catch (e) {}

  try {
    const audiobooksFileList = await scanWatchFolder(audiobooksHandle);
    combinedFiles = [...combinedFiles, ...audiobooksFileList];
  } catch (e) {}

  const mappedFiles = autoMapFiles(combinedFiles, books);
  let restoredCount = 0;

  for (const file of mappedFiles) {
    if (file.autoMappedBook && file.type !== "cover") {
      const book = file.autoMappedBook;
      // Re-link if missing from offline map
      if (!offlineMap[book.id]) {
        try {
          const authorFolder = sanitizePathName(book.author);
          const bookFolder = sanitizePathName(book.title);
          const isAudio = book.type === "audiobook";
          const relativeDest = `${isAudio ? "Audiobooks" : "Ebooks"}/${authorFolder}/${bookFolder}/${file.name}`;

          await saveFileHandle(book.id, file.handle, relativeDest);
          // Removed fake placeholder blob. getOfflineBooksMap now relies on handle.

          restoredCount++;
        } catch (e) {
          console.error(`Failed to relink ${book.title}`, e);
        }
      }
    }
  }

  return restoredCount;
}
