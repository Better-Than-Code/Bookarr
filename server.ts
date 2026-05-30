/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Book, TorrentTask, TorrentSearchResult, IndexerSettings, BookrrConfig, MessageLog } from './src/types';
import { searchAllIndexers } from './src/services/TrackerService';
import { enrichMetadata } from './src/services/MetadataService';
import { getMetadataFromFile } from './src/services/MetadataParser.server';
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
import epubParser from 'epub-parser';
import { GoogleGenAI, Type } from "@google/genai";
import multer from 'multer';

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

let _ai: any = null;
function getAI() {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || 'dummy_key',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return _ai;
}

const agent = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1.2',
  ciphers: 'DEFAULT'
});

import WebTorrent from 'webtorrent';
import EPub from 'epub';

const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.publictracker.xyz:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.bitsearch.to:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.thepiratebay.org:80/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.files.fm:7073/announce',
  'udp://zer0day.ch:1337/announce',
  'udp://wepzone.net:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker.qu.ax:6969/announce',
  'udp://tracker.iperson.xyz:6969/announce',
  'udp://tracker.auctor.tv:6969/announce',
  'udp://tracker.004430.xyz:1337/announce',
  'udp://torrents.tmtime.dev:6969/announce',
  'udp://leet-tracker.moe:1337/announce',
  'udp://bittorrent-tracker.e-n-c-r-y-p-t.net:1337/announce',
  'https://tracker.zhuqiy.com:443/announce',
  'https://tracker.yemekyedim.com:443/announce',
  'https://tracker.pmman.tech:443/announce',
  'https://tracker.nekomi.cn:443/announce',
  'https://torrents.tmtime.dev:443/announce'
];

const client = new WebTorrent({
  maxConns: 120,           // Safe connection limits for Cloud Run container socket constraints
  downloadLimit: -1,       // Ensure unlimited download 
  uploadLimit: 250000,     // Safe upload cap to save bandwidth and system resources
  tracker: {
    announce: PUBLIC_TRACKERS
  },
  dht: { 
    concurrency: 16,       // Moderate DHT concurrency to prevent out-of-memory or file descriptor exhaustion
    bootstrap: [
      'router.bittorrent.com:6881',
      'router.utorrent.com:6881',
      'dht.transmissionbt.com:6881',
      'dht.aelitis.com:6881'
    ]
  },
  lsd: true,
  webSeeds: true
});

const OPENLIBRARY_TIMEOUT = 300000;

const fetchWithRetry = async (url: string, options: any, retries = 2) => {
  try {
    return await axios.get(url, options);
  } catch (err: any) {
    if (retries > 0 && (err.code === 'ECONNABORTED' || err.message.includes('timeout') || err.response?.status >= 500)) {
      console.log(`Retrying fetch for ${url} (${retries} left)...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
};

const injectTrackers = (magnet: string): string => {
    if (!magnet || !magnet.startsWith('magnet:')) return magnet;
    let enhancedMagnet = magnet;
    PUBLIC_TRACKERS.forEach(tr => {
        if (!enhancedMagnet.includes(encodeURIComponent(tr))) {
            enhancedMagnet += `&tr=${encodeURIComponent(tr)}`;
        }
    });
    return enhancedMagnet;
};

const extractInfoHash = (magnet: string): string | null => {
    if (!magnet || !magnet.startsWith('magnet:')) return null;
    const match = magnet.match(/xt=urn:btih:([a-fA-F0-9]+)/);
    return match ? match[1].toLowerCase() : null;
};

const bootstrapTorrentReady = (torrent: any) => {
    let bootstrapCount = 0;
    const bootstrapTimer = setInterval(() => {
         bootstrapCount++;
         if (bootstrapCount > 10 || torrent.numPeers > 0 || torrent.ready || torrent.destroyed) {
             clearInterval(bootstrapTimer);
             return;
         }
         console.log(`[WEBTOR-BOOTSTRAP] Forcing fast announce for ${torrent.name || torrent.infoHash} (attempt ${bootstrapCount})...`);
         try {
             PUBLIC_TRACKERS.forEach(tr => {
                 if (typeof torrent.announce === 'function') {
                     torrent.announce(tr);
                 }
             });
             // Try to force direct announce tracker run
             if (torrent.discovery && torrent.discovery.tracker && typeof torrent.discovery.tracker.announce === 'function') {
                 torrent.discovery.tracker.announce();
             }
         } catch (e: any) {
             console.log('[WEBTOR-BOOTSTRAP] Error in force announce:', e.message || e);
         }
    }, 2000); // Poll/announce every 2 seconds for the first 20 seconds to achieve super-fast initial bootstrap
};

client.on('error', (err: any) => {
  if (err.message && err.message.includes('Cannot add duplicate torrent')) {
    console.log('[WEBTOR] Ignored duplicate torrent add attempt');
  } else {
    console.error('[WEBTOR] Global client error:', err);
  }
});

client.on('warning', (err: any) => {
  const msg = err.message || err;
  if (typeof msg === 'string' && (
      msg.includes('fetch failed') || 
      msg.includes('Error connecting to') || 
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('socket hang up') ||
      msg.includes('handshake timeout')
  )) return;
  console.warn('[WEBTOR] Client warning:', msg);
});

const addTorrentToClient = (task: TorrentTask): any => {
    const downloadBase = STORAGE_DIRS.download;
    const magnet = injectTrackers(task.magnetLink);
    const magnetHash = extractInfoHash(magnet) || task.infoHash;
    
    // Check if torrent already exists in the client
    const existing = client.torrents.find((t: any) => 
        (magnetHash && t.infoHash && t.infoHash.toLowerCase() === magnetHash.toLowerCase()) ||
        t.magnetURI === magnet
    );

    if (existing) {
        console.log(`[WEBTOR] Torrent already exists in client: ${task.name}`);
        if (existing.ready) {
            const db = loadDB();
            const t = db.torrentTasks.find((tt: any) => tt.id === task.id);
            if (t && t.status === 'connecting') {
                t.status = 'downloading';
                t.infoHash = existing.infoHash;
                saveDB(db);
            }
        }
        return existing;
    }

    try {
        const torrent = client.add(magnet, { 
          path: path.join(downloadBase, task.name),
          announce: PUBLIC_TRACKERS
        });

        console.log(`[WEBTOR] Initiated torrent add: ${task.name} (${torrent.infoHash || 'Pending Hash'})`);
        
        // Fast-bootstrap trackers and DHT to connect to seeds/peers immediately
        if (torrent.discovery && torrent.discovery.tracker) {
            torrent.discovery.tracker.announce();
        }
        bootstrapTorrentReady(torrent);

        // Log periodically if it stays stuck
        const stuckLogger = setInterval(() => {
            if (!torrent.ready) {
                console.log(`[WEBTOR] Still waiting for metadata: ${task.name} - Peers: ${torrent.numPeers}`);
                // Try to force re-announce tracking
                if (torrent.numPeers === 0) {
                    try {
                        // @ts-ignore
                        if (torrent.discovery && torrent.discovery.tracker) {
                           // @ts-ignore
                           torrent.discovery.tracker.announce();
                        }
                    } catch(e) {}
                }
            } else if (torrent.progress < 1 && torrent.downloadSpeed === 0) {
                console.log(`[WEBTOR] Active but 0 speed: ${task.name} - Progress: ${(torrent.progress * 100).toFixed(1)}% - Peers: ${torrent.numPeers}`);
            }
        }, 60000);

        const cleanupLogger = () => clearInterval(stuckLogger);

        torrent.on('ready', () => {
            console.log(`[WEBTOR] Torrent READY: ${task.name} (${torrent.infoHash})`);
            const db = loadDB();
            const t = db.torrentTasks.find((tt: any) => tt.id === task.id);
            if (t) {
                t.infoHash = torrent.infoHash;
                if (t.status === 'connecting') t.status = 'downloading';
                saveDB(db);
            }
        });

        torrent.on('done', () => {
            cleanupLogger();
            console.log(`[WEBTOR] Internal download complete for: ${task.name}`);
        });

        torrent.on('close', cleanupLogger);
        torrent.on('error', (e: any) => {
            cleanupLogger();
            if (e.message && e.message.includes('duplicate')) {
                console.log(`[WEBTOR] Ignored duplicate error for ${task.name}`);
                return;
            }
            console.error(`Error with torrent ${task.name}: ${e}`);
            const db = loadDB();
            const t = db.torrentTasks.find((tt: any) => tt.id === task.id);
            if (t) {
                t.status = 'failed';
                saveDB(db);
            }
        });

        torrent.on('metadata', () => {
            console.log(`[WEBTOR] Metadata received for: ${task.name} (${torrent.infoHash})`);
        });

        torrent.on('warning', (err: any) => {
            const msg = err.message || err;
            if (typeof msg === 'string' && (
                msg.includes('fetch failed') || 
                msg.includes('Error connecting to') ||
                msg.includes('ECONNREFUSED') ||
                msg.includes('ETIMEDOUT') ||
                msg.includes('socket hang up')
            )) return;
            console.warn(`[WEBTOR] Warning for ${task.name}:`, msg);
        });

        return torrent;
    } catch (err: any) {
        if (err.message && err.message.includes('duplicate')) {
            return client.torrents.find((t: any) => 
               (magnetHash && t.infoHash && t.infoHash.toLowerCase() === magnetHash.toLowerCase())
            );
        }
        throw err;
    }
}

const MAX_RETRY_ATTEMPTS = 3;

const restartTorrent = (task: TorrentTask): any => {
    const db = loadDB();
    const t = db.torrentTasks.find((item: any) => item.id === task.id);
    if (!t) return null;

    const currentRetries = t.retryCount || 0;
    if (currentRetries >= MAX_RETRY_ATTEMPTS) {
        console.log(`Max retries reached for ${task.name}. Marking as failed.`);
        t.status = 'failed';
        task.status = 'failed'; // Update passed reference immediately
        saveDB(db);
        return null;
    }

    t.retryCount = currentRetries + 1;
    task.retryCount = t.retryCount; // Update passed reference immediately
    saveDB(db);

    const existing = client.torrents.find((t: any) => t.magnetURI === task.magnetLink || t.infoHash === task.infoHash);
    if(existing) {
        console.log(`Restarting stalled torrent: ${task.name} (Attempt ${t.retryCount}/${MAX_RETRY_ATTEMPTS})`);
        try {
            client.remove(existing);
        } catch (e: any) {
            console.error(`Error removing existing stalled torrent client:`, e.message || e);
        }
    }
    return addTorrentToClient(task);
}

const app = express();
app.use((req, res, next) => {
  // Commented out COOP/COEP as they prevent the iframe from loading inside the AI Studio preview environment
  // res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  try { fs.appendFileSync('proxy.log', '[EXPRESS URL LOG] ' + req.method + ' ' + req.url + '\n'); } catch(e) {}
  next();
});
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

console.log('EPUB Parser Module:', epubParser ? 'Loaded' : 'FAILED');
if (epubParser) {
  console.log('EPUB Parser Keys:', Object.keys(epubParser));
}

// Helper to check tracker health
async function checkTrackerHealth(url: string): Promise<{ status: 'online' | 'offline'; error?: string }> {
  try {
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 10000,
      validateStatus: (status) => (status >= 200 && status < 400) || status === 403
    });
    if (response.status === 403) {
      return { status: 'online', error: 'Cloudflare Protected (But reachable)' };
    }
    return { status: 'online' };
  } catch (error: any) {
    return { status: 'offline', error: error.message };
  }
}

// Background task to periodically check indexer health
async function runHealthChecks() {
  const db = loadDB();
  console.log('Running periodic health checks for indexers...');
  
  const enabledIndexers = db.indexers.filter((i: any) => i.enabled);
  
  await Promise.all(enabledIndexers.map(async (indexer: any) => {
    try {
      const result = await checkTrackerHealth(indexer.url);
      indexer.status = result.status;
      indexer.lastChecked = new Date().toISOString();
      indexer.error = result.error;
    } catch (e: any) {
      indexer.status = 'offline';
      indexer.lastChecked = new Date().toISOString();
      indexer.error = e.message || 'Error checking health';
    }
  }));
  
  saveDB(db);
}

// Function to resume previously active torrents
async function resumeActiveTorrents() {
  const db = loadDB();
  const downloading = db.torrentTasks.filter((t: TorrentTask) => 
    (t.status === 'downloading' || t.status === 'connecting' || t.status === 'stalled') &&
    (t.retryCount || 0) < MAX_RETRY_ATTEMPTS
  );
  
  console.log(`Resuming ${downloading.length} active torrent downloads...`);
  
  for (const task of downloading) {
    if (task.magnetLink && task.magnetLink.startsWith('magnet:')) {
      const magnet = injectTrackers(task.magnetLink);
      const existing = client.torrents.find((t: any) => t.magnetURI === magnet || t.infoHash === task.infoHash);
      if (existing) {
        console.log(`Torrent already active, skipping re-add: ${task.name}`);
        continue;
      }
      try {
        addTorrentToClient(task);
      } catch (err) {
        console.error(`Failed to resume torrent ${task.name}:`, err);
      }
    }
  }
}

// Run health checks every 30 minutes
setInterval(runHealthChecks, 30 * 60 * 1000);

// Background task to fix books that were stuck with placeholders
async function fixStuckBooks() {
  const db = loadDB();
  let changed = false;
  
  if (!process.env.GEMINI_API_KEY) return;

  // Process stuck books one by one with a delay to avoid overloading
  for (const book of db.books) {
    const firstChapter = book.chapters?.[0];
    if (book.type === 'ebook' && firstChapter && firstChapter.content && firstChapter.content.includes('is being processed')) {
      console.log(`Fixing stuck book: ${book.title}`);
      try {
        // Reduced timeout for startup fix to keep things moving
        const enriched = await enrichTorrentTaskWithMetadata(book.title, false, book.size, 'Auto-Repair');
        book.description = enriched.description;
        book.chapters = enriched.chapters;
        book.genres = enriched.genres;
        book.author = enriched.author;
        book.coverUrl = enriched.coverUrl;
        changed = true;
        
        // Add a small pause between repairs
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Failed to repair book ${book.title}:`, err);
      }
    }
  }

  if (changed) {
    saveDB(db);
    console.log('Cleanup migration: Stuck book placeholders repaired successfully.');
  }
}

// Run once on startup after a short delay
setTimeout(async () => {
  runHealthChecks().catch(err => console.error('Error in startup runHealthChecks:', err));
  fixStuckBooks().catch(err => console.error('Error in startup fixStuckBooks:', err));
  resumeActiveTorrents().catch(err => console.error('Error in startup resumeActiveTorrents:', err));
}, 5000);

// Local storage paths
const DATA_DIR = path.join(process.cwd(), 'data');
const BOOKARR_DIR = path.join(DATA_DIR, 'bookarr');
const STORAGE_DIRS = {
    download: path.join(BOOKARR_DIR, 'download')
};
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data folder and bookarr structure exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BOOKARR_DIR)) {
  fs.mkdirSync(BOOKARR_DIR, { recursive: true });
}
Object.values(STORAGE_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

function sanitizePathName(name: string): string {
  if (!name) return 'Unknown';
  return name
    .replace(/[\\/:*?"<>|]/g, '-') // Replace illegal characters with hyphens
    .trim()
    .replace(/\s+/g, ' '); // Clean redundant spacing
}

/**
 * Moves a downloaded file or directory into the organized bookarr hierarchy
 */
function finalizeFileLocation(sourcePath: string, type: 'ebook' | 'audiobook', author?: string, title?: string): string {
    console.log(`[STORAGE] Keeping file in server staging area: ${sourcePath}. File will be organized client-side on device storage.`);
    return sourcePath;
}

// Initial Book Data to seed the local database
const INITIAL_BOOKS: Book[] = [];

let memoryDB: any = null;

// Save Db helper
const saveDB = (data: any) => {
  try {
    memoryDB = data;
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving DB', e);
  }
};

// Load Db helper
const loadDB = () => {
  if (memoryDB) return memoryDB;

  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const db = JSON.parse(content);
      
      if (!db.indexers) db.indexers = [];
      if (!db.config) db.config = { webtorEnabled: true, localDownloadPath: '/data/downloads/bookrr' };
      if (!db.config.deletedIndexerNames) db.config.deletedIndexerNames = [];
      if (!db.logs) db.logs = [];
      if (!db.torrentTasks) db.torrentTasks = [];
      if (!db.books) db.books = [];

      // Migration: Add new default indexers if they are missing
      const defaultIndexers = [
        { id: '1', name: '1337x', url: 'https://1337x.to', apiKey: '', enabled: true, type: 'native' },
        { id: '2', name: 'LimeTorrents', url: 'https://limetorrents.info', apiKey: '', enabled: true, type: 'native' },
        { id: '3', name: 'TorrentDownloads', url: 'https://www.torrentdownloads.pro', apiKey: '', enabled: true, type: 'native' },
        { id: '4', name: 'GloTorrents', url: 'https://glodls.to', apiKey: '', enabled: true, type: 'native' },
        { id: '5', name: 'Kickass', url: 'https://kickasst.net', apiKey: '', enabled: true, type: 'native' },
        { id: '6', name: 'The Pirate Bay', url: 'https://thepiratebay.org', apiKey: '', enabled: true, type: 'native' },
        { id: '7', name: 'SolidTorrents', url: 'https://solidtorrents.to', apiKey: '', enabled: true, type: 'native' },
        { id: '8', name: 'LibGen', url: 'https://libgen.is', apiKey: '', enabled: true, type: 'native' },
        { id: '9', name: 'Torlock', url: 'https://www.torlock.com', apiKey: '', enabled: true, type: 'native' }
      ];

      let changed = false;
      defaultIndexers.forEach(def => {
        const existing = db.indexers.find((i: any) => i.name === def.name);
        const wasDeleted = db.config.deletedIndexerNames?.includes(def.name);
        if (!existing && !wasDeleted) {
          db.indexers.push(def);
          changed = true;
        } else if (existing && existing.url !== def.url && (existing.url.includes('.lu') || existing.url.includes('.cm') || existing.url.includes('.so') || existing.url.includes('kickasstorrents.to'))) {
          // Force update for broken default mirrors
          existing.url = def.url;
          changed = true;
        }
      });

      if (changed) {
        saveDB(db);
      }

      memoryDB = db;
      return db;
    }
  } catch (e) {
    console.error('Error reading DB, resetting', e);
  }

  const defaultDB = {
    books: INITIAL_BOOKS,
    torrentTasks: [] as TorrentTask[],
    logs: [
      {
        id: 'log-1',
        timestamp: new Date().toISOString(),
        level: 'success',
        source: 'server',
        message: 'Bookrr local storage database started successfully.'
      }
    ] as MessageLog[],
    config: {
      webtorEnabled: true,
      localDownloadPath: '/data/downloads/bookrr',
      deletedIndexerNames: []
    } as BookrrConfig,
    indexers: [
      { id: '1', name: '1337x', url: 'https://1337x.to', apiKey: '', enabled: true, type: 'native' },
      { id: '2', name: 'LimeTorrents', url: 'https://limetorrents.info', apiKey: '', enabled: true, type: 'native' },
      { id: '3', name: 'TorrentDownloads', url: 'https://www.torrentdownloads.pro', apiKey: '', enabled: true, type: 'native' },
      { id: '4', name: 'GloTorrents', url: 'https://glodls.to', apiKey: '', enabled: true, type: 'native' },
      { id: '5', name: 'Kickass', url: 'https://kickasst.net', apiKey: '', enabled: true, type: 'native' },
      { id: '6', name: 'The Pirate Bay', url: 'https://thepiratebay.org', apiKey: '', enabled: true, type: 'native' },
      { id: '7', name: 'SolidTorrents', url: 'https://solidtorrents.to', apiKey: '', enabled: true, type: 'native' },
      { id: '8', name: 'LibGen', url: 'https://libgen.is', apiKey: '', enabled: true, type: 'native' },
      { id: '9', name: 'Torlock', url: 'https://www.torlock.com', apiKey: '', enabled: true, type: 'native' }
    ] as IndexerSettings[]
  };

  memoryDB = defaultDB;
  saveDB(defaultDB);
  return defaultDB;
};

async function resolveLibGenDownload(mirrorUrl: string): Promise<string> {
  try {
    const response = await axios.get(mirrorUrl, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      timeout: 120000
    });
    const $ = cheerio.load(response.data);
    // On library.lol, the download link is usually the first link inside h2#download or similar, or just text "GET"
    const getLink = $('a:contains("GET")').attr('href') || $('h2 a').attr('href');
    if (getLink) {
        return getLink.startsWith('http') ? getLink : new URL(getLink, mirrorUrl).toString();
    }
  } catch (err) {
    console.error('Error resolving LibGen DDL:', err);
  }
  return '';
}

async function downloadDirectFile(url: string, destination: string, taskId?: string): Promise<boolean> {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      httpsAgent: agent,
      timeout: 120000,
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      }
    });

    const totalLength = response.headers['content-length'] ? parseInt(String(response.headers['content-length']), 10) : 0;
    let downloadedLength = 0;
    const startTime = Date.now();

    response.data.on('data', (chunk: Buffer) => {
        downloadedLength += chunk.length;
        if (taskId && totalLength > 0) {
           const db = loadDB();
           const task = db.torrentTasks.find((t: any) => t.id === taskId);
           if (task && task.status === 'downloading') {
               task.progress = Math.round((downloadedLength / totalLength) * 100);
               const elapsedS = Math.max(0.1, (Date.now() - startTime) / 1000);
               const speedBps = downloadedLength / elapsedS;
               task.downloadSpeed = (speedBps / (1024 * 1024)).toFixed(1) + ' MB/s';
               const remainingBytes = totalLength - downloadedLength;
               const etaS = Math.round(remainingBytes / speedBps);
               task.eta = isFinite(etaS) && etaS > 0 ? `${etaS}s` : 'Done';
               saveDB(db);
           }
        }
    });

    const writer = fs.createWriteStream(destination);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(true));
      writer.on('error', (err) => {
        console.error('Download write error:', err);
        reject(false);
      });
    });
  } catch (err) {
    console.error('Download fetch error:', err);
    return false;
  }
}

async function extractEpubContent(filePath: string): Promise<any[]> {
  console.log(`[EPUB-DEBUG] Attempting modern extraction from: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`[EPUB-ERROR] File not found at ${filePath}`);
    return [];
  }

  const stats = fs.statSync(filePath);
  if (stats.size < 100) {
    console.error(`[EPUB-ERROR] File is suspiciously small (${stats.size} bytes)`);
    return [];
  }

  return new Promise((resolve, reject) => {
    try {
      const EPubClass = (EPub as any).default || (EPub as any).EPub || EPub;
      const epub = new EPubClass(filePath) as any;
      
      epub.on('end', async () => {
        console.log(`[EPUB-DEBUG] EPUB parsed. Metadata:`, epub.metadata?.title);
        const spine = epub.flow || epub.spine?.contents || [];
        console.log(`[EPUB-DEBUG] Spine length:`, spine.length);

        const chapters: any[] = [];
        const sectionsToExtract = spine.slice(0, 150);
        
        for (let i = 0; i < sectionsToExtract.length; i++) {
            const section = sectionsToExtract[i];
            if (!section.id) continue;
            
            try {
                // getChapter uses a callback
                const rawContent: string = await new Promise((res, rej) => {
                  epub.getChapter(section.id, (error: any, text: string) => {
                    if (error) rej(error);
                    else res(text);
                  });
                });
                
                if (rawContent && rawContent.trim()) {
                    const $ = cheerio.load(rawContent);
                    
                    $('script, style, link, meta, iframe, object, embed').remove();
                    $('*').removeAttr('style').removeAttr('onmouseover').removeAttr('onclick');
                    
                    const bodyContent = $('body').html() || $.html();
                    if (!bodyContent || bodyContent.trim().length < 5) continue;
                    
                    const tocItem = epub.toc?.find((t: any) => t.id === section.id || t.href?.includes(section.id));
                    let title: any = tocItem?.title || section.title || '';
                    
                    if (!title) {
                        title = $('h1, h2, h3').first().text().trim();
                    }
                    if (!title) {
                        title = `Section ${i + 1}`;
                    }
                    
                    const titleStr = String(title);
                    chapters.push({
                        id: `ch-${Date.now()}-${i}`,
                        title: titleStr.length > 100 ? titleStr.substring(0, 100) + '...' : titleStr,
                        content: bodyContent
                    });
                }
            } catch (err: any) {
                console.error(`[EPUB-ERROR] Failed to extract section ${i} (${section.id}):`, err.message || err);
            }
        }
        
        console.log(`[EPUB-DEBUG] Extraction complete. Found ${chapters.length} chapters.`);
        resolve(chapters);
      });

      epub.on('error', (err: any) => {
         console.error('[EPUB-ERROR] Parser emitted error event:', err);
         resolve([]);
      });

      epub.parse();
    } catch (err) {
      console.error('[EPUB-ERROR] Fatal extraction exception:', err);
      resolve([]);
    }
  });
}

/**
 * Performs actual OpenLibrary API metadata lookup
 */
async function enrichTorrentTaskWithMetadata(torrentTitle: string, isAudiobook: boolean, size: string, indexer: string): Promise<Book> {
  const cleanQuery = torrentTitle
    .replace(/\[Audiobook\]|ePub|MP3|M4B|Unabridged|Read by.*/gi, '')
    .replace(/\[.*\]/g, '')
    .trim();
  
  let finalTitle = cleanQuery;
  let finalAuthor = isAudiobook ? 'Various Narrators' : 'Unknown Author';
  let finalDescription = `Discovered and downloaded via Bookrr integration from Tracker ${indexer}.`;
  let finalCover = isAudiobook 
    ? 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=400' 
    : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400';
  let finalGenres = isAudiobook ? ['Narrative', 'Spoken Word'] : ['Literature', 'Document'];
  let pages = isAudiobook ? undefined : undefined;
  let duration = isAudiobook ? 18000 : undefined; // ~5 hours default

  // Try fetching from Open Library Search API
  try {
    const cleanSearchQuery = cleanQuery
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanSearchQuery.length > 2) {
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanSearchQuery)}&limit=1`;
      const res = await fetchWithRetry(olUrl, { timeout: OPENLIBRARY_TIMEOUT });
      if (res.status === 200) {
        const olData = res.data;
        if (olData && olData.docs && olData.docs.length > 0) {
          const doc = olData.docs[0];
          if (doc.title) finalTitle = doc.title;
          if (doc.author_name && doc.author_name.length > 0) {
            finalAuthor = doc.author_name[0];
          }
          if (doc.number_of_pages_median) {
            pages = doc.number_of_pages_median;
            if (isAudiobook) {
              duration = Math.floor(doc.number_of_pages_median * 90);
            }
          }
          if (doc.cover_i) {
            finalCover = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          }
          if (doc.subject && doc.subject.length > 0) {
            finalGenres = doc.subject.slice(0, 3);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching OpenLibrary metadata:', error);
  }

  const resultBook: Book = {
    id: `book-${Date.now()}`,
    title: finalTitle,
    author: finalAuthor,
    coverUrl: finalCover,
    type: isAudiobook ? 'audiobook' : 'ebook',
    description: finalDescription,
    genres: finalGenres,
    progress: 0,
    currentTime: 0,
    isDownloaded: true,
    size: size || '3.5 MB',
    addedAt: new Date().toISOString(),
    chapters: []
  };

  if (isAudiobook) {
    resultBook.duration = duration;
  } else {
    resultBook.pages = pages;
    resultBook.currentPage = 1;
  }

  return resultBook;
}

// Real ticking for downloading torrent tasks using WebTorrent metrics
setInterval(async () => {
  const db = loadDB();
  let updated = false;

  const updatedTasks = [];
  for (let task of db.torrentTasks) {
    if (!task.addedAt) {
      task.addedAt = new Date().toISOString();
      updated = true;
    }
    if (task.status === 'downloading' || task.status === 'connecting' || task.status === 'stalled') {
      if ((task.retryCount || 0) >= MAX_RETRY_ATTEMPTS) {
        task.status = 'failed';
        task.downloadSpeed = '0 KB/s';
        task.uploadSpeed = '0 KB/s';
        task.eta = 'Failed';
        updated = true;
        updatedTasks.push(task);
        continue;
      }
      updated = true;
      let nextProgress = task.progress;
      let downloadSpeed = task.downloadSpeed;
      let uploadSpeed = task.uploadSpeed;
      let eta = task.eta;
      let status = task.status;
      let files = task.files;
      const magnet = injectTrackers(task.magnetLink);

      // Try to find matching active torrent in WebTorrent client
      const activeTorrent = client.torrents.find((t: any) => 
        (t.magnetURI && t.magnetURI === magnet) || 
        (t.infoHash && t.infoHash === task.infoHash) ||
        (task.magnetLink && task.magnetLink.includes(t.infoHash))
      );

      if (activeTorrent) {
        if (activeTorrent.ready) {
           if (status === 'connecting') status = 'downloading';
        }

        // Use real stats from WebTorrent
        nextProgress = Math.round(activeTorrent.progress * 100);
        if (activeTorrent.downloadSpeed > 1024 * 1024) {
          downloadSpeed = (activeTorrent.downloadSpeed / (1024 * 1024)).toFixed(1) + ' MB/s';
        } else {
          downloadSpeed = (activeTorrent.downloadSpeed / 1024).toFixed(1) + ' KB/s';
        }
        uploadSpeed = (activeTorrent.uploadSpeed / 1024).toFixed(0) + ' KB/s';
        const currentPeers = activeTorrent.numPeers;
        task.numPeers = currentPeers;
        
        const tr = activeTorrent.timeRemaining;
        if (activeTorrent.downloadSpeed > 0 && tr && isFinite(tr)) {
          const seconds = Math.floor((tr / 1000) % 60);
          const minutes = Math.floor((tr / (1000 * 60)) % 60);
          const hours = Math.floor((tr / (1000 * 60 * 60)));
          eta = hours > 0 ? `${hours}h ${minutes}m` : (minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
        } else {
          if (activeTorrent.progress >= 1) {
            eta = 'Done';
          } else if (currentPeers > 0) {
            eta = 'Waiting for pieces...';
          } else {
            eta = 'Finding peers...';
          }
        }

        // Update file-level progress too
        files = task.files.map(f => {
          const matchingFile = activeTorrent.files.find((af: any) => af.name === f.name);
          return {
            ...f,
            progress: matchingFile ? Math.round(matchingFile.progress * 100) : f.progress
          };
        });

        if (activeTorrent.progress === 1) {
          status = 'completed';
          downloadSpeed = '0 KB/s';
          eta = 'Done';
        } else {
           // Improved stall handling: also handle 'connecting' state hanging with metadata missing
           const now = Date.now();
           
           // A torrent is truly stalled if:
           // 1. No speed and No peers for 1.5 minutes
           // 2. Or No speed but HAS peers for 3 minutes (maybe slow seeds or choked)
           // 3. Or stuck "connecting" for 3 minutes
           const isStalled = (activeTorrent.downloadSpeed <= 0 && activeTorrent.numPeers === 0 && now - (task.zeroSpeedSince || now) > 90000) || 
                            (activeTorrent.downloadSpeed <= 0 && activeTorrent.numPeers > 0 && now - (task.zeroSpeedSince || now) > 180000) ||
                            (status === 'connecting' && now - (task.addedAt ? new Date(task.addedAt).getTime() : now) > 180000);
           
           if (isStalled) {
              if (task.status !== 'stalled') {
                  status = 'stalled';
                  task.zeroSpeedSince = now;
                  
                  // Periodic re-announce while stalled (every 2.5 minutes)
                  const lastAnnounce = task.lastAnnounceAt || 0;
                  if (now - lastAnnounce > 150000) {
                      task.lastAnnounceAt = now;
                      try {
                        PUBLIC_TRACKERS.forEach(tr => {
                            activeTorrent.announce(tr);
                        });
                        console.log(`[WEBTOR] Periodic re-announce for stalled torrent: ${task.name}`);
                      } catch(e) {}
                  }
              }
              
              // Only restart if stalled for a significant amount of time (8 mins total or 3 mins in stalled status)
              if (now - (task.zeroSpeedSince || now) > 180000) {
                  const restarted = restartTorrent(task);
                  status = task.status; // Correctly sync local status state
                  if (restarted) {
                      task.zeroSpeedSince = now;
                      db.logs.push({
                          id: `log-${now}`,
                          timestamp: new Date().toISOString(),
                          level: 'warn',
                          source: 'webtor',
                          message: `Torrent [${task.name}] stalled. Attempting tracker re-announce and restart (${task.retryCount || 1}/${MAX_RETRY_ATTEMPTS}).`
                      });
                  }
              }
           } else if (activeTorrent.downloadSpeed <= 0) {
              if (!task.zeroSpeedSince) {
                  task.zeroSpeedSince = now;
              }
           } else {
               task.zeroSpeedSince = undefined;
               if (status === 'stalled') status = 'downloading';
           }
        }
      } else {
        // Torrent is in downloading status but not active in client -> add it securely
        try {
          console.log(`Adding missing torrent from task manager: ${task.name}`);
          addTorrentToClient(task);
        } catch (e: any) {
          console.error(`[WEBTOR] Safety catch: Failed to register missing torrent ${task.name}:`, e.message || e);
        }
      }

      if (!task.magnetLink?.startsWith('magnet:')) {
        // Fallback for direct downloads (already handled by their own async flows, 
        // but this loop handles the task object persistence)
        nextProgress = task.progress; 
      }

      // If just finished (and wasn't finished before), add to book list!
      if (status === 'completed' && task.status !== 'completed') {
        const isAudio = task.name.toLowerCase().includes('audiobook') || task.name.toLowerCase().includes('mp3') || task.name.toLowerCase().includes('m4b');
        
        let foundPath = '';
        let foundUrl = '';
        let realChapters: any[] = [];
        let totalDuration = 0;

        try {
          const downloadBase = STORAGE_DIRS.download;
          const taskDir = path.join(downloadBase, task.name);
          
          if (fs.existsSync(taskDir)) {
            if (fs.lstatSync(taskDir).isFile()) {
              const actualFile = taskDir;
              foundPath = actualFile;
              const fileName = path.basename(actualFile);
              foundUrl = `/api/files/${fileName}`;
              
              if (!isAudio && actualFile.toLowerCase().endsWith('.epub')) {
                console.log(`[STREAMING] Automated extraction for ${task.name}...`);
                realChapters = await extractEpubContent(actualFile);
              }
            } else {
              // It's a directory
              const items = fs.readdirSync(taskDir, { recursive: true }) as string[];
              
              if (isAudio) {
                const audioFiles = items
                  .filter((f: string) => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.m4b'))
                  .sort();
                
                if (audioFiles.length > 0) {
                  foundPath = path.join(taskDir, audioFiles[0]); // Primary file
                  foundUrl = `/api/files/${path.basename(audioFiles[0])}`;
                  
                  // Create chapters for each file
                  // Note: We don't have accurate durations without parsing each file, 
                  // but we can estimate or just provide the fileUrls
                  let startTime = 0;
                  for (let i = 0; i < audioFiles.length; i++) {
                    const audioFile = audioFiles[i];
                    const audioFileName = path.basename(audioFile);
                    const chapterDuration = 1800; // 30 min estimate if unknown
                    realChapters.push({
                      id: `ch-${Date.now()}-${i}`,
                      title: audioFileName.replace(/\.mp3|\.m4b/gi, ''),
                      start: startTime,
                      end: startTime + chapterDuration,
                      fileUrl: `/api/files/${encodeURIComponent(audioFileName)}`
                    });
                    startTime += chapterDuration;
                  }
                  totalDuration = startTime;
                }
              } else {
                const ebookExts = ['.epub', '.pdf', '.mobi', '.azw3', '.txt', '.djvu'];
                // Prioritize best ebook formats, falling back to others
                const matched = ebookExts.reduce((found: string | undefined, ext: string) => {
                  return found || items.find((f: string) => f.toLowerCase().endsWith(ext));
                }, undefined);
                
                if (matched) {
                  const actualFile = path.join(taskDir, matched);
                  foundPath = actualFile;
                  foundUrl = `/api/files/${path.basename(actualFile)}`;
                  if (matched.toLowerCase().endsWith('.epub')) {
                     console.log(`[STREAMING] Automated extraction for ${task.name}...`);
                     realChapters = await extractEpubContent(actualFile);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('Error finding files for completed task:', err);
        }

        let fileMetadata: Partial<Book> = {};
        if (foundPath) {
          try {
            fileMetadata = await getMetadataFromFile(foundPath);
          } catch (e) {
            console.error('Error scaping metadata from file:', e);
          }
        }

        let newBook: Book;
        if (task.enrichedBook) {
          newBook = {
            ...task.enrichedBook,
            ...fileMetadata,
            id: `book-${Date.now()}`,
            isDownloaded: false,
            filePath: foundPath || task.enrichedBook.filePath || '',
            fileUrl: foundUrl || task.enrichedBook.fileUrl || '',
            chapters: realChapters.length > 0 ? realChapters : (fileMetadata.chapters || task.enrichedBook.chapters || []),
            duration: totalDuration || task.enrichedBook.duration || fileMetadata.duration
          };
        } else {
          newBook = {
            id: `book-${Date.now()}`,
            title: fileMetadata.title || task.name,
            author: fileMetadata.author || 'Unknown Author',
            coverUrl: isAudio 
              ? 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=400'
              : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400',
            type: isAudio ? 'audiobook' : 'ebook',
            description: fileMetadata.description || `Downloaded from indexer ${task.indexer}.`,
            genres: fileMetadata.genres || [],
            progress: 0,
            currentTime: 0,
            isDownloaded: false,
            size: task.size,
            addedAt: new Date().toISOString(),
            chapters: realChapters.length > 0 ? realChapters : (fileMetadata.chapters || []),
            filePath: foundPath || '',
            fileUrl: foundUrl || '',
            duration: totalDuration || fileMetadata.duration || (isAudio ? 18000 : undefined)
          };
        }
        
        // Ensure new book has some fileUrl if possible, by guessing based on task name
        if (!newBook.fileUrl && task.files && task.files.length > 0) {
           const ebookFile = task.files.find((f: any) => f.name.toLowerCase().match(/\.(epub|pdf|mobi|azw3|txt|djvu|mp3|m4b|aac)$/));
           const nonImageFile = ebookFile || task.files.find((f: any) => !f.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/)) || task.files[0];
           newBook.fileUrl = `/api/files/${encodeURIComponent(nonImageFile.name)}`;
           newBook.filePath = newBook.filePath || path.join(STORAGE_DIRS.download, task.name, nonImageFile.name);
        }

        // Keep files in temporary STAGING context under STORAGE_DIRS.download on server
        if (newBook.filePath) {
            newBook.fileUrl = `/api/files/${encodeURIComponent(path.basename(newBook.filePath))}`;
        }

        db.books.push(newBook);
        db.logs.push({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'success',
          source: 'webtor',
          message: `Torrent [${task.name}] downloaded fully. Registered new ${newBook.type === 'audiobook' ? 'Audiobook' : 'E-book'} in Library!`
        });
      }

      updatedTasks.push({
        ...task,
        progress: nextProgress,
        downloadSpeed,
        uploadSpeed,
        numPeers: activeTorrent ? activeTorrent.numPeers : task.numPeers,
        eta,
        status,
        files
      });
    } else {
      updatedTasks.push(task);
    }
  }

  if (updated) {
    db.torrentTasks = updatedTasks;
    saveDB(db);
  }
}, 5000);

// API Endpoints for Bookrr

const MODELS_CACHE_DIR = path.join(process.cwd(), 'data', 'models');
if (!fs.existsSync(MODELS_CACHE_DIR)) {
  fs.mkdirSync(MODELS_CACHE_DIR, { recursive: true });
}

app.options(['/api/proxy-hf/*', '/api/models/*'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range, Accept-Ranges, ETag');
  res.sendStatus(204);
});

// Proxy for Hugging Face to bypass 401/CORS issues in some environments and cache locally
app.get(['/api/proxy-hf/*', '/api/models/*'], async (req, res) => {
  fs.appendFileSync('proxy.log', `[${new Date().toISOString()}] Incoming request: ${req.url}\n`);
  let targetPath = req.params[0];
  
  // Rewrites for incorrect model IDs:
  if (targetPath.includes('onnx-community/vits-ljspeech')) {
    console.log(`[PROXY] Rewriting legacy/incorrect model ID: ${targetPath}`);
    targetPath = targetPath.replace('onnx-community/vits-ljspeech', 'Xenova/vits-ljspeech');
  }
  if (targetPath.includes('onnx-community/mms-tts-eng')) {
    console.log(`[PROXY] Rewriting legacy/incorrect model ID: ${targetPath}`);
    targetPath = targetPath.replace('onnx-community/mms-tts-eng', 'Xenova/mms-tts-eng');
  }

  // Pre-check for local cache
  const localFileName = targetPath.replace(/\//g, '___');
  const localFilePath = path.join(MODELS_CACHE_DIR, localFileName);
  
  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 0) {
    if (!req.headers.range) {
       console.log(`[CACHE HIT] Serving from local disk: ${targetPath}`);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range, Accept-Ranges, ETag');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(localFilePath);
  }

  const url = `https://huggingface.co/${targetPath}`;
  console.log(`[PROXY] Fetching: ${url} (TargetPath: ${targetPath})`);
  
  if (targetPath.includes('preprocessor_config.json')) {
    if (targetPath.toLowerCase().includes('kokoro')) {
      console.log(`[PROXY] Injecting safe dummy preprocessor_config for ${targetPath}`);
      res.type('application/json');
      res.send(JSON.stringify({
        "feature_extractor_type": "SequenceFeatureExtractor",
        "padding_value": 0.0,
        "do_normalize": false,
        "return_attention_mask": false
      }));
      return;
    }
  }
  
  // Pass through relevant incoming headers (like Range)
  const incomingHeaders = req.headers || {};
  const commonHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': '*/*, application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://huggingface.co/'
  };
  
  // Forward Range header if present
  if (incomingHeaders['range']) {
      commonHeaders['Range'] = incomingHeaders['range'] as string;
  }

  try {
    let response;
    try {
      console.log(`[PROXY] Global HF Resolve Attempt: ${targetPath}`);
      response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        decompress: false,
        validateStatus: (status) => status < 500, // Do not throw on 4xx like 404
        timeout: 600000, 
        headers: {
            ...commonHeaders,
            'Accept-Encoding': 'identity'
        }
      });
      if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw { response: { status: response.status } };
      }
      console.log(`[PROXY] Global HF Success for ${targetPath}`);
    } catch (e: any) {
      // If Global HF fails with 401/403/5xx, try HF Mirror immediately
      // Explicitly delete any potential Authorization header
      delete e.config?.headers?.Authorization;
      if (!e.response || e.response.status === 401 || e.response.status === 403 || e.response.status === 429 || e.response.status >= 500 || e.message?.includes('timeout')) {
        console.warn(`[PROXY] Global HF failed (${e.response?.status || 'network error'}). Falling back to Mirror for: ${targetPath}`);
        const mirrorUrl = `https://hf-mirror.com/${targetPath}`;
        try {
          response = await axios({
            method: 'get',
            url: mirrorUrl,
            responseType: 'stream',
            decompress: false,
            validateStatus: (status) => status < 500,
            timeout: 600000,
            headers: {
               ...commonHeaders,
               'Accept-Encoding': 'identity'
            }
          });
          if (response.status === 401 || response.status === 403 || response.status === 429) {
             throw { response: { status: response.status } };
          }
          console.log(`[PROXY] Mirror Success for ${targetPath}`);
        } catch (mirrorError: any) {
          console.error(`[PROXY] Mirror failed (${mirrorError.response?.status || 'network error', mirrorError.message}). Last resort: ModelScope.`);
          const parts = targetPath.split('/');
          // Typical: onnx-community/vits-ljspeech/resolve/main/config.json
          const org = parts[0];
          const repo = parts[1];
          const revision = parts[3] || 'master';
          const file = parts.slice(4).join('/');
          
          const modelScopeUrl = `https://www.modelscope.cn/api/v1/models/${org}/${repo}/repo?Revision=${revision}&FilePath=${encodeURIComponent(file)}`;
          
          try {
            response = await axios({
              method: 'get',
              url: modelScopeUrl,
              responseType: 'stream',
              decompress: false,
              httpsAgent: agent,
              validateStatus: (status) => status < 500,
              timeout: 600000,
              headers: {
                 ...commonHeaders,
                 'Accept-Encoding': 'identity'
              }
            });
            if (response.status === 401 || response.status === 403 || response.status === 429) {
                throw { response: { status: response.status } };
            }
            console.log(`[PROXY] ModelScope Success for ${targetPath}`);
          } catch (modelScopeError: any) {
            console.warn(`[PROXY] ModelScope also failed (${modelScopeError.response?.status || 'network error'}).`);
            const finalStatus = modelScopeError.response?.status || 404;
            const finalError: any = new Error(`All proxies failed for ${targetPath}`);
            finalError.response = { status: finalStatus };
            throw finalError;
          }
        }
      } else {
        throw e;
      }
    }

    if (!response) throw new Error('Proxy returned empty response after fallbacks');

    // Pass along important headers
    const allowedHeaders = ['content-type', 'content-length', 'etag', 'last-modified', 'content-range', 'accept-ranges'];
    Object.entries(response.headers).forEach(([key, value]) => {
      if (allowedHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value as any);
      }
    });
    
    // Pass through status code (e.g. 206 Partial Content)
    res.status(response.status || 200);
    
    // Add CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Range, Accept-Ranges, ETag');
    if (response.status === 200 || response.status === 206) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
    }

    if (!req.headers.range && response.status === 200) {
      // Stream directly to client without dual-piping to disk to avoid backpressure stream deadlocks
      response.data.pipe(res);
      
      response.data.on('error', (err: any) => {
         console.error('[PROXY] Error piping data to client:', err.message);
      });
    } else {
      response.data.pipe(res);
    }
  } catch (err: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const origStatus = err.response?.status || 500;
    // Map any 401 or 403 (unauthorized/forbidden on non-existent files) to a 404 so transformers.js treats it as a standard missing file fallback
    const mappedStatus = (origStatus === 401 || origStatus === 403) ? 404 : origStatus;
    if (mappedStatus === 404) {
        return res.status(404).send('Not Found on Hugging Face (Check your Model ID)');
    }
    console.error(`[PROXY] All attempts failed for ${targetPath}:`, err.message);
    res.status(mappedStatus).send(err.message);
  }
});

// 1. Get configs and logs and indexers
app.get('/api/config', (req, res) => {
  const db = loadDB();
  res.json({
    config: db.config,
    indexers: db.indexers,
    logs: db.logs
  });
});

app.post('/api/indexers/check', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  const result = await checkTrackerHealth(url);
  res.json(result);
});

app.post('/api/config', (req, res) => {
  const db = loadDB();
  db.config = { ...db.config, ...req.body.config };
  if (req.body.indexers) {
    db.indexers = req.body.indexers;
  }
  db.logs.push({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'server',
    message: 'Bookrr system configuration settings updated locally.'
  });
  saveDB(db);
  res.json({ success: true, config: db.config, indexers: db.indexers });
});

app.post('/api/books/sync-all', async (req, res) => {
  const db = loadDB();
  const booksToSync = db.books.filter((b: Book) => !b.description || b.description.includes('Manually cataloged') || b.description.includes('No metadata found') || !b.coverUrl || b.coverUrl.includes('unsplash'));
  
  console.log(`[Metadata] Sync all triggered for ${booksToSync.length} books.`);
  
  for (const book of booksToSync) {
    try {
      const enriched = await enrichMetadata({ title: book.title, type: book.type } as any);
      book.description = enriched.description || book.description;
      book.coverUrl = enriched.coverUrl || book.coverUrl;
      book.author = enriched.author || book.author;
      book.genres = enriched.genres || book.genres;
    } catch (e) {
      console.error(`[Metadata] Sync failed for ${book.title}`, e);
    }
  }
  
  saveDB(db);
  res.json({ success: true, synced: booksToSync.length });
});

// 2. Books APIs - Get, Post, Update, Delete
// Add Scan Library Endpoint
app.post('/api/scan-library', async (req, res) => {
  const db = loadDB();
  const indexerDir = db.config?.localDownloadPath || STORAGE_DIRS.download; // Prefer specific download dir
  
  if (!fs.existsSync(indexerDir)) {
    try {
      fs.mkdirSync(indexerDir, { recursive: true });
    } catch(e) {
      return res.status(500).send('Watch folder does not exist and could not be created.');
    }
  }

  let addedFiles = 0;
  const maxDepth = 4;

  const scanDir = async (dir: string, depth = 0) => {
    if (depth > maxDepth || !fs.existsSync(dir)) return;
    
    let items;
    try {
       items = await fs.promises.readdir(dir);
    } catch (e) {
       console.error(`Failed readdir for ${dir}:`, e);
       return;
    }
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      let stats;
      try {
         stats = await fs.promises.lstat(fullPath);
      } catch (e) { continue; }

      if (stats.isDirectory()) {
         // Avoid scanning system or massive directories
         if (!item.startsWith('.') && item !== 'node_modules' && item !== 'dist') {
            await scanDir(fullPath, depth + 1);
         }
      } else {
        const lower = item.toLowerCase();
        if (lower.match(/\.(epub|pdf|mobi|azw3|txt|djvu|mp3|m4b|aac|flac|wav|ogg|m4a)$/)) {
          // Check if file is already in library
          const alreadyExists = db.books.some((b: Book) => {
             if (b.filePath && (b.filePath === fullPath || b.filePath === item || path.join(dir, b.filePath) === fullPath)) return true;
             if (b.fileUrl && (b.fileUrl.endsWith(encodeURIComponent(item)) || b.fileUrl.includes(encodeURIComponent(item)))) return true;
             return false;
          });

          if (!alreadyExists) {
             console.log(`[SCANNER] Found new book item: ${item}`);
             const isAudio = lower.endsWith('.mp3') || lower.endsWith('.m4b');
             const nameWithoutExt = item.replace(/\.[^/.]+$/, "");
             
             let epubChapters: any[] = [];
             let fileMeta: Partial<Book> = { title: nameWithoutExt, author: 'Unknown Author (Scanned)' };
             
             try {
               fileMeta = await getMetadataFromFile(fullPath);
             } catch (e) {
               console.error('Failed scanning metadata in scanDir:', e);
             }

             if (!isAudio && lower.endsWith('.epub')) {
               try {
                 epubChapters = await extractEpubContent(fullPath);
               } catch(ex) { console.error(`Epub extract failed during scan for ${item}`); }
             }

             const newBook: Book = {
               id: `book-scan-${Date.now()}-${Math.floor(Math.random()*1000)}`,
               title: fileMeta.title || nameWithoutExt,
               author: fileMeta.author || 'Unknown Author (Scanned)',
               type: isAudio ? 'audiobook' : 'ebook',
               coverUrl: isAudio 
                ? 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?q=80&w=200&auto=format&fit=crop'
                : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=200&auto=format&fit=crop',
               description: fileMeta.description || `Automatically imported from local folder: ${fullPath}`,
               genres: fileMeta.genres || ['Uncategorized'],
               progress: 0,
               currentTime: 0,
               currentPage: 0,
               fileUrl: `/api/files/${encodeURIComponent(item)}`,
               filePath: fullPath,
               isDownloaded: true,
               addedAt: new Date().toISOString(),
               duration: fileMeta.duration || (isAudio ? 0 : undefined),
               chapters: epubChapters.length > 0 ? epubChapters : (fileMeta.chapters && fileMeta.chapters.length > 0 ? fileMeta.chapters : undefined),
             };
             db.books.push(newBook);
             addedFiles++;
          }
        }
      }
    }
  };

  await scanDir(indexerDir);
  
  if (addedFiles > 0) {
    db.logs.push({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'success',
      source: 'filesystem',
      message: `Library scan completed. Found and added ${addedFiles} new local files.`
    });
    saveDB(db);
  }
  res.json({ success: true, added: addedFiles });
});

app.post('/api/logs', (req, res) => {
  const db = loadDB();
  const log = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: req.body.level || 'info',
    source: req.body.source || 'client',
    message: req.body.message
  };
  db.logs.push(log);
  saveDB(db);
  res.json({ success: true, log });
});

app.get('/api/books', (req, res) => {
  const db = loadDB();
  
  // Mark books as not downloaded if their file is missing, but still return them
  const processedBooks = db.books.map((book: Book) => {
    let fileExists = false;
    if (book.filePath) {
      try {
        const fullPath = path.isAbsolute(book.filePath) 
          ? book.filePath 
          : path.join(DATA_DIR, book.filePath);
        fileExists = fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile();
      } catch (e) {}
    }
    
    // Auto-heal missing file path if nested by torrent
    if (!fileExists && book.fileUrl) {
      const safeDecode = (str: string) => {
          try { return decodeURIComponent(str); } catch { return str; }
      };
      const searchDirs = [
          STORAGE_DIRS.download,
          path.join(BOOKARR_DIR, 'audiobooks'), // Legacy fallback
          path.join(BOOKARR_DIR, 'ebooks'),     // Legacy fallback
          DATA_DIR
      ];
      const fileName = safeDecode(book.fileUrl.split('/').pop() || '');
      if (fileName) {
          const findFileRecursive = (dir: string): string | null => {
              try {
                  if (!fs.existsSync(dir)) return null;
                  const items = fs.readdirSync(dir);
                  for (const item of items) {
                      const fullPath = path.join(dir, item);
                      try {
                          if (fs.lstatSync(fullPath).isDirectory()) {
                              const found = findFileRecursive(fullPath);
                              if (found) return found;
                          } else if (item === fileName || fullPath.endsWith(fileName) || safeDecode(item) === safeDecode(fileName)) {
                              return fullPath;
                          }
                      } catch (e) {
                          continue;
                      }
                  }
                  return null;
              } catch (e) {
                  return null;
              }
          };
          for (const dir of searchDirs) {
              const actualFile = findFileRecursive(dir);
              if (actualFile) {
                  book.filePath = actualFile;
                  fileExists = true;
                  db.books[db.books.findIndex((b: Book) => b.id === book.id)].filePath = actualFile;
                  saveDB(db);
                  break;
              }
          }
      }
    }
    
    return { ...book, isDownloaded: fileExists };
  });

  res.json(processedBooks);
});

app.post('/api/books', (req, res) => {
  const db = loadDB();
  const book: Book = {
    id: `book-${Date.now()}`,
    ...req.body,
    progress: 0,
    currentTime: 0,
    addedAt: new Date().toISOString()
  };
  db.books.push(book);
  db.logs.push({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'success',
    source: 'server',
    message: `Manual import: Book [${book.title}] added to library.`
  });
  saveDB(db);
  res.json(book);
});

app.post('/api/books/:id/process', async (req, res) => {
  const db = loadDB();
  const book = db.books.find((b: Book) => b.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  
  if (!book.filePath || !fs.existsSync(book.filePath)) {
    return res.status(400).json({ error: 'Source file not found on disk' });
  }
  
  if (book.filePath.endsWith('.epub')) {
    console.log(`Manual re-processing of EPUB: ${book.filePath}`);
    const chapters = await extractEpubContent(book.filePath);
    if (chapters && chapters.length > 0) {
      book.chapters = chapters;
      saveDB(db);
      return res.json({ success: true, chaptersProcessed: chapters.length });
    } else {
      return res.status(500).json({ error: 'EPUB extraction failed during re-process' });
    }
  }
  
  res.status(400).json({ error: 'File format not supported for deep processing' });
});

app.put('/api/books/:id', (req, res) => {
  const db = loadDB();
  const index = db.books.findIndex((b: Book) => b.id === req.params.id);
  if (index !== -1) {
    db.books[index] = { ...db.books[index], ...req.body };
    saveDB(db);
    return res.json(db.books[index]);
  }
  res.status(404).json({ error: 'Book not found' });
});

app.delete('/api/books/:id', (req, res) => {
  const db = loadDB();
  const index = db.books.findIndex((b: Book) => b.id === req.params.id);
  if (index !== -1) {
    const title = db.books[index].title;
    db.books.splice(index, 1);
    db.logs.push({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'server',
      message: `Removed track: Book [${title}] and local files deleted.`
    });
    saveDB(db);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Book not found' });
});

// 3. Torrents Search Stream (Internal Tracker Aggregator)
app.get('/api/search/stream', async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  const type = (req.query.type || 'ebook') as 'ebook' | 'audiobook';
  const db = loadDB();
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  if (!query || query.length < 2) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  
  try {
    await searchAllIndexers({ query, type }, db.config, db.indexers, (results) => {
      res.write(`data: ${JSON.stringify(results)}\n\n`);
      if ((res as any).flush) (res as any).flush();
    }, (status) => {
      res.write(`data: ${JSON.stringify({ status })}\n\n`);
      if ((res as any).flush) (res as any).flush();
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// 4. Metadata Enrichment API
app.get('/api/metadata', async (req, res) => {
    const resultId = (req.query.resultId || '').toString();
    const title = (req.query.title || '').toString();
    const type = (req.query.type || 'ebook') as 'ebook' | 'audiobook';
    const returnAll = req.query.all === 'true';
    
    try {
        const enriched = await enrichMetadata({ id: resultId, title, type } as any, returnAll);
        return res.json(enriched);
    } catch (err: any) {
        return res.status(500).json({ error: 'Failed to enrich metadata' });
    }
});

// Proxy route for client-side OpenLibrary book searches to avoid CORS and sandbox fetch errors
app.get('/api/metadata/search', async (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = parseInt((req.query.limit || '9').toString(), 10);
    if (!q) {
        return res.json({ docs: [] });
    }
    try {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}`;
        const axiosResponse = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        return res.json(axiosResponse.data);
    } catch (err: any) {
        console.error(`[Metadata Proxy Search Error] Failed to fetch OpenLibrary search for "${q}":`, err.message || err);
        return res.status(500).json({ error: 'Failed to search metadata source', details: err.message });
    }
});

// 4. Torrent Downloading tasks via Webtor
app.get('/api/torrents', (req, res) => {
  const db = loadDB();
  res.json(db.torrentTasks);
});

// Helper to format bytes
function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Inspect torrent files before downloading
app.get('/api/torrents/inspect', async (req, res) => {
  const { magnet } = req.query;
  if (!magnet || typeof magnet !== 'string') {
    return res.status(400).json({ error: 'Magnet link required' });
  }

  try {
    const enhancedMagnet = injectTrackers(magnet);
    const infoHash = extractInfoHash(enhancedMagnet);
    
    // Check if we already have it in the client
    let infoTask = client.get(enhancedMagnet) || (infoHash ? client.get(infoHash) : null);
    
    if (!infoTask) {
      infoTask = client.add(enhancedMagnet, { 
        deselect: true,
        announce: PUBLIC_TRACKERS
      });
      // Aggressively boost tracking discovery to resolve files list instantly
      bootstrapTorrentReady(infoTask);
    }
    
    const cleanup = () => {
      if (infoTask && !loadDB().torrentTasks.find(t => t.infoHash === infoTask.infoHash)) {
        try { client.remove(infoTask.infoHash); } catch(e) {}
      }
    };

    // Timeout after 90 seconds if metadata doesn't load
    const timeout = setTimeout(() => {
      res.status(408).json({ error: 'Metadata fetch timed out. Indexer might be slow.' });
      cleanup();
    }, 90000);

    const onMetadata = () => {
      clearTimeout(timeout);
      const files = infoTask.files.map((f: any) => ({
        name: f.name,
        size: formatBytes(f.length),
        path: f.path
      }));
      res.json({ name: infoTask.name, files });
      cleanup();
    };

    if (infoTask.ready) {
      onMetadata();
    } else {
      infoTask.once('metadata', onMetadata);
      infoTask.once('error', (err: any) => {
        clearTimeout(timeout);
        res.status(500).json({ error: err.message });
        cleanup();
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/torrents', async (req, res) => {
  try {
    const db = loadDB();
    const { title, magnetLink, downloadUrl, size, indexer, type } = req.body;
    
    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    const safeTitle = title || 'Unknown Title';

    // Check if already downloading (or completed)
    const exists = db.torrentTasks.find((t: TorrentTask) => t.magnetLink === (magnetLink || downloadUrl));
    if (exists) {
      return res.json(exists);
    }

    const isAudio = type === 'audiobook' || safeTitle.toLowerCase().includes('audiobook') || safeTitle.toLowerCase().includes('mp3') || safeTitle.toLowerCase().includes('m4b');
    
    // Handle Direct Download (e.g. LibGen)
    if (downloadUrl) {
      const newTask: TorrentTask = {
          id: `task-${Date.now()}`,
          name: safeTitle,
          size: size || '2.1 MB',
          progress: 0,
          downloadSpeed: 'Calculating...',
          uploadSpeed: '0 KB/s',
          eta: 'Calculating...',
          status: 'downloading',
          magnetLink: downloadUrl, // Using this as unique key
          indexer: indexer || 'Direct Download',
          files: [{ name: safeTitle, size: size || '2.1 MB', progress: 0, type: isAudio ? 'audio' : 'ebook' }],
          addedAt: new Date().toISOString()
      };

    db.torrentTasks.push(newTask);
    saveDB(db);
    res.json(newTask);

    // Start download in background
    (async () => {
        try {
            console.log(`Resolving DDL for: ${safeTitle}`);
            const finalUrl = await resolveLibGenDownload(downloadUrl);
            if (!finalUrl) throw new Error('Could not resolve download link');

            const ext = safeTitle.match(/\[(.*)\]$/)?.[1]?.toLowerCase() || (isAudio ? 'mp3' : 'epub');
            const fileName = `${safeTitle.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
            const dest = path.join(STORAGE_DIRS.download, fileName);
            
            console.log(`Downloading real file to: ${dest}`);
            const success = await downloadDirectFile(finalUrl, dest, newTask.id);
            
             if (success) {
                const innerDb = loadDB();
                const task = innerDb.torrentTasks.find((t: any) => t.id === newTask.id);
                if (task) {
                    task.progress = 100;
                    task.status = 'completed';
                    task.downloadSpeed = '0 KB/s';
                    
                    const enrichedBook = await enrichTorrentTaskWithMetadata(safeTitle, isAudio, size, indexer);
                    
                    let realChapters = [];
                    if (!isAudio && dest.endsWith('.epub')) {
                        console.log(`Extracting text from real file: ${dest}`);
                        realChapters = await extractEpubContent(dest);
                    }

                    const book: Book = {
                        ...enrichedBook,
                        id: `book-${Date.now()}`,
                        isDownloaded: false,
                        filePath: dest,
                        fileUrl: `/api/files/${encodeURIComponent(path.basename(dest))}`,
                        chapters: realChapters.length > 0 ? realChapters : (enrichedBook.chapters || []),
                        addedAt: new Date().toISOString()
                    };
                    innerDb.books.push(book);
                    innerDb.logs.push({
                        id: `log-${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        level: 'success',
                        source: 'server',
                        message: `Direct Download [${safeTitle}] completed and staged in database for browser offline caching.`
                    });
                    saveDB(innerDb);
                }
            } else {
                throw new Error('File download failed');
            }
        } catch (err: any) {
            console.error('Direct download task failed:', err);
            const innerDb = loadDB();
            const task = innerDb.torrentTasks.find((t: any) => t.id === newTask.id);
            if (task) {
                task.status = 'paused';
                innerDb.logs.push({
                    id: `log-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                    level: 'error',
                    source: 'server',
                    message: `Direct download failed for [${safeTitle}]: ${err.message}`
                });
                saveDB(innerDb);
            }
        }
    })();
    return;
  }

  const newTask: TorrentTask = {
    id: `task-${Date.now()}`,
    name: safeTitle,
    size: size || 'Calculating...',
    progress: 0,
    downloadSpeed: '0 KB/s',
    uploadSpeed: '0 KB/s',
    eta: 'Starting...',
    status: 'downloading',
    magnetLink: magnetLink,
    indexer: indexer || 'Bookrr (Native Aggregator)',
    addedAt: new Date().toISOString(),
    files: [
      {
        name: isAudio ? 'Audio Content' : 'E-Book Content',
        size: size || '...',
        progress: 0,
        type: isAudio ? 'audio' : 'ebook'
      }
    ]
  };

  db.torrentTasks.push(newTask);
  db.logs.push({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'webtor',
    message: `Initiated real torrent stream: [${safeTitle}] via WebTorrent client.`
  });
  saveDB(db);
  res.json(newTask);

  // Real Torrent Initiation
  try {
    const torrent = addTorrentToClient(newTask);
      if (torrent) {
        const updateTaskWithMetadata = () => {
          const innerDb = loadDB();
          const t = innerDb.torrentTasks.find((tt: any) => tt.id === newTask.id);
          if (t) {
            t.infoHash = torrent.infoHash;
            t.name = torrent.name;
            t.files = torrent.files.map((f: any) => ({
              name: f.name,
              size: (f.length / (1024 * 1024)).toFixed(1) + ' MB',
              progress: 0,
              type: f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.m4b') ? 'audio' : (f.name.toLowerCase().match(/\.(epub|pdf|mobi|azw3|txt|djvu)$/) ? 'ebook' : (f.name.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/) ? 'cover' : 'other'))
            }));
            saveDB(innerDb);
          }
        };

        if (torrent.ready) {
          updateTaskWithMetadata();
        } else {
          torrent.on('metadata', updateTaskWithMetadata);
          torrent.on('ready', updateTaskWithMetadata);
        }
      }

  } catch (err) {
    console.error('Failed to add torrent:', err);
  }

  // Launch metadata and generative content enrichment asynchronously
  (async () => {
    try {
      const enrichedBook = await enrichTorrentTaskWithMetadata(safeTitle, isAudio, size || 'Calculating...', indexer || 'Bookrr Indexer');
      const enrichDb = loadDB();
      const enrichTask = enrichDb.torrentTasks.find((t: any) => t.id === newTask.id);
      if (enrichTask) {
        enrichTask.enrichedBook = enrichedBook;
        saveDB(enrichDb);
      }
    } catch (err) {
      console.error('Failed to pre-enrich torrent metadata:', err);
    }
  })();
  } catch (err) {
    console.error('API Torrents POST Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete torrent task
app.delete('/api/torrents/:id', (req, res) => {
  const db = loadDB();
  const index = db.torrentTasks.findIndex((t: TorrentTask) => t.id === req.params.id);
  if (index !== -1) {
    const task = db.torrentTasks[index];
    const name = task.name;
    
    // Attempt to locate and remove the active torrent from client
    const torrent = client.torrents.find((t: any) => 
        (t.magnetURI === task.magnetLink) || 
        (t.infoHash === task.infoHash)
    );
    if (torrent) {
        client.remove(torrent);
        console.log(`[WEBTOR] Removed active torrent from client: ${name}`);
    }

    db.torrentTasks.splice(index, 1);
    db.logs.push({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      source: 'webtor',
      message: `Removed torrent download: [${name}]. Deleted cache.`
    });
    saveDB(db);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Torrent task not found' });
});

app.post('/api/books/:id/process', async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const book = db.books.find(b => b.id === id);
  
  if (!book || !book.filePath) {
    return res.status(404).json({ error: 'Book or file path not found' });
  }

  try {
    if (book.filePath.toLowerCase().endsWith('.epub')) {
      console.log(`[STREAMING] Manual re-extraction for ${book.title}...`);
      const chapters = await extractEpubContent(book.filePath);
      if (chapters.length > 0) {
        book.chapters = chapters;
        book.pages = Math.max(1, Math.ceil((chapters.reduce((acc, ch) => acc + (ch.content?.length || 0), 0) / 1500)));
        saveDB(db);
        return res.json({ success: true, message: `Extracted ${chapters.length} chapters` });
      } else {
        return res.status(500).json({ error: 'Extraction resulted in zero chapters' });
      }
    } else {
      return res.status(400).json({ error: 'Book is not an EPUB file' });
    }
  } catch (err) {
    console.error('Processing failed:', err);
    res.status(500).json({ error: 'Processing error' });
  }
});

app.post('/api/torrents/:id/retry', (req, res) => {
    const db = loadDB();
    const task = db.torrentTasks.find((t: TorrentTask) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    
    // Reset retry count manually if requested
    task.retryCount = 0;
    task.status = 'connecting';
    saveDB(db);

    restartTorrent(task);
    res.json({ success: true, message: 'Retry initiated' });
});

// Simple caching for TTS requests
const ttsCache = new Map<string, Buffer>();

// route for cached, lock-screen-compatible TTS proxy
app.get('/api/tts', async (req, res) => {
    const text = req.query.text as string;
    const lang = (req.query.lang as string) || 'en';

    if (!text) {
        return res.status(400).send('Text is required');
    }

    const cacheKey = `${lang}:${text}`;
    if (ttsCache.has(cacheKey)) {
        console.log(`[TTS-API] Cache hit for: ${text.substring(0, 30)}...`);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(ttsCache.get(cacheKey));
    }

    try {
        console.log(`[TTS-API] Fetching speech from Google for length: ${text.length}`);
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text)}`;
        const response = await axios({
            method: 'get',
            url,
            responseType: 'arraybuffer',
            headers: {
                'Referer': 'https://translate.google.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        const buffer = Buffer.from(response.data);
        
        // Cache the result (max 200 items to avoid memory issues)
        if (ttsCache.size > 200) {
            const firstKey = ttsCache.keys().next().value;
            if (firstKey !== undefined) {
                ttsCache.delete(firstKey);
            }
        }
        ttsCache.set(cacheKey, buffer);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
    } catch (err: any) {
        console.error('Error in /api/tts proxy:', err.message);
        res.status(500).send('Error generating speech');
    }
});

// route to serve downloaded files
app.get('/api/files/:name', (req, res) => {
    const safeDecode = (str: string) => {
        try { return decodeURIComponent(str); } catch { return str; }
    };
    const fileName = safeDecode(req.params.name);
    console.log(`[FILE-API] Requesting: ${fileName}`);
    
    // Check all managed directories
    const searchDirs = [
        STORAGE_DIRS.download,
        path.join(BOOKARR_DIR, 'audiobooks'), // Legacy fallback
        path.join(BOOKARR_DIR, 'ebooks'),     // Legacy fallback
        DATA_DIR // Legacy fallback
    ];

    // Check root bases first for performance
    for (const dir of searchDirs) {
        const rootPath = path.join(dir, fileName);
        console.log(`[FILE-API] Checking: ${rootPath}`);
        if (fs.existsSync(rootPath) && fs.lstatSync(rootPath).isFile()) {
            console.log(`[FILE-API] Found: ${rootPath}`);
            const lowerFileName = fileName.toLowerCase();
            const isAudio = lowerFileName.endsWith('.mp3') || lowerFileName.endsWith('.m4b') || lowerFileName.endsWith('.aac');
            const isPdf = lowerFileName.endsWith('.pdf');
            const isImage = lowerFileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
            
            let contentType = 'application/octet-stream';
            if (isAudio) contentType = 'audio/mpeg';
            else if (isPdf) contentType = 'application/pdf';
            else if (isImage) contentType = `image/${lowerFileName.split('.').pop()?.replace('jpg', 'jpeg')}`;
            else contentType = 'application/epub+zip';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Accept-Ranges', 'bytes');
            return res.sendFile(rootPath, (err) => {
                if (err) {
                    if (err.message === 'Request aborted' || err.message.includes('EPIPE')) {
                        console.log(`[FILE-API] File transfer interrupted/aborted: ${rootPath}`);
                    } else {
                        console.error(`[FILE-API] Error sending file ${rootPath}:`, err);
                        if (!res.headersSent) {
                            res.status(500).send('Error sending file');
                        }
                    }
                }
            });
        }
    }

    // Recursive search fallback
    const findFileRecursive = (dir: string): string | null => {
        try {
            if (!fs.existsSync(dir)) return null;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                try {
                    if (fs.lstatSync(fullPath).isDirectory()) {
                        const found = findFileRecursive(fullPath);
                        if (found) return found;
                    } else if (item === fileName || safeDecode(item) === safeDecode(fileName)) {
                        return fullPath;
                    }
                } catch (e) {
                    continue;
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    try {
        let foundPath: string | null = null;
        for (const dir of searchDirs) {
            foundPath = findFileRecursive(dir);
            if (foundPath) break;
        }

        if (foundPath) {
            const lowerFileName = foundPath.toLowerCase();
            const isAudio = lowerFileName.endsWith('.mp3') || lowerFileName.endsWith('.m4b') || lowerFileName.endsWith('.aac');
            const isPdf = lowerFileName.endsWith('.pdf');
            const isImage = lowerFileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
            
            let contentType = 'application/octet-stream';
            if (isAudio) contentType = 'audio/mpeg';
            else if (isPdf) contentType = 'application/pdf';
            else if (isImage) contentType = `image/${lowerFileName.split('.').pop()?.replace('jpg', 'jpeg')}`;
            else contentType = 'application/epub+zip';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Accept-Ranges', 'bytes');
            res.sendFile(foundPath, (err) => {
                if (err) {
                    if (err.message === 'Request aborted' || err.message.includes('EPIPE')) {
                        console.log(`[FILE-API] File transfer interrupted/aborted: ${foundPath}`);
                    } else {
                        console.error(`[FILE-API] Error sending file ${foundPath}:`, err);
                        if (!res.headersSent) {
                            res.status(500).send('Error sending file');
                        }
                    }
                }
            });
        } else {
            res.status(404).send('File not found in local library');
        }
    } catch (err) {
        console.error('File search error:', err);
        res.status(500).send('Error searching filesystem');
    }
});

app.post('/api/books/:id/organize', (req, res) => {
    const db = loadDB();
    const book = db.books.find((b: Book) => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    
    if (!book.filePath || !fs.existsSync(book.filePath)) {
        const safeDecode = (str: string) => {
            try { return decodeURIComponent(str); } catch { return str; }
        };
        
        // Attempt to find the real file using recursive search if it was nested
        let actualFile: string | null = null;
        if (book.fileUrl) {
            const searchDirs = [
                STORAGE_DIRS.download,
                path.join(BOOKARR_DIR, 'audiobooks'), // Legacy fallback
                path.join(BOOKARR_DIR, 'ebooks')     // Legacy fallback
            ];
            const fileName = safeDecode(book.fileUrl.split('/').pop() || '');
            if (fileName) {
                const findFileRecursive = (dir: string): string | null => {
                    try {
                        if (!fs.existsSync(dir)) return null;
                        const items = fs.readdirSync(dir);
                        for (const item of items) {
                            const fullPath = path.join(dir, item);
                            try {
                                if (fs.lstatSync(fullPath).isDirectory()) {
                                    const found = findFileRecursive(fullPath);
                                    if (found) return found;
                                } else if (item === fileName || fullPath.endsWith(fileName) || safeDecode(item) === safeDecode(fileName)) {
                                    return fullPath;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                };
                for (const dir of searchDirs) {
                    actualFile = findFileRecursive(dir);
                    if (actualFile) break;
                }
            }
        }
        
        if (actualFile) {
            book.filePath = actualFile;
        } else {
            return res.status(400).json({ error: 'Source file not found on disk' });
        }
    }

    const finalPath = finalizeFileLocation(book.filePath, book.type, book.author, book.title);
    if (finalPath !== book.filePath) {
        book.filePath = finalPath;
        book.fileUrl = `/api/files/${path.basename(finalPath)}`;
        
        db.logs.push({
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'server',
            message: `Manual organization complete: ${book.title} moved to staged ${book.type} repository.`
        });
        saveDB(db);
        return res.json({ success: true, filePath: finalPath });
    }
    
    res.json({ success: true, message: 'Already organized', filePath: finalPath });
});

app.get('/api/system/storage', (req, res) => {
    res.json({
        success: true,
        baseDir: BOOKARR_DIR,
        paths: STORAGE_DIRS,
        dataDir: DATA_DIR
    });
});

// 5. File Upload API
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, STORAGE_DIRS.download);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
    }
});
const upload = multer({ storage: uploadStorage });

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    try {
        const type = req.body.type === 'audiobook' ? 'audiobook' : 'ebook';
        const finalPath = finalizeFileLocation(req.file.path, type);
        
        res.json({ 
            success: true, 
            filePath: finalPath,
            fileName: path.basename(finalPath),
            fileUrl: `/api/files/${encodeURIComponent(path.basename(finalPath))}`
        });
    } catch (err: any) {
        console.error('Upload processing failed:', err);
        res.status(500).json({ error: 'Failed to process uploaded file' });
    }
});

// Explicit routes for PWA files to guarantee correct MIME types and headers for scanners (e.g. PWABuilder)
app.get(['/pwabuilder-sw.js', '/sw.js', '/service-worker.js'], (req, res) => {
    const possiblePaths = [
        path.join(process.cwd(), 'dist', 'pwabuilder-sw.js'),
        path.join(process.cwd(), 'public', 'pwabuilder-sw.js')
    ];
    const filePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[1];
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(filePath);
});

app.get('/manifest.json', (req, res) => {
    const possiblePaths = [
        path.join(process.cwd(), 'dist', 'manifest.json'),
        path.join(process.cwd(), 'public', 'manifest.json')
    ];
    const filePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[1];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(filePath);
});

app.get(['/icon-192.png', '/icon-512.png'], (req, res) => {
    const iconName = req.path.split('/').pop() || 'icon-512.png';
    const possiblePaths = [
        path.join(process.cwd(), 'dist', iconName),
        path.join(process.cwd(), 'public', iconName)
    ];
    const filePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[1];
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(filePath);
});

app.get(['/icon.svg', '/icon-maskable.svg'], (req, res) => {
    const iconName = req.path.split('/').pop() || 'icon.svg';
    const possiblePaths = [
        path.join(process.cwd(), 'dist', iconName),
        path.join(process.cwd(), 'public', iconName)
    ];
    const filePath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[1];
    res.setHeader('Content-Type', 'image/svg+xml');
    res.sendFile(filePath);
});

// Setup dev server with Vite middleware or express static bundle
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      console.log('FALLBACK TO INDEX.HTML FOR:', req.url);
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bookrr Server running on http://localhost:${PORT}`);
  });
}

startServer();
