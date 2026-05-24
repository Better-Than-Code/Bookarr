/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_NAME = 'bookrr-offline-store';
const STORE_NAME = 'files';
const DIRECTORY_STORE_NAME = 'directories';
const DB_VERSION = 2;

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

export async function getOfflineFile(bookId: string): Promise<OfflineFile | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(bookId);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result as OfflineFile);
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
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const result: {[bookId: string]: { name: string; filePath?: string }} = {};

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        result[cursor.key as string] = {
          name: cursor.value.name,
          filePath: cursor.value.filePath || `Downloads/${cursor.value.name}`
        };
        cursor.continue();
      } else {
        resolve(result);
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

export async function saveDirectoryHandle(id: 'watch' | 'ebooks' | 'audiobooks', handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIRECTORY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DIRECTORY_STORE_NAME);
    const request = store.put({ id, handle });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error(`Failed to save directory handle for ${id}`));
  });
}

export async function getDirectoryHandle(id: 'watch' | 'ebooks' | 'audiobooks'): Promise<FileSystemDirectoryHandle | null> {
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

export async function deleteDirectoryHandle(id: 'watch' | 'ebooks' | 'audiobooks'): Promise<void> {
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
