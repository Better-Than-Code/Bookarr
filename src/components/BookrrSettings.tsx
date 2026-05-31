/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Settings,
  HardDrive,
  Terminal,
  Plus,
  Layers,
  CheckCircle2,
  Trash2,
  Activity,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  Volume2,
  Sparkles,
  Wand2,
  Zap,
  X,
  FileUp,
  Search,
  Database,
  Globe,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BookrrConfig, IndexerSettings, MessageLog, Book } from "../types";
import { useReadAloud } from "../context/ReadAloudContext";
import {
  getDirectoryHandle,
  saveDirectoryHandle,
  deleteDirectoryHandle,
  verifyDirectoryPermission,
  getOfflineBooksMap,
  getOfflineFile,
  updateOfflineFilePath,
  saveOfflineFile,
  saveFileHandle,
} from "../services/LocalFileService";
import {
  sanitizePathName,
  scanWatchFolder,
  autoMapFiles,
  organizeSingleFile,
  WatchFolderFile,
} from "../services/LocalOrganizerService";

interface PresetTracker {
  id: string;
  name: string;
  url: string;
  type: "native";
  description: string;
}

const PRESET_TRACKERS_DB: PresetTracker[] = [
  {
    id: "p1",
    name: "1337x (Main)",
    url: "https://1337x.to",
    type: "native",
    description:
      "Extremely popular public tracker directory with reliable ebook and audiobook categories.",
  },
  {
    id: "p2",
    name: "1337x (Mirror ST)",
    url: "https://1337x.st",
    type: "native",
    description: "Fast mirror for books, software and media categories.",
  },
  {
    id: "p3",
    name: "1337x (Mirror WS)",
    url: "https://1337x.ws",
    type: "native",
    description: "Resilient alternate domain mirror for global reach.",
  },
  {
    id: "p4",
    name: "LimeTorrents (Main)",
    url: "https://limetorrents.info",
    type: "native",
    description: "Long-running verified public indexer with robust search api.",
  },
  {
    id: "p5",
    name: "LimeTorrents (Mirror LOL)",
    url: "https://limetorrents.lol",
    type: "native",
    description: "LimeTorrents high speed secondary mirror.",
  },
  {
    id: "p6",
    name: "The Pirate Bay (Main)",
    url: "https://thepiratebay.org",
    type: "native",
    description: "The galaxy's most legendary and resilient indexer.",
  },
  {
    id: "p7",
    name: "The Pirate Bay (Mirror 10)",
    url: "https://thepiratebay10.org",
    type: "native",
    description: "Reliable fast-mirror proxy with multi-category search.",
  },
  {
    id: "p8",
    name: "SolidTorrents (Main)",
    url: "https://solidtorrents.to",
    type: "native",
    description:
      "An extremely fast, clean DHT crawler search engine with high-quality ebook seeds.",
  },
  {
    id: "p9",
    name: "SolidTorrents (Mirror NET)",
    url: "https://solidtorrents.net",
    type: "native",
    description: "Alternative secure DHT gateway for SolidTorrents.",
  },
  {
    id: "p10",
    name: "TorrentDownloads (Main)",
    url: "https://www.torrentdownloads.pro",
    type: "native",
    description:
      "Quality torrent archives directory with an extensive database of epub and pdf books.",
  },
  {
    id: "p11",
    name: "Kickass (Main)",
    url: "https://kickasst.net",
    type: "native",
    description: "Modern interface mirror of the classic Kickass indexer.",
  },
  {
    id: "p12",
    name: "Kickass (Proxy WS)",
    url: "https://kickass.ws",
    type: "native",
    description: "Fast public search endpoint mirror.",
  },
  {
    id: "p13",
    name: "GloTorrents (Main)",
    url: "https://glodls.to",
    type: "native",
    description: "Direct search on active public torrent DB.",
  },
  {
    id: "p14",
    name: "Torlock (Main)",
    url: "https://www.torlock.com",
    type: "native",
    description:
      "Verified only torrent tracker indexer (strictly screens fake uploads).",
  },
  {
    id: "p15",
    name: "LibGen (Main)",
    url: "https://libgen.is",
    type: "native",
    description: "Library Genesis ebooks & papers indexer.",
  },
  {
    id: "p16",
    name: "LibGen (Mirror RS)",
    url: "https://libgen.rs",
    type: "native",
    description:
      "Alternative reliable direct download server gateway for LibGen books.",
  },
];

interface IndexerSettingsProps {
  books?: Book[];
  config: BookrrConfig;
  indexers: IndexerSettings[];
  logs: MessageLog[];
  onSaveConfig: (updated: {
    config: BookrrConfig;
    indexers: IndexerSettings[];
  }) => void;
  onClearLogs?: () => void;
}

export default function BookrrSettings({
  books = [],
  config,
  indexers,
  logs,
  onSaveConfig,
}: IndexerSettingsProps) {
  const {
    state: ttsState,
    setEngine: setTtsEngine,
    initializeNeuralEngine,
    cancelNeuralEngine,
    resetNeuralEngine,
    setNeuralModel,
    setNeuralBackend,
  } = useReadAloud();
  // Form configurations
  const [webtorEnabled, setWebtorEnabled] = useState(
    config.webtorEnabled ?? true,
  );
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const currentSavedModelFull =
    localStorage.getItem("bookrr_tts_model_id") ||
    "kokoro/Kokoro-82M-v1.0-ONNX";
  const modelParts = currentSavedModelFull.split("/");
  const savedBaseModel = modelParts.slice(0, 2).join("/");
  const savedSpeakerId = parseInt(modelParts[2]) || 0;

  const [selectedNeuralModel, setSelectedNeuralModel] =
    useState(savedBaseModel);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(savedSpeakerId);

  const currentSavedBackend =
    localStorage.getItem("bookrr_tts_backend") || "auto";
  const [selectedBackend, setSelectedBackend] = useState(currentSavedBackend);

  const handleNeuralModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedNeuralModel(val);
    if (val.includes("libritts") || val.includes("vctk")) {
      setNeuralModel(val + "/" + selectedSpeakerId);
    } else {
      setNeuralModel(val);
    }
  };

  const handleSpeakerIdChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const val = parseInt(e.target.value) || 0;
    setSelectedSpeakerId(val);
    setNeuralModel(selectedNeuralModel + "/" + val);
  };

  const US_VOICE_PRESETS = [
    { id: 0, label: "Sarah (Female)" },
    { id: 1, label: "Emily (Female)" },
    { id: 2, label: "Robert (Male)" },
    { id: 3, label: "Michael (Male)" },
    { id: 4, label: "Jessica (Female)" },
    { id: 5, label: "Thomas (Male)" },
    { id: 6, label: "William (Male)" },
    { id: 7, label: "Henry (Male)" },
    { id: 8, label: "David (Male)" },
    { id: 9, label: "Alice (Female)" },
  ];
  const UK_VOICE_PRESETS = [
    { id: 0, label: "Elizabeth (Female)" },
    { id: 1, label: "Charlotte (Female)" },
    { id: 2, label: "Victoria (Female)" },
    { id: 3, label: "Beatrice (Female)" },
    { id: 4, label: "Alistair (Male)" },
    { id: 5, label: "George (Male)" },
    { id: 6, label: "Charles (Male)" },
    { id: 7, label: "Harry (Male)" },
    { id: 8, label: "Arthur (Female)" },
    { id: 9, label: "Florence (Male)" },
  ];

  const handleBackendChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBackend(e.target.value);
    setNeuralBackend(e.target.value);
  };

  const showNotification = (
    type: "success" | "error" | "info",
    message: string,
  ) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((current) =>
        current?.message === message ? null : current,
      );
    }, 6000);
  };
  const [localDownloadPath, setLocalDownloadPath] = useState(
    config.localDownloadPath || "",
  );

  // Indexers management
  const [localIndexers, setLocalIndexers] = useState<IndexerSettings[]>(
    indexers || [],
  );
  const [activeSettingTab, setActiveSettingTab] = useState<
    "general" | "storage" | "speech" | "indexers" | "logs"
  >("general");
  const [saveStatus, setSaveStatus] = useState("");

  // New indexer states
  const [showAddIndexer, setShowAddIndexer] = useState(false);
  const [newIndexerName, setNewIndexerName] = useState("");
  const [newIndexerUrl, setNewIndexerUrl] = useState("");
  const [newIndexerApiKey, setNewIndexerApiKey] = useState("");
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    status: "online" | "offline";
    error?: string;
  } | null>(null);

  // Public Torrent Tracker / Indexer Preset Database States
  const [showPublicDb, setShowPublicDb] = useState(false);
  const [dbSearchQuery, setDbSearchQuery] = useState("");
  const [verifyingTrackerId, setVerifyingTrackerId] = useState<string | null>(
    null,
  );
  const [verificationStatuses, setVerificationStatuses] = useState<
    Record<
      string,
      { status: "online" | "offline" | "checking"; error?: string }
    >
  >({});

  // Local File System Organizer Directory handles state
  const [watchHandle, setWatchHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [watchInternalHandle, setWatchInternalHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [ebooksHandle, setEbooksHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [audiobooksHandle, setAudiobooksHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  const [watchPermission, setWatchPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [watchInternalPermission, setWatchInternalPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [ebooksPermission, setEbooksPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [audiobooksPermission, setAudiobooksPermission] = useState<
    "pending" | "granted" | "denied"
  >("pending");
  const [internalStorage, setInternalStorage] = useState<{
    baseDir: string;
    paths: Record<string, string>;
  } | null>(null);
  const [rootHandle, setRootHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [rootName, setRootName] = useState<string | null>(null);

  // ... rest of state stays same ...

  const pickRootFolder = async () => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      setRootHandle(handle);

      // Auto-create subfolders if not present
      const watchInternal = await handle.getDirectoryHandle("download", {
        create: true,
      });
      const ebooksHandle = await handle.getDirectoryHandle("ebooks", {
        create: true,
      });
      const audiobooksHandle = await handle.getDirectoryHandle("audiobooks", {
        create: true,
      });

      setWatchInternalHandle(watchInternal);
      setEbooksHandle(ebooksHandle);
      setAudiobooksHandle(audiobooksHandle);

      setWatchInternalPermission("granted");
      setEbooksPermission("granted");
      setAudiobooksPermission("granted");

      // Persist handles manually as we're not using a library for this simplicity
      localStorage.setItem("bookarr_root_name", handle.name);
      setRootName(handle.name);

      // Save handles to IndexedDB for persistence
      await saveDirectoryHandle("watch_internal", watchInternal);
      await saveDirectoryHandle("ebooks", ebooksHandle);
      await saveDirectoryHandle("audiobooks", audiobooksHandle);

      showNotification(
        "success",
        `Bookarr fully initialized inside folder: "${handle.name}". Staged downloads, organized Ebooks and Audiobooks folders mapped correctly.`,
      );
    } catch (e: any) {
      console.error("Failed to pick root folder", e);
      if (e.name !== "AbortError") {
        showNotification(
          "error",
          `Failed to initialize folder root: ${e.message || String(e)}`,
        );
      }
    }
  };

  // Library Structure Validation State
  interface LibraryDiscrepancy {
    bookId: string;
    title: string;
    author: string;
    type: "audiobook" | "ebook";
    currentPath: string;
    expectedPath: string; // relative path like Author/Book/Title - Author.ext
    expectedFilename: string; // Title - Author.ext
    source: "indexeddb" | "watch";
    watchFile?: WatchFolderFile; // To store WatchFolderFile if it comes from watch directory
  }

  const [isScanningLibrary, setIsScanningLibrary] = useState(false);
  const [libraryDiscrepancies, setLibraryDiscrepancies] = useState<
    LibraryDiscrepancy[]
  >([]);
  const [hasScannedLibrary, setHasScannedLibrary] = useState(false);
  const [isFixingLibrary, setIsFixingLibrary] = useState(false);
  const [isCleaningLibrary, setIsCleaningLibrary] = useState(false);
  const [cleanupResults, setCleanupResults] = useState<Book[] | null>(null);
  const [fixProgress, setFixProgress] = useState(0);

  const isInIframe =
    typeof window !== "undefined" && window.self !== window.top;

  useEffect(() => {
    const loadHandles = async () => {
      try {
        const storedRootName = localStorage.getItem("bookarr_root_name");
        if (storedRootName) {
          setRootName(storedRootName);
        }

        // Fetch internal storage paths from server with retries
        const fetchStorage = (retries = 3) => {
          fetch("/api/system/storage")
            .then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then((data) => {
              if (data.success) {
                setInternalStorage({
                  baseDir: data.baseDir,
                  paths: data.paths,
                });
              }
            })
            .catch((err) => {
              console.error("Failed to fetch storage info:", err);
              if (retries > 0) {
                setTimeout(() => fetchStorage(retries - 1), 2000);
              }
            });
        };
        fetchStorage();

        const watch = await getDirectoryHandle("watch");
        const watchInternal = await getDirectoryHandle("watch_internal");
        const ebooks = await getDirectoryHandle("ebooks");
        const audiobooks = await getDirectoryHandle("audiobooks");

        setWatchHandle(watch);
        setWatchInternalHandle(watchInternal);
        setEbooksHandle(ebooks);
        setAudiobooksHandle(audiobooks);

        // Check permission if handle is there
        if (watch) {
          const perm = await (watch as any).queryPermission({
            mode: "readwrite",
          });
          setWatchPermission(perm === "granted" ? "granted" : "pending");
        }
        if (watchInternal) {
          const perm = await (watchInternal as any).queryPermission({
            mode: "readwrite",
          });
          setWatchInternalPermission(
            perm === "granted" ? "granted" : "pending",
          );
        }
        if (ebooks) {
          const perm = await (ebooks as any).queryPermission({
            mode: "readwrite",
          });
          setEbooksPermission(perm === "granted" ? "granted" : "pending");
        }
        if (audiobooks) {
          const perm = await (audiobooks as any).queryPermission({
            mode: "readwrite",
          });
          setAudiobooksPermission(perm === "granted" ? "granted" : "pending");
        }
      } catch (e) {
        console.warn("Error loading handles inside settings mount:", e);
      }
    };
    loadHandles();
  }, []);

  const selectFolder = async (type: "watch" | "ebooks" | "audiobooks") => {
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({
        id: `bookrr-${type}-picker`,
        mode: "readwrite",
      });
      await saveDirectoryHandle(type, handle);

      if (type === "watch") {
        setWatchHandle(handle);
        setWatchPermission("granted");
      } else if (type === "ebooks") {
        setEbooksHandle(handle);
        setEbooksPermission("granted");
      } else if (type === "audiobooks") {
        setAudiobooksHandle(handle);
        setAudiobooksPermission("granted");
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.error(`Directory picking failed for ${type}:`, e);

        const isIframeMessage =
          e.message?.includes("sub frame") ||
          e.message?.includes("cross-origin") ||
          e.message?.includes("iframe") ||
          (typeof window !== "undefined" && window.self !== window.top);

        if (isIframeMessage) {
          showNotification(
            "error",
            'Cross-origin sandbox restriction: Folder pickers cannot open inside frames. Please click "Open in New Tab" to authorize local directories!',
          );
        } else {
          showNotification(
            "error",
            `Folder connection failed: ${e.message || String(e)}`,
          );
        }
      }
    }
  };

  const verifyResetPermission = async (
    type: "watch" | "watch_internal" | "ebooks" | "audiobooks",
    handle: FileSystemDirectoryHandle,
  ) => {
    const perm = await verifyDirectoryPermission(handle, true, true);
    if (type === "watch") setWatchPermission(perm ? "granted" : "denied");
    else if (type === "watch_internal")
      setWatchInternalPermission(perm ? "granted" : "denied");
    else if (type === "ebooks")
      setEbooksPermission(perm ? "granted" : "denied");
    else if (type === "audiobooks")
      setAudiobooksPermission(perm ? "granted" : "denied");
  };

  const removeFolder = async (
    type: "watch" | "watch_internal" | "ebooks" | "audiobooks",
  ) => {
    await deleteDirectoryHandle(type);
    if (type === "watch") {
      setWatchHandle(null);
      setWatchPermission("pending");
    } else if (type === "watch_internal") {
      setWatchInternalHandle(null);
      setWatchInternalPermission("pending");
    } else if (type === "ebooks") {
      setEbooksHandle(null);
      setEbooksPermission("pending");
    } else if (type === "audiobooks") {
      setAudiobooksHandle(null);
      setAudiobooksPermission("pending");
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
        const parts = offlineInfo.name.split(".");
        const ext =
          parts.length > 1
            ? parts.pop()
            : offlineInfo.filePath?.split(".").pop() ||
              (book.type === "audiobook" ? "mp3" : "epub");
        const expectedFilename = `${titleFolder} - ${authorFolder}.${ext}`;
        const relativeExpectedPath = `${authorFolder}/${titleFolder}/${expectedFilename}`;
        const fullExpectedPath = `${book.type === "audiobook" ? "Audiobooks" : "Ebooks"}/${relativeExpectedPath}`;

        const isStandardStructure =
          currentPath === relativeExpectedPath ||
          currentPath === fullExpectedPath;

        if (!isStandardStructure) {
          discrepancies.push({
            bookId: book.id,
            title: book.title,
            author: book.author,
            type: book.type,
            currentPath,
            expectedPath: relativeExpectedPath,
            expectedFilename,
            source: "indexeddb",
          });
        }
      }

      // 2. Scan Watch (Downloads) Directory for unassigned auto-matching files
      if (
        watchHandle ||
        watchInternalHandle ||
        ebooksHandle ||
        audiobooksHandle
      ) {
        try {
          let combinedFiles: WatchFolderFile[] = [];
          if (watchHandle) {
            const fileList = await scanWatchFolder(watchHandle);
            combinedFiles = [...combinedFiles, ...fileList];
          }
          if (watchInternalHandle) {
            const internalFileList = await scanWatchFolder(watchInternalHandle);
            combinedFiles = [...combinedFiles, ...internalFileList];
          }
          if (ebooksHandle) {
            const ebooksFileList = await scanWatchFolder(ebooksHandle);
            combinedFiles = [...combinedFiles, ...ebooksFileList];
          }
          if (audiobooksHandle) {
            const audiobooksFileList = await scanWatchFolder(audiobooksHandle);
            combinedFiles = [...combinedFiles, ...audiobooksFileList];
          }

          const mappedFiles = autoMapFiles(combinedFiles, books);
          for (const file of mappedFiles) {
            if (file.autoMappedBook) {
              const book = file.autoMappedBook;
              // If the book does NOT have an offline map entry correctly set up yet, OR it's a cover
              if (!offlineMap[book.id] || file.type === "cover") {
                const authorFolder = sanitizePathName(book.author);
                const titleFolder = sanitizePathName(book.title);
                const ext = file.extension;
                const expectedFilename =
                  file.type === "cover"
                    ? `cover.${ext}`
                    : `${titleFolder} - ${authorFolder}.${ext}`;
                const relativeExpectedPath = `${authorFolder}/${titleFolder}/${expectedFilename}`;

                // Path indicator
                let currentPathText = `/Downloads/${file.path}`;
                if (file.originDirHandle === ebooksHandle)
                  currentPathText = `/Ebooks/${file.path}`;
                if (file.originDirHandle === audiobooksHandle)
                  currentPathText = `/Audiobooks/${file.path}`;

                discrepancies.push({
                  bookId: book.id,
                  title: book.title,
                  author: book.author,
                  type: book.type,
                  currentPath: currentPathText, // Virtual representation showing location
                  expectedPath: relativeExpectedPath,
                  expectedFilename,
                  source: "watch",
                  watchFile: file,
                });
              }
            }
          }
        } catch (e) {
          console.warn(
            "Failed to scan folders during library structure check:",
            e,
          );
        }
      }

      setLibraryDiscrepancies(discrepancies);
    } catch (err: any) {
      console.error("Failed to analyze library structure:", err);
      showNotification(
        "error",
        `Analyzing library structure failed: ${err.message || String(err)}`,
      );
    } finally {
      setHasScannedLibrary(true);
      setIsScanningLibrary(false);
    }
  };

  const handleOrganizeDiscrepancies = async () => {
    if (!ebooksHandle || !audiobooksHandle) {
      showNotification(
        "info",
        "Please connect both Organized Ebooks and Audiobooks destination folders to organize files.",
      );
      return;
    }

    if (
      !confirm(
        `Are you sure you want to move and rename ${libraryDiscrepancies.length} files?`,
      )
    ) {
      return;
    }

    setIsFixingLibrary(true);
    setFixProgress(0);

    let fixedCount = 0;

    for (let i = 0; i < libraryDiscrepancies.length; i++) {
      const disc = libraryDiscrepancies[i];
      try {
        const baseHandle =
          disc.type === "audiobook" ? audiobooksHandle : ebooksHandle;

        if (disc.source === "indexeddb") {
          const record = await getOfflineFile(disc.bookId);
          if (!record) continue; // couldn't read local indexblob

          // Reorganize using new service method
          const baseHandle =
            disc.type === "audiobook" ? audiobooksHandle : ebooksHandle;

          // For indexedDB, we don't have a direct filehandle here, so we continue using existing logic
          // but can refactor this to use reorganizeFile if we could get a handle.
          // Given the constraint, I will keep current indexedDB logic but improve the path handling.

          // 1. Create Author / Book Directory
          const authorFolder = sanitizePathName(disc.author);
          const bookFolder = sanitizePathName(disc.title);

          const authorDirHandle = await baseHandle.getDirectoryHandle(
            authorFolder,
            { create: true },
          );
          const bookDirHandle = await authorDirHandle.getDirectoryHandle(
            bookFolder,
            { create: true },
          );

          // 2. Write file
          const fileHandle = await bookDirHandle.getFileHandle(
            disc.expectedFilename,
            { create: true },
          );
          const writable = await fileHandle.createWritable();
          const arrayBuffer = await record.blob.arrayBuffer();
          await writable.write(arrayBuffer);
          await writable.close();

          // 3. Update DB
          const finalDestPath = `${disc.type === "audiobook" ? "Audiobooks" : "Ebooks"}/${disc.expectedPath}`;
          await updateOfflineFilePath(disc.bookId, finalDestPath);
          await saveFileHandle(disc.bookId, fileHandle);

          // Optional: remove old file if currentPath != finalDestPath
          // ... (would require parent handle, skipping for now as per constraints)

          fixedCount++;
        } else if (
          disc.source === "watch" &&
          disc.watchFile &&
          (watchHandle || watchInternalHandle)
        ) {
          const bookRef = books.find((b) => b.id === disc.bookId);
          if (!bookRef) continue;

          const fallbackWatchDir = watchHandle || watchInternalHandle;
          const result = await organizeSingleFile(
            disc.watchFile,
            fallbackWatchDir!,
            baseHandle,
            bookRef,
          );
          if (result.success && result.fileObj) {
            try {
              if (disc.watchFile.type === "cover") {
                const reader = new FileReader();
                reader.readAsDataURL(result.fileObj);
                reader.onload = async () => {
                  const coverUrl = reader.result as string;
                  try {
                    await fetch(`/api/books/${disc.bookId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ coverUrl }),
                    });
                  } catch (e) {}
                };
                fixedCount++;
              } else {
                // Save the file contents persistently into IndexedDB mapped to this book ID
                await saveOfflineFile(
                  disc.bookId,
                  disc.watchFile.name,
                  result.fileObj,
                  result.destinationPath,
                );
                if (result.destFileHandle) {
                  await saveFileHandle(disc.bookId, result.destFileHandle);
                }
                fixedCount++;
              }
            } catch (dbErr) {
              console.error(
                "Failed to register organized physical file inside IndexedDB:",
                dbErr,
              );
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
    showNotification(
      "success",
      `Library sorted and restructured! Synchronized ${fixedCount} of ${libraryDiscrepancies.length} filesystem items successfully.`,
    );

    // Refresh the list
    handleAnalyzeLibraryStructure();
  };

  const handleScanLibraryCleanup = async () => {
    setIsCleaningLibrary(true);
    try {
      const res = await fetch("/api/library/cleanup");
      if (res.ok) {
        const data = await res.json();
        setCleanupResults(data.missingEntries || []);
        if (data.missingEntries.length > 0) {
          showNotification(
            "info",
            `Found ${data.missingEntries.length} invalid library entries.`,
          );
        } else {
          showNotification("success", `Library is pristine. No missing files.`);
        }
      }
    } catch (e) {
      console.error("Cleanup scan failed", e);
      showNotification("error", "Failed to check library cleanup status");
    } finally {
      setIsCleaningLibrary(false);
    }
  };

  const handlePerformDelete = async (bookId: string, deleteFiles: boolean) => {
    try {
      const res = await fetch(
        `/api/books/${bookId}?deleteFiles=${deleteFiles ? "true" : "false"}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        showNotification(
          "success",
          deleteFiles ? "Deleted entry and files." : "Deleted database entry.",
        );
        setCleanupResults((prev) =>
          prev ? prev.filter((b) => b.id !== bookId) : null,
        );
      }
    } catch (e) {
      showNotification("error", "Failed deleting entry");
    }
  };

  useEffect(() => {
    setWebtorEnabled(config.webtorEnabled);
    setLocalDownloadPath(config.localDownloadPath);
    setLocalIndexers(indexers);
  }, [config, indexers]);

  const checkHealth = async (url: string) => {
    try {
      const response = await fetch("/api/indexers/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      return await response.json();
    } catch (e) {
      return { status: "offline", error: "Service Unavailable" };
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
    const updated = localIndexers.map((ind) => {
      if (ind.id === id) {
        return { ...ind, enabled: !ind.enabled };
      }
      return ind;
    });
    setLocalIndexers(updated);

    // Send updated indexers to backend
    onSaveConfig({
      config,
      indexers: updated,
    });
  };

  const handleUpdateIndexerApiKey = (id: string, key: string) => {
    const updated = localIndexers.map((ind) => {
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

    let status: "online" | "offline" | "unknown" = "unknown";
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
      type: "native",
      status,
      lastChecked: new Date().toISOString(),
    };
    const updated = [...localIndexers, newIdx];
    setLocalIndexers(updated);

    onSaveConfig({
      config: {
        ...config,
        webtorEnabled,
        localDownloadPath,
      },
      indexers: updated,
    });

    setNewIndexerName("");
    setNewIndexerUrl("");
    setNewIndexerApiKey("");
    setCheckResult(null);
    setShowAddIndexer(false);
    setSaveStatus("New tracker added successfully!");
    setTimeout(() => {
      setSaveStatus("");
    }, 4000);
  };

  const handleVerifyPresetTracker = async (preset: PresetTracker) => {
    setVerifyingTrackerId(preset.id);
    setVerificationStatuses((prev) => ({
      ...prev,
      [preset.id]: { status: "checking" },
    }));

    const result = await checkHealth(preset.url);

    setVerificationStatuses((prev) => ({
      ...prev,
      [preset.id]: { status: result.status, error: result.error },
    }));
    setVerifyingTrackerId(null);
    return result;
  };

  const handleQuickAddPresetTracker = async (preset: PresetTracker) => {
    // Check duplication
    const isDup = localIndexers.some(
      (ind) =>
        ind.url.toLowerCase().replace(/\/$/, "") ===
        preset.url.toLowerCase().replace(/\/$/, ""),
    );
    if (isDup) {
      showNotification(
        "info",
        `Tracker "${preset.name}" is already installed!`,
      );
      return;
    }

    // Determine current health status
    let currentStatus: "online" | "offline" | "unknown" = "unknown";
    const existingCheck = verificationStatuses[preset.id];
    if (existingCheck && existingCheck.status !== "checking") {
      currentStatus = existingCheck.status;
    } else {
      // Run quick health check
      setVerifyingTrackerId(preset.id);
      setVerificationStatuses((prev) => ({
        ...prev,
        [preset.id]: { status: "checking" },
      }));
      const checkResult = await checkHealth(preset.url);
      currentStatus = checkResult.status;
      setVerificationStatuses((prev) => ({
        ...prev,
        [preset.id]: { status: checkResult.status, error: checkResult.error },
      }));
      setVerifyingTrackerId(null);
    }

    // Add to indexers list
    const newIdx: IndexerSettings = {
      id: `ind-${crypto.randomUUID()}`,
      name: preset.name,
      url: preset.url,
      apiKey: "",
      enabled: true,
      type: "native",
      status: currentStatus,
      lastChecked: new Date().toISOString(),
    };

    const updated = [...localIndexers, newIdx];
    setLocalIndexers(updated);

    onSaveConfig({
      config,
      indexers: updated,
    });

    showNotification(
      "success",
      `"${preset.name}" added to list of indexers. Status: ${currentStatus.toUpperCase()}`,
    );
  };

  const handleDeleteIndexer = (id: string) => {
    if (
      !window.confirm(
        "Delete this tracker indexer link from your torrent indexers list?",
      )
    ) {
      return;
    }
    const deletedIndexer = localIndexers.find((ind) => ind.id === id);
    const updated = localIndexers.filter((ind) => ind.id !== id);
    setLocalIndexers(updated);

    // Track deleted indexer name to prevent migration re-add
    const deletedNames = [
      ...(config.deletedIndexerNames || []),
      deletedIndexer ? deletedIndexer.name : "unknown",
    ];

    onSaveConfig({
      config: {
        ...config,
        deletedIndexerNames: deletedNames,
      },
      indexers: updated,
    });

    setSaveStatus("Tracker removed successfully!");
    setTimeout(() => {
      setSaveStatus("");
    }, 4000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      config: {
        ...config,
        webtorEnabled,
        localDownloadPath,
      },
      indexers: localIndexers,
    });
    setSaveStatus("Bookrr settings saved locally!");
    setTimeout(() => {
      setSaveStatus("");
    }, 4000);
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed top-6 right-6 z-[99] max-w-sm p-4 rounded-xl border shadow-xl flex items-start gap-3 backdrop-blur-md ${
              notification.type === "success"
                ? "bg-neutral-900/95 border-emerald-500/30 text-emerald-250"
                : notification.type === "error"
                  ? "bg-neutral-900/95 border-rose-500/30 text-rose-250"
                  : "bg-neutral-900/95 border-neutral-800 text-neutral-255"
            }`}
          >
            {notification.type === "success" && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            {notification.type === "error" && (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            {notification.type === "info" && (
              <HardDrive className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs leading-relaxed text-left text-neutral-200">
              <h5 className="font-bold mb-0.5 capitalize text-neutral-100">
                {notification.type}
              </h5>
              <p className="text-neutral-450 font-sans leading-snug">
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-neutral-500 hover:text-neutral-300 transition shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex w-full overflow-x-auto hide-scrollbar gap-2 mb-6 border-b border-[#222] pb-4 snap-x">
        {[
          { id: "general", icon: Settings, label: "General" },
          { id: "storage", icon: HardDrive, label: "Storage & Library" },
          { id: "speech", icon: Volume2, label: "Speech & AI" },
          { id: "indexers", icon: Globe, label: "Indexers" },
          { id: "logs", icon: Terminal, label: "System Logs" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSettingTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
              activeSettingTab === tab.id
                ? "bg-amber-500 text-black shadow-md"
                : "bg-[#111] text-neutral-400 border border-[#222] hover:text-neutral-200 hover:border-[#333]"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 text-left">
        {(activeSettingTab === "general" || activeSettingTab === "storage") && (
          <div className="space-y-6">
            <form
              onSubmit={handleSubmit}
              className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-6"
            >
              <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
                <Settings className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-neutral-100">
                    Bookrr Media Suite
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Configure your internal media server and download behavior
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div
                  className={
                    rootName
                      ? "bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-3"
                      : "bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={
                          rootName
                            ? "p-2 bg-emerald-500 rounded-lg text-black"
                            : "p-2 bg-amber-500 rounded-lg text-black"
                        }
                      >
                        <FolderOpen size={18} />
                      </div>
                      <div className="text-left">
                        <h4 className="text-[11px] font-bold text-neutral-200">
                          Device Internal Storage
                        </h4>
                        <p className="text-[10px] text-neutral-500 leading-tight">
                          {rootName
                            ? `Mapped root: "${rootName}"`
                            : 'Pick your "Bookarr" root folder to keep all files self-contained.'}
                        </p>
                      </div>
                    </div>
                    {rootName && (
                      <button
                        type="button"
                        onClick={async () => {
                          localStorage.removeItem("bookarr_root_name");
                          setRootName(null);
                          setRootHandle(null);
                          setWatchInternalHandle(null);
                          setEbooksHandle(null);
                          setAudiobooksHandle(null);
                          await deleteDirectoryHandle("watch_internal");
                          await deleteDirectoryHandle("ebooks");
                          await deleteDirectoryHandle("audiobooks");
                          showNotification(
                            "info",
                            "Disconnected browser storage root folder. Individual folders can now be selected manually if needed.",
                          );
                        }}
                        className="bg-[#1a1a1a] border border-neutral-800 hover:border-red-500/30 text-rose-400 text-[10px] uppercase font-bold py-1 px-2.5 rounded transition cursor-pointer"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                  {!rootName && (
                    <button
                      type="button"
                      onClick={pickRootFolder}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded-lg transition"
                    >
                      Initialize Bookarr Root
                    </button>
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <label className="text-neutral-400 block font-semibold font-sans">
                    Server Library Scan Folder (Optional)
                  </label>
                  {rootName ? (
                    <div className="w-full bg-[#141414] border border-emerald-500/20 rounded-lg p-2.5 text-xs text-neutral-400 flex items-center justify-between font-sans">
                      <span className="flex items-center gap-1.5 truncate">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        Client-Side Active: {rootName}/download
                      </span>
                      <span className="text-[9px] uppercase font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none shrink-0 font-mono">
                        Browser Storage
                      </span>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={localDownloadPath}
                      onChange={(e) => setLocalDownloadPath(e.target.value)}
                      placeholder={
                        internalStorage?.paths?.download ||
                        "/data/bookarr/download"
                      }
                      className="w-full bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg p-2.5 focus:outline-none focus:border-amber-500 text-neutral-100 text-xs font-mono"
                    />
                  )}
                  <p className="text-[10px] text-neutral-550 leading-snug font-sans mt-1">
                    {rootName
                      ? "With Active Device storage, the scanning & organizing of downloads is done locally from your device's Bookrr > download folder."
                      : "An absolute folder path on your hosting server where completed server-side torrents or files are initially stored before you organize them."}
                  </p>
                </div>

                {internalStorage && (
                  <div className="space-y-2 pt-2 border-t border-[#222]/50">
                    <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">
                      Server Storage & Download Space
                    </h4>
                    <div className="bg-[#161616] p-3 rounded-xl border border-neutral-900 space-y-2.5">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-neutral-500 font-sans">
                          Server Staging Folder:
                        </span>
                        <span
                          className="text-amber-500/80 truncate ml-2"
                          title={internalStorage?.paths?.download}
                        >
                          {internalStorage?.paths?.download ||
                            "data/bookarr/download"}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 font-sans leading-relaxed pt-1.5 border-t border-neutral-900/40">
                        <strong>Note:</strong> Your organized Audiobooks and
                        Ebooks are stored entirely client-side inside your{" "}
                        <strong>Device Internal Storage</strong> selected above.
                        The server only uses this temporary folder to host
                        downloads until they are organized.
                      </p>
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
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  className="bg-amber-500 text-black px-6 py-2.5 rounded-xl text-xs font-semibold hover:bg-amber-400 transition cursor-pointer ml-auto"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        )}

        {activeSettingTab === "speech" && (
          <div className="space-y-6">
            {/* Neural AI Settings */}
            <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-neutral-100">
                    Speech & AI Experience
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Manage high-fidelity on-device Neural TTS engines
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-900 border border-white/5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${ttsState.engine === "neural" ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/20 text-amber-500"}`}
                    >
                      {ttsState.engine === "neural" ? (
                        <Zap size={18} />
                      ) : (
                        <Volume2 size={18} />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-neutral-200">
                        Active Voice Engine
                      </h4>
                      <p className="text-[10px] text-neutral-500">
                        {ttsState.engine === "neural"
                          ? "High-fidelity AI Synthesis"
                          : "Standard Web Speech API"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1 bg-neutral-950 rounded-xl border border-white/5 self-end sm:self-auto">
                    <button
                      onClick={() => setTtsEngine("native")}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                        ttsState.engine === "native"
                          ? "bg-amber-500 text-black shadow-lg shadow-amber-500/10"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      Native
                    </button>
                    <button
                      onClick={() => setTtsEngine("neural")}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                        ttsState.engine === "neural"
                          ? "bg-amber-500 text-white shadow-lg shadow-amber-500/10"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      <Wand2 size={10} />
                      Neural AI
                    </button>
                  </div>
                </div>

                {ttsState.engine === "neural" && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col w-full">
                        <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
                          Neural Model
                        </span>

                        <select
                          value={selectedNeuralModel}
                          onChange={handleNeuralModelChange}
                          disabled={ttsState.neuralStatus === "loading"}
                          className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-[11px] font-medium appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 mt-2"
                        >
                          <option value="piper/en_US-libritts_r-medium">
                            US Voices (LibriTTS R Medium)
                          </option>
                          <option value="piper/en_GB-vctk-medium">
                            UK Voices (VCTK Medium)
                          </option>
                          <option value="kokoro/Kokoro-82M-v1.0-ONNX">
                            Premium Voices (Kokoro - high-end devices)
                          </option>
                        </select>
                      </div>

                      {(selectedNeuralModel.includes("libritts") ||
                        selectedNeuralModel.includes("vctk")) && (
                        <div className="flex flex-col w-full mt-4">
                          <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider mb-2">
                            Voice Preset
                          </span>
                          <select
                            value={selectedSpeakerId}
                            onChange={handleSpeakerIdChange}
                            disabled={ttsState.neuralStatus === "loading"}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-[11px] font-medium appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                          >
                            {selectedNeuralModel.includes("libritts")
                              ? US_VOICE_PRESETS.map((preset) => (
                                  <option key={preset.id} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))
                              : UK_VOICE_PRESETS.map((preset) => (
                                  <option key={preset.id} value={preset.id}>
                                    {preset.label}
                                  </option>
                                ))}
                          </select>
                        </div>
                      )}

                      <div className="flex flex-col w-full">
                        <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
                          Hardware Backend
                        </span>
                        <select
                          value={selectedBackend}
                          onChange={handleBackendChange}
                          disabled={ttsState.neuralStatus === "loading"}
                          className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white text-[11px] font-medium appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 mt-2"
                        >
                          <option value="auto">Auto (Best Available)</option>
                          <option value="webgpu">WebGPU (GPU)</option>
                          <option value="webgl">
                            WebGL (Legacy GPU, High Compatibility)
                          </option>
                          <option value="webnn">WebNN (NPU/GPU)</option>
                          <option value="wasm">Wasm (CPU only)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2">
                        <Activity size={14} className="text-amber-400" />
                        <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider">
                          Model Status
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                          ttsState.neuralStatus === "ready"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : ttsState.neuralStatus === "loading"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : ttsState.neuralStatus === "error"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-neutral-800 text-neutral-500 border-neutral-700"
                        }`}
                      >
                        {ttsState.neuralStatus === "ready"
                          ? "READY"
                          : ttsState.neuralStatus === "loading"
                            ? "INITIALIZING..."
                            : ttsState.neuralStatus === "error"
                              ? "FAILED"
                              : "NOT INITIALIZED"}
                      </span>
                    </div>

                    {ttsState.neuralStatus === "idle" && (
                      <div className="space-y-4">
                        <p className="text-[10px] text-amber-300/70 font-medium leading-tight">
                          Using high-fidelity VITS on-device neural model.
                          Initial set up requires ~80-160MB download.
                        </p>
                        <button
                          onClick={() => {
                            console.log(
                              "[Settings] Initializing Neural Engine via button click",
                            );
                            initializeNeuralEngine();
                          }}
                          disabled={ttsState.neuralStatus === "loading"}
                          className={`w-full py-2.5 rounded-xl text-white text-[11px] font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                            ttsState.neuralStatus === "error"
                              ? "bg-red-500 shadow-red-500/20 hover:bg-red-600"
                              : ttsState.neuralStatus === "loading"
                                ? "bg-neutral-800 cursor-not-allowed opacity-50"
                                : "bg-amber-500 shadow-amber-500/20 hover:bg-amber-400"
                          }`}
                        >
                          {ttsState.neuralStatus === "error" ? (
                            <>
                              <RefreshCw
                                size={14}
                                className="animate-spin-slow"
                              />
                              Retry Engine Setup
                            </>
                          ) : ttsState.neuralStatus === "loading" ? (
                            <>
                              <Activity size={14} className="animate-pulse" />
                              Setting up Engine...
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Download & Initialize Neural Engine
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {ttsState.neuralStatus === "loading" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-neutral-500 font-medium truncate max-w-[160px] flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            {ttsState.neuralStatusMessage || "Initializing..."}
                          </span>
                          <div className="flex items-center gap-2">
                            {ttsState.neuralDownloadSpeed && (
                              <span className="text-neutral-600 font-mono text-[9px] bg-neutral-900 px-1.5 py-0.5 rounded border border-white/5">
                                {ttsState.neuralDownloadSpeed}
                              </span>
                            )}
                            <span className="text-amber-400 font-bold whitespace-nowrap min-w-[30px] text-right drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                              {ttsState.neuralDownloadIsIndeterminate
                                ? ""
                                : `${Math.round(ttsState.neuralDownloadProgress)}%`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-neutral-950 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
                            <motion.div
                              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                              initial={{ width: 0 }}
                              animate={
                                ttsState.neuralDownloadIsIndeterminate
                                  ? {
                                      left: ["-30%", "100%"],
                                      width: "30%",
                                    }
                                  : {
                                      width: `${Math.max(2, ttsState.neuralDownloadProgress)}%`,
                                      left: "0%",
                                    }
                              }
                              transition={
                                ttsState.neuralDownloadIsIndeterminate
                                  ? {
                                      duration: 1.5,
                                      repeat: Infinity,
                                      ease: "linear",
                                    }
                                  : {
                                      duration: 0.3,
                                    }
                              }
                              style={{ position: "absolute" }}
                            />
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => cancelNeuralEngine()}
                              className="p-1 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                              title="Cancel Download"
                            >
                              <X size={12} />
                            </button>
                            <button
                              onClick={() => resetNeuralEngine()}
                              className="p-1 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                              title="Force Reset Worker"
                            >
                              <RefreshCw size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="text-[9px] text-neutral-600 italic">
                          Setup requires ~80-160MB. Do not close the app or
                          navigate away.
                        </p>
                      </div>
                    )}

                    {ttsState.neuralStatus === "ready" && (
                      <div className="flex items-start gap-3 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                        <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400">
                          <CheckCircle2 size={14} />
                        </div>
                        <div className="text-left w-full">
                          <p className="text-[11px] font-bold text-emerald-400">
                            Model verified locally
                          </p>
                          <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">
                            High-fidelity reading is active. Audio is generated
                            on your device for maximum privacy.
                          </p>
                          <div className="mt-2 py-1 px-2 border border-emerald-500/20 bg-emerald-500/10 rounded-lg text-[9px] font-mono text-emerald-300 w-full overflow-hidden text-ellipsis">
                            {ttsState.neuralHardware || "Neural Engine Ready"}
                          </div>
                        </div>
                      </div>
                    )}

                    {ttsState.neuralStatus === "error" && (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 bg-rose-500/5 rounded-xl border border-rose-500/10">
                          <div className="p-1.5 bg-rose-500/20 rounded-lg text-rose-400">
                            <AlertTriangle size={14} />
                          </div>
                          <div className="text-left w-full overflow-hidden">
                            <p className="text-[11px] font-bold text-rose-400 mb-1">
                              Neural Engine Initialization Failed
                            </p>
                            <div className="text-[9px] font-mono text-rose-300/80 bg-black/20 p-2 rounded border border-rose-500/10 break-words whitespace-pre-wrap w-full max-h-[150px] overflow-y-auto">
                              {ttsState.neuralStatusMessage ||
                                "Initialization failed"}
                            </div>
                            <p className="text-[10px] text-neutral-400 leading-tight mt-2">
                              Try clicking "Download & Initialize" again to
                              retry.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSettingTab === "storage" && (
          <>
            <div className="space-y-6">
              {/* Client-Side Directory Watch & Organizer Settings */}
              <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-6">
                <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
                  <HardDrive className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-neutral-100">
                      Local Watch Directory Organizer
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Organize browser-downloaded files into sorted, clean
                      nested directories
                    </p>
                  </div>
                </div>

                {/* Check browser compatibility */}
                {typeof window === "undefined" ||
                !("showDirectoryPicker" in window) ? (
                  <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 text-xs text-red-400 space-y-2 leading-relaxed">
                    <p className="font-bold">
                      ⚠️ Local Organizer Offline (No Native API support)
                    </p>
                    <p>
                      Your browser does not support the Web File System Access
                      API. Please open this app in an up-to-date release of{" "}
                      <strong>Google Chrome, Microsoft Edge, or Opera</strong>{" "}
                      on desktop to configure local directory syncing.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {typeof window !== "undefined" &&
                      window.self !== window.top && (
                        <div className="bg-amber-550/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-400 space-y-2 leading-relaxed text-left">
                          <p className="font-bold text-amber-400 flex items-center gap-1.5">
                            ⚠️ Browser Preview Limitation (Iframe Blocked)
                          </p>
                          <p>
                            Modern secure file pickers are restricted inside of
                            preview iframes. To pick and configure your
                            directories, please launch this application in a
                            separate tab.
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
                    <div className="space-y-4 bg-[#161616] border border-neutral-900 rounded-xl p-4">
                      {/* Browser Storage Watch Folder, if enabled */}
                      {rootName && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left pb-3 border-b border-neutral-900/60">
                          <div>
                            <span className="text-xs font-bold text-neutral-300 block flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Root Storage Staging Folder
                            </span>
                            <p className="text-[10px] text-neutral-500 leading-snug mt-1">
                              Scanning browser storage at{" "}
                              <code>{rootName}/download</code> for automatic
                              sorting.
                            </p>
                          </div>
                          <div>
                            {watchInternalPermission === "granted" ? (
                              <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 text-[10px] uppercase font-bold border border-emerald-500/20 rounded flex items-center gap-1.5 leading-none shrink-0 font-sans">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />{" "}
                                Auto-Mapped
                              </span>
                            ) : watchInternalHandle ? (
                              <button
                                type="button"
                                onClick={() =>
                                  verifyResetPermission(
                                    "watch_internal",
                                    watchInternalHandle,
                                  )
                                }
                                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 px-2.5 py-1 rounded text-[10px] font-bold uppercase border border-amber-500/30 transition flex items-center gap-1 cursor-pointer animate-pulse"
                              >
                                Verify & Unlock
                              </button>
                            ) : (
                              <span className="bg-neutral-800 text-neutral-400 px-2.5 py-1 text-[10px] uppercase font-bold rounded flex items-center gap-1.5 leading-none shrink-0 font-sans">
                                Connecting...
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                        <div>
                          <span className="text-xs font-bold text-neutral-300 block">
                            Custom Watch Directory {rootName && "(Optional)"}
                          </span>
                          <p className="text-[10px] text-neutral-500 leading-snug mt-1">
                            Select a custom system folder (e.g. your device
                            Downloads folder) to organize files you manually put
                            there.
                          </p>
                        </div>
                        <div>
                          {watchHandle ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  verifyResetPermission("watch", watchHandle)
                                }
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                                  watchPermission === "granted"
                                    ? "bg-emerald-500/15 text-emerald-500"
                                    : "bg-amber-500/15 text-amber-500 animate-pulse"
                                }`}
                              >
                                {watchPermission === "granted"
                                  ? "Active"
                                  : "Grant Perm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFolder("watch")}
                                className="bg-neutral-800 text-neutral-400 hover:text-red-400 p-1.5 rounded-lg transition cursor-pointer"
                                title="Disconnect Folder"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => selectFolder("watch")}
                              disabled={isInIframe}
                              className={`bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-amber-400 cursor-pointer transition shrink-0 ${isInIframe ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              Select Folder
                            </button>
                          )}
                        </div>
                      </div>
                      {watchHandle && (
                        <div className="text-[9px] font-mono text-neutral-400 border-t border-neutral-800/60 pt-2">
                          <span className="truncate block">
                            📂 Custom Watch Directory: {watchHandle.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Ebooks Destination */}
                    <div className="space-y-2 bg-[#161616] border border-neutral-900 rounded-xl p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                        <div>
                          <span className="text-xs font-bold text-neutral-300 block">
                            2. Organized Ebooks Destination
                          </span>
                          <p className="text-[10px] text-neutral-500 leading-snug mt-1">
                            Ebooks will be moved and renamed into:{" "}
                            <code>Ebooks/Author/Book/File</code>
                          </p>
                        </div>
                        <div>
                          {rootName ? (
                            ebooksPermission === "granted" ? (
                              <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 text-[10px] uppercase font-bold border border-emerald-500/20 rounded flex items-center gap-1.5 leading-none shrink-0 font-sans">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />{" "}
                                Auto-Mapped
                              </span>
                            ) : ebooksHandle ? (
                              <button
                                type="button"
                                onClick={() =>
                                  verifyResetPermission("ebooks", ebooksHandle)
                                }
                                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 px-2.5 py-1 rounded text-[10px] font-bold uppercase border border-amber-500/30 transition flex items-center gap-1 cursor-pointer animate-pulse"
                              >
                                Verify & Unlock
                              </button>
                            ) : (
                              <span className="bg-neutral-800 text-neutral-400 px-2.5 py-1 text-[10px] uppercase font-bold rounded flex items-center gap-1.5 leading-none shrink-0 font-sans">
                                Connecting...
                              </span>
                            )
                          ) : ebooksHandle ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  verifyResetPermission("ebooks", ebooksHandle)
                                }
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                                  ebooksPermission === "granted"
                                    ? "bg-emerald-500/15 text-emerald-500"
                                    : "bg-amber-500/15 text-amber-500 animate-pulse"
                                }`}
                              >
                                {ebooksPermission === "granted"
                                  ? "Active"
                                  : "Grant Perm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFolder("ebooks")}
                                className="bg-neutral-800 text-neutral-400 hover:text-red-400 p-1.5 rounded-lg transition cursor-pointer"
                                title="Disconnect Folder"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => selectFolder("ebooks")}
                              disabled={isInIframe}
                              className={`bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-amber-400 cursor-pointer transition shrink-0 ${isInIframe ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              Select Folder
                            </button>
                          )}
                        </div>
                      </div>
                      {(ebooksHandle || rootName) && (
                        <div className="text-[9px] font-mono text-neutral-400 border-t border-neutral-800/60 pt-2">
                          <span className="truncate block">
                            📂 Ebooks Destination:{" "}
                            {ebooksHandle
                              ? ebooksHandle.name
                              : `${rootName}/ebooks`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Audiobooks Destination */}
                    <div className="space-y-2 bg-[#161616] border border-neutral-900 rounded-xl p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                        <div>
                          <span className="text-xs font-bold text-neutral-300 block">
                            3. Organized Audiobooks Destination
                          </span>
                          <p className="text-[10px] text-neutral-500 leading-snug mt-1">
                            Audiobooks will be moved and renamed into:{" "}
                            <code>Audiobooks/Author/Book/File</code>
                          </p>
                        </div>
                        <div>
                          {rootName ? (
                            audiobooksPermission === "granted" ? (
                              <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 text-[10px] uppercase font-bold border border-emerald-500/20 rounded flex items-center gap-1.5 leading-none shrink-0 font-sans">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />{" "}
                                Auto-Mapped
                              </span>
                            ) : audiobooksHandle ? (
                              <button
                                type="button"
                                onClick={() =>
                                  verifyResetPermission(
                                    "audiobooks",
                                    audiobooksHandle,
                                  )
                                }
                                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 px-2.5 py-1 rounded text-[10px] font-bold uppercase border border-amber-500/30 transition flex items-center gap-1 cursor-pointer animate-pulse"
                              >
                                Verify & Unlock
                              </button>
                            ) : (
                              <span className="bg-neutral-800 text-neutral-400 px-2.5 py-1 text-[10px] uppercase font-bold rounded flex items-center gap-1.5 leading-none shrink-0 font-sans">
                                Connecting...
                              </span>
                            )
                          ) : audiobooksHandle ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  verifyResetPermission(
                                    "audiobooks",
                                    audiobooksHandle,
                                  )
                                }
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer ${
                                  audiobooksPermission === "granted"
                                    ? "bg-emerald-500/15 text-emerald-500"
                                    : "bg-amber-500/15 text-amber-500 animate-pulse"
                                }`}
                              >
                                {audiobooksPermission === "granted"
                                  ? "Active"
                                  : "Grant Perm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFolder("audiobooks")}
                                className="bg-neutral-800 text-neutral-400 hover:text-red-400 p-1.5 rounded-lg transition cursor-pointer"
                                title="Disconnect Folder"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => selectFolder("audiobooks")}
                              disabled={isInIframe}
                              className={`bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold uppercase hover:bg-amber-400 cursor-pointer transition shrink-0 ${isInIframe ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              Select Folder
                            </button>
                          )}
                        </div>
                      </div>
                      {(audiobooksHandle || rootName) && (
                        <div className="text-[9px] font-mono text-neutral-400 border-t border-neutral-850 pt-2">
                          <span className="truncate block">
                            📂 Audiobooks Destination:{" "}
                            {audiobooksHandle
                              ? audiobooksHandle.name
                              : `${rootName}/audiobooks`}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info block */}
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 text-xs text-neutral-400 leading-relaxed text-left space-y-1.5">
                      <p className="font-semibold text-neutral-200">
                        💡 Local Watch Organizer Instructions:
                      </p>
                      <p>
                        When files are identified in the Watch Folder, the app
                        will auto-match and group files by author and title (or
                        let you manually map them on-screen) and copy them into
                        your pristine libraries.
                      </p>
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
                    <h3 className="font-sans font-bold text-sm text-neutral-100">
                      Library Path Validation
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Scan library and rename or move manually imported books to
                      standardized library folders.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  <button
                    onClick={handleAnalyzeLibraryStructure}
                    disabled={isScanningLibrary || isFixingLibrary}
                    className="bg-[#1a1a1a] border border-[#333] hover:border-amber-500/50 text-neutral-300 hover:text-amber-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isScanningLibrary ? "animate-spin" : ""}`}
                    />
                    {isScanningLibrary
                      ? "Analyzing Structure..."
                      : "Scan & Validate Library Branches"}
                  </button>

                  {hasScannedLibrary && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                      {libraryDiscrepancies.length === 0 ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-emerald-500">
                              Perfect Structure Match
                            </h4>
                            <p className="text-[11px] text-neutral-400 leading-relaxed mt-1">
                              All mapped offline files match the pristine
                              Title/Author branch architecture.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden text-sm">
                          <div className="bg-amber-500/10 p-4 border-b border-amber-500/20">
                            <h4 className="text-xs font-bold text-amber-500 flex justify-between items-center">
                              <span>
                                {libraryDiscrepancies.length} Structural
                                Deviations Found
                              </span>
                              <button
                                onClick={handleOrganizeDiscrepancies}
                                disabled={
                                  isFixingLibrary ||
                                  (!ebooksHandle && !audiobooksHandle)
                                }
                                className="bg-amber-500 hover:bg-amber-400 text-black px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-extrabold cursor-pointer disabled:opacity-50"
                              >
                                {isFixingLibrary
                                  ? `Organizing (${fixProgress}%)`
                                  : "Normalize & Move All"}
                              </button>
                            </h4>
                            <p className="text-[10px] text-neutral-400 mt-2 leading-relaxed">
                              The following books are stored locally but are out
                              of bounds or misnamed. Fixing will construct
                              correct folders in your pristine directory and
                              move the blob contents there.
                            </p>
                          </div>
                          <div className="max-h-64 overflow-y-auto divide-y divide-neutral-900/50">
                            {libraryDiscrepancies.map((d) => (
                              <div
                                key={d.bookId}
                                className="p-3 hover:bg-white/5 transition flex flex-col sm:flex-row gap-3 items-start justify-between"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-neutral-200 truncate">
                                    {d.title}
                                  </p>
                                  <p className="text-[10px] text-neutral-400 font-mono truncate mt-0.5">
                                    by {d.author}
                                  </p>
                                </div>
                                <div className="text-[9px] font-mono shrink-0 w-full sm:w-auto text-left sm:text-right space-y-1">
                                  <p
                                    className="text-red-400 truncate max-w-[200px]"
                                    title={d.currentPath}
                                  >
                                    Actual: {d.currentPath}
                                  </p>
                                  <p
                                    className="text-emerald-500 truncate max-w-[200px]"
                                    title={d.expectedPath}
                                  >
                                    Expected: {d.expectedPath}
                                  </p>
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
            </div>

            <div className="space-y-6">
              <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
                  <Trash2 className="w-5 h-5 text-red-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-neutral-100">
                      Library Data Cleanup
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Cross-references your database entries against the actual
                      filesystem to identify orphaned records.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  <button
                    onClick={handleScanLibraryCleanup}
                    disabled={isCleaningLibrary}
                    className="bg-[#1a1a1a] border border-[#333] hover:border-red-500/50 text-neutral-300 hover:text-red-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isCleaningLibrary ? "animate-spin" : ""}`}
                    />
                    {isCleaningLibrary
                      ? "Scanning Database..."
                      : "Find Missing Files"}
                  </button>

                  {cleanupResults !== null && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
                      {cleanupResults.length === 0 ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-emerald-500">
                              Clean Registry
                            </h4>
                            <p className="text-[11px] text-neutral-400 leading-relaxed mt-1">
                              All database entries point to valid files. No
                              cleanup needed.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-bold text-red-500 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Found {cleanupResults.length} orphaned entries
                            </h4>
                          </div>
                          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {cleanupResults.map((b) => (
                              <div
                                key={b.id}
                                className="bg-[#1a1a1a] border border-red-500/10 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-neutral-200 truncate">
                                    {b.title}
                                  </p>
                                  <p
                                    className="text-[10px] text-neutral-500 truncate mt-0.5"
                                    title={b.filePath || b.fileUrl}
                                  >
                                    Expected at: {b.filePath || b.fileUrl}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() =>
                                      handlePerformDelete(b.id, false)
                                    }
                                    className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-300 transition"
                                  >
                                    Delete Entry Info
                                  </button>
                                  <button
                                    onClick={() =>
                                      handlePerformDelete(b.id, true)
                                    }
                                    className="px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-[10px] transition"
                                  >
                                    Delete Files & Entry
                                  </button>
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
            </div>
          </>
        )}

        {activeSettingTab === "indexers" && (
          <div className="space-y-6">
            <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-amber-500" />
                  <div>
                    <h3 className="font-sans font-bold text-sm text-neutral-100">
                      Integrated Indexers
                    </h3>
                    <p className="text-[11px] text-neutral-400">
                      Native scrapers acting as your internal media tracker
                      aggregator
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPublicDb(!showPublicDb);
                      setShowAddIndexer(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer border ${
                      showPublicDb
                        ? "bg-neutral-800 text-amber-500 border-amber-500/30"
                        : "bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border-neutral-800"
                    }`}
                  >
                    <Database className="w-3 h-3" />
                    <span>Public Database</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddIndexer(!showAddIndexer);
                      setShowPublicDb(false);
                    }}
                    className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Custom</span>
                  </button>
                </div>
              </div>

              {showPublicDb && (
                <div className="bg-[#151515] border border-neutral-800/80 p-4 rounded-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-900 pb-3">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-neutral-100 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        Public Tracker Indexers Preset DB
                      </h4>
                      <p className="text-[10px] text-neutral-400">
                        Select active public mirrors. Verify connectivity prior
                        to adding back to active indices.
                      </p>
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filter public trackers DB..."
                        value={dbSearchQuery}
                        onChange={(e) => setDbSearchQuery(e.target.value)}
                        className="w-full bg-[#1e1e1e] border border-neutral-800 p-1.5 pl-8 rounded text-xs focus:outline-none text-neutral-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                    {PRESET_TRACKERS_DB.filter((preset) => {
                      const query = dbSearchQuery.toLowerCase();
                      return (
                        preset.name.toLowerCase().includes(query) ||
                        preset.url.toLowerCase().includes(query) ||
                        preset.description.toLowerCase().includes(query)
                      );
                    }).map((preset) => {
                      const isInstalled = localIndexers.some(
                        (ind) =>
                          ind.url.toLowerCase().replace(/\/$/, "") ===
                          preset.url.toLowerCase().replace(/\/$/, ""),
                      );
                      const verifyStatus = verificationStatuses[preset.id];
                      const isCurrentlyVerifying =
                        verifyingTrackerId === preset.id;

                      return (
                        <div
                          key={preset.id}
                          className="bg-[#111111] border border-neutral-900 p-3 rounded-lg flex flex-col justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-start justify-between min-w-0 gap-2">
                              <span
                                className="font-bold text-neutral-200 truncate"
                                title={preset.name}
                              >
                                {preset.name}
                              </span>
                              <span className="text-[9px] font-bold text-neutral-500 font-mono shrink-0 uppercase tracking-widest bg-neutral-900 border border-neutral-800 px-1 rounded">
                                {preset.type}
                              </span>
                            </div>
                            <span
                              className="text-[10px] text-neutral-500 font-mono block truncate animate-none"
                              title={preset.url}
                            >
                              {preset.url}
                            </span>
                            <span className="text-[10px] text-neutral-400 leading-normal block">
                              {preset.description}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-neutral-900 pt-2 shrink-0">
                            <div>
                              {isCurrentlyVerifying ? (
                                <div className="flex items-center gap-1 text-[10px] font-mono text-amber-500">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Checking...</span>
                                </div>
                              ) : verifyStatus ? (
                                <div
                                  className={`flex items-center gap-1 text-[10px] font-mono ${
                                    verifyStatus.status === "online"
                                      ? "text-emerald-500"
                                      : "text-red-400"
                                  }`}
                                >
                                  {verifyStatus.status === "online" ? (
                                    <ShieldCheck className="w-3 h-3" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3" />
                                  )}
                                  <span className="capitalize">
                                    {verifyStatus.status}
                                  </span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleVerifyPresetTracker(preset)
                                  }
                                  className="text-[10px] font-bold text-neutral-400 hover:text-amber-500 transition cursor-pointer"
                                >
                                  Test Connectivity
                                </button>
                              )}
                            </div>

                            {isInstalled ? (
                              <span className="flex items-center gap-1 text-[10px] font-extrabold text-neutral-500 bg-neutral-900/50 border border-neutral-900 px-2 py-1 rounded">
                                <Check className="w-3 h-3 text-emerald-500" />
                                Installed
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickAddPresetTracker(preset)
                                }
                                disabled={isCurrentlyVerifying}
                                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 font-bold px-2 py-1.5 rounded transition text-[10px] cursor-pointer"
                              >
                                Verify & Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {showAddIndexer && (
                <form
                  onSubmit={handleAddIndexer}
                  className="bg-[#181818] border border-amber-500/25 p-4 rounded-xl space-y-3 text-xs font-mono"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-neutral-400 block">
                        Indexer Name
                      </label>
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
                          {isCheckingNew ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Activity className="w-3 h-3" />
                          )}
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
                        <div
                          className={`mt-1 text-[10px] flex items-center gap-1.5 ${checkResult.status === "online" ? "text-emerald-500" : "text-red-400"}`}
                        >
                          {checkResult.status === "online" ? (
                            <ShieldCheck className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {checkResult.status === "online"
                            ? "Tracker Reachable"
                            : checkResult.error || "Connection Failed"}
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
                              ind.status === "online"
                                ? "bg-emerald-500"
                                : ind.status === "offline"
                                  ? "bg-red-500"
                                  : "bg-neutral-500"
                            }`}
                            title={
                              ind.error ||
                              (ind.status === "online" ? "Online" : "Offline")
                            }
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-neutral-200 block truncate">
                            {ind.name}
                          </span>
                          {ind.lastChecked && (
                            <span className="text-[8px] text-neutral-600 font-mono hidden group-hover:block transition-opacity animate-in fade-in duration-300">
                              (Checked:{" "}
                              {new Date(ind.lastChecked).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                              )
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-neutral-500 font-mono block truncate">
                          {ind.url}
                        </span>
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
          </div>
        )}

        {activeSettingTab === "logs" && (
          <div className="space-y-6">
            <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-amber-500" />
                <h3 className="font-sans font-bold text-sm text-neutral-100">
                  Bookrr Service Logs
                </h3>
              </div>

              <div className="bg-[#080808] border border-[#202020] rounded-xl p-4 h-56 font-mono text-xs overflow-y-auto space-y-1.5 scrollbar-thin select-all">
                {logs.map((log) => {
                  let textCol = "text-neutral-300";
                  if (log.level === "warn") textCol = "text-amber-500";
                  else if (log.level === "error") textCol = "text-red-400";
                  else if (log.level === "success")
                    textCol = "text-emerald-400";

                  return (
                    <div
                      key={log.id}
                      className="text-left flex items-start gap-2 select-text leading-relaxed"
                    >
                      <span className="text-neutral-600 shrink-0 select-none text-[10px]">
                        [
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour12: false,
                        })}
                        ]
                      </span>
                      <span
                        className={`uppercase font-bold shrink-0 select-none text-[10px] ${
                          log.source === "webtor"
                            ? "text-amber-500"
                            : "text-neutral-500"
                        }`}
                      >
                        [{log.source}]
                      </span>
                      <span className={textCol}>{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
