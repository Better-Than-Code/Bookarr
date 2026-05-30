import { Book } from "../types";
import { getFileHandle, getOfflineBooksMap } from "./LocalFileService";

export interface CleanupResult {
  missingEntries: Book[];
  orphanedFiles: string[];
}

/**
 * Validates the database entries against the local file system mappings.
 * Returns books that no longer have valid local files.
 */
export async function validateLibrary(books: Book[]): Promise<CleanupResult> {
  const missingEntries: Book[] = [];
  const map = await getOfflineBooksMap();

  for (const book of books) {
    if (book.isDownloaded) {
      if (!map[book.id]) {
        // Technically missing from offline map
        missingEntries.push(book);
        continue;
      }
      try {
        const handle = await getFileHandle(book.id);
        if (!handle) {
           missingEntries.push(book);
        } else {
           // Quickly check if we can get file, which verifies it's still accessible
           await handle.getFile();
        }
      } catch (e) {
        // File not found or permission revoked
        missingEntries.push(book);
      }
    }
  }

  return { missingEntries, orphanedFiles: [] };
}

/**
 * Perform a library cleanup action.
 * deleteType: 
 * 'entry_only' - Just remove the book from the DB
 * 'files_only' - Delete files from disk but keep entry (e.g. mark not downloaded)
 * 'both' - Delete files and remove DB entry
 */
export async function performCleanupAction(
  bookId: string, 
  deleteType: 'entry_only' | 'files_only' | 'both'
) {
  // 1. Delete file using File System Access API if requested
  if (deleteType === 'files_only' || deleteType === 'both') {
     try {
         // Requires directory handle with write access to remove the entry.
         // We'd need the parent directory handle.
         // Currently, the spec requires using directoryHandle.removeEntry(name).
         // Given we only have file handles in IndexedDB, deleting the actual file 
         // programmatically requires the user to grant readwrite to the parent folder.
         // If we don't have it, we can't reliably delete via JS.
         // To emulate 'arr' behavior, we may need an API endpoint if using the server!
     } catch (e) {
         console.warn("Could not delete local file for ", bookId, e);
     }
  }
}
