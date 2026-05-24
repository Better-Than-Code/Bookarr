/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, Pause, Play, CheckCircle2, ChevronDown, Award, Compass, FileAudio, FileText, Database, RefreshCw, FolderClosed, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';
import { TorrentTask, IndexerSettings, Book } from '../types';
import { 
  getDirectoryHandle, 
  verifyDirectoryPermission,
  saveOfflineFile
} from '../services/LocalFileService';
import { 
  scanWatchFolder, 
  autoMapFiles, 
  organizeSingleFile, 
  WatchFolderFile 
} from '../services/LocalOrganizerService';

interface WebtorDownloadsProps {
  tasks: TorrentTask[];
  onCancelTask: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
  indexers: IndexerSettings[];
  books?: Book[];
  onReloadLibrary?: () => void;
  onReloadLogs?: () => void;
}

export default function WebtorDownloads({ 
  tasks, 
  onCancelTask, 
  onRetryTask,
  indexers, 
  books = [], 
  onReloadLibrary, 
  onReloadLogs 
}: WebtorDownloadsProps) {
  const activeDownloadsCount = tasks.filter(t => ['downloading', 'connecting', 'stalled'].includes(t.status)).length;

  // Organizer States
  const [watchFolderFiles, setWatchFolderFiles] = useState<WatchFolderFile[]>([]);
  const [manualMappedBookIds, setManualMappedBookIds] = useState<{[filePath: string]: string}>({});
  const [isOrganizerScanning, setIsOrganizerScanning] = useState(false);
  const [organizingFilesMap, setOrganizingFilesMap] = useState<{[filePath: string]: boolean}>({});

  // Handles & permissions
  const [watchDirHandle, setWatchDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [ebooksDirHandle, setEbooksDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [audiobooksDirHandle, setAudiobooksDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const [dirHasPermission, setDirHasPermission] = useState<{[key: string]: boolean}>({
    watch: false,
    ebooks: false,
    audiobooks: false
  });

  const [organizerStatusMessage, setOrganizerStatusMessage] = useState<string | null>(null);

  // Load and check directory handles
  const checkHandlesAndPermissions = useCallback(async (requestPermission: boolean = false) => {
    try {
      const watch = await getDirectoryHandle('watch');
      const ebooks = await getDirectoryHandle('ebooks');
      const audiobooks = await getDirectoryHandle('audiobooks');

      setWatchDirHandle(watch);
      setEbooksDirHandle(ebooks);
      setAudiobooksDirHandle(audiobooks);

      const status: {[key: string]: boolean} = { watch: false, ebooks: false, audiobooks: false };

      if (watch) {
        const perm = await verifyDirectoryPermission(watch, true, requestPermission);
        status.watch = perm;
      }
      if (ebooks) {
        const perm = await verifyDirectoryPermission(ebooks, true, requestPermission);
        status.ebooks = perm;
      }
      if (audiobooks) {
        const perm = await verifyDirectoryPermission(audiobooks, true, requestPermission);
        status.audiobooks = perm;
      }

      setDirHasPermission(status);
      return status;
    } catch (err) {
      console.error('Error checking handles and permissions:', err);
      return { watch: false, ebooks: false, audiobooks: false };
    }
  }, []);

  // Scan Watch Folder
  const doFolderScan = useCallback(async (askPermission: boolean = false) => {
    setIsOrganizerScanning(true);
    try {
      const permStatus = await checkHandlesAndPermissions(askPermission);
      if (!permStatus.watch) {
        setWatchFolderFiles([]);
        setIsOrganizerScanning(false);
        return;
      }

      const watch = await getDirectoryHandle('watch');
      if (!watch) return;

      const scannedFiles = await scanWatchFolder(watch);
      const mapped = autoMapFiles(scannedFiles, books);
      setWatchFolderFiles(mapped);
    } catch (e) {
      console.error('Watch directory scan failed:', e);
    } finally {
      setIsOrganizerScanning(false);
    }
  }, [books, checkHandlesAndPermissions]);

  // Handle active component mount and passive polling
  useEffect(() => {
    doFolderScan(false);

    // Dynamic basic polling inside the active session
    const interval = setInterval(() => {
      // Passive silently updates
      doFolderScan(false);
    }, 10000); // Poll scan watch folder every 10 seconds

    return () => clearInterval(interval);
  }, [doFolderScan]);

  // Request manual permission unlock
  const unlockWatchFolder = async () => {
    await doFolderScan(true);
  };

  // Run file organization
  const handleOrganizeSingle = async (file: WatchFolderFile) => {
    // 1. Establish book metadata mapping (auto or manual selection)
    const selectedBookId = manualMappedBookIds[file.path] || file.autoMappedBook?.id;
    const targetBook = books.find(b => b.id === selectedBookId);

    if (!targetBook) {
      alert('Please connect or manually map this file to a library volume before moving.');
      return;
    }

    const destHandle = targetBook.type === 'audiobook' ? audiobooksDirHandle : ebooksDirHandle;
    if (!destHandle) {
      alert(`The organized destination directory for ${targetBook.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'} is unconfigured. Please configure it in Settings.`);
      return;
    }

    const typeKey = targetBook.type === 'audiobook' ? 'audiobooks' : 'ebooks';
    if (!dirHasPermission[typeKey]) {
      const perm = await verifyDirectoryPermission(destHandle, true, true);
      if (!perm) {
        alert('Missing write permissions to organize into destination directories.');
        return;
      }
      setDirHasPermission(prev => ({ ...prev, [typeKey]: true }));
    }

    setOrganizingFilesMap(prev => ({ ...prev, [file.path]: true }));
    setOrganizerStatusMessage(`Sorting and sweeping [${file.name}]...`);

    try {
      const result = await organizeSingleFile(file, watchDirHandle!, destHandle, targetBook);
      
      if (result.success) {
        setOrganizerStatusMessage(`Successfully cataloged: Moved to / ${targetBook.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'} / ${result.destinationPath}`);
        
        // Save the file contents persistently into IndexedDB mapped to this book ID,
        // so the Library immediately shows it as available/playable and maps it correctly
        try {
          const fileObj = await file.handle.getFile();
          await saveOfflineFile(targetBook.id, file.name, fileObj, result.destinationPath);
        } catch (dbErr) {
          console.error('Failed to register organized physical file inside IndexedDB:', dbErr);
        }

        // Log action back to server log system persistently!
        try {
          await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              level: 'success',
              source: 'organizer',
              message: `Organized File: Moved and renamed [${file.name}] → destination [${result.destinationPath}] under Library.`
            })
          });
        } catch (le) {
          console.warn('Logging feedback error:', le);
        }

        // Remove organized file from local view list
        setWatchFolderFiles(prev => prev.filter(f => f.path !== file.path));

        // Refresh triggers to let parent view update
        if (onReloadLibrary) onReloadLibrary();
        if (onReloadLogs) onReloadLogs();
      } else {
        alert(`Organization operation failed: ${result.message}`);
      }
    } catch (e: any) {
      console.error('File sorting failed:', e);
      alert(`Critical write failure: ${e.message || String(e)}`);
    } finally {
      setOrganizingFilesMap(prev => ({ ...prev, [file.path]: false }));
      setTimeout(() => setOrganizerStatusMessage(null), 6000);
    }
  };
  
  // Compute aggregate stats safely
  const totalSpeedBytes = tasks.reduce((acc, t) => {
    if (t.status !== 'downloading') return acc;
    const match = t.downloadSpeed.match(/([\d.]+)\s*MB\/s/);
    if (match) return acc + parseFloat(match[1]) * 1024 * 1024;
    const kbMatch = t.downloadSpeed.match(/([\d.]+)\s*KB\/s/);
    if (kbMatch) return acc + parseFloat(kbMatch[1]) * 1024;
    return acc;
  }, 0);

  const downloadSpeed = totalSpeedBytes > 1024 * 1024 
    ? (totalSpeedBytes / (1024 * 1024)).toFixed(1) + ' MB/s'
    : (totalSpeedBytes / 1024).toFixed(0) + ' KB/s';
    
  const diskSpace = '218.4 GB Free';

  return (
    <div className="space-y-6">
      
      {/* Overall stats board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Webtor Active Streams</p>
          <p className="text-xl font-sans font-extrabold text-neutral-200 mt-1">{activeDownloadsCount} Torrent Streams</p>
        </div>
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Overall Download Speed</p>
          <p className="text-xl font-sans font-extrabold text-amber-500 mt-1">{downloadSpeed}</p>
        </div>
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Local Disk Available</p>
          <p className="text-xl font-sans font-extrabold text-neutral-200 mt-1">{diskSpace}</p>
        </div>
      </div>

      {/* Main tasks panel */}
      <div className="space-y-4 text-left">
        <h3 className="font-sans font-bold text-sm text-neutral-300">
          Downloading Queue / Torrent Tasks
        </h3>

        {tasks.length === 0 ? (
          <div className="p-12 text-center bg-[#111] rounded-2xl border border-[#222]">
            <Compass className="w-8 h-8 text-neutral-600 mx-auto mb-2 animate-spin duration-3000" />
            <p className="text-neutral-400 font-sans text-sm font-medium">Your torrent downloader is idle.</p>
            <p className="text-neutral-600 font-sans text-xs mt-1">
              Navigate to the Indexer Search or Gemini Butler to queue and download torrents locally.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const isCompleted = task.status === 'completed';
              return (
                <div
                  key={task.id}
                  className="bg-[#121212] border border-[#222] p-5 rounded-2xl space-y-4 shadow-sm"
                >
                  {/* Task identity bar */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCompleted ? (
                          <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : task.status === 'connecting' ? (
                          <span className="flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Connecting
                          </span>
                        ) : task.status === 'stalled' ? (
                          <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <ShieldAlert className="w-3 h-3" /> Stalled
                          </span>
                        ) : task.status === 'failed' ? (
                          <span className="flex items-center gap-1 text-[10px] bg-red-500/10 text-red-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <ShieldAlert className="w-3 h-3" /> Failed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono animate-pulse">
                            <Download className="w-3 h-3" /> Streaming
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Indexer Source: {task.indexer}
                        </span>
                        {task.retryCount && task.retryCount > 0 && (
                           <span className="text-[9px] text-neutral-600 bg-neutral-900 px-1 py-0.5 rounded">
                             Retry Attempt: {task.retryCount}
                           </span>
                        )}
                      </div>
                      <h4 className="font-sans font-bold text-sm text-neutral-200 truncate mt-1">
                        {task.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                         <Database size={10} className="text-neutral-600" />
                         <span className="text-[9px] font-mono text-neutral-600 truncate uppercase">
                           Locally stored in: /data/bookarr/download/{task.name}
                         </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {(task.status === 'stalled' || task.status === 'failed' || (task.status === 'downloading' && task.progress === 0)) && onRetryTask && (
                        <button
                          onClick={() => onRetryTask(task.id)}
                          className="text-neutral-400 hover:text-amber-500 p-2 hover:bg-neutral-800 rounded-lg transition shrink-0 cursor-pointer"
                          title="Force restart torrent with common trackers"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => onCancelTask(task.id)}
                        className="text-neutral-500 hover:text-red-400 p-2 hover:bg-neutral-800 rounded-lg transition shrink-0 cursor-pointer"
                        title="Delete torrent and cache directory"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Slider Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-mono text-neutral-500">
                      <span>Progress: {task.progress}%</span>
                      <span>{task.size} total</span>
                    </div>
                    <div className="w-full bg-[#1e1e1e] h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${task.progress}%` }}
                        className={`h-full transition-all duration-300 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Speeds and Stats if downloading */}
                  {!isCompleted && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#181818] p-3 rounded-lg text-xs font-mono text-neutral-400">
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">DL Speed</span>
                        <span className="text-neutral-200 mt-0.5 block font-semibold">{task.downloadSpeed}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">UL Speed</span>
                        <span className="text-neutral-200 mt-0.5 block">{task.uploadSpeed}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">ETA Remaining</span>
                        <span className="text-neutral-200 mt-0.5 block font-semibold">{task.eta}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">Connected peers</span>
                        <span className="text-neutral-200 mt-0.5 block font-semibold">
                          {task.numPeers || 0} active connections
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Files inside Torrent list */}
                  <div className="space-y-1.5 border-t border-[#222] pt-3.5">
                    <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest pl-1 mb-1">
                      Torrent Folder Contents
                    </p>
                    <div className="space-y-1">
                      {task.files.map((file, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-center text-xs text-neutral-400 py-1.5 hover:bg-neutral-800 rounded px-1.5 border-b border-neutral-900 last:border-none"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {file.type === 'audio' ? (
                              <FileAudio className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : file.type === 'ebook' ? (
                              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-600 shrink-0 rotate-270" />
                            )}
                            <span className="truncate text-neutral-300 font-medium">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                            <span className="text-neutral-500">{file.size}</span>
                            <span className={file.progress === 100 ? 'text-emerald-500' : 'text-amber-500'}>
                              {file.progress}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Client-Side Watch Folder Organizer Panel */}
      <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4 text-left">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222] pb-4">
          <div className="flex items-center gap-3">
            <FolderClosed className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-sans font-bold text-sm text-neutral-100">Local Archive & Watch Folder Organizer</h3>
              <p className="text-[11px] text-neutral-400">Sweeps downloaded files, renames, and moves them to organized library directories</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {watchDirHandle && (
              <button
                type="button"
                onClick={() => doFolderScan(true)}
                disabled={isOrganizerScanning}
                className="bg-[#1e1e1e] hover:bg-[#2e2e2e] text-neutral-300 border border-neutral-800 disabled:opacity-55 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isOrganizerScanning ? 'animate-spin' : ''}`} />
                {isOrganizerScanning ? 'Scanning...' : 'Scan Watch Folder'}
              </button>
            )}
          </div>
        </div>

        {organizerStatusMessage && (
          <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl px-4 py-2.5 text-xs text-amber-400 font-mono animate-pulse">
            ✨ {organizerStatusMessage}
          </div>
        )}

        {typeof window !== 'undefined' && window.self !== window.top && (
          <div className="bg-amber-550/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400 space-y-2 leading-relaxed text-left">
            <p className="font-bold text-amber-400 flex items-center gap-1.5">⚠️ Browser Preview Limitation (Iframe Blocked)</p>
            <p>
              Local folder scanning and organizing features are restricted inside of preview frames. Open this app in separate browser tab to run the automated folder synchronization on-the-fly.
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

        {!watchDirHandle ? (
          <div className="bg-[#161616] border border-neutral-900 rounded-xl p-6 text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-amber-500/60 mx-auto" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-neutral-200">Local Organizer Disconnected</p>
              <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">Configure a Watch Directory and organized destination paths in the Settings menu to enable automated file renaming and sorting.</p>
            </div>
          </div>
        ) : !dirHasPermission.watch ? (
          <div className="bg-[#161616] border border-neutral-900 rounded-xl p-6 text-center space-y-4">
            <FolderClosed className="w-8 h-8 text-amber-500/60 mx-auto" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-neutral-200">Watch Folder Connection Locked</p>
              <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">Local File System Access requires user verification to resume active scans after page reloads.</p>
            </div>
            <button
              type="button"
              onClick={unlockWatchFolder}
              className="bg-amber-500 text-black px-4 py-2 rounded-lg text-xs font-bold uppercase hover:bg-amber-400 transition cursor-pointer mx-auto block"
            >
              Verify & Unlock Folder
            </button>
          </div>
        ) : watchFolderFiles.length === 0 ? (
          <div className="text-center py-8 text-neutral-550 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-neutral-700 mx-auto" />
            <p className="text-xs font-medium">Watch Folder Clean</p>
            <p className="text-[10px] text-neutral-500 max-w-sm mx-auto font-sans leading-relaxed">No EPUB or Audiobook files are currently pending in <strong>{watchDirHandle.name}</strong>. Downloaded torrents will appear here when done!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Pending files in watch folder ({watchFolderFiles.length})</span>
              <span className="text-neutral-400">Folder: / {watchDirHandle.name}</span>
            </div>

            <div className="divide-y divide-neutral-950 border border-neutral-900 rounded-xl overflow-hidden bg-[#141414]">
              {watchFolderFiles.map((file) => {
                // Determine mapped book
                const currentMappedId = manualMappedBookIds[file.path] || file.autoMappedBook?.id;
                const activeMappedBook = books.find(b => b.id === currentMappedId);
                const isAuto = !manualMappedBookIds[file.path] && file.autoMappedBook;
                
                // Keep only books of same type for mapping
                const filteredMappingBooks = books.filter(b => b.type === file.type);

                return (
                  <div key={file.path} className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between p-4 gap-4 bg-[#141414] hover:bg-[#161616] transition text-left">
                    {/* Visual details column */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2 bg-neutral-950 border border-neutral-900 rounded-lg shrink-0">
                        {file.type === 'audiobook' ? (
                          <FileAudio className="w-5 h-5 text-amber-500" />
                        ) : (
                          <FileText className="w-5 h-5 text-blue-400" />
                        )}
                      </div>
                      <div className="truncate text-left min-w-0 flex-1">
                        <span className="text-xs font-bold text-neutral-200 block truncate" title={file.name}>
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-neutral-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-900">
                            {file.size}
                          </span>
                          <span className="text-[10px] text-neutral-500 font-sans truncate block max-w-[200px] sm:max-w-md">
                            Path: {file.path}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Selector and Connection Column */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                      {/* Mapping Indicator or Selector */}
                      <div className="space-y-1 text-left w-full sm:w-56">
                        <span className="text-[10px] font-mono text-neutral-500 uppercase block">Library Target Assignment</span>
                        
                        {/* Dynamic manual connector dropdown */}
                        <div className="relative">
                          <select
                            value={currentMappedId || ''}
                            onChange={(e) => {
                              const targetId = e.target.value;
                              setManualMappedBookIds(prev => ({
                                ...prev,
                                [file.path]: targetId
                              }));
                            }}
                            className="w-full bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg p-1.5 pr-6 focus:outline-none focus:border-amber-500 text-neutral-300 text-[11px] font-medium appearance-none cursor-pointer"
                          >
                            <option value="">-- Let's manual map to Book --</option>
                            {filteredMappingBooks.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.title} ({b.author})
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-2 top-2.5 pointer-events-none" />
                        </div>

                        {/* Banner status helper */}
                        {activeMappedBook ? (
                          <div className="flex items-center gap-1.5 pt-0.5 text-[10px]">
                            {isAuto ? (
                              <span className="text-emerald-500 font-bold uppercase tracking-wide flex items-center gap-1 text-[9px]">
                                <Sparkles className="w-2.5 h-2.5" /> Auto-Mapped Match
                              </span>
                            ) : (
                              <span className="text-amber-500 font-bold uppercase tracking-wide text-[9px]">
                                Custom Overridden
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[9px] text-red-400 font-semibold block pt-0.5">
                            ⚠️ Unassigned. Choose a library book to import file.
                          </span>
                        )}
                      </div>

                      {/* Organizer Trigger Buttons */}
                      <div className="shrink-0 pt-0 sm:pt-4 w-full sm:w-auto text-right flex items-center">
                        <button
                          type="button"
                          onClick={() => handleOrganizeSingle(file)}
                          disabled={!activeMappedBook || organizingFilesMap[file.path]}
                          className="w-full sm:w-auto bg-amber-500 text-black disabled:bg-neutral-900 disabled:text-neutral-500 px-4 py-2 rounded-lg text-xs font-bold uppercase hover:bg-amber-400 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {organizingFilesMap[file.path] ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                              Moving...
                            </>
                          ) : (
                            'Organize & Move'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Description Info Corner */}
      <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 text-left">
        <div className="flex items-start gap-3">
          <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h5 className="font-sans font-bold text-xs text-amber-400">Webtor Automation Bridge</h5>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Upon completed torrent execution, the server backend automatically unpackages ePUB text files or MP3 audio tracks, maps the corresponding AudiobookShelf directory schemas, and binds them to your media dashboard instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
