/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_NAME = 'bookrr-offline-store';
const STORE_NAME = 'files';
const DIRECTORY_STORE_NAME = 'directories';
const DB_VERSION = 4;
const FILE_HANDLE_STORE = 'file_handles';

export interface OfflineFile {
  bookId: string;
  name: string;
  blob: Blob;
  savedAt: string;
  filePath?: string; // Point to physical device file path entered by user (e.g. ~/Downloads/book.epub)
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open offline storage database.'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
        db.createObjectStore(DIRECTORY_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILE_HANDLE_STORE)) {
        db.createObjectStore(FILE_HANDLE_STORE, { keyPath: 'bookId' });
      }
    };
  });
}

export async function saveOfflineFile(bookId: string, name: string, blob: Blob, filePath?: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const fileRecord: OfflineFile = {
      bookId,
      name,
      blob,
      savedAt: new Date().toISOString(),
      filePath: filePath || `Downloads/${name}`
    };

    const request = store.put(fileRecord);
    
    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to save file to local browser offline storage.'));
    };
  });
}

export async function updateOfflineFilePath(bookId: string, filePath: string): Promise<void> {
  const db = await getDB();
  const record = await getOfflineFile(bookId);
  if (!record) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const fileRecord: OfflineFile = {
      bookId,
      name: record.name,
      blob: record.blob,
      savedAt: new Date().toISOString(),
      filePath: filePath
    };

    const request = store.put(fileRecord);
    
    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to update offline file path.'));
    };
  });
}

export async function verifyFilePermission(
  handle: FileSystemFileHandle,
  readWrite: boolean = false,
  requestIfPrompt: boolean = false
): Promise<boolean> {
  try {
    const options: any = {
      mode: readWrite ? 'readwrite' : 'read'
    };
    const status = await (handle as any).queryPermission(options);
    if (status === 'granted') {
      return true;
    }
    if (requestIfPrompt) {
      const newStatus = await (handle as any).requestPermission(options);
      return newStatus === 'granted';
    }
    return false;
  } catch (e) {
    console.error('File permission verification failed', e);
    return false;
  }
}

export async function ensureFilePermission(bookId: string): Promise<boolean> {
  const handle = await getFileHandle(bookId);
  if (!handle) return true; // If no handle, might be in fallback blob store or missing. Allow proceed.
  return await verifyFilePermission(handle, false, true);
}

export async function getOfflineFile(bookId: string): Promise<OfflineFile | null> {
  const handle = await getFileHandle(bookId);
  if (handle) {
    try {
      const isGranted = await verifyFilePermission(handle, false, false); // Do not prompt here
      if (!isGranted) {
         console.warn(`File permission denied for ${bookId}`);
         throw new Error("Permission denied for file handle");
      }
      const file = await handle.getFile();
      return {
        bookId,
        name: file.name,
        blob: file as Blob,
        savedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.warn('Failed to read from filesystem handle, falling back to IndexedDB', e);
    }
  }

  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(bookId);

    request.onsuccess = () => {
      if (request.result) {
        const result = request.result as OfflineFile;
        // Skip tiny placeholder blobs (less than 100 bytes) that were incorrectly saved previously
        if (result.blob && result.blob.size < 100) {
          console.warn('Skipping placeholder blob from IndexedDB fallback.');
          resolve(null);
        } else {
          resolve(result);
        }
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to read file from local offline storage.'));
    };
  });
}

export async function getOfflineBooksMap(): Promise<{[bookId: string]: { name: string; filePath?: string }}> {
  const db = await getDB();
  const result: {[bookId: string]: { name: string; filePath?: string }} = {};

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, FILE_HANDLE_STORE], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        result[cursor.key as string] = {
          name: cursor.value.name,
          filePath: cursor.value.filePath || `Downloads/${cursor.value.name}`
        };
        cursor.continue();
      } else {
        // Now check FILE_HANDLE_STORE
        try {
          const handleStore = transaction.objectStore(FILE_HANDLE_STORE);
          const handleReq = handleStore.openCursor();
          handleReq.onsuccess = () => {
            const hCursor = handleReq.result;
            if (hCursor) {
               if (!result[hCursor.key as string]) {
                  result[hCursor.key as string] = {
                     name: (hCursor.value.handle as FileSystemFileHandle).name,
                     filePath: hCursor.value.filePath || `Local Desktop Mapped / ${(hCursor.value.handle as FileSystemFileHandle).name}`
                  };
               }
               hCursor.continue();
            } else {
               resolve(result);
            }
          };
          handleReq.onerror = () => resolve(result); // Don't fail if handle store issue
        } catch (e) {
          resolve(result);
        }
      }
    };

    request.onerror = () => {
      reject(new Error('Failed to list offline books.'));
    };
  });
}

export async function deleteOfflineFile(bookId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(bookId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to delete offline file.'));
    };
  });
}

export async function hasOfflineFile(bookId: string): Promise<boolean> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getKey(bookId);

    request.onsuccess = () => {
      resolve(request.result !== undefined);
    };

    request.onerror = () => {
      resolve(false);
    };
  });
}

export async function saveDirectoryHandle(id: 'watch' | 'watch_internal' | 'ebooks' | 'audiobooks', handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.put({ id, handle });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to save directory handle for ${id}`));
  });
}

export async function getDirectoryHandle(id: 'watch' | 'watch_internal' | 'ebooks' | 'audiobooks'): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DIRECTORY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(DIRECTORY_STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        resolve(request.result ? (request.result.handle as FileSystemDirectoryHandle) : null);
      };
      request.onerror = () => reject(new Error(`Failed to read directory handle for ${id}`));
    });
  } catch (e) {
    console.warn('Directories store not initialized or error reading:', e);
    return null;
  }
}

export async function deleteDirectoryHandle(id: 'watch' | 'watch_internal' | 'ebooks' | 'audiobooks'): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to delete directory handle for ${id}`));
  });
}

export async function verifyDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  readWrite: boolean,
  requestIfPrompt: boolean = false
): Promise<boolean> {
  try {
    const options: any = {
      mode: readWrite ? 'readwrite' : 'read'
    };
    const status = await (handle as any).queryPermission(options);
    if (status === 'granted') {
      return true;
    }
    if (requestIfPrompt) {
      const newStatus = await (handle as any).requestPermission(options);
      return newStatus === 'granted';
    }
    return false;
  } catch (e) {
    console.error('Permission verification failed', e);
    return false;
  }
}

export async function saveFileHandle(bookId: string, handle: FileSystemFileHandle, filePath?: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FILE_HANDLE_STORE, 'readwrite');
    const store = transaction.objectStore(FILE_HANDLE_STORE);
    const request = store.put({ bookId, handle, filePath });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to save file handle for ${bookId}`));
  });
}

export async function getFileHandle(bookId: string): Promise<FileSystemFileHandle | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FILE_HANDLE_STORE, 'readonly');
      const store = transaction.objectStore(FILE_HANDLE_STORE);
      const request = store.get(bookId);
      request.onsuccess = () => {
        resolve(request.result ? (request.result.handle as FileSystemFileHandle) : null);
      };
      request.onerror = () => reject(new Error(`Failed to read file handle for ${bookId}`));
    });
  } catch (e) {
    console.warn('File handle store not initialized or error reading:', e);
    return null;
  }
}

export async function saveOfflineChapterFile(
  bookId: string,
  chapterId: string,
  name: string,
  blob: Blob,
  filePath?: string
): Promise<void> {
  const compositeId = `${bookId}::ch::${chapterId}`;
  return saveOfflineFile(compositeId, name, blob, filePath);
}

export async function getOfflineChapterFile(
  bookId: string,
  chapterId: string
): Promise<OfflineFile | null> {
  const compositeId = `${bookId}::ch::${chapterId}`;
  return getOfflineFile(compositeId);
}

export async function hasOfflineChapterFile(
  bookId: string,
  chapterId: string
): Promise<boolean> {
  const compositeId = `${bookId}::ch::${chapterId}`;
  return hasOfflineFile(compositeId);
}
