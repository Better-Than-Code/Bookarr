/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import LibraryDashboard from './components/LibraryDashboard';
import IndexerSearch from './components/IndexerSearch';
import WebtorDownloads from './components/WebtorDownloads';
import BookrrSettings from './components/BookrrSettings';
import AudiobookPlayer from './components/AudiobookPlayer';
import EbookReader from './components/EbookReader';
import ReadAloudMiniPlayer from './components/ReadAloudMiniPlayer';
import { Book, TorrentTask, TorrentSearchResult, IndexerSettings, BookrrConfig, MessageLog, AudiobookChapter } from './types';

import { 
  getOfflineBooksMap, 
  saveOfflineFile, 
  getDirectoryHandle, 
  verifyDirectoryPermission, 
  updateOfflineFilePath,
  saveOfflineChapterFile,
  hasOfflineChapterFile,
  getOfflineFile,
  OfflineFile,
  saveFileHandle
} from './services/LocalFileService';
import { sanitizePathName, autoRelinkLibrary } from './services/LocalOrganizerService';

export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [torrentTasks, setTorrentTasks] = useState<TorrentTask[]>([]);
  const [bookrrConfig, setBookrrConfig] = useState<BookrrConfig>({
    webtorEnabled: true,
    localDownloadPath: '/data/downloads/bookrr'
  });
  const [indexers, setIndexers] = useState<IndexerSettings[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);

  // Page active tabs
  const [activeTab, setActiveTab] = useState<string>('library');

  // Media Player Active Overlays
  const [activeAudiobook, setActiveAudiobook] = useState<Book | null>(null);
  const [activeEbook, setActiveEbook] = useState<Book | null>(null);

  // Library scanning indicator
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Query transfer states
  const [searchState, setSearchState] = useState<{
    query: string;
    type: 'ebook' | 'audiobook';
    results: TorrentSearchResult[];
    searchedOnce: boolean;
  }>({
    query: '',
    type: 'ebook',
    results: [],
    searchedOnce: false
  });

  // Local state for checking offline files in IndexedDB
  const [offlineBooksMap, setOfflineBooksMap] = useState<{[bookId: string]: { name: string, filePath?: string }}>({});
  const [syncingBookIds, setSyncingBookIds] = useState<{[bookId: string]: boolean}>({});
  const syncInProgressRef = React.useRef<{[bookId: string]: boolean}>({});

  const refreshOfflineBooks = async () => {
    try {
      const map = await getOfflineBooksMap();
      setOfflineBooksMap(map);

      if (books.length > 0) {
        const ebooksHandle = await getDirectoryHandle('ebooks');
        const audiobooksHandle = await getDirectoryHandle('audiobooks');
        
        let hasEbookPerms = false;
        let hasAudioPerms = false;
        
        if (ebooksHandle) hasEbookPerms = await verifyDirectoryPermission(ebooksHandle, true, false);
        if (audiobooksHandle) hasAudioPerms = await verifyDirectoryPermission(audiobooksHandle, true, false);
        
        if (hasEbookPerms && hasAudioPerms) {
           const restored = await autoRelinkLibrary(books, ebooksHandle!, audiobooksHandle!, saveFileHandle, saveOfflineFile, map);
           if (restored > 0) {
               console.log(`[AUTO-LINK] Automatically restored ${restored} missing directory file handles.`);
               const newMap = await getOfflineBooksMap();
               setOfflineBooksMap(newMap);
           }
        }
      }
    } catch (e) {
      console.error('Failed to load local offline map in background', e);
    }
  };

  useEffect(() => {
    refreshOfflineBooks();
  }, [books]);

  // Background Auto-Sync of Server Staged Files to Client IndexedDB
  useEffect(() => {
    const doAutoSync = async () => {
      const verifyAndCorrectBookLocation = async (book: Book, offlineFile: OfflineFile) => {
        try {
          const isAudio = book.type === 'audiobook';
          const destId = isAudio ? 'audiobooks' : 'ebooks';
          const destPrefix = isAudio ? 'Audiobooks' : 'Ebooks';
          const destHandle = await getDirectoryHandle(destId);
          let useOrganized = false;

          if (destHandle) {
            const hasPerm = await verifyDirectoryPermission(destHandle, true, false);
            if (hasPerm) {
              useOrganized = true;
            }
          }

          if (useOrganized && destHandle) {
            const authorFolder = sanitizePathName(book.author);
            const bookFolder = sanitizePathName(book.title);
            
            const authorDirHandle = await destHandle.getDirectoryHandle(authorFolder, { create: true });
            const bookDirHandle = await authorDirHandle.getDirectoryHandle(bookFolder, { create: true });

            const extParts = book.fileUrl?.split('.');
            let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
            if (!ext) ext = isAudio ? 'mp3' : 'epub';
            const extClean = decodeURIComponent(ext).toLowerCase().split('?')[0];
            const finalFileName = `${bookFolder} - ${authorFolder}.${extClean}`;

            try {
              const existingFileHandle = await bookDirHandle.getFileHandle(finalFileName); 
              const newPath = `${destPrefix}/${authorFolder}/${bookFolder}/${finalFileName}`;
              if (offlineFile.filePath !== newPath) {
                 await updateOfflineFilePath(book.id, newPath);
                 await saveFileHandle(book.id, existingFileHandle, newPath);
                 console.log(`[AUTO-SYNC] Corrected discrepancy in file path for ${book.title}: ${newPath}`);
              }
            } catch (e) {
              const fileHandle = await bookDirHandle.getFileHandle(finalFileName, { create: true });
              const writable = await fileHandle.createWritable();
              const arrayBuffer = await offlineFile.blob.arrayBuffer();
              await writable.write(arrayBuffer);
              await writable.close();
              
              const newPath = `${destPrefix}/${authorFolder}/${bookFolder}/${finalFileName}`;
              await updateOfflineFilePath(book.id, newPath);
              await saveFileHandle(book.id, fileHandle, newPath);
              console.log(`[AUTO-SYNC] Successfully re-organized file for ${book.title}: ${newPath}`);
            }
          } else {
            // Legacy watch folder fallback
            let watchHandle = await getDirectoryHandle('watch');
            if (!watchHandle) {
              watchHandle = await getDirectoryHandle('watch_internal');
            }
            if (watchHandle) {
              const hasPerm = await verifyDirectoryPermission(watchHandle, true, false);
              if (hasPerm) {
                const extParts = book.fileUrl?.split('.');
                let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
                if (!ext) ext = isAudio ? 'mp3' : 'epub';
                const safeTitle = book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const deviceFileName = `${safeTitle}.${ext}`;

                try {
                  const existingHandle = await watchHandle.getFileHandle(deviceFileName); 
                  const newPath = `${watchHandle.name}/${deviceFileName}`;
                  if (offlineFile.filePath !== newPath) {
                     await updateOfflineFilePath(book.id, newPath);
                     await saveFileHandle(book.id, existingHandle, newPath);
                     console.log(`[AUTO-SYNC] Corrected discrepancy in file path for ${book.title} (watch fallback): ${newPath}`);
                  }
                } catch (e) {
                  const fileHandle = await watchHandle.getFileHandle(deviceFileName, { create: true });
                  const writable = await fileHandle.createWritable();
                  const arrayBuffer = await offlineFile.blob.arrayBuffer();
                  await writable.write(arrayBuffer);
                  await writable.close();
                  
                  const newPath = `${watchHandle.name}/${deviceFileName}`;
                  await updateOfflineFilePath(book.id, newPath);
                  await saveFileHandle(book.id, fileHandle, newPath);
                  console.log(`[AUTO-SYNC] Successfully re-organized file for ${book.title} (watch fallback): ${newPath}`);
                }
              }
            }
          }
        } catch (error) {
          console.warn('[AUTO-SYNC] Native folder organization verification skipped', error);
        }
      };

      for (const book of books) {
        // VERIFY DISCREPANCY IF ALREADY EXISTS
        if (offlineBooksMap[book.id]) {
            const offlineFile = await getOfflineFile(book.id);
            if (offlineFile) await verifyAndCorrectBookLocation(book, offlineFile);
            continue;
        }

        // Must have fileUrl, must be downloaded on server, must not have local offline file, and must not be currently downloading
        if (
          book.fileUrl && 
          book.fileUrl.startsWith('/api/files/') && 
          book.isDownloaded &&
          !offlineBooksMap[book.id] && 
          !syncInProgressRef.current[book.id]
        ) {
          console.log(`[AUTO-SYNC] Initiating background sync for ${book.title}...`);
          
          // Mark as compiling/syncing
          syncInProgressRef.current[book.id] = true;
          setSyncingBookIds(prev => ({ ...prev, [book.id]: true }));
          
          try {
            // encode URI to prevent Failed to fetch on unescaped spaces
            const res = await fetch(encodeURI(book.fileUrl));
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            
            const blob = await res.blob();
            const originalFileName = book.fileUrl.split('/').pop() || (book.type === 'audiobook' ? `${book.title}.mp3` : `${book.title}.epub`);
            const fileName = decodeURIComponent(originalFileName);
            const defaultDevicePath = `Downloads/${fileName}`;
            
            // 1. Save to IndexedDB
            await saveOfflineFile(book.id, fileName, blob, defaultDevicePath);
            
            // 2. Also, if there are separate chapter files for an audiobook, sync them in the background as well!
            if (book.type === 'audiobook' && book.chapters && book.chapters.length > 0) {
              const audioChapters = book.chapters as AudiobookChapter[];
              for (const ch of audioChapters) {
                if (ch.fileUrl && ch.fileUrl.startsWith('/api/files/')) {
                  const alreadySaved = await hasOfflineChapterFile(book.id, ch.id);
                  if (!alreadySaved) {
                    console.log(`[AUTO-SYNC] Initiating background sync for chapter [${ch.title}] of [${book.title}]...`);
                    try {
                      const chRes = await fetch(encodeURI(ch.fileUrl));
                      if (chRes.ok) {
                        const chBlob = await chRes.blob();
                        const chOriginalFileName = ch.fileUrl.split('/').pop() || `${book.title}_${ch.title}.mp3`;
                        const chFileName = decodeURIComponent(chOriginalFileName);
                        const chDefaultDevicePath = `Downloads/${chFileName}`;
                        await saveOfflineChapterFile(book.id, ch.id, chFileName, chBlob, chDefaultDevicePath);
                        console.log(`[AUTO-SYNC] Successfully cached chapter [${ch.title}] of [${book.title}].`);
                      }
                    } catch (chErr) {
                      console.error(`[AUTO-SYNC] Failed background sync for chapter [${ch.title}] of [${book.title}]:`, chErr);
                    }
                  }
                }
              }
            }
            
            // 3. Try to automatically sync/write to organized device folders or fall back to watch directory
            try {
              const isAudio = book.type === 'audiobook';
              const destId = isAudio ? 'audiobooks' : 'ebooks';
              const destPrefix = isAudio ? 'Audiobooks' : 'Ebooks';
              let destHandle = await getDirectoryHandle(destId);
              let useOrganized = false;

              if (destHandle) {
                const hasPerm = await verifyDirectoryPermission(destHandle, true, false);
                if (hasPerm) {
                  useOrganized = true;
                }
              }

              if (useOrganized && destHandle) {
                const authorFolder = sanitizePathName(book.author);
                const bookFolder = sanitizePathName(book.title);
                
                const authorDirHandle = await destHandle.getDirectoryHandle(authorFolder, { create: true });
                const bookDirHandle = await authorDirHandle.getDirectoryHandle(bookFolder, { create: true });

                const extParts = book.fileUrl?.split('.');
                let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
                if (!ext) ext = isAudio ? 'mp3' : 'epub';
                const extClean = decodeURIComponent(ext).toLowerCase().split('?')[0];
                const finalFileName = `${bookFolder} - ${authorFolder}.${extClean}`;
                
                const fileHandle = await bookDirHandle.getFileHandle(finalFileName, { create: true });
                const writable = await fileHandle.createWritable();
                const arrayBuffer = await blob.arrayBuffer();
                await writable.write(arrayBuffer);
                await writable.close();
                
                const finalDestPath = `${destPrefix}/${authorFolder}/${bookFolder}/${finalFileName}`;
                await updateOfflineFilePath(book.id, finalDestPath);
                await saveFileHandle(book.id, fileHandle, finalDestPath);
                console.log(`[AUTO-SYNC] Successfully wrote reorganized offline file to ${destPrefix}: ${finalFileName}`);
              } else {
                // Legacy Watch folder fallback
                let watchHandle = await getDirectoryHandle('watch');
                if (!watchHandle) {
                  watchHandle = await getDirectoryHandle('watch_internal');
                }
                if (watchHandle) {
                  const hasPerm = await verifyDirectoryPermission(watchHandle, true, false);
                  if (hasPerm) {
                    const extParts = book?.fileUrl?.split('.');
                    let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
                    if (!ext) ext = book.type === 'audiobook' ? 'mp3' : 'epub';
                    const safeTitle = book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const deviceFileName = `${safeTitle}.${ext}`;
                    
                    const fileHandle = await watchHandle.getFileHandle(deviceFileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    const arrayBuffer = await blob.arrayBuffer();
                    await writable.write(arrayBuffer);
                    await writable.close();
                    
                    const newPath = `${watchHandle.name}/${deviceFileName}`;
                    await updateOfflineFilePath(book.id, newPath);
                    await saveFileHandle(book.id, fileHandle, newPath);
                    console.log(`[AUTO-SYNC] Quietly recorded offline file to device watch folder (legacy fallback): ${deviceFileName}`);
                  }
                }
              }
            } catch (storageErr) {
              console.warn('[AUTO-SYNC] Native folder auto-organization was skipped: ', storageErr);
            }
            
            console.log(`[AUTO-SYNC] Successfully cached ${book.title} in browser IndexedDB.`);
            
            // Reload logs/history on server about this ingestion
            await fetch('/api/logs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                level: 'success',
                source: 'browser_sync',
                message: `Auto-Sync: Torrent download [${book.title}] was successfully staged offline inside your browser secure database.`
              })
            });

            // Refresh local map and settings so everything lights up!
            await refreshOfflineBooks();
            await loadSettingsAndLogs();
          } catch (syncErr) {
            console.error(`[AUTO-SYNC] Failed background sync for ${book.title}:`, syncErr);
          } finally {
            syncInProgressRef.current[book.id] = false;
            setSyncingBookIds(prev => ({ ...prev, [book.id]: false }));
          }
        }
      }
    };
    
    doAutoSync();
  }, [books, offlineBooksMap]);

  // 1. Initial mounting API loaders
  const loadLibraryData = async () => {
    try {
      const bRes = await fetch('/api/books');
      if (bRes.ok) {
        const booksData = await bRes.json();
        setBooks(booksData);
      }
    } catch (err) {
      console.error('Failed to load library database', err);
    }
  };

  const loadSettingsAndLogs = async () => {
    try {
      const cRes = await fetch('/api/config');
      if (cRes.ok) {
        const data = await cRes.json();
        if (data.config) setBookrrConfig(data.config);
        if (data.indexers) setIndexers(data.indexers);
        if (data.logs) setLogs(data.logs.reverse()); // latest first
      }
    } catch (err) {
      console.error('Failed to load setting configurations', err);
    }
  };

  const loadTorrents = async () => {
    try {
      const tRes = await fetch('/api/torrents');
      if (tRes.ok) {
        const tData = await tRes.json();
        setTorrentTasks(tData);
      }
    } catch (err) {
      console.error('Failed to load active download torrents', err);
    }
  };

  useEffect(() => {
    // Migration: Migrate legacy neural models to Piper TTS
    const currentModelId = localStorage.getItem('bookrr_tts_model_id');
    
    if (currentModelId && !currentModelId.startsWith('piper/')) {
      console.log(`[Migration] Migrating model ${currentModelId} to high-quality Piper TTS`);
      localStorage.setItem('bookrr_tts_model_id', 'piper/en_US-libritts-high');
    } else if (!currentModelId) {
      localStorage.setItem('bookrr_tts_model_id', 'piper/en_US-libritts-high');
    }

    const initApp = async () => {
      try {
        await fetch('/api/scan-library', { method: 'POST' });
      } catch (err) {
        console.error('Initial background scan failed', err);
      }
      loadLibraryData();
      loadSettingsAndLogs();
      loadTorrents();
    };
    initApp();
  }, []);

  // 2. Poll for active download tasks (rapid 1.5s poll during active transfers, 4.0s during idle)
  useEffect(() => {
    const isTransferring = torrentTasks.some(t => ['downloading', 'connecting', 'stalled'].includes(t.status));
    const pollRate = isTransferring ? 1500 : 4000;
    
    // Always poll to keep stats, logs, and downloads synchronous, especially if task finishes
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/torrents');
        if (res.ok) {
          const updatedTasks = await res.json();
          
          // Check if any task finished transitions from downloading to completed
          const hadFinished = torrentTasks.some(oldTask => 
            oldTask.status === 'downloading' && 
            updatedTasks.find((nt: TorrentTask) => nt.id === oldTask.id)?.status === 'completed'
          );

          setTorrentTasks(updatedTasks);

          if (hadFinished) {
            // Fresh update books and logs!
            loadLibraryData();
            loadSettingsAndLogs();
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, pollRate);

    return () => clearInterval(interval);
  }, [torrentTasks]);

  // 3. Sync AudiobookShelf database (stimulated scanner)
  const handleScanLibrarySync = async () => {
    setIsSyncing(true);
    try {
      // 1. Trigger server scan
      try {
        await fetch('/api/scan-library', { method: 'POST' });
      } catch (err) {
        console.warn('Server library scan warning:', err);
      }

      // 2. Load latest server library dataset
      await loadLibraryData();
      await loadSettingsAndLogs();

      // 3. Perform client-side library directory check and relinking
      const ebooksHandle = await getDirectoryHandle('ebooks');
      const audiobooksHandle = await getDirectoryHandle('audiobooks');
      
      if (ebooksHandle || audiobooksHandle) {
        let hasEbookPerms = false;
        let hasAudioPerms = false;
        
        if (ebooksHandle) {
          hasEbookPerms = await verifyDirectoryPermission(ebooksHandle, true, true);
        }
        if (audiobooksHandle) {
          hasAudioPerms = await verifyDirectoryPermission(audiobooksHandle, true, true);
        }
        
        if (hasEbookPerms || hasAudioPerms) {
          const currentMap = await getOfflineBooksMap();
          // Provide local directory handle fallback if one of them is missing/denied
          const restored = await autoRelinkLibrary(
            books, 
            ebooksHandle || {} as FileSystemDirectoryHandle, 
            audiobooksHandle || {} as FileSystemDirectoryHandle, 
            saveFileHandle, 
            saveOfflineFile, 
            currentMap
          );
          console.log(`[SYNC-LOCAL] Local files scanned and mapped directly. Retained: ${restored}`);
          await refreshOfflineBooks();
        }
      }
    } catch (err: any) {
      console.error('Scan library failed:', err);
      alert('Scanning & alignment failed: ' + (err.message || String(err)));
    } finally {
      setIsSyncing(false);
    }
  };

  // 4. Save Bookrr config
  const handleSaveConfig = async (payload: { config: BookrrConfig; indexers: IndexerSettings[] }) => {
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setBookrrConfig(payload.config);
        setIndexers(payload.indexers);
        await loadSettingsAndLogs(); // Reload logs from server write
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 5. Delete specific book catalog and local storage directories
  const handleDeleteBook = async (bookId: string) => {
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (activeAudiobook?.id === bookId) setActiveAudiobook(null);
        if (activeEbook?.id === bookId) setActiveEbook(null);
        await loadLibraryData();
        await loadSettingsAndLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 6. Delete a torrent task download cache
  const handleCancelTorrentTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/torrents/${taskId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadTorrents();
        await loadSettingsAndLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 6.b Retry/Refresh a stalled or failed torrent task
  const handleRetryTorrentTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/torrents/${taskId}/retry`, {
        method: 'POST'
      });
      if (res.ok) {
        await loadTorrents();
      }
    } catch (err) {
      console.error('Failed to retry torrent task', err);
    }
  };

  // 7. Add Magnet link / Send result to downloader
  const handleAddTorrentToQueue = async (torrent: TorrentSearchResult) => {
    try {
      const res = await fetch('/api/torrents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: torrent.title,
          magnetLink: torrent.magnetLink,
          downloadUrl: torrent.downloadUrl,
          size: torrent.size,
          indexer: torrent.indexer,
          type: torrent.type
        })
      });
      if (res.ok) {
        await loadTorrents();
        await loadSettingsAndLogs();
        // Shift user tabs automatically to downloads queue so they get live statistics
        setActiveTab('downloads');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 9. Update audio progress state on server
  const handleUpdateAudiobookTimeline = async (id: string, time: number, prog: number) => {
    try {
      // Optimistic update client arrays so shelves progress updates immediately!
      setBooks((prevBooks) => 
        prevBooks.map(b => (b.id === id ? { ...b, currentTime: time, progress: prog } : b))
      );

      await fetch(`/api/books/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTime: time,
          progress: prog
        })
      });
    } catch (err) {
      console.error('Error saving audio status', err);
    }
  };

  // 10. Update ebook progress state on server
  const handleUpdateEbookProgress = async (id: string, pageIdx: number, prog: number) => {
    try {
      // Optimistic update
      setBooks((prevBooks) => 
        prevBooks.map(b => (b.id === id ? { ...b, currentPage: pageIdx, progress: prog } : b))
      );

      await fetch(`/api/books/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPage: pageIdx,
          progress: prog
        })
      });
    } catch (err) {
      console.error('Error saving reading status', err);
    }
  };

  // Count active downloads for badge notifier
  const activeDownloadsCount = torrentTasks.filter(t => ['downloading', 'connecting', 'stalled'].includes(t.status)).length;

  return (
    <div id="bookrr-root" className={`min-h-screen bg-[#090909] text-neutral-100 flex font-sans antialiased text-base lg:pb-0 ${activeAudiobook ? 'pb-[160px]' : 'pb-[72px]'}`}>
      
      {/* Sidebar navigation controls (Desktop only now) */}
      <div className="hidden lg:block">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeDownloadsCount={activeDownloadsCount}
          isOpen={true}
          onClose={() => {}}
        />
      </div>

      {/* Main Content Workspace viewport offset by sidebar */}
      <main className="flex-1 pl-0 lg:pl-64 min-h-screen relative">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          
          {/* Active Tab View Renders */}
          {activeTab === 'library' && (
            <LibraryDashboard
              books={books}
              onPlayAudiobook={(b) => {
                setActiveAudiobook(b);
              }}
              onReadEbook={(b) => {
                setActiveEbook(b);
              }}
              onManualImport={async () => {
                await loadLibraryData();
              }}
              onDeleteBook={handleDeleteBook}
              onSyncLibrary={handleScanLibrarySync}
              isSyncing={isSyncing}
              onSearchTrackers={(query) => {
                setSearchState({
                    query: query,
                    type: 'ebook',
                    results: [],
                    searchedOnce: false
                });
                setActiveTab('search');
              }}
              offlineBooksMap={offlineBooksMap}
              onRefreshOfflineBooks={refreshOfflineBooks}
            />
          )}

          {activeTab === 'search' && (
            <IndexerSearch
              onAddTorrent={handleAddTorrentToQueue}
              recentLogs={logs}
              searchState={searchState}
              setSearchState={setSearchState}
              config={bookrrConfig}
              indexers={indexers}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'downloads' && (
            <WebtorDownloads
              tasks={torrentTasks}
              onCancelTask={handleCancelTorrentTask}
              onRetryTask={handleRetryTorrentTask}
              indexers={indexers}
              books={books}
              onReloadLibrary={loadLibraryData}
              onReloadLogs={loadSettingsAndLogs}
            />
          )}

          {activeTab === 'settings' && (
            <BookrrSettings
              books={books}
              config={bookrrConfig}
              indexers={indexers}
              logs={logs}
              onSaveConfig={handleSaveConfig}
            />
          )}

        </div>
      </main>

      {/* Full-screen Ebook Reading Arena (overlay portal setup) */}
      {activeEbook && (
        <EbookReader
          book={activeEbook}
          onClose={() => setActiveEbook(null)}
          onUpdateProgress={handleUpdateEbookProgress}
        />
      )}

      {/* Persistent global Audiobook playback dashboard (locked to the bottom footer) */}
      {activeAudiobook && (
        <AudiobookPlayer
          book={activeAudiobook}
          onClose={() => setActiveAudiobook(null)}
          onUpdateProgress={handleUpdateAudiobookTimeline}
        />
      )}

      {/* Persistent global Read Aloud player (locked to the bottom footer) */}
      <ReadAloudMiniPlayer 
        isReaderOpen={!!activeEbook} 
        onOpenReader={(bookId) => {
          const book = books.find(b => b.id === bookId);
          if (book) setActiveEbook(book);
        }}
      />

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeDownloadsCount={activeDownloadsCount}
      />
    </div>
  );
}
