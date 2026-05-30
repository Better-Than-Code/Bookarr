/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  Trash2,
  Pause,
  Play,
  CheckCircle2,
  ChevronDown,
  Award,
  Compass,
  FileAudio,
  FileText,
  Database,
  RefreshCw,
  FolderClosed,
  ShieldAlert,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { TorrentTask, IndexerSettings, Book } from "../types";
import {
  getDirectoryHandle,
  verifyDirectoryPermission,
  saveOfflineFile,
  saveFileHandle,
} from "../services/LocalFileService";
import {
  scanWatchFolder,
  autoMapFiles,
  organizeSingleFile,
  WatchFolderFile,
  sanitizePathName,
} from "../services/LocalOrganizerService";
import {
  extractFileMetadata,
  ExtractedMetadata,
} from "../services/ClientMetadataParser";

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
  onReloadLogs,
}: WebtorDownloadsProps) {
  const activeDownloadsCount = tasks.filter((t) =>
    ["downloading", "connecting", "stalled"].includes(t.status),
  ).length;

  // Organizer States
  const [watchFolderFiles, setWatchFolderFiles] = useState<WatchFolderFile[]>(
    [],
  );
  const [manualMappedBookIds, setManualMappedBookIds] = useState<{
    [filePath: string]: string;
  }>({});
  const [isOrganizerScanning, setIsOrganizerScanning] = useState(false);
  const [organizingFilesMap, setOrganizingFilesMap] = useState<{
    [filePath: string]: boolean;
  }>({});

  const [extractedMetadataMap, setExtractedMetadataMap] = useState<{
    [filePath: string]: ExtractedMetadata;
  }>({});
  const [parsingMetadataMap, setParsingMetadataMap] = useState<{
    [filePath: string]: boolean;
  }>({});

  const handleExtractMetadata = useCallback(
    async (file: WatchFolderFile) => {
      if (parsingMetadataMap[file.path] || extractedMetadataMap[file.path])
        return;
      setParsingMetadataMap((prev) => ({ ...prev, [file.path]: true }));
      try {
        const browserFile = await file.handle.getFile();
        const meta = await extractFileMetadata(browserFile);
        if (meta) {
          setExtractedMetadataMap((prev) => ({ ...prev, [file.path]: meta }));

          // Dry auto match based on extracted title
          if (meta.title) {
            const match = books.find(
              (b) =>
                b.type === file.type &&
                (b.title.toLowerCase().includes(meta.title!.toLowerCase()) ||
                  meta.title!.toLowerCase().includes(b.title.toLowerCase())),
            );
            if (match && !manualMappedBookIds[file.path]) {
              setManualMappedBookIds((prev) => ({
                ...prev,
                [file.path]: match.id,
              }));
            }
          }
        }
      } catch (e) {
        console.warn("[METADATA] Failed client-side extract:", file.name, e);
      } finally {
        setParsingMetadataMap((prev) => ({ ...prev, [file.path]: false }));
      }
    },
    [books, manualMappedBookIds, parsingMetadataMap, extractedMetadataMap],
  );

  // Automatically trigger metadata extraction for any non-cover files detected in watch folder list
  useEffect(() => {
    watchFolderFiles.forEach((file) => {
      if (
        file.type !== "cover" &&
        !extractedMetadataMap[file.path] &&
        !parsingMetadataMap[file.path]
      ) {
        handleExtractMetadata(file);
      }
    });
  }, [
    watchFolderFiles,
    extractedMetadataMap,
    parsingMetadataMap,
    handleExtractMetadata,
  ]);

  // Download Queue UI States
  const [autoCleanCompleted, setAutoCleanCompleted] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("bookarr_auto_clean_completed") === "true";
    }
    return false;
  });
  const [autoPullCompleted, setAutoPullCompleted] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("bookarr_auto_pull_completed") !== "false"; // default to true
    }
    return true;
  });
  const [pullingTasksMap, setPullingTasksMap] = useState<{
    [taskId: string]: {
      percent: number;
      status: "pulling" | "completed" | "failed";
      message?: string;
    };
  }>({});
  const [expandedTasks, setExpandedTasks] = useState<{
    [taskId: string]: boolean;
  }>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearCompleted, setConfirmClearCompleted] =
    useState<boolean>(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<boolean>(false);

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleClearCompletedTasks = useCallback(() => {
    const completed = tasks.filter((t) => t.status === "completed");
    completed.forEach((task) => {
      onCancelTask(task.id);
    });
  }, [tasks, onCancelTask]);

  const tasksStatusKey = JSON.stringify(
    tasks.map((t) => `${t.id}-${t.status}`),
  );

  useEffect(() => {
    if (autoCleanCompleted) {
      const completed = tasks.filter((t) => t.status === "completed");
      if (completed.length > 0) {
        completed.forEach((task) => {
          onCancelTask(task.id);
        });
      }
    }
  }, [tasksStatusKey, autoCleanCompleted, onCancelTask]);

  // Handles & permissions
  const [watchDirHandle, setWatchDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [watchInternalDirHandle, setWatchInternalDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [ebooksDirHandle, setEbooksDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [audiobooksDirHandle, setAudiobooksDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  const [dirHasPermission, setDirHasPermission] = useState<{
    [key: string]: boolean;
  }>({
    watch: false,
    watchInternal: false,
    ebooks: false,
    audiobooks: false,
  });

  const [organizerStatusMessage, setOrganizerStatusMessage] = useState<
    string | null
  >(null);
  const [isLoadingHandles, setIsLoadingHandles] = useState(true);
  const rootName =
    typeof window !== "undefined"
      ? localStorage.getItem("bookarr_root_name")
      : null;

  // Load and check directory handles
  const checkHandlesAndPermissions = useCallback(
    async (requestPermission: boolean = false) => {
      try {
        const watch = await getDirectoryHandle("watch");
        const watchInternal = await getDirectoryHandle("watch_internal");
        const ebooks = await getDirectoryHandle("ebooks");
        const audiobooks = await getDirectoryHandle("audiobooks");

        setWatchDirHandle(watch);
        setWatchInternalDirHandle(watchInternal);
        setEbooksDirHandle(ebooks);
        setAudiobooksDirHandle(audiobooks);

        const status: { [key: string]: boolean } = {
          watch: false,
          watchInternal: false,
          ebooks: false,
          audiobooks: false,
        };

        if (watch) {
          const perm = await verifyDirectoryPermission(
            watch,
            true,
            requestPermission,
          );
          status.watch = perm;
        }
        if (watchInternal) {
          const perm = await verifyDirectoryPermission(
            watchInternal,
            true,
            requestPermission,
          );
          status.watchInternal = perm;
        }
        if (ebooks) {
          const perm = await verifyDirectoryPermission(
            ebooks,
            true,
            requestPermission,
          );
          status.ebooks = perm;
        }
        if (audiobooks) {
          const perm = await verifyDirectoryPermission(
            audiobooks,
            true,
            requestPermission,
          );
          status.audiobooks = perm;
        }

        setDirHasPermission(status);
        return status;
      } catch (err) {
        console.error("Error checking handles and permissions:", err);
        return {
          watch: false,
          watchInternal: false,
          ebooks: false,
          audiobooks: false,
        };
      }
    },
    [],
  );

  // Scan Watch Folder
  const doFolderScan = useCallback(
    async (askPermission: boolean = false) => {
      setIsOrganizerScanning(true);
      try {
        const permStatus = await checkHandlesAndPermissions(askPermission);
        setIsLoadingHandles(false);

        const watch = await getDirectoryHandle("watch");
        const watchInternal = await getDirectoryHandle("watch_internal");

        let combinedFiles: WatchFolderFile[] = [];

        if (permStatus.watch && watch) {
          const scanned = await scanWatchFolder(watch);
          combinedFiles = [...combinedFiles, ...scanned];
        }
        if (permStatus.watchInternal && watchInternal) {
          const scanned = await scanWatchFolder(watchInternal);
          combinedFiles = [...combinedFiles, ...scanned];
        }

        if (!permStatus.watch && !permStatus.watchInternal) {
          setWatchFolderFiles([]);
          return;
        }

        const mapped = autoMapFiles(combinedFiles, books);
        setWatchFolderFiles(mapped);
      } catch (e) {
        console.error("Watch directory scan failed:", e);
      } finally {
        setIsOrganizerScanning(false);
        setIsLoadingHandles(false);
      }
    },
    [books, checkHandlesAndPermissions],
  );

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

  const handlePullTorrentFiles = useCallback(
    async (task: TorrentTask) => {
      let destFolderHandle = watchInternalDirHandle || watchDirHandle;
      if (!destFolderHandle) {
        console.warn(
          "[STAGING] Staging handle is uninitialized. Skipping live staging sync.",
        );
        return;
      }

      const hasPerm = await verifyDirectoryPermission(
        destFolderHandle,
        true,
        false,
      );
      if (!hasPerm) {
        console.warn(
          "[STAGING] Local staging folder write permissions are locked.",
        );
        return;
      }

      setPullingTasksMap((prev) => ({
        ...prev,
        [task.id]: { percent: 0, status: "pulling" },
      }));

      try {
        // Create subfolder named after the torrent task (to keep files grouped)
        const taskFolderHandle = await destFolderHandle.getDirectoryHandle(
          sanitizePathName(task.name),
          { create: true },
        );

        let totalFiles = task.files.length;
        let completedFiles = 0;

        for (const file of task.files) {
          setPullingTasksMap((prev) => ({
            ...prev,
            [task.id]: {
              percent: Math.round((completedFiles / totalFiles) * 100),
              status: "pulling",
              message: `Copying "${file.name}"...`,
            },
          }));

          const response = await fetch(
            `/api/files/${encodeURIComponent(file.name)}`,
          );
          if (!response.ok) {
            throw new Error(
              `Failed to fetch file chunk from container storage: ${file.name}`,
            );
          }

          const fileHandle = await taskFolderHandle.getFileHandle(file.name, {
            create: true,
          });
          const writable = await fileHandle.createWritable();

          const reader = response.body?.getReader();
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              await writable.write(value);
            }
          } else {
            const blob = await response.blob();
            await writable.write(blob);
          }
          await writable.close();
          completedFiles++;
        }

        setPullingTasksMap((prev) => ({
          ...prev,
          [task.id]: { percent: 100, status: "completed" },
        }));

        // Refresh watch list
        setTimeout(() => {
          doFolderScan(false);
        }, 500);
      } catch (err: any) {
        console.error("[STAGING] Local sync staging error:", err);
        setPullingTasksMap((prev) => ({
          ...prev,
          [task.id]: {
            percent: 0,
            status: "failed",
            message: err.message || String(err),
          },
        }));
      }
    },
    [watchInternalDirHandle, watchDirHandle, doFolderScan],
  );

  // Automate pulling of completed downloads on the client directly to browser staging folder
  useEffect(() => {
    if (autoPullCompleted && (watchInternalDirHandle || watchDirHandle)) {
      const completedPendingPull = tasks.filter(
        (t) => t.status === "completed" && !pullingTasksMap[t.id],
      );
      completedPendingPull.forEach((task) => {
        handlePullTorrentFiles(task);
      });
    }
  }, [
    tasksStatusKey,
    autoPullCompleted,
    pullingTasksMap,
    tasks,
    watchInternalDirHandle,
    watchDirHandle,
    handlePullTorrentFiles,
  ]);

  // Run file organization
  const handleOrganizeSingle = async (file: WatchFolderFile) => {
    // 1. Establish book metadata mapping (auto or manual selection)
    const selectedBookId =
      manualMappedBookIds[file.path] || file.autoMappedBook?.id;
    const targetBook = books.find((b) => b.id === selectedBookId);

    if (!targetBook) {
      alert(
        "Please connect or manually map this file to a library volume before moving.",
      );
      return;
    }

    const destHandle =
      targetBook.type === "audiobook" ? audiobooksDirHandle : ebooksDirHandle;
    if (!destHandle) {
      alert(
        `The organized destination directory for ${targetBook.type === "audiobook" ? "Audiobooks" : "Ebooks"} is unconfigured. Please configure it in Settings.`,
      );
      return;
    }

    const typeKey = targetBook.type === "audiobook" ? "audiobooks" : "ebooks";
    if (!dirHasPermission[typeKey]) {
      const perm = await verifyDirectoryPermission(destHandle, true, true);
      if (!perm) {
        alert(
          "Missing write permissions to organize into destination directories.",
        );
        return;
      }
      setDirHasPermission((prev) => ({ ...prev, [typeKey]: true }));
    }

    setOrganizingFilesMap((prev) => ({ ...prev, [file.path]: true }));
    setOrganizerStatusMessage(`Sorting and sweeping [${file.name}]...`);

    try {
      const fallbackWatchDir = watchDirHandle || watchInternalDirHandle;
      const result = await organizeSingleFile(
        file,
        fallbackWatchDir!,
        destHandle,
        targetBook,
      );

      if (result.success) {
        setOrganizerStatusMessage(
          `Successfully cataloged: Moved to / ${targetBook.type === "audiobook" ? "Audiobooks" : "Ebooks"} / ${result.destinationPath}`,
        );

        // Register the file handle for direct access later, instead of saving the blob in browser storage
        try {
          if (file.type === "cover") {
            if (result.fileObj) {
              const reader = new FileReader();
              reader.readAsDataURL(result.fileObj);
              reader.onload = async () => {
                const coverUrl = reader.result as string;
                try {
                  await fetch(`/api/books/${targetBook.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ coverUrl }),
                  });
                  if (onReloadLibrary) onReloadLibrary();
                } catch (e) {
                  console.error("Failed to update cover url", e);
                }
              };
            }
          } else {
            if (result.destFileHandle) {
              await saveFileHandle(targetBook.id, result.destFileHandle);
            }

            // Enrich database with client-side extracted metadata if present
            const localMeta = extractedMetadataMap[file.path];
            const updatePayload: any = {
              isDownloaded: true,
              filePath: result.destinationPath,
            };

            if (localMeta) {
              if (localMeta.coverUrl) {
                updatePayload.coverUrl = localMeta.coverUrl;
              }
              if (
                localMeta.description &&
                (!targetBook.description ||
                  targetBook.description.startsWith("No metadata found") ||
                  targetBook.description.startsWith("Point this book") ||
                  targetBook.description.length < 100)
              ) {
                updatePayload.description = localMeta.description;
              }
              if (localMeta.duration && targetBook.type === "audiobook") {
                updatePayload.duration = localMeta.duration;
              }
            }

            await fetch(`/api/books/${targetBook.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updatePayload),
            });
          }
        } catch (dbErr) {
          console.error(
            "Failed to register organized physical file handle inside IndexedDB:",
            dbErr,
          );
        }

        // Log action back to server log system persistently!
        try {
          await fetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: "success",
              source: "organizer",
              message: `Organized File: Moved and renamed [${file.name}] → destination [${result.destinationPath}] under Library.`,
            }),
          });
        } catch (le) {
          console.warn("Logging feedback error:", le);
        }

        // Remove organized file from local view list
        setWatchFolderFiles((prev) => prev.filter((f) => f.path !== file.path));

        // Refresh triggers to let parent view update
        if (onReloadLibrary) onReloadLibrary();
        if (onReloadLogs) onReloadLogs();
      } else {
        alert(`Organization operation failed: ${result.message}`);
      }
    } catch (e: any) {
      console.error("File sorting failed:", e);
      alert(`Critical write failure: ${e.message || String(e)}`);
    } finally {
      setOrganizingFilesMap((prev) => ({ ...prev, [file.path]: false }));
      setTimeout(() => setOrganizerStatusMessage(null), 6000);
    }
  };

  // Compute aggregate stats safely
  const totalSpeedBytes = tasks.reduce((acc, t) => {
    if (t.status !== "downloading") return acc;
    const match = t.downloadSpeed.match(/([\d.]+)\s*MB\/s/);
    if (match) return acc + parseFloat(match[1]) * 1024 * 1024;
    const kbMatch = t.downloadSpeed.match(/([\d.]+)\s*KB\/s/);
    if (kbMatch) return acc + parseFloat(kbMatch[1]) * 1024;
    return acc;
  }, 0);

  const downloadSpeed =
    totalSpeedBytes > 1024 * 1024
      ? (totalSpeedBytes / (1024 * 1024)).toFixed(1) + " MB/s"
      : (totalSpeedBytes / 1024).toFixed(0) + " KB/s";

  const diskSpace = "218.4 GB Free";

  return (
    <div className="space-y-6">
      {/* Overall stats board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
            Webtor Active Streams
          </p>
          <p className="text-xl font-sans font-extrabold text-neutral-200 mt-1">
            {activeDownloadsCount} Torrent Streams
          </p>
        </div>
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
            Overall Download Speed
          </p>
          <p className="text-xl font-sans font-extrabold text-amber-500 mt-1">
            {downloadSpeed}
          </p>
        </div>
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
            Local Disk Available
          </p>
          <p className="text-xl font-sans font-extrabold text-neutral-200 mt-1">
            {diskSpace}
          </p>
        </div>
      </div>{" "}
      {/* Main tasks panel */}
      <div className="space-y-4 text-left">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-sans font-bold text-sm text-neutral-300">
              Downloading Queue / Torrent Tasks
            </h3>
            {tasks.length > 0 && (
              <span className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-mono font-bold">
                {tasks.length}
              </span>
            )}
          </div>

          {tasks.length > 0 && (
            <div className="flex items-center gap-3.5 flex-wrap">
              {/* Auto-Clean Switch */}
              <label className="flex items-center gap-2 text-xs font-semibold text-neutral-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCleanCompleted}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoCleanCompleted(checked);
                    localStorage.setItem(
                      "bookarr_auto_clean_completed",
                      String(checked),
                    );
                  }}
                  className="rounded border-neutral-800 bg-[#141414] text-amber-500 focus:ring-amber-500 focus:ring-offset-[#111] h-3.5 w-3.5"
                />
                <span className="text-[11px] text-neutral-400 hover:text-neutral-200 transition">
                  Auto-Clean Queue
                </span>
              </label>

              {/* Auto-Pull to Local Watch/Download Staging */}
              <label className="flex items-center gap-2 text-xs font-semibold text-neutral-400 cursor-pointer select-none border-l border-neutral-800 pl-3">
                <input
                  type="checkbox"
                  checked={autoPullCompleted}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoPullCompleted(checked);
                    localStorage.setItem(
                      "bookarr_auto_pull_completed",
                      String(checked),
                    );
                  }}
                  className="rounded border-neutral-800 bg-[#141414] text-amber-500 focus:ring-amber-500 focus:ring-offset-[#111] h-3.5 w-3.5"
                />
                <span
                  className="text-[11px] text-neutral-400 hover:text-neutral-200 transition"
                  title="Automatically copy finished files to your local browser staging folder"
                >
                  Auto-Pull to Staging
                </span>
              </label>

              {/* Clear Completed action with confirmation */}
              {tasks.some((t) => t.status === "completed") &&
                (confirmClearCompleted ? (
                  <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2.5 py-1 rounded-lg text-xs animate-in fade-in duration-200">
                    <span className="text-red-400 font-bold text-[11px]">
                      Clear Completed?
                    </span>
                    <button
                      onClick={() => {
                        handleClearCompletedTasks();
                        setConfirmClearCompleted(false);
                      }}
                      className="bg-red-500 hover:bg-red-650 text-white font-extrabold px-1.5 py-0.5 rounded text-[10px] uppercase cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmClearCompleted(false)}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-extrabold px-1.5 py-0.5 rounded text-[10px] uppercase cursor-pointer"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClearCompleted(true)}
                    className="border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 text-red-400 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Completed
                  </button>
                ))}

              {/* Delete All action with confirmation */}
              {confirmDeleteAll ? (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 px-2.5 py-1 rounded-lg text-xs animate-in fade-in duration-200">
                  <span className="text-red-400 font-bold text-[11px]">
                    Delete All?
                  </span>
                  <button
                    onClick={() => {
                      tasks.forEach((task) => onCancelTask(task.id));
                      setConfirmDeleteAll(false);
                    }}
                    className="bg-red-500 hover:bg-red-650 text-white font-extrabold px-1.5 py-0.5 rounded text-[10px] uppercase cursor-pointer"
                  >
                    Yes, Delete All
                  </button>
                  <button
                    onClick={() => setConfirmDeleteAll(false)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-extrabold px-1.5 py-0.5 rounded text-[10px] uppercase cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-400 text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="Bulk delete and cancel all running/stored tasks"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete All
                </button>
              )}
            </div>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="p-12 text-center bg-[#111] rounded-2xl border border-[#222]">
            <Compass className="w-8 h-8 text-neutral-600 mx-auto mb-2 animate-spin duration-3000" />
            <p className="text-neutral-400 font-sans text-sm font-medium">
              Your torrent downloader is idle.
            </p>
            <p className="text-neutral-600 font-sans text-xs mt-1">
              Navigate to the Indexer Search or Gemini Butler to queue and
              download torrents locally.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const isCompleted = task.status === "completed";
              const isExpanded = !!expandedTasks[task.id];
              return (
                <div
                  key={task.id}
                  className="relative pr-9 bg-[#121212] border border-[#222] p-3 rounded-xl transition duration-200 hover:border-neutral-800"
                >
                  {/* Absolute Positioned Individual Trash with confirmation */}
                  <div className="absolute top-2.5 right-2 z-10 flex items-center">
                    {confirmDeleteId === task.id ? (
                      <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded text-[10px] animate-in fade-in zoom-in duration-200">
                        <span className="text-red-400 font-bold font-sans text-[8px]">
                          Delete?
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelTask(task.id);
                            setConfirmDeleteId(null);
                          }}
                          className="bg-red-500 hover:bg-red-650 text-white font-extrabold px-1 rounded text-[7px] uppercase cursor-pointer"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-extrabold px-1 rounded text-[7px] uppercase cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(task.id);
                        }}
                        className="text-neutral-500 hover:text-red-400 p-1 hover:bg-neutral-800 rounded transition cursor-pointer"
                        title="Delete torrent and cache directory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Task Header Row (Compact view format) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Identity Block */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCompleted ? (
                          <span className="flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Completed
                          </span>
                        ) : task.status === "connecting" ? (
                          <span className="flex items-center gap-1 text-[9px] bg-blue-500/10 text-blue-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono animate-pulse">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" />{" "}
                            Connecting
                          </span>
                        ) : task.status === "stalled" ? (
                          <span className="flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <ShieldAlert className="w-2.5 h-2.5" /> Stalled
                          </span>
                        ) : task.status === "failed" ? (
                          <span className="flex items-center gap-1 text-[9px] bg-red-500/10 text-red-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <ShieldAlert className="w-2.5 h-2.5" /> Failed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono animate-pulse">
                            <Download className="w-2.5 h-2.5" /> Streaming
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {task.indexer}
                        </span>
                        {task.retryCount && task.retryCount > 0 && (
                          <span className="text-[8px] text-neutral-600 bg-neutral-900 px-1 py-0.5 rounded font-mono">
                            Retry: {task.retryCount}
                          </span>
                        )}
                        {!isCompleted && task.status !== "failed" && (
                          <span className="text-[10px] text-[#888] font-mono hidden md:inline">
                            · DL: {task.downloadSpeed} · peers:{" "}
                            {task.numPeers || 0}
                          </span>
                        )}
                      </div>

                      <h4
                        onClick={() => toggleExpand(task.id)}
                        className="font-sans font-bold text-xs text-neutral-200 truncate mt-1 cursor-pointer hover:text-amber-500 transition pr-4"
                        title={task.name}
                      >
                        {task.name}
                      </h4>
                    </div>

                    {/* Progress Slider and Controls */}
                    <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-neutral-400 font-bold w-9 text-right">
                          {task.progress}%
                        </span>
                        <div className="w-16 sm:w-28 bg-[#1e1e1e] h-1.5 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${task.progress}%` }}
                            className={`h-full transition-all duration-300 ${
                              isCompleted ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-neutral-500 hidden sm:inline">
                          {task.size}
                        </span>
                      </div>

                      {/* Mini actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        {(task.status === "stalled" ||
                          task.status === "failed" ||
                          (task.status === "downloading" &&
                            task.progress === 0)) &&
                          onRetryTask && (
                            <button
                              onClick={() => onRetryTask(task.id)}
                              className="text-neutral-400 hover:text-amber-500 p-1.5 hover:bg-neutral-800 rounded transition shrink-0 cursor-pointer"
                              title="Force restart torrent with common trackers"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}

                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="text-neutral-500 hover:text-neutral-200 p-1.5 hover:bg-neutral-800 rounded transition shrink-0 cursor-pointer flex items-center justify-center animate-pulse"
                          title={
                            isExpanded ? "Collapse Details" : "Expand Details"
                          }
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail views & folder files */}
                  {isExpanded && (
                    <div className="border-t border-[#222]/80 mt-2.5 pt-2.5 space-y-2.5">
                      {/* Physical disk path */}
                      <div className="flex items-center gap-1.5 justify-between">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-neutral-500 uppercase">
                          <Database
                            size={10}
                            className="text-neutral-600 mb-0.5"
                          />
                          <span className="truncate">
                            Locally stored in: /data/bookarr/download/
                            {task.name}
                          </span>
                        </div>
                      </div>

                      {/* Stager Status banner */}
                      {pullingTasksMap[task.id] && (
                        <div className="p-3 rounded-xl border border-amber-500/20 bg-[#16130c] space-y-2">
                          <div className="flex justify-between items-center text-[11px] font-sans">
                            <span className="text-amber-400 font-bold flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 animate-pulse shrink-0" />
                              {pullingTasksMap[task.id].status === "pulling"
                                ? "Streaming Stream to Local Browser Staging..."
                                : pullingTasksMap[task.id].status ===
                                    "completed"
                                  ? "Completed: Synced directly to local disk!"
                                  : "Failed to Stream File"}
                            </span>
                            <span className="font-mono text-amber-500 font-bold">
                              {pullingTasksMap[task.id].percent}%
                            </span>
                          </div>

                          <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden border border-neutral-850">
                            <div
                              style={{
                                width: `${pullingTasksMap[task.id].percent}%`,
                              }}
                              className="bg-amber-500 h-full transition-all duration-300"
                            />
                          </div>
                          {pullingTasksMap[task.id].message && (
                            <p className="text-[10px] text-neutral-400 font-mono italic">
                              {pullingTasksMap[task.id].message}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Manual Pull Action Button if completed and handle is ready & not pulled yet */}
                      {isCompleted &&
                        !pullingTasksMap[task.id] &&
                        (watchInternalDirHandle || watchDirHandle) && (
                          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#151515] border border-neutral-900 text-xs">
                            <span className="text-neutral-400 text-[11px] font-medium font-sans">
                              File downloaded on server staging. Pull directly
                              to local browser staging handle.
                            </span>
                            <button
                              type="button"
                              onClick={() => handlePullTorrentFiles(task)}
                              className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase cursor-pointer transition select-none flex items-center gap-1 shrink-0 ml-4"
                            >
                              <Download className="w-3 h-3" />
                              Pull to Browser Staging
                            </button>
                          </div>
                        )}

                      {/* Help warning if completed and no browser handle is synced */}
                      {isCompleted &&
                        !watchInternalDirHandle &&
                        !watchDirHandle && (
                          <div className="p-3.5 rounded-xl bg-orange-500/5 border border-orange-500/10 text-[11px] text-neutral-400 flex items-start gap-2.5">
                            <HelpCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <p className="text-neutral-300 font-bold">
                                Staging Folder Locked or Unconfigured
                              </p>
                              <p>
                                To enable direct browser file transfer, go to
                                the Settings page and select a Watch/Staging
                                directory.
                              </p>
                            </div>
                          </div>
                        )}

                      {/* Technical detail cards panel */}
                      {!isCompleted && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#181818]/50 p-2 rounded-lg text-[9px] font-mono text-neutral-400 border border-neutral-900">
                          <div>
                            <span className="text-[9px] text-neutral-550 block uppercase">
                              DL Speed
                            </span>
                            <span className="text-neutral-200 mt-0.5 block font-semibold">
                              {task.downloadSpeed}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-[#888] block uppercase">
                              UL Speed
                            </span>
                            <span className="text-neutral-200 mt-0.5 block">
                              {task.uploadSpeed}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-[#888] block uppercase">
                              ETA Remaining
                            </span>
                            <span className="text-neutral-200 mt-0.5 block font-semibold">
                              {task.eta}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-[#888] block uppercase">
                              Connected peers
                            </span>
                            <span className="text-neutral-200 mt-0.5 block font-semibold">
                              {task.numPeers || 0} active connections
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Files inside Torrent list */}
                      <div className="space-y-1 bg-[#151515] p-2 rounded-lg border border-neutral-900">
                        <p className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest pl-1">
                          Torrent Folder Contents ({task.files.length} files)
                        </p>
                        <div className="space-y-0.5 max-h-40 overflow-y-auto custom-scrollbar pr-0.5 divide-y divide-neutral-950">
                          {task.files.map((file, i) => (
                            <div
                              key={i}
                              className="flex justify-between items-center text-[10px] text-neutral-400 py-1 hover:bg-neutral-800/40 rounded px-1 transition"
                            >
                              <div className="flex items-center gap-2 truncate">
                                {file.type === "audio" ? (
                                  <FileAudio className="w-3 h-3 text-amber-500 shrink-0" />
                                ) : file.type === "ebook" ? (
                                  <FileText className="w-3 h-3 text-blue-400 shrink-0" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-neutral-600 shrink-0 rotate-270" />
                                )}
                                <span className="truncate text-neutral-300 font-medium">
                                  {file.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5 font-mono text-[9px] shrink-0 ml-2">
                                <span className="text-neutral-500">
                                  {file.size}
                                </span>
                                <span
                                  className={
                                    file.progress === 100
                                      ? "text-emerald-500 font-semibold"
                                      : "text-amber-500"
                                  }
                                >
                                  {file.progress}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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
              <h3 className="font-sans font-bold text-sm text-neutral-100">
                Local Archive & Watch Folder Organizer
              </h3>
              <p className="text-[11px] text-neutral-400">
                Sweeps downloaded files, renames, and moves them to organized
                library directories
              </p>
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
                <RefreshCw
                  className={`w-3.5 h-3.5 text-amber-500 ${isOrganizerScanning ? "animate-spin" : ""}`}
                />
                {isOrganizerScanning ? "Scanning..." : "Scan Watch Folder"}
              </button>
            )}
          </div>
        </div>

        {organizerStatusMessage && (
          <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl px-4 py-2.5 text-xs text-amber-400 font-mono animate-pulse">
            ✨ {organizerStatusMessage}
          </div>
        )}

        {typeof window !== "undefined" && window.self !== window.top && (
          <div className="bg-amber-550/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400 space-y-2 leading-relaxed text-left">
            <p className="font-bold text-amber-400 flex items-center gap-1.5">
              ⚠️ Browser Preview Limitation (Iframe Blocked)
            </p>
            <p>
              Local folder scanning and organizing features are restricted
              inside of preview frames. Open this app in separate browser tab to
              run the automated folder synchronization on-the-fly.
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

        {isLoadingHandles ? (
          <div className="bg-[#161616] border border-neutral-900 rounded-xl p-6 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-500/60 mx-auto animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-neutral-200">
                Verifying Local Storage Connections...
              </p>
              <p className="text-[11px] text-neutral-500">
                Checking device folder links and directory authorization...
              </p>
            </div>
          </div>
        ) : !watchDirHandle && !watchInternalDirHandle ? (
          rootName ? (
            <div className="bg-[#161616] border border-neutral-900 rounded-xl p-6 text-center space-y-4">
              <FolderClosed className="w-8 h-8 text-amber-500/60 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-neutral-200">
                  Storage Root "{rootName}" Access Required
                </p>
                <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                  Your browser storage root folder is configured, but active
                  folder connections are currently locked by browser security.
                  Go to the Settings page to verify & unlock the mapped
                  directories.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-[#161616] border border-neutral-900 rounded-xl p-6 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-amber-500/60 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-neutral-200">
                  Local Organizer Disconnected
                </p>
                <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                  Configure a Watch Directory and organized destination paths in
                  the Settings menu to enable automated file renaming and
                  sorting.
                </p>
              </div>
            </div>
          )
        ) : !dirHasPermission.watch && !dirHasPermission.watchInternal ? (
          <div className="bg-[#161616] border border-neutral-900 rounded-xl p-6 text-center space-y-4">
            <FolderClosed className="w-8 h-8 text-amber-500/60 mx-auto" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-neutral-200">
                Watch Folder Connection Locked
              </p>
              <p className="text-[11px] text-neutral-500 max-w-sm mx-auto">
                Local File System Access requires user verification to resume
                active scans after page reloads.
              </p>
            </div>
            <button
              type="button"
              onClick={unlockWatchFolder}
              className="bg-amber-500 text-black px-4 py-2 rounded-lg text-xs font-bold uppercase hover:bg-amber-400 transition cursor-pointer mx-auto block"
            >
              Verify & Unlock Folders
            </button>
          </div>
        ) : watchFolderFiles.length === 0 ? (
          <div className="text-center py-8 text-neutral-550 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-neutral-700 mx-auto" />
            <p className="text-xs font-medium">Watch Folders Clean</p>
            <p className="text-[10px] text-neutral-500 max-w-sm mx-auto font-sans leading-relaxed">
              No EPUB or Audiobook files are currently pending in your watch
              folders. Downloaded torrents will appear here when done!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>
                Pending files in watch folders ({watchFolderFiles.length})
              </span>
            </div>

            <div className="divide-y divide-neutral-950 border border-neutral-900 rounded-xl overflow-hidden bg-[#141414]">
              {watchFolderFiles.map((file) => {
                // Determine mapped book
                const currentMappedId =
                  manualMappedBookIds[file.path] || file.autoMappedBook?.id;
                const activeMappedBook = books.find(
                  (b) => b.id === currentMappedId,
                );
                const isAuto =
                  !manualMappedBookIds[file.path] && file.autoMappedBook;

                // Keep only books of same type for mapping
                const filteredMappingBooks = books.filter(
                  (b) => b.type === file.type,
                );

                const localMeta = extractedMetadataMap[file.path];
                const isParsing = parsingMetadataMap[file.path];

                return (
                  <div
                    key={file.path}
                    className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between p-4 gap-4 bg-[#141414] hover:bg-[#161616] transition text-left"
                  >
                    {/* Visual details column */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {localMeta?.coverUrl ? (
                        <img
                          src={localMeta.coverUrl}
                          alt="Cover thumbnail"
                          referrerPolicy="no-referrer"
                          className="w-10 h-14 object-cover rounded shadow-lg border border-neutral-800 shrink-0"
                        />
                      ) : (
                        <div className="p-2 bg-neutral-950 border border-neutral-900 rounded-lg shrink-0">
                          {file.type === "audiobook" ? (
                            <FileAudio className="w-5 h-5 text-amber-500" />
                          ) : (
                            <FileText className="w-5 h-5 text-blue-400" />
                          )}
                        </div>
                      )}

                      <div className="truncate text-left min-w-0 flex-1">
                        <span
                          className="text-xs font-bold text-neutral-200 block truncate"
                          title={file.name}
                        >
                          {file.name}
                        </span>

                        {isParsing && (
                          <div className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5 font-mono animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Reading inner metadata...
                          </div>
                        )}

                        {!isParsing && localMeta && (
                          <div className="text-[10px] text-emerald-400 mt-1 bg-emerald-500/10 border border-emerald-500/15 rounded px-2 py-0.5 inline-block max-w-full truncate font-sans">
                            ✨ Inner title:{" "}
                            <strong className="font-bold text-emerald-300">
                              {localMeta.title || "Untitled"}
                            </strong>{" "}
                            {localMeta.author && `by ${localMeta.author}`}{" "}
                            {localMeta.duration &&
                              `(${Math.round(localMeta.duration / 60)} min)`}
                          </div>
                        )}

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
                        <span className="text-[10px] font-mono text-neutral-500 uppercase block">
                          Library Target Assignment
                        </span>

                        {/* Dynamic manual connector dropdown */}
                        <div className="relative">
                          <select
                            value={currentMappedId || ""}
                            onChange={(e) => {
                              const targetId = e.target.value;
                              setManualMappedBookIds((prev) => ({
                                ...prev,
                                [file.path]: targetId,
                              }));
                            }}
                            className="w-full bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg p-1.5 pr-6 focus:outline-none focus:border-amber-500 text-neutral-300 text-[11px] font-medium appearance-none cursor-pointer"
                          >
                            <option value="">
                              -- Let's manual map to Book --
                            </option>
                            {filteredMappingBooks.map((b) => (
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
                                <Sparkles className="w-2.5 h-2.5" /> Auto-Mapped
                                Match
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
                          disabled={
                            !activeMappedBook || organizingFilesMap[file.path]
                          }
                          className="w-full sm:w-auto bg-amber-500 text-black disabled:bg-neutral-900 disabled:text-neutral-500 px-4 py-2 rounded-lg text-xs font-bold uppercase hover:bg-amber-400 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {organizingFilesMap[file.path] ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                              Moving...
                            </>
                          ) : (
                            "Organize & Move"
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
            <h5 className="font-sans font-bold text-xs text-amber-400">
              Webtor Automation Bridge
            </h5>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Upon completed torrent execution, the server backend automatically
              unpackages ePUB text files or MP3 audio tracks, maps the
              corresponding AudiobookShelf directory schemas, and binds them to
              your media dashboard instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
