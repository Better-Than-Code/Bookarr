/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EbookChapter {
  id: string;
  title: string;
  content: string;
}

export interface AudiobookChapter {
  id: string;
  title: string;
  start: number; // in seconds
  end: number; // in seconds
  fileUrl?: string; // Optional: If the book is split into multiple files
}

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  type: 'audiobook' | 'ebook';
  description: string;
  duration?: number; // for audiobooks in seconds
  pages?: number; // for ebooks
  genres: string[];
  progress: number; // 0 - 100
  currentTime?: number; // for audiobooks in seconds
  currentPage?: number; // for ebooks
  chapters?: EbookChapter[] | AudiobookChapter[];
  isDownloaded: boolean;
  size?: string;
  fileUrl?: string; // local preview path or stream
  filePath?: string; // actual filesystem path
  addedAt: string;
}

export interface TorrentTask {
  id: string;
  name: string;
  size: string;
  progress: number; // 0 - 100
  downloadSpeed: string; // e.g. "2.4 MB/s"
  uploadSpeed: string;
  eta: string;
  status: 'downloading' | 'seeding' | 'completed' | 'paused';
  magnetLink: string;
  infoHash?: string;
  numPeers?: number;
  indexer: string;
  files: {
    name: string;
    size: string;
    progress: number;
    type: 'audio text image' | 'audio' | 'ebook' | 'other';
  }[];
  enrichedBook?: Book;
}

export interface TorrentSearchResult {
  id: string;
  title: string;
  size: string;
  seeds: number;
  peers: number;
  magnetLink: string;
  downloadUrl?: string; // Direct download link (e.g. LibGen)
  indexer: string;
  type: 'ebook' | 'audiobook';
  publishDate: string;
  error?: string;
}

export interface IndexerSettings {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  enabled: boolean;
  type: 'torznab' | 'native';
  status?: 'online' | 'offline' | 'unknown';
  lastChecked?: string;
  error?: string;
}

export interface BookrrConfig {
  webtorEnabled: boolean;
  localDownloadPath: string;
}

export interface MessageLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: 'webtor' | 'server';
  message: string;
}
