/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, HardDrive, Terminal, Plus, Layers, CheckCircle2, Trash2, Activity, ShieldCheck, AlertTriangle, RefreshCw, FolderOpen } from 'lucide-react';
import { BookrrConfig, IndexerSettings, MessageLog, Book } from '../types';
import {
  getDirectoryHandle,
  saveDirectoryHandle,
  deleteDirectoryHandle,
  verifyDirectoryPermission,
  getOfflineBooksMap,
  getOfflineFile,
  updateOfflineFilePath,
  saveOfflineFile
} from '../services/LocalFileService';
import { sanitizePathName, scanWatchFolder, autoMapFiles, organizeSingleFile } from '../services/LocalOrganizerService';

interface IndexerSettingsProps {
  books?: Book[];
  config: BookrrConfig;
  indexers: IndexerSettings[];
  logs: MessageLog[];
  onSaveConfig: (updated: { config: BookrrConfig; indexers: IndexerSettings[] }) => void;
  onClearLogs?: () => void;
}

export default function BookrrSettings({ books = [], config, indexers, logs, onSaveConfig }: IndexerSettingsProps) {
  // Form configurations
  const [webtorEnabled, setWebtorEnabled] = useState(config.webtorEnabled ?? true);
  const [localDownloadPath, setLocalDownloadPath] = useState(config.localDownloadPath || '');

  // Indexers management
  const [localIndexers, setLocalIndexers] = useState<IndexerSettings[]>(indexers || []);
  const [saveStatus, setSaveStatus] = useState('');

  // New indexer states
  const [showAddIndexer, setShowAddIndexer] = useState(false);
  const [newIndexerName, setNewIndexerName] = useState('');
  const [newIndexerUrl, setNewIndexerUrl] = useState('');
  const [newIndexerApiKey, setNewIndexerApiKey] = useState('');
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const [checkResult, setCheckResult] = useState<{ status: 'online' | 'offline'; error?: string } | null>(null);

  // Local File System Organizer Directory handles state
  const [watchHandle, setWatchHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [ebooksHandle, setEbooksHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [audiobooksHandle, setAudiobooksHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const [watchPermission, setWatchPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [ebooksPermission, setEbooksPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [audiobooksPermission, setAudiobooksPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [internalStorage, setInternalStorage] = useState<{ baseDir: string, paths: Record<string, string> } | null>(null);
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // ... rest of state stays same ...

  const pickRootFolder = async () => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      setRootHandle(handle);
      
      // Auto-create subfolders if not present
      const watchHandle = await handle.getDirectoryHandle('download', { create: true });
      const ebooksHandle = await handle.getDirectoryHandle('ebooks', { create: true });
      const audiobooksHandle = await handle.getDirectoryHandle('audiobooks', { create: true });

      setWatchHandle(watchHandle);
      setEbooksHandle(ebooksHandle);
      setAudiobooksHandle(audiobooksHandle);
      
      setWatchPermission('granted');
      setEbooksPermission('granted');
      setAudiobooksPermission('granted');

      // Persist handles manually as we're not using a library for this simplicity
      localStorage.setItem('bookarr_root_name', handle.name);
      
      alert(`Bookarr initialized in: ${handle.name}\n- download/\n- ebooks/\n- audiobooks/`);
    } catch (e) {
      console.error('Failed to pick root folder', e);
    }
  };

  // Library Structure Validation State
  interface LibraryDiscrepancy {
    bookId: string;
    title: string;
    author: string;
    type: 'audiobook' | 'ebook';
    currentPath: string;
    expectedPath: string;    // relative path like Author/Book/Title - Author.ext
    expectedFilename: string; // Title - Author.ext
    source: 'indexeddb' | 'watch';
    watchFile?: any; // To store WatchFolderFile if it comes from watch directory
  }
  
  const [isScanningLibrary, setIsScanningLibrary] = useState(false);
  const [libraryDiscrepancies, setLibraryDiscrepancies] = useState<LibraryDiscrepancy[]>([]);
  const [hasScannedLibrary, setHasScannedLibrary] = useState(false);
  const [isFixingLibrary, setIsFixingLibrary] = useState(false);
  const [fixProgress, setFixProgress] = useState(0);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    const loadHandles = async () => {
      try {
        // Fetch internal storage paths from server
        fetch('/api/system/storage')
          .then(res => res.json())
          .then(data => {
            if (data.success) {
               setInternalStorage({ baseDir: data.baseDir, paths: data.paths });
            }
          })
          .catch(err => console.error('Failed to fetch storage info:', err));

        const watch = await getDirectoryHandle('watch');
        const ebooks = await getDirectoryHandle('ebooks');
        const audiobooks = await getDirectoryHandle('audiobooks');

        setWatchHandle(watch);
        setEbooksHandle(ebooks);
        setAudiobooksHandle(audiobooks);

        // Check permission if handle is there
        if (watch) {
          const perm = await (watch as any).queryPermission({ mode: 'readwrite' });
          setWatchPermission(perm === 'granted' ? 'granted' : 'pending');
        }
        if (ebooks) {
          const perm = await (ebooks as any).queryPermission({ mode: 'readwrite' });
          setEbooksPermission(perm === 'granted' ? 'granted' : 'pending');
        }
        if (audiobooks) {
          const perm = await (audiobooks as any).queryPermission({ mode: 'readwrite' });
          setAudiobooksPermission(perm === 'granted' ? 'granted' : 'pending');
        }
      } catch (e) {
        console.warn('Error loading handles inside settings mount:', e);
      }
    };
    loadHandles();
  }, []);

  const selectFolder = async (type: 'watch' | 'ebooks' | 'audiobooks') => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({
        id: `bookrr-${type}-picker`,
        mode: 'readwrite'
      });
      await saveDirectoryHandle(type, handle);
      
      if (type === 'watch') {
        setWatchHandle(handle);
        setWatchPermission('granted');
      } else if (type === 'ebooks') {
        setEbooksHandle(handle);
        setEbooksPermission('granted');
      } else if (type === 'audiobooks') {
        setAudiobooksHandle(handle);
        setAudiobooksPermission('granted');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`Directory picking failed for ${type}:`, e);
        
        const isIframeMessage = e.message?.includes('sub frame') || 
                               e.message?.includes('cross-origin') || 
                               e.message?.includes('iframe') || 
                               (typeof window !== 'undefined' && window.self !== window.top);

        if (isIframeMessage) {
          alert(
            `Browser Security Limitation:\n\n` +
            `Standard file pickers are restricted inside of cross-origin preview iframes for your security.\n\n` +
            `To connect your local directories, please open this app in its own browser tab by clicking the "Open in new tab" icon at the top right of your preview panel, or use the "Open in New Tab" button in settings!`
          );
        } else {
          alert(`Folder selection failed: ${e.message || String(e)}`);
        }
      }
    }
  };

  const verifyResetPermission = async (type: 'watch' | 'ebooks' | 'audiobooks', handle: FileSystemDirectoryHandle) => {
    const perm = await verifyDirectoryPermission(handle, true, true);
    if (type === 'watch') setWatchPermission(perm ? 'granted' : 'denied');
    else if (type === 'ebooks') setEbooksPermission(perm ? 'granted' : 'denied');
    else if (type === 'audiobooks') setAudiobooksPermission(perm ? 'granted' : 'denied');
  };

  const removeFolder = async (type: 'watch' | 'ebooks' | 'audiobooks') => {
    await deleteDirectoryHandle(type);
    if (type === 'watch') {
      setWatchHandle(null);
      setWatchPermission('pending');
    } else if (type === 'ebooks') {
      setEbooksHandle(null);
      setEbooksPermission('pending');
    } else if (type === 'audiobooks') {
      setAudiobooksHandle(null);
      setAudiobooksPermission('pending');
    }
  };

  const handleAnalyzeLibraryStructure = async () => {
    setIsScanningLibrary(true);
    setLibraryDiscrepancies([]);
    setHasScannedLibrary(false);

    try {
      const offlineMap = await getOfflineBooksMap();
      const discrepancies: LibraryDiscrepancy[] = [];

      // 1. Scan assigned offlineMap entries that are not in valid structured paths
      for (const book of books) {
        const offlineInfo = offlineMap[book.id];
        if (!offlineInfo || !offlineInfo.filePath) continue; // no local path to check

        const currentPath = offlineInfo.filePath;
        
        // Expected structure
        const authorFolder = sanitizePathName(book.author);
        const titleFolder = sanitizePathName(book.title);
        const ext = offlineInfo.name.split('.').pop() || (book.type === 'audiobook' ? 'mp3' : 'epub');
        const expectedFilename = `${titleFolder} - ${authorFolder}.${ext}`;
        const relativeExpectedPath = `${authorFolder}/${titleFolder}/${expectedFilename}`;
        const fullExpectedPath = `${book.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'}/${relativeExpectedPath}`;
        
        const isStandardStructure = currentPath === relativeExpectedPath || currentPath === fullExpectedPath;

        if (!isStandardStructure) {
          discrepancies.push({
            bookId: book.id,
            title: book.title,
            author: book.author,
            type: book.type,
            currentPath,
            expectedPath: relativeExpectedPath,
            expectedFilename,
            source: 'indexeddb'
          });
        }
      }

      // 2. Scan Watch (Downloads) Directory for unassigned auto-matching files
      if (watchHandle) {
        try {
           const fileList = await scanWatchFolder(watchHandle);
           const mappedFiles = autoMapFiles(fileList, books);
           for (const file of mappedFiles) {
              if (file.autoMappedBook) {
                 const book = file.autoMappedBook;
                 // If the book does NOT have an offline map entry correctly set up yet
                 if (!offlineMap[book.id]) {
                    const authorFolder = sanitizePathName(book.author);
                    const titleFolder = sanitizePathName(book.title);
                    const ext = file.extension;
                    const expectedFilename = `${titleFolder} - ${authorFolder}.${ext}`;
                    const relativeExpectedPath = `${authorFolder}/${titleFolder}/${expectedFilename}`;

                    discrepancies.push({
                      bookId: book.id,
                      title: book.title,
                      author: book.author,
                      type: book.type,
                      currentPath: `/Downloads/${file.path}`, // Virtual representation showing watch folder location
                      expectedPath: relativeExpectedPath,
                      expectedFilename,
                      source: 'watch',
                      watchFile: file
                    });
                 }
              }
           }
        } catch (e) {
           console.warn("Failed to scan watch folder during library structure check:", e);
        }
      }

      setLibraryDiscrepancies(discrepancies);
    } catch (err) {
      console.error('Failed to analyze library structure:', err);
      alert('Error analyzing library structure. Check logs.');
    } finally {
      setHasScannedLibrary(true);
      setIsScanningLibrary(false);
    }
  };

  const handleOrganizeDiscrepancies = async () => {
    if (!ebooksHandle || !audiobooksHandle) {
      alert("Please connect both Organized Ebooks and Audiobooks destinations above to organize files.");
      return;
    }

    if (!confirm(`Are you sure you want to move and rename ${libraryDiscrepancies.length} files?`)) {
      return;
    }

    setIsFixingLibrary(true);
    setFixProgress(0);

    let fixedCount = 0;

    for (let i = 0; i < libraryDiscrepancies.length; i++) {
        const disc = libraryDiscrepancies[i];
        try {
            const baseHandle = disc.type === 'audiobook' ? audiobooksHandle : ebooksHandle;

            if (disc.source === 'indexeddb') {
                const record = await getOfflineFile(disc.bookId);
                if (!record) continue; // couldn't read local indexblob

                // 1. Create Author / Book Directory
                const authorFolder = sanitizePathName(disc.author);
                const bookFolder = sanitizePathName(disc.title);

                const authorDirHandle = await baseHandle.getDirectoryHandle(authorFolder, { create: true });
                const bookDirHandle = await authorDirHandle.getDirectoryHandle(bookFolder, { create: true });

                // 2. Write file
                const fileHandle = await bookDirHandle.getFileHandle(disc.expectedFilename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(record.blob);
                await writable.close();

                // 3. Update DB
                const finalDestPath = `${disc.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'}/${disc.expectedPath}`;
                await updateOfflineFilePath(disc.bookId, finalDestPath);
                fixedCount++;
            } else if (disc.source === 'watch' && disc.watchFile && watchHandle) {
                const bookRef = books.find(b => b.id === disc.bookId);
                if (!bookRef) continue;
                
                const result = await organizeSingleFile(disc.watchFile, watchHandle, baseHandle, bookRef);
                if (result.success && result.fileObj) {
                    try {
                        // Save the file contents persistently into IndexedDB mapped to this book ID
                        await saveOfflineFile(disc.bookId, disc.watchFile.name, result.fileObj, result.destinationPath);
                        fixedCount++;
                    } catch (dbErr) {
                        console.error('Failed to register organized physical file inside IndexedDB:', dbErr);
                    }
                } else {
                    console.error("Failed to organize watch file:", result.message);
                }
            }
        } catch (err) {
            console.error(`Failed to organize ${disc.title}`, err);
        }
        setFixProgress(Math.round(((i + 1) / libraryDiscrepancies.length) * 100));
    }

    setIsFixingLibrary(false);
    alert(`Successfully organized ${fixedCount} out of ${libraryDiscrepancies.length} files.`);
    
    // Refresh the list
    handleAnalyzeLibraryStructure();
  };

  useEffect(() => {
    setWebtorEnabled(config.webtorEnabled);
    setLocalDownloadPath(config.localDownloadPath);
    setLocalIndexers(indexers);
  }, [config, indexers]);

  const checkHealth = async (url: string) => {
    try {
      const response = await fetch('/api/indexers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      return await response.json();
    } catch (e) {
      return { status: 'offline', error: 'Service Unavailable' };
    }
  };

  const handleCheckIndexer = async () => {
    if (!newIndexerUrl) return;
    setIsCheckingNew(true);
    setCheckResult(null);
    const result = await checkHealth(newIndexerUrl);
    setCheckResult(result);
    setIsCheckingNew(false);
  };

  const toggleIndexer = (id: string) => {
    const updated = localIndexers.map(ind => {
      if (ind.id === id) {
        return { ...ind, enabled: !ind.enabled };
      }
      return ind;
    });
    setLocalIndexers(updated);
    
    // Send updated indexers to backend
    onSaveConfig({
      config,
      indexers: updated
    });
  };

  const handleUpdateIndexerApiKey = (id: string, key: string) => {
    const updated = localIndexers.map(ind => {
      if (ind.id === id) {
        return { ...ind, apiKey: key };
      }
      return ind;
    });
    setLocalIndexers(updated);
  };

  const handleAddIndexer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIndexerName || !newIndexerUrl) return;

    let status: 'online' | 'offline' | 'unknown' = 'unknown';
    if (checkResult) {
      status = checkResult.status;
    } else {
      // Check quickly if we haven't already
      const result = await checkHealth(newIndexerUrl);
      status = result.status;
    }

    const newIdx: IndexerSettings = {
      id: `ind-${Date.now()}`,
      name: newIndexerName,
      url: newIndexerUrl,
      apiKey: newIndexerApiKey,
      enabled: true,
      type: 'native',
      status,
      lastChecked: new Date().toISOString()
    };
    const updated = [...localIndexers, newIdx];
    setLocalIndexers(updated);

    onSaveConfig({
      config: {
        webtorEnabled,
        localDownloadPath
      },
      indexers: updated
    });

    setNewIndexerName('');
    setNewIndexerUrl('');
    setNewIndexerApiKey('');
    setCheckResult(null);
    setShowAddIndexer(false);
    setSaveStatus('New tracker added successfully!');
    setTimeout(() => {
      setSaveStatus('');
    }, 4000);
  };

  const handleDeleteIndexer = (id: string) => {
    if (!window.confirm('Delete this tracker indexer link from your torrent indexers list?')) {
      return;
    }
    const deletedIndexer = localIndexers.find(ind => ind.id === id);
    const updated = localIndexers.filter(ind => ind.id !== id);
    setLocalIndexers(updated);
    
    // Track deleted indexer name to prevent migration re-add
    const deletedNames = [...(config.deletedIndexerNames || []), deletedIndexer ? deletedIndexer.name : 'unknown'];

    onSaveConfig({
      config: {
        ...config,
        deletedIndexerNames: deletedNames
      },
      indexers: updated
    });

    setSaveStatus('Tracker removed successfully!');
    setTimeout(() => {
      setSaveStatus('');
    }, 4000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      config: {
        webtorEnabled,
        localDownloadPath
      },
      indexers: localIndexers
    });
    setSaveStatus('Bookrr settings saved locally!');
    setTimeout(() => {
      setSaveStatus('');
    }, 4000);
  };

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
        
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-6">
            
            <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
              <Settings className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-sans font-bold text-sm text-neutral-100">Bookrr Media Suite</h3>
                <p className="text-[11px] text-neutral-400">Configure your internal media server and download behavior</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 rounded-lg text-black">
                    <FolderOpen size={18} />
                  </div>
                  <div className="text-left">
                    <h4 className="text-[11px] font-bold text-neutral-200">Device Internal Storage</h4>
                    <p className="text-[10px] text-neutral-500 leading-tight">Pick your "Bookarr" root folder to keep all files self-contained.</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={pickRootFolder}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded-lg transition"
                >
                  {rootHandle ? `Linked: /${rootHandle.name}` : 'Initialize Bookarr Root'}
                </button>
              </div>

              <div className="space-y-1 font-mono text-[11px]">
                <label className="text-neutral-400 block font-semibold">Watch / Download Path (Staging)</label>
                <input
                  type="text"
                  value={localDownloadPath}
                  onChange={(e) => setLocalDownloadPath(e.target.value)}
                  placeholder={internalStorage?.paths?.download || "/data/bookarr/download"}
                  className="w-full bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg p-2.5 focus:outline-none focus:border-amber-500 text-neutral-100 text-xs"
                />
                <p className="text-[10px] text-neutral-500 font-sans leading-snug mt-1">
                  Files placed in your device "download" folder will be staged here before organization.
                </p>
              </div>

              {internalStorage && (
                <div className="space-y-2 pt-2 border-t border-[#222]/50">
                   <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Server Managed Repositories</h4>
                   <div className="bg-[#161616] p-3 rounded-xl border border-neutral-900 space-y-2">
                       <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-neutral-500">Staging:</span>
                          <span className="text-amber-500/80 truncate ml-2" title={internalStorage.paths.download}>{internalStorage.paths.download.split('/').slice(-3).join('/')}</span>
                       </div>
                       <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-neutral-500">Audiobooks:</span>
                          <span className="text-neutral-300 truncate ml-2" title={internalStorage.paths.audiobooks}>{internalStorage.paths.audiobooks.split('/').slice(-3).join('/')}</span>
                       </div>
                       <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-neutral-500">Ebooks:</span>
                          <span className="text-neutral-300 truncate ml-2" title={internalStorage.paths.ebooks}>{internalStorage.paths.ebooks.split('/').slice(-3).join('/')}</span>
                       </div>
                   </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#222] flex items-center justify-between">
              {saveStatus ? (
                <span className="text-[10px] font-mono text-emerald-500 font-semibold flex items-center gap-1.5 animate-pulse">
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                  {saveStatus}
                </span>
              ) : <div />}

              <button
                type="submit"
                className="bg-amber-500 text-black px-6 py-2.5 rounded-xl text-xs font-semibold hover:bg-amber-400 transition cursor-pointer ml-auto"
              >
                Save Settings
              </button>
            </div>
          </form>

          {/* Client-Side Directory Watch & Organizer Settings */}
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
              <HardDrive className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-sans font-bold text-sm text-neutral-100">Local Watch Directory Organizer</h3>
                <p className="text-[11px] text-neutral-400">Organize browser-downloaded files into sorted, clean nested directories</p>
              </div>
            </div>

            {/* Check browser compatibility */}
            {typeof window === 'undefined' || !('showDirectoryPicker' in window) ? (
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 text-xs text-red-400 space-y-2 leading-relaxed">
                <p className="font-bold">⚠️ Local Organizer Offline (No Native API support)</p>
                <p>Your browser does not support the Web File System Access API. Please open this app in an up-to-date release of <strong>Google Chrome, Microsoft Edge, or Opera</strong> on desktop to configure local directory syncing.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {typeof window !== 'undefined' && window.self !== window.top && (
                  <div className="bg-amber-550/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400 space-y-2 leading-relaxed text-left">
                    <p className="font-bold text-amber-400 flex items-center gap-1.5">⚠️ Browser Preview Limitation (Iframe Blocked)</p>
                    <p>
                      Modern secure file pickers are restricted inside of preview iframes. To pick and configure your directories, please launch this application in a separate tab.
                    </p>
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition mt-1"
                    >
                      Open App in New Tab
                    </a>
                  </div>
                )}
                
                {/* Watch Folder */}
                <div className="space-y-2 bg-[#161616] border border-neutral-900 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                    <div>
                      <span className="text-xs font-bold text-neutral-300 block">1. Target Watch Folder</span>
                      <p className="text-[10px] text-neutral-500 leading-snug mt-1">Select the browser's download folder or where torrent downloads land.</p>
                    </div>
                    <div>
                      {watchHandle ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => verifyResetPermission('watch', watchHandle)}
                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                              watchPermission === 'granted' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500 animate-pulse'
                            }`}
                          >
                            {watchPermission === 'granted' ? 'Active' : 'Grant Perm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFolder('watch')}
                            className="bg-neutral-800 text-neutral-400 hover:text-red-400 p-1.5 rounded-lg transition cursor-pointer"
                            title="Disconnect Folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectFolder('watch')}
                          disabled={isInIframe}
                          className={`bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-amber-400 cursor-pointer transition shrink-0 ${isInIframe ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Select Folder
                        </button>
                      )}
                    </div>
                  </div>
                  {watchHandle && (
                    <div className="text-[9px] font-mono text-neutral-400 border-t border-neutral-800/60 pt-2">
                      <span className="truncate block">📂 Watch Folder: {watchHandle.name}</span>
                    </div>
                  )}
                </div>

                {/* Ebooks Destination */}
                <div className="space-y-2 bg-[#161616] border border-neutral-900 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                    <div>
                      <span className="text-xs font-bold text-neutral-300 block">2. Organized Ebooks Destination</span>
                      <p className="text-[10px] text-neutral-500 leading-snug mt-1">Ebooks will be moved and renamed into: <code>Ebooks/Author/Book/File</code></p>
                    </div>
                    <div>
                      {ebooksHandle ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => verifyResetPermission('ebooks', ebooksHandle)}
                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                              ebooksPermission === 'granted' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500 animate-pulse'
                            }`}
                          >
                            {ebooksPermission === 'granted' ? 'Active' : 'Grant Perm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFolder('ebooks')}
                            className="bg-neutral-800 text-neutral-400 hover:text-red-400 p-1.5 rounded-lg transition cursor-pointer"
                            title="Disconnect Folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectFolder('ebooks')}
                          disabled={isInIframe}
                          className={`bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-amber-400 cursor-pointer transition shrink-0 ${isInIframe ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Select Folder
                        </button>
                      )}
                    </div>
                  </div>
                  {ebooksHandle && (
                    <div className="text-[9px] font-mono text-neutral-400 border-t border-neutral-800/60 pt-2">
                      <span className="truncate block">📂 Ebooks Destination: {ebooksHandle.name}</span>
                    </div>
                  )}
                </div>

                {/* Audiobooks Destination */}
                <div className="space-y-2 bg-[#161616] border border-neutral-900 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                    <div>
                      <span className="text-xs font-bold text-neutral-300 block">3. Organized Audiobooks Destination</span>
                      <p className="text-[10px] text-neutral-500 leading-snug mt-1">Audiobooks will be moved and renamed into: <code>Audiobooks/Author/Book/File</code></p>
                    </div>
                    <div>
                      {audiobooksHandle ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => verifyResetPermission('audiobooks', audiobooksHandle)}
                            className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                              audiobooksPermission === 'granted' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500 animate-pulse'
                            }`}
                          >
                            {audiobooksPermission === 'granted' ? 'Active' : 'Grant Perm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFolder('audiobooks')}
                            className="bg-neutral-800 text-neutral-400 hover:text-red-400 p-1.5 rounded-lg transition cursor-pointer"
                            title="Disconnect Folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectFolder('audiobooks')}
                          disabled={isInIframe}
                          className={`bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-amber-400 cursor-pointer transition shrink-0 ${isInIframe ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Select Folder
                        </button>
                      )}
                    </div>
                  </div>
                  {audiobooksHandle && (
                    <div className="text-[9px] font-mono text-neutral-400 border-t border-neutral-850 pt-2">
                      <span className="truncate block">📂 Audiobooks Destination: {audiobooksHandle.name}</span>
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 text-xs text-neutral-400 leading-relaxed text-left space-y-1.5">
                  <p className="font-semibold text-neutral-200">💡 Local Watch Organizer Instructions:</p>
                  <p>When files are identified in the Watch Folder, the app will auto-match and group files by author and title (or let you manually map them on-screen) and copy them into your pristine libraries.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
              <CheckCircle2 className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-sans font-bold text-sm text-neutral-100">Library Path Validation</h3>
                <p className="text-[11px] text-neutral-400">Scan library and rename or move manually imported books to standardized library folders.</p>
              </div>
            </div>

            <div className="space-y-4 text-left">
              <button
                onClick={handleAnalyzeLibraryStructure}
                disabled={isScanningLibrary || isFixingLibrary}
                className="bg-[#1a1a1a] border border-[#333] hover:border-amber-500/50 text-neutral-300 hover:text-amber-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isScanningLibrary ? 'animate-spin' : ''}`} />
                {isScanningLibrary ? 'Analyzing Structure...' : 'Scan & Validate Library Branches'}
              </button>

              {hasScannedLibrary && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                  {libraryDiscrepancies.length === 0 ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-emerald-500">Perfect Structure Match</h4>
                        <p className="text-[11px] text-neutral-400 leading-relaxed mt-1">All mapped offline files match the pristine Title/Author branch architecture.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden text-sm">
                      <div className="bg-amber-500/10 p-4 border-b border-amber-500/20">
                        <h4 className="text-xs font-bold text-amber-500 flex justify-between items-center">
                          <span>{libraryDiscrepancies.length} Structural Deviations Found</span>
                          <button
                            onClick={handleOrganizeDiscrepancies}
                            disabled={isFixingLibrary || (!ebooksHandle && !audiobooksHandle)}
                            className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-extrabold cursor-pointer disabled:opacity-50"
                          >
                            {isFixingLibrary ? `Organizing (${fixProgress}%)` : 'Normalize & Move All'}
                          </button>
                        </h4>
                        <p className="text-[10px] text-neutral-400 mt-2 leading-relaxed">
                          The following books are stored locally but are out of bounds or misnamed. Fixing will construct correct folders in your pristine directory and move the blob contents there.
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-neutral-900/50">
                        {libraryDiscrepancies.map(d => (
                          <div key={d.bookId} className="p-3 hover:bg-white/5 transition flex flex-col sm:flex-row gap-3 items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-neutral-200 truncate">{d.title}</p>
                              <p className="text-[10px] text-neutral-400 font-mono truncate mt-0.5">by {d.author}</p>
                            </div>
                            <div className="text-[9px] font-mono shrink-0 w-full sm:w-auto text-left sm:text-right space-y-1">
                              <p className="text-red-400 truncate max-w-[200px]" title={d.currentPath}>Actual: {d.currentPath}</p>
                              <p className="text-emerald-500 truncate max-w-[200px]" title={d.expectedPath}>Expected: {d.expectedPath}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-neutral-100">Integrated Indexers</h3>
                  <p className="text-[11px] text-neutral-400">Native scrapers acting as your internal media tracker aggregator</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddIndexer(!showAddIndexer)}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Custom</span>
              </button>
            </div>

            {showAddIndexer && (
              <form onSubmit={handleAddIndexer} className="bg-[#181818] border border-amber-500/25 p-4 rounded-xl space-y-3 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-neutral-400 block">Indexer Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MyTracker"
                      value={newIndexerName}
                      onChange={(e) => setNewIndexerName(e.target.value)}
                      className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-neutral-400 block flex items-center justify-between">
                      Base URL
                      <button 
                        type="button"
                        onClick={handleCheckIndexer}
                        disabled={!newIndexerUrl || isCheckingNew}
                        className="text-amber-500 hover:text-amber-400 disabled:text-neutral-600 disabled:cursor-not-allowed transition flex items-center gap-1"
                      >
                        {isCheckingNew ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                        Check
                      </button>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="https://..."
                      value={newIndexerUrl}
                      onChange={(e) => {
                        setNewIndexerUrl(e.target.value);
                        setCheckResult(null);
                      }}
                      className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
                    />
                    {checkResult && (
                      <div className={`mt-1 text-[10px] flex items-center gap-1.5 ${checkResult.status === 'online' ? 'text-emerald-500' : 'text-red-400'}`}>
                        {checkResult.status === 'online' ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {checkResult.status === 'online' ? 'Tracker Reachable' : checkResult.error || 'Connection Failed'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddIndexer(false)}
                    className="px-3 py-1.5 hover:bg-[#202020] text-neutral-400 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-500 text-black px-4 py-1.5 hover:bg-amber-400 rounded font-semibold cursor-pointer"
                  >
                    Add Indexer
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {localIndexers.map((ind) => (
                <div
                  key={ind.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#161616] border border-[#242424] p-3 rounded-xl hover:border-neutral-750 gap-3 transition group"
                >
                  <div className="flex items-center gap-3 text-left min-w-0">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={ind.enabled}
                        onChange={() => toggleIndexer(ind.id)}
                        className="w-4 h-4 text-amber-500 bg-neutral-900 border-neutral-700 rounded focus:ring-amber-500 cursor-pointer shrink-0"
                      />
                      {ind.status && (
                        <div 
                          className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-[#161616] ${
                            ind.status === 'online' ? 'bg-emerald-500' : 
                            ind.status === 'offline' ? 'bg-red-500' : 'bg-neutral-500'
                          }`}
                          title={ind.error || (ind.status === 'online' ? 'Online' : 'Offline')}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-200 block truncate">{ind.name}</span>
                        {ind.lastChecked && (
                          <span className="text-[8px] text-neutral-600 font-mono hidden group-hover:block transition-opacity animate-in fade-in duration-300">
                            (Checked: {new Date(ind.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-neutral-500 font-mono block truncate">{ind.url}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-neutral-500 uppercase font-bold px-2 py-0.5 border border-neutral-800 rounded bg-neutral-900">
                      {ind.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteIndexer(ind.id)}
                      className="text-neutral-500 hover:text-red-400 p-1 rounded hover:bg-neutral-800 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-amber-500" />
              <h3 className="font-sans font-bold text-sm text-neutral-100">Bookrr Service Logs</h3>
            </div>

            <div className="bg-[#080808] border border-[#202020] rounded-xl p-4 h-56 font-mono text-xs overflow-y-auto space-y-1.5 scrollbar-thin select-all">
              {logs.map((log) => {
                let textCol = 'text-neutral-300';
                if (log.level === 'warn') textCol = 'text-amber-500';
                else if (log.level === 'error') textCol = 'text-red-400';
                else if (log.level === 'success') textCol = 'text-emerald-400';

                return (
                  <div key={log.id} className="text-left flex items-start gap-2 select-text leading-relaxed">
                    <span className="text-neutral-600 shrink-0 select-none text-[10px]">
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]
                    </span>
                    <span className={`uppercase font-bold shrink-0 select-none text-[10px] ${
                      log.source === 'webtor' ? 'text-amber-500' : 'text-neutral-500'
                    }`}>
                      [{log.source}]
                    </span>
                    <span className={textCol}>{log.message}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
