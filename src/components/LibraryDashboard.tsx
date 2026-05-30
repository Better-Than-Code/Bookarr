/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import BookDetailsModal from "./BookDetailsModal";
import { Book, AudiobookChapter, EbookChapter } from "../types";
import {
  Play,
  BookOpen,
  RefreshCw,
  PlusCircle,
  Search,
  SlidersHorizontal,
  BookMarked,
  Layers,
  Trash2,
  Download,
  ExternalLink,
  AlertTriangle,
  Globe,
  Save,
  FileDown,
  UploadCloud,
  Check,
  Plus,
  HelpCircle,
  FolderOpen,
  FolderPlus,
} from "lucide-react";
import StorageOnboarding from "./StorageOnboarding";
import {
  getOfflineBooksMap,
  saveOfflineFile,
  deleteOfflineFile,
  updateOfflineFilePath,
  getOfflineFile,
  getDirectoryHandle,
  verifyDirectoryPermission,
  saveFileHandle,
  ensureFilePermission,
} from "../services/LocalFileService";
import { autoRelinkLibrary, batchOrganizeLocalBooks } from "../services/LocalOrganizerService";

interface LibraryDashboardProps {
  books: Book[];
  onPlayAudiobook: (book: Book) => void;
  onReadEbook: (book: Book) => void;
  onManualImport: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onSyncLibrary: () => void;
  isSyncing: boolean;
  onSearchTrackers: (query: string) => void;
  offlineBooksMap?: { [bookId: string]: { name: string; filePath?: string } };
  onRefreshOfflineBooks?: () => void;
}

export default function LibraryDashboard({
  books,
  onPlayAudiobook,
  onReadEbook,
  onManualImport,
  onDeleteBook,
  onSyncLibrary,
  isSyncing,
  onSearchTrackers,
  offlineBooksMap: passedOfflineBooksMap,
  onRefreshOfflineBooks,
}: LibraryDashboardProps) {
  const [activeFilter, setActiveFilter] = useState<
    "all" | "audiobook" | "ebook"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedProgress, setSelectedProgress] = useState("All");
  const [sortBy, setSortBy] = useState<"title" | "recent" | "progress">(
    "title",
  );
  const [showImportForm, setShowImportForm] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);

  // Batch Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [batchOrganizingStatus, setBatchOrganizingStatus] = useState<string | null>(null);

  // Readarr Online book/author Search states
  const [addMode, setAddMode] = useState<"online" | "manual">("online");
  const [onlineSearchQuery, setOnlineSearchQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<any[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineSelectedFormats, setOnlineSelectedFormats] = useState<{
    [key: string]: "ebook" | "audiobook";
  }>({});
  const [addingBookId, setAddingBookId] = useState<string | null>(null);

  // Inspector Dialog for book details and assigning missing files
  const [selectedBookDetails, setSelectedBookDetails] = useState<Book | null>(
    null,
  );
  const [selectedInspectBook, setSelectedInspectBook] = useState<Book | null>(
    null,
  );

  // Browser Storage / Sandbox Downloader state
  const [downloadingBook, setDownloadingBook] = useState<Book | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "fetching" | "saving" | "completed" | "error"
  >("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showSandboxHelper, setShowSandboxHelper] = useState<boolean>(false);

  // Offline browser and device path state
  const [localOfflineBooksMap, setLocalOfflineBooksMap] = useState<{
    [bookId: string]: { name: string; filePath?: string };
  }>({});
  const offlineBooksMap = passedOfflineBooksMap || localOfflineBooksMap;
  const [configuringBookPath, setConfiguringBookPath] = useState<Book | null>(
    null,
  );
  const [customDevicePath, setCustomDevicePath] = useState<string>("");
  const [linkSuccessMessage, setLinkSuccessMessage] = useState<string | null>(
    null,
  );

  const refreshOfflineBooks = async () => {
    if (onRefreshOfflineBooks) {
      onRefreshOfflineBooks();
    } else {
      try {
        const map = await getOfflineBooksMap();
        setLocalOfflineBooksMap(map);
      } catch (e) {
        console.error("Failed to load offline books map:", e);
      }
    }
  };

  useEffect(() => {
    refreshOfflineBooks();
  }, [books]);

  useEffect(() => {
    if (selectedBookDetails) {
      const refreshedBook = books.find((b) => b.id === selectedBookDetails.id);
      if (refreshedBook) {
        setSelectedBookDetails(refreshedBook);
      }
    }
  }, [books, selectedBookDetails?.id]);

  const isBookAvailable = (bookId: string, serverIsDownloaded: boolean) => {
    return serverIsDownloaded || !!offlineBooksMap[bookId];
  };

  // New book manual form state
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newType, setNewType] = useState<"audiobook" | "ebook">("ebook");
  const [newGenres, setNewGenres] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [newLength, setNewLength] = useState(120); // pages or duration minutes
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Get all unique genres from book list
  const genres = [
    "All",
    ...Array.from(new Set(books.flatMap((b) => b.genres))),
  ];

  // Filters & Sorting setup
  const filteredBooks = books
    .filter((book) => {
      const matchesSearch =
        book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.author.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = activeFilter === "all" || book.type === activeFilter;
      const matchesGenre =
        selectedGenre === "All" || book.genres.includes(selectedGenre);

      let matchesProgress = true;
      if (selectedProgress === "Unread") matchesProgress = book.progress === 0;
      else if (selectedProgress === "In Progress")
        matchesProgress = book.progress > 0 && book.progress < 100;
      else if (selectedProgress === "Completed")
        matchesProgress = book.progress === 100;

      return matchesSearch && matchesType && matchesGenre && matchesProgress;
    })
    .sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "progress") return b.progress - a.progress;
      return 0; // 'recent' would need a date field, skipping for now
    });

  // Separate in-progress books for a "Continue" shelf
  const inProgressBooks = filteredBooks.filter(
    (book) => book.progress > 0 && book.progress < 100,
  );
  const otherBooks = filteredBooks.filter(
    (book) => book.progress === 0 || book.progress === 100,
  );

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newAuthor) return;
    setIsUploading(true);

    try {
      let filePath = "";
      let fileUrl = "";

      if (selectedFile) {
        let destFolderHandle = await getDirectoryHandle("watch_internal");
        if (!destFolderHandle) {
          destFolderHandle = await getDirectoryHandle("watch");
        }

        if (destFolderHandle) {
          const hasPerm = await verifyDirectoryPermission(
            destFolderHandle,
            true,
            false,
          );
          if (hasPerm) {
            try {
              const fileHandle = await destFolderHandle.getFileHandle(
                selectedFile.name,
                { create: true },
              );
              const writable = await fileHandle.createWritable();
              await writable.write(selectedFile);
              await writable.close();

              filePath = `download/${selectedFile.name}`;
              fileUrl = URL.createObjectURL(selectedFile);
              console.log(
                "[STAGING] Direct client upload successful to local staging handle:",
                destFolderHandle.name,
                selectedFile.name,
              );
            } catch (err) {
              console.error(
                "[STAGING] Local staging folder write failed, falling back to server-side upload:",
                err,
              );
            }
          }
        }

        // Fallback to server side upload if staging handle is not available or writing failed
        if (!filePath) {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("type", newType);

          const uploadResp = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (uploadResp.ok) {
            const uploadData = await uploadResp.json();
            filePath = uploadData.filePath;
            fileUrl = uploadData.fileUrl;
          }
        }
      }

      const finalCover =
        newCoverUrl.trim() ||
        (newType === "audiobook"
          ? "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=400"
          : "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400");

      const bookPayload: any = {
        title: newTitle,
        author: newAuthor,
        type: newType,
        coverUrl: finalCover,
        description: newDescription || "Manually cataloged classical volume.",
        genres: newGenres
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
        isDownloaded: !!filePath,
        size: selectedFile
          ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
          : newType === "audiobook"
            ? "180 MB"
            : "1.5 MB",
        filePath,
        fileUrl,
      };

      if (newType === "audiobook") {
        bookPayload.duration = newLength * 60; // in seconds
        bookPayload.chapters = [
          { id: "ch-1", title: "Chapter 1", start: 0, end: 600 },
          { id: "ch-2", title: "Chapter 2", start: 600, end: 1200 },
        ];
      } else {
        bookPayload.pages = newLength;
        bookPayload.chapters = [
          {
            id: "ch-1",
            title: "Introduction",
            content:
              "Welcome to this manually indexed electronic book content. You can start reading chapters here.",
          },
        ];
      }

      const response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookPayload),
      });
      if (response.ok) {
        onSyncLibrary(); // Refresh state from parent
        // Reset form
        setNewTitle("");
        setNewAuthor("");
        setNewGenres("");
        setNewDescription("");
        setNewCoverUrl("");
        setSelectedFile(null);
        setShowImportForm(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOnlineSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onlineSearchQuery.trim()) return;
    setIsSearchingOnline(true);
    setOnlineResults([]);
    try {
      const resp = await fetch(
        `/api/metadata/search?q=${encodeURIComponent(onlineSearchQuery)}&limit=9`,
      );
      if (resp.ok) {
        const data = await resp.json();
        const docs = data.docs || [];
        const formatted = docs.map((doc: any, i: number) => ({
          olId: doc.key || `ol-${i}-${Date.now()}`,
          title: doc.title,
          author: doc.author_name ? doc.author_name[0] : "Unknown Author",
          coverUrl: doc.cover_i
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
            : "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400",
          description: doc.first_sentence
            ? doc.first_sentence[0]
            : `A classical volume cataloged via online lookup.`,
          genres: doc.subject ? doc.subject.slice(0, 3) : ["General"],
          pages: doc.number_of_pages_median || doc.number_of_pages || 250,
          publishYear:
            doc.first_publish_year || doc.publish_year?.[0] || "Unknown",
        }));
        setOnlineResults(formatted);
      }
    } catch (err) {
      console.error("Failed to search OpenLibrary online:", err);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleAddWantedBook = async (item: any) => {
    const selectedType = onlineSelectedFormats[item.olId] || "ebook";
    setAddingBookId(item.olId);

    const isAudio = selectedType === "audiobook";
    const bookPayload: any = {
      title: item.title,
      author: item.author,
      type: selectedType,
      coverUrl: item.coverUrl,
      description:
        item.description ||
        `Synopsis: Cataloged volume published in ${item.publishYear}.`,
      genres: item.genres,
      isDownloaded: false, // Explicitly false so it displays as wanted!
      size: isAudio ? "250 MB" : "1.2 MB",
    };

    if (isAudio) {
      bookPayload.duration = (item.pages || 150) * 90; // estimate duration seconds based on page count
      bookPayload.chapters = [
        {
          id: `ch-${Date.now()}-1`,
          title: "Awaiting Download Content",
          start: 0,
          end: 600,
        },
      ];
    } else {
      bookPayload.pages = item.pages;
      bookPayload.chapters = [
        {
          id: `ch-${Date.now()}-1`,
          title: "Overview",
          content:
            "Point this book to a physical epub or trigger a search Tracker index below to fetch the book content.",
        },
      ];
    }

    try {
      const response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookPayload),
      });
      if (response.ok) {
        onSyncLibrary(); // Refresh main library array
        alert(
          `"${item.title}" has been added to your Library as a "Wanted" entry. Hover over its list tile to search indexers or assign local files!`,
        );
      } else {
        alert("Server returned an error registering title data");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to register book template");
    } finally {
      setAddingBookId(null);
    }
  };

  const handleInitiateDownload = async (book: Book) => {
    if (!book.fileUrl) {
      alert("This book doesn't have a valid file URL on disk.");
      return;
    }

    setDownloadingBook(book);
    setDownloadProgress(0);
    setDownloadStatus("fetching");
    setDownloadError(null);
    setShowSandboxHelper(true);

    try {
      const response = await fetch(book.fileUrl);
      if (!response.ok) {
        throw new Error(
          `File fetch failed with status ${response.status}: ${response.statusText}`,
        );
      }

      const reader = response.body?.getReader();
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : 0;

      let finalBlob: Blob;

      if (!reader) {
        finalBlob = await response.blob();
      } else {
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          if (contentLength > 0) {
            const percent = Math.round((receivedLength / contentLength) * 100);
            setDownloadProgress(percent);
          } else {
            setDownloadProgress((prev) => Math.min(prev + 5, 95));
          }
        }
        finalBlob = new Blob(chunks, {
          type: book.fileUrl.endsWith(".mp3")
            ? "audio/mpeg"
            : "application/epub+zip",
        });
      }

      setDownloadStatus("saving");
      const originalFileName =
        book.fileUrl.split("/").pop() ||
        (book.type === "audiobook"
          ? `${book.title}.mp3`
          : `${book.title}.epub`);
      const fileName = decodeURIComponent(originalFileName);
      const defaultDevicePath = `Downloads/${fileName}`;

      // Persist in persistent IndexedDB storage
      await saveOfflineFile(book.id, fileName, finalBlob, defaultDevicePath);
      await refreshOfflineBooks();

      setDownloadProgress(100);
      triggerBlobDownload(finalBlob, book);
    } catch (err: any) {
      console.error("In-browser downloader error:", err);
      setDownloadStatus("error");
      setDownloadError(err.message || "Network download issue occurred");
    }
  };

  const triggerBlobDownload = async (blob: Blob, book: Book) => {
    try {
      // 1. Try to save to linked "watch" directory (internal storage)
      let watchHandle = await getDirectoryHandle("watch");
      if (!watchHandle) {
        watchHandle = await getDirectoryHandle("watch_internal");
      }
      if (watchHandle) {
        const hasPerm = await verifyDirectoryPermission(
          watchHandle,
          true,
          true,
        );
        if (hasPerm) {
          try {
            const extParts = book.fileUrl?.split(".");
            let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
            if (!ext) ext = book.type === "audiobook" ? "mp3" : "epub";
            const safeTitle = book.title
              .replace(/[^a-z0-9]/gi, "_")
              .toLowerCase();
            const fileName = `${safeTitle}.${ext}`;

            const fileHandle = await watchHandle.getFileHandle(fileName, {
              create: true,
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            console.log(
              `[STORAGE] Saved to internal storage: ${watchHandle.name}/${fileName}`,
            );

            // Also update the offline record with this path
            await updateOfflineFilePath(
              book.id,
              `${watchHandle.name}/${fileName}`,
            );
            await refreshOfflineBooks();
          } catch (storageErr) {
            console.error(
              "Local storage save failed, falling back to download:",
              storageErr,
            );
          }
        }
      }

      // 2. Standard browser download fallback
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const extParts = book.fileUrl?.split(".");
      let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
      if (!ext) ext = book.type === "audiobook" ? "mp3" : "epub";

      const safeTitle = book.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      link.download = `${safeTitle}.${ext}`;
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setDownloadStatus("completed");
      }, 500);
    } catch (err: any) {
      console.error("Native trigger click failed:", err);
      setDownloadStatus("error");
      setDownloadError(
        "Sandbox constraints prevented automatic download triggering. Please use alternative methods.",
      );
    }
  };

  const handleBatchOrganize = async () => {
    if (selectedBooks.size === 0) return;
    
    // Convert selected IDs to actual books
    const booksToOrganize = books.filter(b => selectedBooks.has(b.id));

    setBatchOrganizingStatus("Starting batch organization...");
    
    try {
      const { success, failed, errors } = await batchOrganizeLocalBooks(
        booksToOrganize,
        getDirectoryHandle,
        verifyDirectoryPermission,
        saveOfflineFile,
        saveFileHandle,
        (progress, total, message) => {
          setBatchOrganizingStatus(message);
        }
      );
      
      let finalMessage = `Batch Organization Completed.\nSuccessfully organized: ${success}`;
      if (failed > 0) {
        finalMessage += `\nFailed: ${failed}\n\nErrors:\n${errors.join('\n')}`;
      }
      
      alert(finalMessage);
    } catch (err: any) {
      alert("Batch organization encountered a critical error: " + (err.message || err));
    } finally {
      setBatchOrganizingStatus(null);
      setSelectedBooks(new Set());
      setIsSelectionMode(false);
      onSyncLibrary();
      await refreshOfflineBooks();
    }
  };

  // Inner BookCard component for clean rendering
  const renderBookItem = (book: Book) => {
    const isAudio = book.type === "audiobook";
    const isAvailable = isBookAvailable(book.id, book.isDownloaded);
    const hasOfflineCopy = !!offlineBooksMap[book.id];

    return (
      <div key={book.id} className="group flex flex-col relative w-full mb-4">
        {/* Book Cover Container */}
        <div
          onClick={(e) => {
            if (isSelectionMode) {
              e.preventDefault();
              e.stopPropagation();
              const newSelected = new Set(selectedBooks);
              if (newSelected.has(book.id)) {
                newSelected.delete(book.id);
              } else {
                newSelected.add(book.id);
              }
              setSelectedBooks(newSelected);
              return;
            }
            setSelectedBookDetails(book);
          }}
          className={`relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-xl shadow-black/40 border transition-all duration-300 cursor-pointer ${
            !isAvailable
              ? "border-dashed border-amber-600/60 hover:border-amber-400 hover:scale-102 filter grayscale-[15%] group-hover:grayscale-0"
              : "border-neutral-800 group-hover:border-amber-500/80 group-hover:scale-105"
          } ${isSelectionMode && selectedBooks.has(book.id) ? "ring-2 ring-amber-500 border-amber-500 shadow-amber-500/50" : ""}`}
        >
          {isSelectionMode && (
            <div className="absolute top-2 right-2 z-20 pointer-events-none">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedBooks.has(book.id) ? 'bg-amber-500 border-amber-500 text-black' : 'bg-black/50 border-neutral-400'}`}>
                {selectedBooks.has(book.id) && <Check className="w-3.5 h-3.5" />}
              </div>
            </div>
          )}

          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover select-none pointer-events-none"
          />

          {/* Play/Read hover action overlay */}
          {!isSelectionMode && (
            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-200">
              {!isAvailable ? (
                <div className="flex flex-col items-center gap-2 p-3 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedInspectBook(book);
                    }}
                    className="w-12 h-12 bg-amber-500/90 rounded-full flex items-center justify-center text-black hover:scale-110 cursor-pointer shadow shadow-amber-500/20"
                    title="Configure Book/Find File"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-amber-400">
                    Search Or Assign
                  </span>
                </div>
              ) : isAudio ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayAudiobook(book);
                  }}
                  className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-black hover:scale-110 cursor-pointer shadow shadow-amber-500/20"
                  title="Listen now"
                >
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReadEbook(book);
                  }}
                  className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-black hover:scale-110 cursor-pointer shadow shadow-amber-500/20"
                  title="Read now"
                >
                  <BookOpen className="w-5 h-5" />
                </button>
              )}

              {isAvailable && (book.fileUrl || hasOfflineCopy) && book.status !== 'organized' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (book.status === 'staged') {
                       setSelectedBookDetails(book);
                    } else {
                       handleInitiateDownload(book);
                    }
                  }}
                  className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#111] hover:bg-[#1c1c1c] text-[10px] text-amber-400 hover:text-amber-300 font-bold border border-neutral-800 hover:border-amber-500/30 select-none transition-all active:scale-95 cursor-pointer shadow-lg"
                  title={book.status === 'staged' ? "Organize file to library" : "Save copy to your computer or phone"}
                >
                  {book.status === 'staged' ? <FolderOpen className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                  <span>{book.status === 'staged' ? 'Organize' : 'Save to Device'}</span>
                </button>
              )}
            </div>
          )}

          {/* Format Indicator Tag corner */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <div className="bg-black/85 backdrop-blur-md text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded text-neutral-300">
              {isAudio ? "AUDIO" : "EPUB"}
            </div>
            {!isAvailable && (!book.status || book.status === "wanted") && (
              <div className="bg-amber-600/90 text-white text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded shadow-sm">
                WANTED
              </div>
            )}
            {book.status === "staged" && (
              <div className="bg-indigo-500 text-white text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded shadow-sm">
                STAGED
              </div>
            )}
            {(book.status === "organized" || (isAvailable && hasOfflineCopy && book.status !== "staged")) && (
              <div className="bg-amber-500 text-black text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded shadow-sm">
                ORGANIZED
              </div>
            )}
            {book.status === "organized" && !hasOfflineCopy && book.fileUrl && (
              <div className="bg-emerald-500/90 text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shadow-sm">
                NATIVE
              </div>
            )}
          </div>

          {/* Progress micro-bar bottom alignment */}
          {book.progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-900 border-t border-black/50">
              <div
                style={{ width: `${book.progress}%` }}
                className={`h-full ${book.progress === 100 ? "bg-emerald-500" : "bg-amber-500"}`}
              />
            </div>
          )}
        </div>

        {/* Content Info */}
        <div className="mt-3 text-left w-full space-y-1">
          <h5
            onClick={() => {
              if (!isAvailable) {
                setSelectedInspectBook(book);
                return;
              }
              isAudio ? onPlayAudiobook(book) : onReadEbook(book);
            }}
            className="font-serif font-bold text-sm sm:text-base text-neutral-100 truncate group-hover:text-amber-400 cursor-pointer transition leading-snug tracking-tight"
          >
            {book.title}
          </h5>
          <p className="text-[10px] sm:text-[11px] text-neutral-400 font-medium truncate tracking-wider uppercase">
            {book.author}
          </p>

          <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-mono text-neutral-500 pt-1 leading-none">
            <span>
              {isAudio
                ? formatDuration(book.duration || 0)
                : `${book.pages || "?"} pgs`}
            </span>
            {book.progress > 0 ? (
              <span
                className={
                  book.progress === 100
                    ? "text-emerald-500 font-semibold"
                    : "text-amber-500 font-semibold"
                }
              >
                {book.progress}%
              </span>
            ) : (
              <span className="text-transparent selection:text-transparent">
                0%
              </span>
            )}
          </div>

          {/* Device configuration & link details */}
          {isAvailable && (
            <div className="mt-2 bg-[#09090d] rounded-lg p-2 border border-neutral-900/60 flex flex-col gap-0.5 text-[10px] font-sans">
              <div className="flex items-center justify-between text-neutral-400">
                <span className="flex items-center gap-1 font-bold text-neutral-400">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full inline-block" />
                  Local File Path
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfiguringBookPath(book);
                    setCustomDevicePath(
                      offlineBooksMap[book.id]?.filePath ||
                        `Downloads/${book.fileUrl?.split("/").pop() || (book.type === "audiobook" ? `${book.title}.mp3` : `${book.title}.epub`)}`,
                    );
                    setLinkSuccessMessage(null);
                  }}
                  className="text-[9px] text-[#aaa] hover:text-amber-400 font-bold bg-[#141419] border border-neutral-800 px-1.5 py-0.5 rounded cursor-pointer transition select-none hover:border-amber-500/30"
                >
                  Configure
                </button>
              </div>
              <p
                className="font-mono text-[9px] text-neutral-400 truncate tracking-tight select-all cursor-default"
                title={offlineBooksMap[book.id]?.filePath || "Downloads Folder"}
              >
                {offlineBooksMap[book.id]?.filePath || "Downloads folder"}
              </p>
            </div>
          )}

          <div className="absolute top-1 right-1 sm:top-auto sm:right-auto sm:relative sm:flex sm:justify-end sm:-mt-3 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBookToDelete(book);
              }}
              className="bg-black/60 sm:bg-transparent rounded-full p-1.5 sm:p-1 text-neutral-500 hover:text-red-400 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer"
              title="Delete this book"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 0. Storage Onboarding Banner */}
      <StorageOnboarding onComplete={refreshOfflineBooks} />

      {/* 1. Header with Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
        <div className="text-left space-y-1">
          <h2 className="text-3xl sm:text-4xl font-display font-medium text-amber-500 tracking-tight flex items-center gap-3">
            <span>Bookrr Collection</span>
          </h2>
          <p className="text-xs text-neutral-400 font-sans tracking-wide">
            Browse and manage your downloaded media.
          </p>
        </div>

        {/* Sync & Manual Import Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isSelectionMode ? (
            <>
              <button
                onClick={handleBatchOrganize}
                disabled={selectedBooks.size === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Batch Organize ({selectedBooks.size})</span>
              </button>
              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedBooks(new Set());
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsSelectionMode(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Select</span>
            </button>
          )}

          <button
            onClick={onSyncLibrary}
            disabled={isSyncing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-[#2d2d2d] bg-[#161616] hover:bg-[#202020] text-xs font-semibold text-neutral-300 hover:text-amber-400 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            <span>{isSyncing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            onClick={async () => {
              const res = await fetch("/api/books/sync-all", {
                method: "POST",
              });
              if (res.ok) {
                onSyncLibrary();
                alert("Metadata sync complete!");
              } else {
                alert("Metadata sync failed.");
              }
            }}
            disabled={isSyncing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-[#2d2d2d] bg-[#161616] hover:bg-[#202020] text-xs font-semibold text-neutral-300 hover:text-amber-400 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync All</span>
          </button>

          <button
            onClick={() => setShowImportForm(!showImportForm)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-500 text-black px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold hover:bg-amber-400 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Manual</span>
          </button>
        </div>
      </div>

      {/* 2. Seamless Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 w-full pt-2">
        {/* Toggle Pills: All / Audiobooks / Ebooks */}
        <div className="flex items-center bg-[#111] p-1.5 rounded-2xl border border-[#222] overflow-x-auto hide-scrollbar sm:flex-none">
          {["all", "audiobook", "ebook"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter as any)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs uppercase tracking-widest font-bold transition-all duration-300 cursor-pointer ${
                activeFilter === filter
                  ? "bg-amber-500 text-black shadow-lg scale-100"
                  : "text-neutral-500 hover:text-neutral-200 hover:bg-[#1a1a1a] scale-95 hover:scale-100"
              }`}
            >
              {filter === "all"
                ? "All Media"
                : filter === "audiobook"
                  ? "Audiobooks"
                  : "E-books"}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 space-x-1.5 w-full md:w-auto">
          {/* Text input filter */}
          <div className="relative w-full sm:w-56 shrink-0 transition-all focus-within:w-full focus-within:sm:w-64">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#111] border border-[#222] text-xs font-medium text-neutral-200 rounded-xl py-2.5 pl-10 pr-4 w-full focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder:text-neutral-600 shadow-inner"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto overflow-x-auto hide-scrollbar pb-1 sm:pb-0">
            {/* Genre select */}
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-[#111] border border-[#222] rounded-xl px-3 py-2.5 min-w-[120px] transition-colors hover:border-[#333]">
              <Layers className="w-4 h-4 text-neutral-500 shrink-0" />
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="bg-transparent text-xs font-semibold text-neutral-300 border-none focus:outline-none cursor-pointer w-full appearance-none pr-2"
              >
                {genres.map((g) => (
                  <option key={g} value={g} className="bg-[#111] text-sm">
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress state select */}
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-[#111] border border-[#222] rounded-xl px-3 py-2.5 min-w-[130px] transition-colors hover:border-[#333]">
              <SlidersHorizontal className="w-4 h-4 text-neutral-500 shrink-0" />
              <select
                value={selectedProgress}
                onChange={(e) => setSelectedProgress(e.target.value)}
                className="bg-transparent text-xs font-semibold text-neutral-300 border-none focus:outline-none cursor-pointer w-full appearance-none pr-2"
              >
                <option value="All" className="bg-[#111] text-sm">
                  All Status
                </option>
                <option value="Unread" className="bg-[#111] text-sm">
                  Unread
                </option>
                <option value="In Progress" className="bg-[#111] text-sm">
                  In Progress
                </option>
                <option value="Completed" className="bg-[#111] text-sm">
                  Completed
                </option>
              </select>
            </div>

            {/* Sorting select */}
            <div className="flex-1 sm:flex-none flex items-center gap-2 bg-[#111] border border-[#222] rounded-xl px-3 py-2.5 min-w-[120px] transition-colors hover:border-[#333]">
              <RefreshCw className="w-4 h-4 text-neutral-500 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as "title" | "recent" | "progress")
                }
                className="bg-transparent text-xs font-semibold text-neutral-300 border-none focus:outline-none cursor-pointer w-full appearance-none pr-2"
              >
                <option value="title" className="bg-[#111] text-sm">
                  Sort A-Z
                </option>
                <option value="progress" className="bg-[#111] text-sm">
                  Progress
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Manual Add Entry Form Overlay Drawer / Modal card */}
      {showImportForm && (
        <div className="bg-[#121212] border border-amber-500/15 p-5 md:p-6 rounded-2xl text-left space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-250">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <h4 className="font-sans font-bold text-sm text-amber-500 flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-amber-500" />
              <span>Catalog New Volume</span>
            </h4>
            <button
              onClick={() => {
                setShowImportForm(false);
                setOnlineResults([]);
                setOnlineSearchQuery("");
              }}
              className="text-neutral-500 hover:text-white text-xs px-2 py-1 rounded hover:bg-neutral-900 transition"
            >
              Close
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex bg-[#181818]/60 p-1 rounded-xl border border-neutral-900 w-fit">
            <button
              type="button"
              onClick={() => setAddMode("online")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition select-none cursor-pointer ${
                addMode === "online"
                  ? "bg-amber-500 text-black shadow"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Search Online (Readarr style)
            </button>
            <button
              type="button"
              onClick={() => setAddMode("manual")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition select-none cursor-pointer ${
                addMode === "manual"
                  ? "bg-amber-500 text-black shadow"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Manual Custom Entry
            </button>
          </div>

          {addMode === "online" ? (
            <div className="space-y-4">
              <p className="text-[11px] text-neutral-400 leading-snug font-sans">
                Search OpenLibrary's rich international catalog of millions of
                books and authors. Adding a title creates an elegant placeholder
                in your library with metadata and cover posters, ready to watch
                or search connected torrent indexers when you are!
              </p>

              <form onSubmit={handleOnlineSearch} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Type book title or author (e.g., 'Andy Weir', 'Isaac Asimov')..."
                  value={onlineSearchQuery}
                  onChange={(e) => setOnlineSearchQuery(e.target.value)}
                  className="flex-1 bg-[#1a1a1a] border border-[#2d2d2d] text-xs font-sans text-neutral-200 p-2.5 rounded-lg focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={isSearchingOnline}
                  className="bg-amber-500 text-black px-4 py-2 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Search size={13} />
                  {isSearchingOnline ? "Searching..." : "Search"}
                </button>
              </form>

              {isSearchingOnline && (
                <div className="py-12 text-center text-xs font-mono text-neutral-500 flex items-center justify-center gap-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  Querying OpenLibrary metadata registries...
                </div>
              )}

              {!isSearchingOnline && onlineResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[380px] overflow-y-auto pr-1">
                  {onlineResults.map((item) => {
                    const format = onlineSelectedFormats[item.olId] || "ebook";
                    const isAddingThis = addingBookId === item.olId;
                    return (
                      <div
                        key={item.olId}
                        className="bg-[#18181c] border border-neutral-900 rounded-xl p-3.5 flex gap-3 text-xs text-neutral-300 leading-snug hover:border-neutral-800 transition shadow-lg"
                      >
                        {/* Thumbnail cover */}
                        <img
                          src={item.coverUrl}
                          alt={item.title}
                          className="w-16 h-24 object-cover rounded-md bg-neutral-950 border border-neutral-900 shadow-inner flex-shrink-0"
                        />

                        {/* Poster details */}
                        <div className="flex-1 flex flex-col justify-between min-w-0 space-y-2">
                          <div>
                            <h5
                              className="font-sans font-bold text-neutral-100 truncate"
                              title={item.title}
                            >
                              {item.title}
                            </h5>
                            <p className="text-[10px] text-neutral-400 font-mono truncate">
                              by {item.author}
                            </p>
                            <p className="text-[9px] text-neutral-500 font-sans mt-0.5">
                              First Pub: {item.publishYear} •{" "}
                              {item.pages || "?"} pgs
                            </p>
                          </div>

                          {/* Controls */}
                          <div className="space-y-2 pt-1 border-t border-neutral-900">
                            {/* Format selection */}
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-neutral-500">Format:</span>
                              <div className="flex items-center gap-2 bg-[#202025] px-1.5 py-0.5 rounded border border-neutral-850">
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`format-${item.olId}`}
                                    checked={format === "ebook"}
                                    onChange={() =>
                                      setOnlineSelectedFormats((prev) => ({
                                        ...prev,
                                        [item.olId]: "ebook",
                                      }))
                                    }
                                    className="accent-amber-500 w-2.5 h-2.5"
                                  />
                                  <span
                                    className={
                                      format === "ebook"
                                        ? "text-amber-400 font-bold"
                                        : "text-neutral-400"
                                    }
                                  >
                                    EBook
                                  </span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`format-${item.olId}`}
                                    checked={format === "audiobook"}
                                    onChange={() =>
                                      setOnlineSelectedFormats((prev) => ({
                                        ...prev,
                                        [item.olId]: "audiobook",
                                      }))
                                    }
                                    className="accent-amber-500 w-2.5 h-2.5"
                                  />
                                  <span
                                    className={
                                      format === "audiobook"
                                        ? "text-amber-400 font-bold"
                                        : "text-neutral-400"
                                    }
                                  >
                                    Audio
                                  </span>
                                </label>
                              </div>
                            </div>

                            {/* Add action btn */}
                            <button
                              type="button"
                              onClick={() => handleAddWantedBook(item)}
                              disabled={isAddingThis}
                              className="w-full bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/30 text-amber-400 text-[10px] font-bold py-1.5 rounded-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                            >
                              {isAddingThis ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Adding...</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  <span>Add as Wanted</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isSearchingOnline &&
                onlineSearchQuery &&
                onlineResults.length === 0 && (
                  <div className="py-12 text-center text-xs font-mono text-neutral-500 leading-normal">
                    No catalog records matching "{onlineSearchQuery}" found on
                    OpenLibrary.
                    <br />
                    Try searching a different title or shift to standard Manual
                    Entry tab.
                  </div>
                )}
            </div>
          ) : (
            <form
              onSubmit={handleCreateBook}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono"
            >
              <div className="space-y-1.5">
                <label className="text-neutral-400 block">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="The Odyssey..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-400 block">Author *</label>
                <input
                  type="text"
                  required
                  placeholder="Homer..."
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-400 block">Format</label>
                <select
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as "audiobook" | "ebook")
                  }
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200 cursor-pointer"
                >
                  <option value="ebook">E-book</option>
                  <option value="audiobook">Audiobook</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-400 block">
                  Length ({newType === "audiobook" ? "Mins" : "Pages"})
                </label>
                <input
                  type="number"
                  min={1}
                  value={newLength}
                  onChange={(e) => setNewLength(Number(e.target.value))}
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-400 block">Genres (csv)</label>
                <input
                  type="text"
                  placeholder="Fantasy, Sci-Fi..."
                  value={newGenres}
                  onChange={(e) => setNewGenres(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-neutral-400 block">Cover URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={newCoverUrl}
                  onChange={(e) => setNewCoverUrl(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200"
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-neutral-400 block flex items-center gap-2">
                  <FolderOpen size={13} />
                  Direct File Upload (Staging)
                </label>
                <div className="flex items-center gap-3 bg-[#1a1a1a] border border-[#2d2d2d] p-3 rounded-xl border-dashed hover:border-amber-500/50 transition">
                  <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                    <UploadCloud size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-neutral-400 mb-1">
                      Upload direct from browser to staging
                    </p>
                    <input
                      type="file"
                      onChange={(e) =>
                        setSelectedFile(e.target.files?.[0] || null)
                      }
                      className="text-[10px] text-neutral-500 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-neutral-800 file:text-neutral-300 hover:file:bg-neutral-700 cursor-pointer"
                      accept={
                        newType === "audiobook"
                          ? ".mp3,.m4b,.aac"
                          : ".epub,.pdf,.mobi,.azw3,.txt"
                      }
                    />
                  </div>
                  {selectedFile && (
                    <div className="text-emerald-500">
                      <Check size={16} />
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-neutral-400 block">
                  Description (Optional)
                </label>
                <textarea
                  placeholder="Synopsis..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-[#1a1a1a] border border-[#2d2d2d] p-2.5 rounded-lg focus:outline-none focus:border-amber-500 text-neutral-200"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportForm(false)}
                  className="px-4 py-2 hover:bg-neutral-900 text-neutral-400 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-black px-5 py-2 hover:bg-amber-400 rounded-lg font-bold cursor-pointer transition select-none"
                >
                  Add manually
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 4. Display Grids */}
      <div className="space-y-10 pb-8">
        {filteredBooks.length === 0 ? (
          <div className="p-16 text-center bg-[#111] rounded-2xl border border-[#222]">
            <BookMarked className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
            <p className="text-white font-sans text-sm font-semibold">
              No books found.
            </p>
            <p className="text-[#cccccc] font-sans text-xs mt-2 italic">
              Try adjusting your filters or triggering a download.
            </p>
          </div>
        ) : (
          <>
            {/* Continue Reading Section (Horizontal scroll for mobile) */}
            {inProgressBooks.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-serif italic text-xl sm:text-2xl text-neutral-100/90 px-2 tracking-tight">
                  Continue Reading
                </h3>
                <div className="flex overflow-x-auto hide-scrollbar gap-5 pb-6 px-2 -mx-2">
                  {inProgressBooks.map((book) => (
                    <div
                      key={book.id}
                      className="min-w-[130px] max-w-[130px] sm:min-w-[170px] sm:max-w-[170px] shrink-0"
                    >
                      {renderBookItem(book)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All / Rest of Books Grid */}
            {otherBooks.length > 0 && (
              <div className="space-y-4 pt-4">
                <h3 className="font-serif italic text-xl sm:text-2xl text-neutral-100/90 px-2 tracking-tight">
                  Your Collection
                </h3>
                <div className="grid grid-cols-2 min-[500px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 sm:gap-6 px-2">
                  {otherBooks.map((book) => renderBookItem(book))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modern Confirmation Overlay Dialog */}
      {selectedBookDetails && (
        <BookDetailsModal
          book={{
            ...selectedBookDetails,
            filePath:
              offlineBooksMap[selectedBookDetails.id]?.filePath ||
              selectedBookDetails.filePath,
          }}
          onClose={() => setSelectedBookDetails(null)}
          onPlay={onPlayAudiobook}
          onRead={onReadEbook}
          isAvailable={isBookAvailable(
            selectedBookDetails.id,
            selectedBookDetails.isDownloaded,
          )}
          onUpdateBook={() => onManualImport(selectedBookDetails.id)}
        />
      )}
      {bookToDelete && (
        <div
          onClick={() => setBookToDelete(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none cursor-default"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111111] border border-neutral-800 rounded-2xl max-w-sm w-full p-6 text-left shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-500/80" />

            <h3 className="font-sans font-extrabold text-[#eeeeee] text-base mb-2 select-text">
              Delete Title?
            </h3>

            <p className="text-xs text-neutral-400 leading-relaxed mb-4 select-text">
              Are you sure you want to permanently delete{" "}
              <strong className="text-neutral-200">
                "{bookToDelete.title}"
              </strong>{" "}
              by {bookToDelete.author}?
            </p>

            <div className="flex items-center gap-3 justify-end text-xs font-mono">
              <button
                onClick={() => setBookToDelete(null)}
                className="px-4 py-2 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteBook(bookToDelete.id);
                  setBookToDelete(null);
                }}
                className="bg-red-500/90 text-white font-semibold hover:bg-red-600 px-4 py-2 rounded-lg cursor-pointer transition shadow shadow-red-500/20"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Sandbox Download Assistant & Browser Memory Downloader Modal */}
      {showSandboxHelper && downloadingBook && (
        <div
          onClick={() => {
            if (downloadStatus === "completed" || downloadStatus === "error") {
              setShowSandboxHelper(false);
              setDownloadingBook(null);
            }
          }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 transition-all duration-300"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0f0f15] border border-neutral-800 rounded-3xl max-w-sm w-full p-6 text-left shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Top color strap */}
            <div
              className={`absolute top-0 left-0 right-0 h-1.5 ${
                downloadStatus === "error"
                  ? "bg-rose-500"
                  : downloadStatus === "completed"
                    ? "bg-emerald-500"
                    : "bg-amber-500"
              }`}
            />

            {/* Header info */}
            <div className="flex items-start gap-3.5 mb-5 mt-2">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  downloadStatus === "error"
                    ? "bg-rose-500/10 text-rose-400"
                    : downloadStatus === "completed"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-500 animate-pulse"
                }`}
              >
                <FileDown size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-sans font-extrabold text-[#eeeeee] text-sm leading-snug">
                  Download Assistant
                </h3>
                <p className="text-[9px] uppercase font-mono tracking-wider text-neutral-550 mt-0.5">
                  Browser Sandboxing Bypasser
                </p>
              </div>
            </div>

            {/* File info banner */}
            <div className="bg-[#16161f] border border-neutral-900 rounded-xl p-3 mb-5 flex items-center gap-3">
              <img
                src={downloadingBook.coverUrl}
                alt={downloadingBook.title}
                className="w-10 h-14 object-cover rounded-md shrink-0 border border-neutral-800"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-200 truncate leading-tight">
                  {downloadingBook.title}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5 truncate">
                  {downloadingBook.author}
                </p>
                <span className="inline-block text-[9px] bg-[#222] text-[#aaa] font-mono rounded px-1.5 py-0.5 mt-1">
                  {downloadingBook.type === "audiobook" ? "AUDIO" : "EPUB"}
                </span>
              </div>
            </div>

            {/* Status section & progress loaders */}
            <div className="space-y-4 mb-6">
              {downloadStatus === "fetching" && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400 flex items-center gap-1.5 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" />
                      Downloading to browser memory & offline cache...
                    </span>
                    <span className="font-mono font-bold text-amber-500">
                      {downloadProgress}%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800/50">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300 ease-out"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-500 leading-snug pt-1">
                    Fetching locally allows us to place a copy in your browser
                    database AND stream it offline.
                  </p>
                </div>
              )}

              {downloadStatus === "saving" && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-neutral-300 font-medium">
                    Assembling file data, persisting in browser store &
                    saving...
                  </p>
                </div>
              )}

              {downloadStatus === "completed" && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-left space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <span>✓</span> Success! Download Triggered
                  </div>
                  <p className="text-[10px] text-neutral-300 leading-relaxed">
                    The file was saved to your device. Check your browser
                    Downloads folder. It is also cached offline in browser
                    storage!
                  </p>
                </div>
              )}

              {downloadStatus === "error" && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 text-left space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                    <AlertTriangle size={14} /> Sandbox Blocked Save
                  </div>
                  <p className="text-[10px] text-neutral-300 leading-normal">
                    {downloadError ||
                      "Your browser's iframe security sandbox blocked the automated file save command."}
                  </p>
                </div>
              )}
            </div>

            {/* Sandbox Bypassing Actions */}
            <div className="space-y-2 px-1 pt-3 border-t border-neutral-900">
              <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-550 pb-1">
                Alternate Sandbox Bypasses:
              </p>

              {/* Action 1: Open direct download link in a new tab */}
              <a
                href={downloadingBook.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md select-none text-center"
              >
                <ExternalLink size={13} />
                Open Direct Download link (New Tab)
              </a>

              {/* Action 2: Open full frame app inside a top tab */}
              <button
                onClick={() => {
                  window.open(window.location.href, "_blank");
                }}
                className="w-full py-2 px-3 border border-neutral-800 bg-[#16161f] hover:bg-[#1e1e2d] text-neutral-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer select-none text-center"
              >
                <Globe size={13} />
                Open Entire App (New Tab)
              </button>

              <p className="text-[9px] text-neutral-500 text-center leading-normal mt-2.5">
                💡 Opening either option in a new tab operates completely free
                of the sandboxed workspace!
              </p>
            </div>

            {/* Footer Control */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => {
                  setShowSandboxHelper(false);
                  setDownloadingBook(null);
                }}
                className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg text-xs font-semibold cursor-pointer transition select-none"
              >
                {downloadStatus === "fetching" || downloadStatus === "saving"
                  ? "Cancel / Hide"
                  : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configure Device Path & Associate Native File Modal */}
      {configuringBookPath && (
        <div
          onClick={() => setConfiguringBookPath(null)}
          className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 transition-all duration-300"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0c0c12] border border-neutral-800 rounded-3xl max-w-sm w-full p-6 text-left shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Top color strap */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />

            {/* Header info */}
            <div className="flex items-start gap-3 mt-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Save size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-sans font-extrabold text-[#eeeeee] text-sm leading-snug">
                  Local Device Linker
                </h3>
                <p className="text-[9px] uppercase font-mono tracking-wider text-neutral-500 mt-0.5">
                  Point book entry to personal files
                </p>
              </div>
            </div>

            {/* Current Book card summary */}
            <div className="bg-[#12121a] border border-neutral-900 rounded-xl p-3 mb-4 flex items-center gap-3">
              <img
                src={configuringBookPath.coverUrl}
                alt={configuringBookPath.title}
                className="w-10 h-14 object-cover rounded-md shrink-0 border border-neutral-800 animate-pulse"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-200 truncate leading-tight">
                  {configuringBookPath.title}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5 truncate">
                  {configuringBookPath.author}
                </p>
                <span className="inline-block text-[9px] bg-[#1a1a24] text-amber-400 font-mono rounded px-1.5 py-0.5 mt-1.5">
                  {configuringBookPath.type === "audiobook"
                    ? "AUDIOBOOK"
                    : "EBOOK"}
                </span>
              </div>
            </div>

            {/* Path Form Input */}
            <div className="space-y-3 mb-5">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-neutral-400 tracking-wider uppercase block">
                  Device Filepath or Note:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customDevicePath}
                    onChange={(e) => setCustomDevicePath(e.target.value)}
                    placeholder="e.g. ~/Downloads/book_title.epub"
                    className="flex-1 bg-[#12121c] border border-neutral-800 hover:border-neutral-700 focus:border-amber-500/50 rounded-xl px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none transition-all duration-200 placeholder:text-neutral-600"
                  />
                  <button
                    onClick={async () => {
                      if (!customDevicePath.trim()) {
                        alert(
                          "Please provide a valid file path representation.",
                        );
                        return;
                      }

                      // Check if we already have it in IndexedDB, if not we seed with empty blob to preserve the path string!
                      const offlineRecord = await getOfflineFile(
                        configuringBookPath.id,
                      );
                      if (offlineRecord) {
                        await updateOfflineFilePath(
                          configuringBookPath.id,
                          customDevicePath.trim(),
                        );
                      } else {
                        // Create a dummy placeholder blob to mark it as local
                        const placeholderBlob = new Blob(["dummy content"], {
                          type:
                            configuringBookPath.type === "audiobook"
                              ? "audio/mpeg"
                              : "application/epub+zip",
                        });
                        await saveOfflineFile(
                          configuringBookPath.id,
                          configuringBookPath.fileUrl?.split("/").pop() ||
                            `${configuringBookPath.title}.epub`,
                          placeholderBlob,
                          customDevicePath.trim(),
                        );
                      }

                      await refreshOfflineBooks();
                      setLinkSuccessMessage("Path updated successfully!");
                      setTimeout(() => setLinkSuccessMessage(null), 3050);
                    }}
                    className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-extrabold text-xs h-9 px-3 rounded-xl cursor-pointer transition select-none flex items-center justify-center shrink-0 shadow-lg"
                  >
                    Set
                  </button>
                </div>
                <p className="text-[9px] text-neutral-500 font-sans leading-snug pt-0.5">
                  Keep track of where you saved the download. Inputting the
                  exact system path helps you remember!
                </p>
              </div>

              {/* Native File Selector Upload Bridge (Bypasses sandboxing rules natively) */}
              <div className="pt-3 border-t border-neutral-900 space-y-2">
                <label className="text-[10px] font-mono text-neutral-400 tracking-wider uppercase block">
                  Re-Link / Load Actual File:
                </label>

                <input
                  type="file"
                  id="native-device-file-picker"
                  accept={
                    configuringBookPath.type === "audiobook"
                      ? ".mp3,.m4b,.aac"
                      : ".epub,.pdf,.mobi,.azw3,.txt"
                  }
                  className="hidden"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;

                    const file = files[0];
                    const safeName = file.name;

                    try {
                      setLinkSuccessMessage("Reading file contents...");

                      // Read selected physical file as Blob
                      const blob = new Blob([file], { type: file.type });

                      // Persist in client browser storage under this books unique identifier
                      const guessedPath = `Downloads/${safeName}`;
                      await saveOfflineFile(
                        configuringBookPath.id,
                        safeName,
                        blob,
                        guessedPath,
                      );
                      await refreshOfflineBooks();

                      setCustomDevicePath(guessedPath);
                      setLinkSuccessMessage(
                        `Pointed book map to localized version: ${safeName}`,
                      );
                    } catch (err: any) {
                      alert(
                        `Failed to load selected physical file: ${err.message}`,
                      );
                    }
                  }}
                />

                <button
                  onClick={() => {
                    document
                      .getElementById("native-device-file-picker")
                      ?.click();
                  }}
                  className="w-full py-2 px-3 border border-neutral-800 bg-[#14141d] hover:bg-[#1a1a26]/80 text-[#ddd] hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer select-none"
                >
                  <Globe size={13} />
                  Choose Local File from Device Filepicker
                </button>

                <p className="text-[9px] text-neutral-500 leading-snug">
                  Select the downloaded file on your computer/phone. Reading it
                  locally loads it directly in your browser's persistent offline
                  database!
                </p>
              </div>
            </div>

            {/* Response messages */}
            {linkSuccessMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold rounded-xl p-2.5 mb-4 text-center leading-normal animate-in fade-in duration-200">
                {linkSuccessMessage}
              </div>
            )}

            {/* Backer Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-950">
              <button
                onClick={async () => {
                  if (
                    confirm(
                      "Are you sure you want to unlink and remove browser memory storage? Your physical file in the Downloads folder won't be modified.",
                    )
                  ) {
                    await deleteOfflineFile(configuringBookPath.id);
                    await refreshOfflineBooks();
                    setConfiguringBookPath(null);
                  }
                }}
                className="px-3 py-1.5 hover:bg-rose-500/10 hover:text-rose-400 text-neutral-500 border border-transparent rounded-lg text-[10px] font-bold cursor-pointer transition select-none"
              >
                Unlink Block
              </button>
              <button
                onClick={() => setConfiguringBookPath(null)}
                className="px-4 py-1.5 bg-neutral-900 border border-neutral-850 hover:bg-[#17171f] hover:text-white text-neutral-300 rounded-lg text-xs font-semibold cursor-pointer transition select-none"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Detail & Readarr Search/Assign Metadata Inspector Modal */}
      {selectedInspectBook &&
        (() => {
          const isAudio = selectedInspectBook.type === "audiobook";
          const isAvailable = isBookAvailable(
            selectedInspectBook.id,
            selectedInspectBook.isDownloaded,
          );
          const hasOfflineCopy = !!offlineBooksMap[selectedInspectBook.id];
          return (
            <div
              onClick={() => setSelectedInspectBook(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 transition-all duration-300"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0e0e12] border border-neutral-800/80 rounded-3xl max-w-lg w-full p-6 text-left shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 space-y-5"
              >
                {/* Colored status bar top */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${isAvailable ? "bg-emerald-500" : "bg-amber-500"}`}
                />

                <div className="flex flex-col sm:flex-row gap-5 items-start">
                  {/* Cover Frame */}
                  <div className="relative w-32 h-44 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0 shadow-xl shadow-black/60 mx-auto sm:mx-0">
                    <img
                      src={selectedInspectBook.coverUrl}
                      alt={selectedInspectBook.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1.5 right-1.5">
                      <span className="text-[8px] font-mono font-bold bg-[#111]/90 backdrop-blur-md text-neutral-300 px-1.5 py-0.5 rounded uppercase border border-neutral-800">
                        {isAudio ? "Audio" : "Epub"}
                      </span>
                    </div>
                  </div>

                  {/* Main descriptors */}
                  <div className="flex-1 min-w-0 space-y-2 mt-1 w-full">
                    <h3
                      className="font-sans font-extrabold text-[#eeeeee] text-base sm:text-lg leading-snug truncate"
                      title={selectedInspectBook.title}
                    >
                      {selectedInspectBook.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#ffb03a] font-mono leading-none truncate">
                      by {selectedInspectBook.author}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {selectedInspectBook.genres.map((g) => (
                        <span
                          key={g}
                          className="text-[9px] bg-neutral-900 border border-neutral-800 rounded-md px-2 py-0.5 text-neutral-400 font-sans font-medium"
                        >
                          {g}
                        </span>
                      ))}
                    </div>

                    <div className="text-[10px] text-neutral-400 font-mono space-y-1 pt-1.5 border-t border-neutral-900">
                      <p>
                        Format:{" "}
                        <span className="text-neutral-200 capitalize">
                          {selectedInspectBook.type}
                        </span>
                      </p>
                      <p>
                        Size:{" "}
                        <span className="text-neutral-200">
                          {selectedInspectBook.size || "Auto-Sized"}
                        </span>
                      </p>
                      <p>
                        Status:{" "}
                        {isAvailable ? (
                          <span className="text-emerald-400 font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded">
                            Available / Downloaded{" "}
                            {hasOfflineCopy
                              ? "(Offline cached)"
                              : "(Native server)"}
                          </span>
                        ) : (
                          <span className="text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Missing / Wanted (Awaiting Play file)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Description Section */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 font-bold">
                    Synopsis / Description:
                  </h4>
                  <div className="bg-[#121217] rounded-xl p-3 border border-neutral-900 text-[11px] leading-relaxed text-neutral-300 font-sans max-h-24 overflow-y-auto">
                    {selectedInspectBook.description ||
                      "No digital synopsis listed for this cataloged volume reference."}
                  </div>
                </div>

                {/* File action assignments */}
                <div className="pt-2 border-t border-neutral-900 space-y-3">
                  {!isAvailable ? (
                    <div className="space-y-3">
                      <p className="text-[10px] text-neutral-400 leading-normal font-sans">
                        ⚠️ This volume has been added as a{" "}
                        <strong>Wanted Bookmark</strong> details. You can
                        instantly trigger tracker scans on indexers to request
                        this title file or pick locally:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Search Tracks CTA */}
                        <button
                          onClick={() => {
                            const query =
                              `${selectedInspectBook.title} ${selectedInspectBook.author}`.replace(
                                /[^a-zA-Z0-9\s]/g,
                                " ",
                              );
                            onSearchTrackers(query);
                            setSelectedInspectBook(null); // Close modal
                          }}
                          className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-lg"
                        >
                          <Search size={13} />
                          Search Connected Indexers
                        </button>

                        {/* Manual File Pick Input */}
                        <input
                          type="file"
                          id="wanted-file-picker"
                          accept={
                            isAudio
                              ? ".mp3,.m4b,.aac"
                              : ".epub,.pdf,.mobi,.azw3,.txt"
                          }
                          className="hidden"
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0) return;

                            const file = files[0];
                            try {
                              setLinkSuccessMessage(
                                "Binding offline file representation...",
                              );
                              const blob = new Blob([file], {
                                type: file.type,
                              });
                              const defaultDevicePath = `Downloads/${file.name}`;
                              await saveOfflineFile(
                                selectedInspectBook.id,
                                file.name,
                                blob,
                                defaultDevicePath,
                              );
                              await refreshOfflineBooks();

                              setLinkSuccessMessage(
                                `Offline copy linked! ${file.name} is now ready to read.`,
                              );
                              onManualImport(selectedInspectBook.id); // Parent trigger refresh
                              setTimeout(() => {
                                setLinkSuccessMessage(null);
                                setSelectedInspectBook(null);
                              }, 1800);
                            } catch (err: any) {
                              alert(
                                "Failed to map file locally: " + err.message,
                              );
                            }
                          }}
                        />

                        <button
                          onClick={() => {
                            document
                              .getElementById("wanted-file-picker")
                              ?.click();
                          }}
                          className="py-2.5 px-3 border border-neutral-800 bg-[#16161f] hover:bg-[#1e1e2d] text-neutral-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <UploadCloud size={13} />
                          Assign Local File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] text-neutral-400 leading-normal font-sans">
                        ✅ File is available in device storage or local web
                        cache database. Ready for playback:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setSelectedInspectBook(null);
                            isAudio
                              ? onPlayAudiobook(selectedInspectBook)
                              : onReadEbook(selectedInspectBook);
                          }}
                          className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-lg"
                        >
                          {isAudio ? (
                            <Play size={13} className="fill-current" />
                          ) : (
                            <BookOpen size={13} />
                          )}
                          {isAudio ? "Listen Audiobook" : "Read E-book"}
                        </button>

                        {(selectedInspectBook.fileUrl || hasOfflineCopy) &&
                          !hasOfflineCopy && (
                            <button
                              onClick={() => {
                                setSelectedInspectBook(null);
                                handleInitiateDownload(selectedInspectBook);
                              }}
                              className="py-2.5 px-3 bg-neutral-900 hover:bg-[#18181f] border border-neutral-850 text-amber-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
                            >
                              <Download size={13} />
                              Save Offline Copy
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Message indicators */}
                {linkSuccessMessage && (
                  <div className="bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 text-[10px] font-semibold rounded-xl py-2 px-3 text-center">
                    {linkSuccessMessage}
                  </div>
                )}

                {/* Footer controls */}
                <div className="flex justify-between gap-2 pt-3 border-t border-neutral-950 items-center">
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Remove "${selectedInspectBook.title}" completely from index bookmarks? Any associated browser storage will be unlinked.`,
                        )
                      ) {
                        deleteOfflineFile(selectedInspectBook.id).then(() => {
                          onDeleteBook(selectedInspectBook.id);
                          refreshOfflineBooks();
                          setSelectedInspectBook(null);
                        });
                      }
                    }}
                    className="px-3 py-1.5 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400 rounded-lg text-[10px] font-bold cursor-pointer transition select-none flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                    Delete Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedInspectBook(null)}
                    className="px-4 py-1.5 bg-neutral-900 border border-neutral-850 hover:bg-[#17171f] hover:text-white text-neutral-300 rounded-lg text-xs font-semibold cursor-pointer transition select-none"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {batchOrganizingStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121212] border border-[#222] p-8 flex flex-col items-center justify-center max-w-sm w-full rounded-2xl shadow-[0_0_80px_rgba(245,158,11,0.15)] text-center">
            <RefreshCw className="w-12 h-12 text-amber-500 animate-spin mb-4" />
            <h4 className="font-sans font-bold text-lg mb-2 tracking-tight text-white">Batch Organizing</h4>
            <p className="text-sm font-mono text-neutral-400 break-words leading-relaxed w-full">
              {batchOrganizingStatus}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(secs: number) {
  if (!secs) return "0h";
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}
