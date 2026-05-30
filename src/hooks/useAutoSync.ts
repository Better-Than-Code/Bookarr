import React, { useEffect, useRef } from "react";
import { Book, AudiobookChapter } from "../types";
import {
  getOfflineFile,
  getOfflineBooksMap,
  saveOfflineFile,
  getDirectoryHandle,
  verifyDirectoryPermission,
  updateOfflineFilePath,
  saveOfflineChapterFile,
  hasOfflineChapterFile,
  OfflineFile,
  saveFileHandle,
} from "../services/LocalFileService";
import { sanitizePathName } from "../services/LocalOrganizerService";

export function useAutoSync(
  books: Book[],
  offlineBooksMap: { [bookId: string]: { name: string; filePath?: string } },
  refreshOfflineBooks: () => Promise<void>,
  loadSettingsAndLogs: () => Promise<void>,
  setSyncingBookIds: React.Dispatch<
    React.SetStateAction<{ [bookId: string]: boolean }>
  >,
) {
  const syncInProgressRef = useRef<{ [bookId: string]: boolean }>({});

  useEffect(() => {
    const doAutoSync = async () => {
      const verifyAndCorrectBookLocation = async (
        book: Book,
        offlineFile: OfflineFile,
      ) => {
        try {
          const isAudio = book.type === "audiobook";
          const destId = isAudio ? "audiobooks" : "ebooks";
          const destPrefix = isAudio ? "Audiobooks" : "Ebooks";
          const destHandle = await getDirectoryHandle(destId);
          let useOrganized = false;

          if (destHandle) {
            const hasPerm = await verifyDirectoryPermission(
              destHandle,
              true,
              false,
            );
            if (hasPerm) {
              useOrganized = true;
            }
          }

          if (useOrganized && destHandle) {
            const authorFolder = sanitizePathName(book.author);
            const bookFolder = sanitizePathName(book.title);

            const authorDirHandle = await destHandle.getDirectoryHandle(
              authorFolder,
              { create: true },
            );
            const bookDirHandle = await authorDirHandle.getDirectoryHandle(
              bookFolder,
              { create: true },
            );

            const extParts = book.fileUrl?.split(".");
            let ext = extParts && extParts.length > 1 ? extParts.pop() : null;
            if (!ext) ext = isAudio ? "mp3" : "epub";
            const extClean = decodeURIComponent(ext)
              .toLowerCase()
              .split("?")[0];
            const finalFileName = `${bookFolder} - ${authorFolder}.${extClean}`;

            try {
              const existingFileHandle =
                await bookDirHandle.getFileHandle(finalFileName);
              const newPath = `${destPrefix}/${authorFolder}/${bookFolder}/${finalFileName}`;
              if (offlineFile.filePath !== newPath) {
                await updateOfflineFilePath(book.id, newPath);
                await saveFileHandle(book.id, existingFileHandle, newPath);
                console.log(
                  `[AUTO-SYNC] Corrected discrepancy in file path for ${book.title}: ${newPath}`,
                );
              }
            } catch (e) {
              const fileHandle = await bookDirHandle.getFileHandle(
                finalFileName,
                { create: true },
              );
              const writable = await fileHandle.createWritable();
              const arrayBuffer = await offlineFile.blob.arrayBuffer();
              await writable.write(arrayBuffer);
              await writable.close();

              const newPath = `${destPrefix}/${authorFolder}/${bookFolder}/${finalFileName}`;
              await updateOfflineFilePath(book.id, newPath);
              await saveFileHandle(book.id, fileHandle, newPath);
              console.log(
                `[AUTO-SYNC] Successfully re-organized file for ${book.title}: ${newPath}`,
              );
            }
          } else {
            // Legacy watch folder fallback
            let watchHandle = await getDirectoryHandle("watch");
            if (!watchHandle) {
              watchHandle = await getDirectoryHandle("watch_internal");
            }
            if (watchHandle) {
              const hasPerm = await verifyDirectoryPermission(
                watchHandle,
                true,
                false,
              );
              if (hasPerm) {
                const extParts = book.fileUrl?.split(".");
                let ext =
                  extParts && extParts.length > 1 ? extParts.pop() : null;
                if (!ext) ext = isAudio ? "mp3" : "epub";
                const safeTitle = book.title
                  .replace(/[^a-z0-9]/gi, "_")
                  .toLowerCase();
                const deviceFileName = `${safeTitle}.${ext}`;

                try {
                  const existingHandle =
                    await watchHandle.getFileHandle(deviceFileName);
                  const newPath = `${watchHandle.name}/${deviceFileName}`;
                  if (offlineFile.filePath !== newPath) {
                    await updateOfflineFilePath(book.id, newPath);
                    await saveFileHandle(book.id, existingHandle, newPath);
                    console.log(
                      `[AUTO-SYNC] Corrected discrepancy in file path for ${book.title} (watch fallback): ${newPath}`,
                    );
                  }
                } catch (e) {
                  const fileHandle = await watchHandle.getFileHandle(
                    deviceFileName,
                    { create: true },
                  );
                  const writable = await fileHandle.createWritable();
                  const arrayBuffer = await offlineFile.blob.arrayBuffer();
                  await writable.write(arrayBuffer);
                  await writable.close();

                  const newPath = `${watchHandle.name}/${deviceFileName}`;
                  await updateOfflineFilePath(book.id, newPath);
                  await saveFileHandle(book.id, fileHandle, newPath);
                  console.log(
                    `[AUTO-SYNC] Successfully re-organized file for ${book.title} (watch fallback): ${newPath}`,
                  );
                }
              }
            }
          }
        } catch (error) {
          console.warn(
            "[AUTO-SYNC] Native folder organization verification skipped",
            error,
          );
        }
      };

      for (const book of books) {
        // VERIFY DISCREPANCY IF ALREADY EXISTS
        if (offlineBooksMap[book.id]) {
          const offlineFile = await getOfflineFile(book.id);
          if (offlineFile)
            await verifyAndCorrectBookLocation(book, offlineFile);
          continue;
        }

        // Must have fileUrl, must be downloaded on server, must not have local offline file, and must not be currently downloading
        if (
          book.fileUrl &&
          book.fileUrl.startsWith("/api/files/") &&
          book.isDownloaded &&
          !offlineBooksMap[book.id] &&
          !syncInProgressRef.current[book.id]
        ) {
          console.log(
            `[AUTO-SYNC] Initiating background sync for ${book.title}...`,
          );

          // Mark as compiling/syncing
          syncInProgressRef.current[book.id] = true;
          setSyncingBookIds((prev) => ({ ...prev, [book.id]: true }));

          try {
            // encode URI to prevent Failed to fetch on unescaped spaces
            const res = await fetch(encodeURI(book.fileUrl));
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);

            const blob = await res.blob();
            const originalFileName =
              book.fileUrl.split("/").pop() ||
              (book.type === "audiobook"
                ? `${book.title}.mp3`
                : `${book.title}.epub`);
            const fileName = decodeURIComponent(originalFileName);
            const defaultDevicePath = `Downloads/${fileName}`;

            // 1. Save to IndexedDB
            await saveOfflineFile(book.id, fileName, blob, defaultDevicePath);

            // 2. Also, if there are separate chapter files for an audiobook, sync them in the background as well!
            if (
              book.type === "audiobook" &&
              book.chapters &&
              book.chapters.length > 0
            ) {
              const audioChapters = book.chapters as AudiobookChapter[];
              for (const ch of audioChapters) {
                if (ch.fileUrl && ch.fileUrl.startsWith("/api/files/")) {
                  const alreadySaved = await hasOfflineChapterFile(
                    book.id,
                    ch.id,
                  );
                  if (!alreadySaved) {
                    console.log(
                      `[AUTO-SYNC] Initiating background sync for chapter [${ch.title}] of [${book.title}]...`,
                    );
                    try {
                      const chRes = await fetch(encodeURI(ch.fileUrl));
                      if (chRes.ok) {
                        const chBlob = await chRes.blob();
                        const chOriginalFileName =
                          ch.fileUrl.split("/").pop() ||
                          `${book.title}_${ch.title}.mp3`;
                        const chFileName =
                          decodeURIComponent(chOriginalFileName);
                        const chDefaultDevicePath = `Downloads/${chFileName}`;
                        await saveOfflineChapterFile(
                          book.id,
                          ch.id,
                          chFileName,
                          chBlob,
                          chDefaultDevicePath,
                        );
                        console.log(
                          `[AUTO-SYNC] Successfully cached chapter [${ch.title}] of [${book.title}].`,
                        );
                      }
                    } catch (chErr) {
                      console.error(
                        `[AUTO-SYNC] Failed background sync for chapter [${ch.title}] of [${book.title}]:`,
                        chErr,
                      );
                    }
                  }
                }
              }
            }

            // 3. Try to automatically sync/write to organized device folders or fall back to watch directory
            try {
              const isAudio = book.type === "audiobook";
              const destId = isAudio ? "audiobooks" : "ebooks";
              const destPrefix = isAudio ? "Audiobooks" : "Ebooks";
              let destHandle = await getDirectoryHandle(destId);
              let useOrganized = false;

              if (destHandle) {
                const hasPerm = await verifyDirectoryPermission(
                  destHandle,
                  true,
                  false,
                );
                if (hasPerm) {
                  useOrganized = true;
                }
              }

              if (useOrganized && destHandle) {
                const authorFolder = sanitizePathName(book.author);
                const bookFolder = sanitizePathName(book.title);

                const authorDirHandle = await destHandle.getDirectoryHandle(
                  authorFolder,
                  { create: true },
                );
                const bookDirHandle = await authorDirHandle.getDirectoryHandle(
                  bookFolder,
                  { create: true },
                );

                const extParts = book.fileUrl?.split(".");
                let ext =
                  extParts && extParts.length > 1 ? extParts.pop() : null;
                if (!ext) ext = isAudio ? "mp3" : "epub";
                const extClean = decodeURIComponent(ext)
                  .toLowerCase()
                  .split("?")[0];
                const finalFileName = `${bookFolder} - ${authorFolder}.${extClean}`;

                const fileHandle = await bookDirHandle.getFileHandle(
                  finalFileName,
                  { create: true },
                );
                const writable = await fileHandle.createWritable();
                const arrayBuffer = await blob.arrayBuffer();
                await writable.write(arrayBuffer);
                await writable.close();

                const finalDestPath = `${destPrefix}/${authorFolder}/${bookFolder}/${finalFileName}`;
                await updateOfflineFilePath(book.id, finalDestPath);
                await saveFileHandle(book.id, fileHandle, finalDestPath);
                console.log(
                  `[AUTO-SYNC] Successfully wrote reorganized offline file to ${destPrefix}: ${finalFileName}`,
                );
              } else {
                // Legacy Watch folder fallback
                let watchHandle = await getDirectoryHandle("watch");
                if (!watchHandle) {
                  watchHandle = await getDirectoryHandle("watch_internal");
                }
                if (watchHandle) {
                  const hasPerm = await verifyDirectoryPermission(
                    watchHandle,
                    true,
                    false,
                  );
                  if (hasPerm) {
                    const extParts = book?.fileUrl?.split(".");
                    let ext =
                      extParts && extParts.length > 1 ? extParts.pop() : null;
                    if (!ext) ext = book.type === "audiobook" ? "mp3" : "epub";
                    const safeTitle = book.title
                      .replace(/[^a-z0-9]/gi, "_")
                      .toLowerCase();
                    const deviceFileName = `${safeTitle}.${ext}`;

                    const fileHandle = await watchHandle.getFileHandle(
                      deviceFileName,
                      { create: true },
                    );
                    const writable = await fileHandle.createWritable();
                    const arrayBuffer = await blob.arrayBuffer();
                    await writable.write(arrayBuffer);
                    await writable.close();

                    const newPath = `${watchHandle.name}/${deviceFileName}`;
                    await updateOfflineFilePath(book.id, newPath);
                    await saveFileHandle(book.id, fileHandle, newPath);
                    console.log(
                      `[AUTO-SYNC] Quietly recorded offline file to device watch folder (legacy fallback): ${deviceFileName}`,
                    );
                  }
                }
              }
            } catch (storageErr) {
              console.warn(
                "[AUTO-SYNC] Native folder auto-organization was skipped: ",
                storageErr,
              );
            }

            console.log(
              `[AUTO-SYNC] Successfully cached ${book.title} in browser IndexedDB.`,
            );

            // Reload logs/history on server about this ingestion
            await fetch("/api/logs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                level: "success",
                source: "browser_sync",
                message: `Auto-Sync: Torrent download [${book.title}] was successfully staged offline inside your browser secure database.`,
              }),
            });

            // Refresh local map and settings so everything lights up!
            await refreshOfflineBooks();
            await loadSettingsAndLogs();
          } catch (syncErr) {
            console.error(
              `[AUTO-SYNC] Failed background sync for ${book.title}:`,
              syncErr,
            );
          } finally {
            syncInProgressRef.current[book.id] = false;
            setSyncingBookIds((prev) => ({ ...prev, [book.id]: false }));
          }
        }
      }
    };

    doAutoSync();
  }, [
    books,
    offlineBooksMap,
    refreshOfflineBooks,
    loadSettingsAndLogs,
    setSyncingBookIds,
  ]);

  return { syncInProgressRef };
}
