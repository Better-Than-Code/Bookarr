import { Book } from "../types";
import { WatchFolderFile } from "./LocalOrganizerService";
import { extractFileMetadata } from "./ClientMetadataParser";

export interface TorrentBookGroup {
  baseName: string;
  dirPath: string;
  title: string;
  author: string;
  ebookFiles: WatchFolderFile[];
  audioFiles: WatchFolderFile[];
  coverFiles: WatchFolderFile[];
  bestEbook?: WatchFolderFile;
  bestCoverUrl?: string; // from extract or coverFiles
}

export async function processTorrentFiles(
  files: WatchFolderFile[],
): Promise<TorrentBookGroup[]> {
  const groupsRecord: Record<string, TorrentBookGroup> = {};

  // Grouping strategy:
  // 1. By directory path (if the torrent had subdirs where each is a book)
  // 2. By base filename (without extension) if in the same dir

  for (const file of files) {
    const pathParts = file.path.split("/");
    const dirPath =
      pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "root";

    // Attempt to drop file extension for base name
    const dotIndex = file.name.lastIndexOf(".");
    const baseName =
      dotIndex > 0 ? file.name.substring(0, dotIndex) : file.name;
    const cleanBaseName = baseName.replace(/[-_]/g, " ").trim();

    // We group by "DIR || BASENAME" unless it's a cover named "cover.jpg"
    let groupKey = `${dirPath}/${baseName}`;

    // For audiobooks, a directory often represents one book, and tracks have various names.
    if (
      file.type === "audiobook" ||
      file.name.toLowerCase().startsWith("cover")
    ) {
      groupKey = dirPath;
    }

    if (!groupsRecord[groupKey]) {
      // Guess title and author
      let guessTitle = cleanBaseName;
      let guessAuthor = "Unknown Author";

      // If directory is structured like Author/Series/Book or Author - Title
      if (dirPath !== "root") {
        const dirParts = dirPath.split("/");
        if (file.type === "audiobook") {
          guessTitle = dirParts[dirParts.length - 1]; // Folder name is usually the book title
          if (dirParts.length > 1) {
            guessAuthor = dirParts[0];
          }
        }
      }

      if (cleanBaseName.includes(" - ")) {
        const parts = cleanBaseName.split(" - ");
        guessAuthor = parts[0].trim();
        guessTitle = parts[1].trim();
      }

      groupsRecord[groupKey] = {
        baseName: cleanBaseName,
        dirPath,
        title: guessTitle,
        author: guessAuthor,
        ebookFiles: [],
        audioFiles: [],
        coverFiles: [],
      };
    }

    const group = groupsRecord[groupKey];
    if (file.type === "ebook") group.ebookFiles.push(file);
    else if (file.type === "audiobook") group.audioFiles.push(file);
    else if (file.type === "cover") group.coverFiles.push(file);
  }

  const groups = Object.values(groupsRecord);

  // Post-processing each group
  for (const group of groups) {
    // Find best ebook format (epub > mobi > azw3 > pdf > txt)
    if (group.ebookFiles.length > 0) {
      const formatWeights: Record<string, number> = {
        epub: 5,
        mobi: 4,
        azw3: 3,
        pdf: 2,
        txt: 1,
      };
      group.ebookFiles.sort((a, b) => {
        const weightA = formatWeights[a.extension.toLowerCase()] || 0;
        const weightB = formatWeights[b.extension.toLowerCase()] || 0;
        return weightB - weightA;
      });
      group.bestEbook = group.ebookFiles[0];

      // Try extracting real metadata from the best ebook!
      try {
        const fileObj = await group.bestEbook.handle.getFile();
        const meta = await extractFileMetadata(fileObj);
        if (meta) {
          if (meta.title) group.title = meta.title;
          if (meta.author) group.author = meta.author;
          if (meta.coverUrl) group.bestCoverUrl = meta.coverUrl;
        }
      } catch (e) {
        console.warn("Metadata extraction failed for", group.bestEbook.name, e);
      }
    }

    // If no embedded cover, check stand-alone cover files
    if (!group.bestCoverUrl && group.coverFiles.length > 0) {
      try {
        const coverFileObj = await group.coverFiles[0].handle.getFile();
        const buffer = await coverFileObj.arrayBuffer();
        const ext = group.coverFiles[0].extension.toLowerCase();
        const mime = ext === "png" ? "image/png" : "image/jpeg";

        // converting buffer to base64
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        group.bestCoverUrl = `data:${mime};base64,${btoa(binary)}`;
      } catch (e) {}
    }

    // If audiobooks try extracting title/author from the first track ID3
    if (group.audioFiles.length > 0 && !group.bestEbook) {
      try {
        const firstTrack = await group.audioFiles[0].handle.getFile();
        const meta = await extractFileMetadata(firstTrack);
        if (meta) {
          if (meta.title && meta.title !== group.title)
            group.title = meta.title; // Note ID3 might be track name, so be careful. Actually let's trust folder name more if it's there.
          if (meta.author) group.author = meta.author;
          if (meta.coverUrl) group.bestCoverUrl = meta.coverUrl;
        }
      } catch (e) {}
    }

    // Default cleanups
    if (group.title && group.title.length > 60)
      group.title = group.title.substring(0, 60);
    if (!group.bestCoverUrl) {
      // fallback placeholder
      group.bestCoverUrl =
        group.audioFiles.length > 0
          ? "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=200&auto=format&fit=crop"
          : "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=200&auto=format&fit=crop";
    }

    // Sort audiofiles alphabetically
    group.audioFiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Filter out empty groups
  return groups.filter(
    (g) => g.ebookFiles.length > 0 || g.audioFiles.length > 0,
  );
}
