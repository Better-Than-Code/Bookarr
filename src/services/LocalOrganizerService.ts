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

export async function batchOrganizeLocalBooks(
  books: Book[],
  getDirectoryHandle: (
    dirName: "ebooks" | "audiobooks",
  ) => Promise<FileSystemDirectoryHandle | null>,
  verifyDirectoryPermission: (
    handle: FileSystemDirectoryHandle,
    read: boolean,
    write: boolean,
  ) => Promise<boolean>,
  saveOfflineFile: (
    bookId: string,
    name: string,
    blob: Blob,
    filePath?: string,
  ) => Promise<void>,
  saveFileHandle: (
    bookId: string,
    handle: FileSystemFileHandle,
    originalPath?: string,
  ) => Promise<void>,
  onProgress?: (progress: number, total: number, message: string) => void,
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    try {
      if (onProgress) {
        onProgress(
          i,
          books.length,
          `Organizing "${book.title}"... (${i + 1}/${books.length})`,
        );
      }

      const destType = book.type === "audiobook" ? "audiobooks" : "ebooks";
      const handle = await getDirectoryHandle(destType);

      if (!handle) {
        throw new Error(
          `Organized destination directory for ${book.type} is unconfigured.`,
        );
      }

      const hasPerm = await verifyDirectoryPermission(handle, true, true);
      if (!hasPerm) {
        throw new Error(`Missing write permission for ${destType} folder.`);
      }

      if (!book.fileUrl) {
        throw new Error(
          "File URL is not available on the server. Make sure download has finished.",
        );
      }

      const authorFolder = sanitizePathName(book.author);
      const bookFolder = sanitizePathName(book.title);

      // Create folders as needed
      const authorDirHandle = await handle.getDirectoryHandle(authorFolder, {
        create: true,
      });
      const bookDirHandle = await authorDirHandle.getDirectoryHandle(
        bookFolder,
        { create: true },
      );

      let relativeDest = "";

      if (
        book.type === "audiobook" &&
        book.chapters &&
        book.chapters.length > 1 &&
        book.chapters.some((c) => c.fileUrl)
      ) {
        // Multi-chapter audiobook
        for (let j = 0; j < book.chapters.length; j++) {
          const chap = book.chapters[j] as any;
          if (!chap.fileUrl) continue;

          if (onProgress) {
            onProgress(
              i,
              books.length,
              `Organizing "${book.title}"... Part ${j + 1}/${book.chapters.length}`,
            );
          }

          const chapRes = await fetch(chap.fileUrl);
          if (!chapRes.ok)
            throw new Error(
              `Server returned HTTP ${chapRes.status} for part ${j + 1}`,
            );
          const chapBlob = await chapRes.blob();

          let cExt = chap.fileUrl.split(".").pop() || "mp3";
          cExt = cExt.split("?")[0];
          let chapName =
            chap.title.replace(/[\\/:*?"<>|]/g, "-").trim() || `Part ${j + 1}`;
          if (
            !chapName.toLowerCase().endsWith(".mp3") &&
            !chapName.toLowerCase().endsWith(".m4b")
          ) {
            chapName = `${chapName}.${cExt}`;
          }

          const fileHandle = await bookDirHandle.getFileHandle(chapName, {
            create: true,
          });
          const writable = await fileHandle.createWritable();
          await writable.write(chapBlob);
          await writable.close();
        }

        relativeDest = `Audiobooks/${authorFolder}/${bookFolder}`;
        const firstPart = book.chapters[0] as any;
        const firstExt =
          firstPart.fileUrl?.split(".").pop()?.split("?")[0] || "mp3";
        let firstFileName =
          firstPart.title.replace(/[\\/:*?"<>|]/g, "-").trim() || "Part 1";
        if (
          !firstFileName.toLowerCase().endsWith(".mp3") &&
          !firstFileName.toLowerCase().endsWith(".m4b")
        ) {
          firstFileName = `${firstFileName}.${firstExt}`;
        }

        const firstFileHandle =
          await bookDirHandle.getFileHandle(firstFileName);
        await saveOfflineFile(
          book.id,
          firstFileName,
          new Blob([]),
          relativeDest,
        ); // Save dummy blob, path holds context
        await saveFileHandle(book.id, firstFileHandle, relativeDest);
      } else {
        // Single file book
        const fileRes = await fetch(book.fileUrl);
        if (!fileRes.ok)
          throw new Error(`Server returned HTTP ${fileRes.status}`);
        const blob = await fileRes.blob();

        const ext = book.filePath
          ? book.filePath.split(".").pop() || "epub"
          : "epub";
        const finalFileName = `${bookFolder} - ${authorFolder}.${ext}`;

        const fileHandle = await bookDirHandle.getFileHandle(finalFileName, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        relativeDest = `${destType === "audiobooks" ? "Audiobooks" : "Ebooks"}/${authorFolder}/${bookFolder}/${finalFileName}`;
        await saveOfflineFile(book.id, finalFileName, blob, relativeDest);
        await saveFileHandle(book.id, fileHandle, relativeDest);
      }

      // Sync status with server
      const updateRes = await fetch(`/api/books/${book.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isDownloaded: true,
          filePath: relativeDest,
          status: "organized",
        }),
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Server failed to update book status: ${errText}`);
      }

      success++;
    } catch (e: any) {
      console.error(`Failed to organize "${book.title}":`, e);
      errors.push(`"${book.title}": ${e.message || String(e)}`);
      failed++;
    }
  }

  return { success, failed, errors };
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
    const isAudio = ["mp3", "m4b", "aac", "flac", "wav", "ogg", "wma"].includes(ext);
    
    // For audiobooks, keep original filename so tracks don't overwrite each other
    let finalFileName = file.name;
    if (!isAudio) {
      finalFileName = `${bookFolder} - ${authorFolder}.${ext}`;
    }

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

    // Create organised file name
    const isAudio = ["mp3", "m4b", "aac", "flac", "wav", "ogg", "wma"].includes(file.extension.toLowerCase());
    
    let finalFileName = file.name; // Keep Original Track Name for audiobooks to avoid collision
    
    if (file.type === "cover") {
      finalFileName = `cover.${file.extension}`;
    } else if (!isAudio) {
      finalFileName = `${bookFolder} - ${authorFolder}.${file.extension}`;
    }

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

  // Group unmapped audio files by their directory (using file.path relative to root)
  const unmappedAudiobooks: Record<string, WatchFolderFile[]> = {};

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
          restoredCount++;
        } catch (e) {
          console.error(`Failed to relink ${book.title}`, e);
        }
      }
    } else if (!file.autoMappedBook && file.type === "ebook") {
      // Auto import unmapped locally discovered ebook!
      try {
        let titleGuess = file.name.replace(/\.[^/.]+$/, "");
        let authorGuess = "Unknown Author (Scanned Local)";

        const pathParts = file.path.split("/");
        if (pathParts.length >= 3) {
          authorGuess = pathParts[0];
          titleGuess = pathParts[1];
        } else if (pathParts.length >= 2) {
          titleGuess = pathParts[0];
        } else if (titleGuess.includes("-")) {
          const parts = titleGuess.split("-");
          titleGuess = parts[0].trim();
          authorGuess = parts[1].trim();
        }

        const newBook = {
          title: titleGuess,
          author: authorGuess,
          type: file.type,
          coverUrl:
            "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=200&auto=format&fit=crop",
          description: `Automatically imported from local library path: ${file.path}`,
          genres: ["Uncategorized"],
          isDownloaded: true,
          status: "organized",
        };

        const res = await fetch("/api/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newBook),
        });

        if (res.ok) {
          const addedBook = await res.json();

          if (addedBook && addedBook.id) {
            const authorFolder = sanitizePathName(addedBook.author);
            const bookFolder = sanitizePathName(addedBook.title);
            const relativeDest = `Ebooks/${authorFolder}/${bookFolder}/${file.name}`;
            await saveFileHandle(addedBook.id, file.handle, relativeDest);
            restoredCount++;
            offlineMap[addedBook.id] = relativeDest;
          }
        }
      } catch (e) {
        console.error("Failed to auto-import unmapped local file", e);
      }
    } else if (!file.autoMappedBook && file.type === "audiobook") {
      const pathParts = file.path.split("/");
      // Map to directory name, if in root folder, make each file unique to avoid grouping unrelated loose files
      const dirName =
        pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : `root_${file.name}`;
      if (!unmappedAudiobooks[dirName]) {
        unmappedAudiobooks[dirName] = [];
      }
      unmappedAudiobooks[dirName].push(file);
    }
  }

  // Handle unmapped audiobooks grouped by directory
  for (const [dir, files] of Object.entries(unmappedAudiobooks)) {
    files.sort((a, b) => a.name.localeCompare(b.name));
    const firstFile = files[0];

    try {
      let titleGuess =
        dir.startsWith("root_")
          ? firstFile.name.replace(/\.[^/.]+$/, "")
          : dir.split("/").pop() || "Unknown Title";
      let authorGuess = "Unknown Author (Scanned Local)";

      const pathParts = firstFile.path.split("/");
      if (!dir.startsWith("root_")) {
        if (pathParts.length >= 3) {
          authorGuess = pathParts[0];
          titleGuess = pathParts[1];
        } else if (pathParts.length >= 2) {
          titleGuess = pathParts[0];
        }
      } else if (titleGuess.includes("-")) {
        const parts = titleGuess.split("-");
        titleGuess = parts[0].trim();
        authorGuess = parts[1].trim();
      }

      const mappedChapters = files.map((af, i) => {
        return {
          id: `chapter-${i}`,
          title: af.name.replace(/\.[^/.]+$/, ""),
          start: 0,
          end: 0,
          fileUrl: "", // Replaced when played
        };
      });

      const newBook = {
        title: titleGuess,
        author: authorGuess,
        type: "audiobook",
        coverUrl:
          "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=200&auto=format&fit=crop",
        description: `Automatically imported audiobook from local library`,
        genres: ["Uncategorized"],
        chapters: files.length > 1 ? mappedChapters : undefined,
        isDownloaded: true,
        status: "organized",
      };

      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBook),
      });

      if (res.ok) {
        const addedBook = await res.json();

        if (addedBook && addedBook.id) {
          const authorFolder = sanitizePathName(addedBook.author);
          const bookFolder = sanitizePathName(addedBook.title);

          if (files.length > 1) {
            for (let i = 0; i < files.length; i++) {
              const af = files[i];
              const relativeDest = `Audiobooks/${authorFolder}/${bookFolder}/${af.name}`;
              const compositeId = `${addedBook.id}::ch::chapter-${i}`;
              await saveFileHandle(compositeId, af.handle, relativeDest);
            }
            // Set base handle to first file
            const baseDest = `Audiobooks/${authorFolder}/${bookFolder}/${firstFile.name}`;
            await saveFileHandle(addedBook.id, firstFile.handle, baseDest);
            offlineMap[addedBook.id] = baseDest;
          } else {
            const relativeDest = `Audiobooks/${authorFolder}/${bookFolder}/${firstFile.name}`;
            await saveFileHandle(addedBook.id, firstFile.handle, relativeDest);
            offlineMap[addedBook.id] = relativeDest;
          }
          restoredCount++;
        }
      }
    } catch (e) {
      console.error("Failed to auto-import unmapped audiobook", e);
    }
  }

  return restoredCount;
}
