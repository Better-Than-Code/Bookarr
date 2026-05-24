/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book, TorrentTask } from '../types';

export interface WatchFolderFile {
  name: string;
  path: string; // Relative path matching the folders inside watch directory
  handle: FileSystemFileHandle;
  size: number;
  extension: string;
  type: 'ebook' | 'audiobook' | 'other';
  autoMappedBook?: Book;
  manualMappedBook?: Book;
}

// Ensure folder names don't contain illegal characters for Windows/macOS/Linux filesystems
export function sanitizePathName(name: string): string {
  if (!name) return 'Unknown';
  return name
    .replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters with hyphens
    .trim()
    .replace(/\s+/g, ' '); // Clean redundant spacing
}

// Deeply scan folder for eBook and audio tracks up to 3 levels deep
export async function scanWatchFolder(
  dirHandle: FileSystemDirectoryHandle,
  relativePrefix = '',
  fileList: WatchFolderFile[] = []
): Promise<WatchFolderFile[]> {
  for await (const entry of (dirHandle as any).values()) {
    const entryPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    
    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle;
      let size = 0;
      try {
        const file = await fileHandle.getFile();
        size = file.size;
      } catch (e) {
        console.warn('Unable to get file size for', entry.name, e);
      }

      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      
      const isAudio = ['mp3', 'm4b', 'aac', 'flac', 'wav', 'ogg', 'm4a'].includes(ext);
      const isEbook = ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'djvu'].includes(ext);

      if (isAudio || isEbook) {
        fileList.push({
          name: entry.name,
          path: entryPath,
          handle: fileHandle,
          size,
          extension: ext,
          type: isAudio ? 'audiobook' : 'ebook'
        });
      }
    } else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      // Prevent infinite loops / overly deep traversal (e.g. maximum 3 levels)
      if (entryPath.split('/').length <= 3) {
        await scanWatchFolder(subDirHandle, entryPath, fileList);
      }
    }
  }
  return fileList;
}

// Auto map helper
export function autoMapFiles(files: WatchFolderFile[], books: Book[]): WatchFolderFile[] {
  return files.map(file => {
    const cleanFileName = file.name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    let bestMatch: Book | undefined = undefined;
    let bestScore = 0;

    for (const book of books) {
      if (book.type !== file.type) continue; // Must match type

      const cleanTitle = book.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');
      const cleanAuthor = book.author.toLowerCase().replace(/[^a-z0-9]/g, ' ');

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
      autoMappedBook: bestMatch
    };
  });
}

// Traverse subfolder handles in order to delete a file inside nested structures
async function removeFromWatchFolder(watchDir: FileSystemDirectoryHandle, relativePath: string): Promise<void> {
  const parts = relativePath.split('/');
  let currentDir = watchDir;
  
  // Go through directories up to the parent directory of tomorrow's target file
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i]);
  }
  
  const fileName = parts[parts.length - 1];
  await currentDir.removeEntry(fileName);
  
  // Optional: Clean up parent folders recursively if they become empty
  try {
    let parentPathParts = parts.slice(0, -1);
    while (parentPathParts.length > 0) {
      let runDir = watchDir;
      for (let i = 0; i < parentPathParts.length - 1; i++) {
        runDir = await runDir.getDirectoryHandle(parentPathParts[i]);
      }
      const topDirName = parentPathParts[parentPathParts.length - 1];
      const checkDirObj = await runDir.getDirectoryHandle(topDirName);
      
      // Look if folder is empty
      let isEmpty = true;
      for await (const entry of (checkDirObj as any).values()) {
        isEmpty = false;
        break;
      }
      
      if (isEmpty) {
        await runDir.removeEntry(topDirName, { recursive: true });
        parentPathParts.pop();
      } else {
        break;
      }
    }
  } catch (e) {
    console.log('Skipping recursive parent folder cleanup after moving file:', e);
  }
}

export interface OrganizationResult {
  success: boolean;
  message: string;
  destinationPath: string;
  fileObj?: File;
}

// Organize separate file: create nested folders, copy, verify, then delete origin
export async function organizeSingleFile(
  file: WatchFolderFile,
  watchDir: FileSystemDirectoryHandle,
  destDir: FileSystemDirectoryHandle,
  book: Book
): Promise<OrganizationResult> {
  try {
    const authorFolder = sanitizePathName(book.author);
    const bookFolder = sanitizePathName(book.title);
    
    // Create organised file name: "Title - Author.ext"
    const finalFileName = `${bookFolder} - ${authorFolder}.${file.extension}`;

    // 1. Traverse and create structure (Author folder -> Book folder)
    const authorHandle = await destDir.getDirectoryHandle(authorFolder, { create: true });
    const bookHandle = await authorHandle.getDirectoryHandle(bookFolder, { create: true });

    // 2. Open source file stream
    const fileObj = await file.handle.getFile();

    // 3. Create destination file and stream payload
    const destFileHandle = await bookHandle.getFileHandle(finalFileName, { create: true });
    const writable = await destFileHandle.createWritable();
    await writable.write(fileObj);
    await writable.close();

    // Verify copy size
    const writtenFile = await destFileHandle.getFile();
    if (writtenFile.size !== fileObj.size) {
      throw new Error(`Integrity size check failed: expected ${fileObj.size} bytes, wrote ${writtenFile.size} bytes.`);
    }

    // 4. Safely delete from the watch folder
    await removeFromWatchFolder(watchDir, file.path);

    const relativeDest = `${book.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'}/${authorFolder}/${bookFolder}/${finalFileName}`;

    return {
      success: true,
      message: `Organized "${file.name}" to organized library under: "${authorFolder} / ${bookFolder}"`,
      destinationPath: relativeDest,
      fileObj: fileObj
    };
  } catch (e: any) {
    console.error('File organization failure:', e);
    return {
      success: false,
      message: `Failed to organize "${file.name}": ${e.message || String(e)}`,
      destinationPath: ''
    };
  }
}
