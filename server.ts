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
import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';
// @ts-ignore
import epubParser from 'epub-parser';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const agent = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1.2',
  ciphers: 'DEFAULT'
});

// @ts-ignore
import WebTorrent from 'webtorrent';
// @ts-ignore
import EPub from 'epub';

const client = new WebTorrent();
client.on('error', (err: any) => {
  console.error('Global WebTorrent client error:', err);
});

const app = express();
const PORT = 3000;

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
      timeout: 15000,
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
  
  for (const indexer of db.indexers) {
    if (!indexer.enabled) continue;
    
    const result = await checkTrackerHealth(indexer.url);
    indexer.status = result.status;
    indexer.lastChecked = new Date().toISOString();
    indexer.error = result.error;
  }
  
  saveDB(db);
}

// Function to resume previously active torrents
async function resumeActiveTorrents() {
  const db = loadDB();
  const downloading = db.torrentTasks.filter((t: TorrentTask) => t.status === 'downloading');
  
  console.log(`Resuming ${downloading.length} active torrent downloads...`);
  
  for (const task of downloading) {
    if (task.magnetLink && task.magnetLink.startsWith('magnet:')) {
      try {
        const downloadBase = path.join(DATA_DIR, 'downloads');
        client.add(task.magnetLink, { path: path.join(downloadBase, task.name) }, (torrent: any) => {
          console.log(`Resumed torrent: ${task.name} (${torrent.infoHash})`);
        });
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

  for (const book of db.books) {
    const firstChapter = book.chapters?.[0];
    if (book.type === 'ebook' && firstChapter && firstChapter.content && firstChapter.content.includes('is being processed')) {
      console.log(`Fixing stuck book: ${book.title}`);
      try {
        const enriched = await enrichTorrentTaskWithMetadata(book.title, false, book.size, 'Auto-Repair');
        book.description = enriched.description;
        book.chapters = enriched.chapters;
        book.genres = enriched.genres;
        book.author = enriched.author;
        book.coverUrl = enriched.coverUrl;
        changed = true;
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
  await runHealthChecks();
  await fixStuckBooks();
  await resumeActiveTorrents();
}, 5000);

// Local storage paths
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Book Data to seed the local database
const INITIAL_BOOKS: Book[] = [];

// Load Db helper
const loadDB = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const db = JSON.parse(content);
      
      if (!db.indexers) db.indexers = [];
      if (!db.config) db.config = { webtorEnabled: true, localDownloadPath: '/data/downloads/bookrr' };
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
        { id: '8', name: 'LibGen', url: 'https://libgen.is', apiKey: '', enabled: true, type: 'native' }
      ];

      let changed = false;
      defaultIndexers.forEach(def => {
        const existing = db.indexers.find((i: any) => i.name === def.name);
        if (!existing) {
          db.indexers.push(def);
          changed = true;
        } else if (existing.url !== def.url && (existing.url.includes('.lu') || existing.url.includes('.cm') || existing.url.includes('.so') || existing.url.includes('kickasstorrents.to'))) {
          // Force update for broken default mirrors
          existing.url = def.url;
          changed = true;
        }
      });

      if (changed) {
        saveDB(db);
      }

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
      localDownloadPath: '/data/downloads/bookrr'
    } as BookrrConfig,
    indexers: [
      { id: '1', name: '1337x', url: 'https://1337x.to', apiKey: '', enabled: true, type: 'native' },
      { id: '2', name: 'LimeTorrents', url: 'https://limetorrents.info', apiKey: '', enabled: true, type: 'native' },
      { id: '3', name: 'TorrentDownloads', url: 'https://www.torrentdownloads.pro', apiKey: '', enabled: true, type: 'native' },
      { id: '4', name: 'GloTorrents', url: 'https://glodls.to', apiKey: '', enabled: true, type: 'native' },
      { id: '5', name: 'Kickass', url: 'https://kickasst.net', apiKey: '', enabled: true, type: 'native' },
      { id: '6', name: 'The Pirate Bay', url: 'https://thepiratebay.org', apiKey: '', enabled: true, type: 'native' },
      { id: '7', name: 'SolidTorrents', url: 'https://solidtorrents.to', apiKey: '', enabled: true, type: 'native' },
      { id: '8', name: 'LibGen', url: 'https://libgen.is', apiKey: '', enabled: true, type: 'native' }
    ] as IndexerSettings[]
  };

  saveDB(defaultDB);
  return defaultDB;
};

// Save Db helper
const saveDB = (data: any) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving DB', e);
  }
};

async function resolveLibGenDownload(mirrorUrl: string): Promise<string> {
  try {
    const response = await axios.get(mirrorUrl, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      timeout: 10000
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

async function downloadDirectFile(url: string, destination: string): Promise<boolean> {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      httpsAgent: agent,
      timeout: 30000,
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
      const epub = new EPub(filePath) as any;
      
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
      const res = await axios.get(olUrl, { timeout: 5000 });
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
    if (task.status === 'downloading') {
      updated = true;
      let nextProgress = task.progress;
      let downloadSpeed = task.downloadSpeed;
      let uploadSpeed = task.uploadSpeed;
      let eta = task.eta;
      let status = task.status;
      let files = task.files;

      // Try to find matching active torrent in WebTorrent client
      const activeTorrent = client.torrents.find((t: any) => 
        t.magnetLink === task.magnetLink || t.infoHash === task.infoHash
      );

      if (activeTorrent) {
        // Use real stats from WebTorrent
        nextProgress = Math.round(activeTorrent.progress * 100);
        downloadSpeed = (activeTorrent.downloadSpeed / (1024 * 1024)).toFixed(1) + ' MB/s';
        uploadSpeed = (activeTorrent.uploadSpeed / 1024).toFixed(0) + ' KB/s';
        const numPeers = activeTorrent.numPeers;
        
        const tr = activeTorrent.timeRemaining;
        if (tr && isFinite(tr)) {
          const seconds = Math.floor((tr / 1000) % 60);
          const minutes = Math.floor((tr / (1000 * 60)) % 60);
          const hours = Math.floor((tr / (1000 * 60 * 60)));
          eta = hours > 0 ? `${hours}h ${minutes}m` : (minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
        } else {
          eta = 'Calculating...';
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
        }
      } else if (!task.magnetLink?.startsWith('magnet:')) {
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
          const downloadBase = path.join(DATA_DIR, 'downloads');
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
                      fileUrl: `/api/files/${audioFileName}`
                    });
                    startTime += chapterDuration;
                  }
                  totalDuration = startTime;
                }
              } else {
                const matched = items.find((f: string) => f.toLowerCase().endsWith('.epub'));
                if (matched) {
                  const actualFile = path.join(taskDir, matched);
                  foundPath = actualFile;
                  foundUrl = `/api/files/${path.basename(actualFile)}`;
                  console.log(`[STREAMING] Automated extraction for ${task.name}...`);
                  realChapters = await extractEpubContent(actualFile);
                }
              }
            }
          }
        } catch (err) {
          console.error('Error finding files for completed task:', err);
        }

        let newBook: Book;
        if (task.enrichedBook) {
          newBook = {
            ...task.enrichedBook,
            id: `book-${Date.now()}`,
            filePath: foundPath || task.enrichedBook.filePath || '',
            fileUrl: foundUrl || task.enrichedBook.fileUrl || '',
            chapters: realChapters.length > 0 ? realChapters : (task.enrichedBook.chapters || []),
            duration: totalDuration || task.enrichedBook.duration
          };
        } else {
          newBook = {
            id: `book-${Date.now()}`,
            title: task.name,
            author: 'Unknown Author',
            coverUrl: isAudio 
              ? 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=400'
              : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400',
            type: isAudio ? 'audiobook' : 'ebook',
            description: `Downloaded from indexer ${task.indexer}.`,
            genres: [],
            progress: 0,
            currentTime: 0,
            isDownloaded: true,
            size: task.size,
            addedAt: new Date().toISOString(),
            chapters: realChapters,
            filePath: foundPath || '',
            fileUrl: foundUrl || '',
            duration: totalDuration || (isAudio ? 18000 : undefined)
          };
        }
        
        // Ensure new book has some fileUrl if possible, by guessing based on task name
        if (!newBook.fileUrl && task.files && task.files.length > 0) {
           newBook.fileUrl = `/api/files/${task.files[0].name}`;
           newBook.filePath = newBook.filePath || `/data/downloads/${task.name}/${task.files[0].name}`;
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
}, 3000);

// API Endpoints for Bookrr

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

// 2. Books APIs - Get, Post, Update, Delete
// Add Scan Library Endpoint
app.post('/api/scan-library', (req, res) => {
  const db = loadDB();
  const indexerDir = db.config?.localDownloadPath || DATA_DIR;
  
  if (!fs.existsSync(indexerDir)) {
    try {
      fs.mkdirSync(indexerDir, { recursive: true });
    } catch(e) {
      return res.status(500).send('Watch folder does not exist and could not be created.');
    }
  }

  let addedFiles = 0;

  const scanDir = async (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      if (fs.lstatSync(fullPath).isDirectory()) {
         // Avoid scanning known app directories that aren't the watch directory
        await scanDir(fullPath);
      } else {
        const lower = item.toLowerCase();
        if (lower.endsWith('.epub') || lower.endsWith('.mp3') || lower.endsWith('.m4b')) {
          // Check if file is already in library
          const alreadyExists = db.books.some((b: Book) => {
             if (b.filePath && (b.filePath === fullPath || b.filePath === item || path.join(dir, b.filePath) === fullPath)) return true;
             if (b.fileUrl && (b.fileUrl.endsWith(encodeURIComponent(item)) || b.fileUrl.includes(item))) return true;
             const nameWithoutExt = item.replace(/\.[^/.]+$/, "");
             if (b.title && nameWithoutExt.toLowerCase().includes(b.title.toLowerCase())) return true;
             return false;
          });

          if (!alreadyExists) {
            const isAudio = lower.endsWith('.mp3') || lower.endsWith('.m4b');
            const nameWithoutExt = item.replace(/\.[^/.]+$/, "");
            
            let epubChapters: any[] = [];
            if (!isAudio) {
              console.log(`[SCANNER] Extracting EPUB chapters for ${fullPath}...`);
              epubChapters = await extractEpubContent(fullPath);
            }

            const newBook: Book = {
              id: `book-scan-${Date.now()}-${Math.floor(Math.random()*1000)}`,
              title: nameWithoutExt,
              author: 'Unknown Author (Scanned)',
              type: isAudio ? 'audiobook' : 'ebook',
              coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?q=80&w=200&auto=format&fit=crop',
              description: `Automatically imported from watch folder: ${fullPath}`,
              genres: ['Uncategorized'],
              progress: 0,
              currentTime: 0,
              currentPage: 0,
              fileUrl: `/api/stream/${encodeURIComponent(item)}`,
              filePath: fullPath,
              isDownloaded: true,
              addedAt: new Date().toISOString(),
              duration: isAudio ? 0 : undefined,
              chapters: epubChapters.length > 0 ? epubChapters : undefined,
            };
            db.books.push(newBook);
            addedFiles++;
          }
        }
      }
    }
  };

  scanDir(indexerDir).then(() => {
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
    res.json({ added: addedFiles });
  }).catch((err: any) => {
    console.error('Scan error:', err);
    res.status(500).send('Error scanning directories: ' + err.message);
  });
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
    }, (status) => {
      res.write(`data: ${JSON.stringify({ status })}\n\n`);
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
    
    try {
        const enriched = await enrichMetadata({ id: resultId, title, type } as any);
        return res.json(enriched);
    } catch (err: any) {
        return res.status(500).json({ error: 'Failed to enrich metadata' });
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
    const infoTask = client.add(magnet, { deselect: true });
    
    // Timeout after 10 seconds if metadata doesn't load
    const timeout = setTimeout(() => {
      try { client.remove(magnet); } catch(e) {}
      res.status(408).json({ error: 'Metadata fetch timed out. Indexer might be slow.' });
    }, 15000);

    infoTask.on('metadata', () => {
      clearTimeout(timeout);
      const files = infoTask.files.map(f => ({
        name: f.name,
        size: formatBytes(f.length),
        path: f.path
      }));
      // We don't want to keep it seeding/downloading yet
      try { client.remove(magnet); } catch(e) {}
      res.json({ name: infoTask.name, files });
    });
  } catch (err) {
    console.error('Inspection failed:', err);
    res.status(500).json({ error: 'Failed to inspect torrent' });
  }
});

app.post('/api/torrents', async (req, res) => {
  const db = loadDB();
  const { title, magnetLink, downloadUrl, size, indexer, type } = req.body;

  // Check if already downloading (or completed)
  const exists = db.torrentTasks.find((t: TorrentTask) => t.magnetLink === (magnetLink || downloadUrl));
  if (exists) {
    return res.json(exists);
  }

  const isAudio = type === 'audiobook' || title.toLowerCase().includes('audiobook') || title.toLowerCase().includes('mp3') || title.toLowerCase().includes('m4b');
  const downloadsDir = path.join(DATA_DIR, 'downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  // Handle Direct Download (e.g. LibGen)
  if (downloadUrl) {
    const newTask: TorrentTask = {
        id: `task-${Date.now()}`,
        name: title,
        size: size || '2.1 MB',
        progress: 0,
        downloadSpeed: 'Calculating...',
        uploadSpeed: '0 KB/s',
        eta: 'Calculating...',
        status: 'downloading',
        magnetLink: downloadUrl, // Using this as unique key
        indexer: indexer || 'Direct Download',
        files: [{ name: title, size: size || '2.1 MB', progress: 0, type: isAudio ? 'audio' : 'ebook' }]
    };

    db.torrentTasks.push(newTask);
    saveDB(db);
    res.json(newTask);

    // Start download in background
    (async () => {
        try {
            console.log(`Resolving DDL for: ${title}`);
            const finalUrl = await resolveLibGenDownload(downloadUrl);
            if (!finalUrl) throw new Error('Could not resolve download link');

            const ext = title.match(/\[(.*)\]$/)?.[1]?.toLowerCase() || (isAudio ? 'mp3' : 'epub');
            const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
            const dest = path.join(downloadsDir, fileName);
            
            console.log(`Downloading real file to: ${dest}`);
            const success = await downloadDirectFile(finalUrl, dest);
            
            if (success) {
                const innerDb = loadDB();
                const task = innerDb.torrentTasks.find((t: any) => t.id === newTask.id);
                if (task) {
                    task.progress = 100;
                    task.status = 'completed';
                    task.downloadSpeed = '0 KB/s';
                    
                    const enrichedBook = await enrichTorrentTaskWithMetadata(title, isAudio, size, indexer);
                    
                    let realChapters = [];
                    if (!isAudio && dest.endsWith('.epub')) {
                        console.log(`Extracting text from real file: ${dest}`);
                        realChapters = await extractEpubContent(dest);
                    }

                    const newBook: Book = {
                        ...enrichedBook,
                        id: `book-${Date.now()}`,
                        isDownloaded: true,
                        filePath: dest,
                        fileUrl: `/api/files/${fileName}`,
                        chapters: realChapters.length > 0 ? realChapters : enrichedBook.chapters
                    };
                    innerDb.books.push(newBook);
                    innerDb.logs.push({
                        id: `log-${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        level: 'success',
                        source: 'server',
                        message: `Direct Download [${title}] completed and verified. File saved locally.`
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
                    message: `Direct download failed for [${title}]: ${err.message}`
                });
                saveDB(innerDb);
            }
        }
    })();
    return;
  }

  // Real Torrent Initiation
  try {
    const downloadBase = path.join(DATA_DIR, 'downloads');
    client.add(magnetLink, { path: path.join(downloadBase, title) }, async (torrent: any) => {
      console.log('Client is downloading:', torrent.infoHash);
      
      const db = loadDB();
      const task = db.torrentTasks.find((t: any) => t.magnetLink === magnetLink);
      if (task) {
        task.infoHash = torrent.infoHash;
        // Pre-populate files list from real metadata
        task.files = torrent.files.map((f: any) => ({
          name: f.name,
          size: (f.length / (1024 * 1024)).toFixed(1) + ' MB',
          progress: 0,
          type: f.name.toLowerCase().endsWith('.mp3') ? 'audio' : (f.name.toLowerCase().endsWith('.epub') ? 'ebook' : 'other')
        }));
        saveDB(db);
      }

      torrent.on('error', (err: any) => {
        console.error('Torrent internal error:', err);
      });
    });
  } catch (err) {
    console.error('Failed to add torrent:', err);
    return res.status(400).json({ error: 'Invalid magnet link' });
  }

  // Launch metadata and generative content enrichment asynchronously
  let enrichedBook: Book | undefined;
  try {
    enrichedBook = await enrichTorrentTaskWithMetadata(title, isAudio, size || 'Calculating...', indexer || 'Bookrr Indexer');
  } catch (err) {
    console.error('Failed to pre-enrich torrent metadata:', err);
  }

  const newTask: TorrentTask = {
    id: `task-${Date.now()}`,
    name: title,
    size: size || 'Calculating...',
    progress: 0,
    downloadSpeed: '0 KB/s',
    uploadSpeed: '0 KB/s',
    eta: 'Starting...',
    status: 'downloading',
    magnetLink: magnetLink,
    indexer: indexer || 'Bookrr (Native Aggregator)',
    files: [
      {
        name: isAudio ? 'Audio Content' : 'E-Book Content',
        size: size || '...',
        progress: 0,
        type: isAudio ? 'audio' : 'ebook'
      }
    ],
    enrichedBook
  };

  db.torrentTasks.push(newTask);
  db.logs.push({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'webtor',
    message: `Initiated real torrent stream: [${title}] via WebTorrent client.`
  });

  saveDB(db);
  res.json(newTask);
});

// Delete torrent task
app.delete('/api/torrents/:id', (req, res) => {
  const db = loadDB();
  const index = db.torrentTasks.findIndex((t: TorrentTask) => t.id === req.params.id);
  if (index !== -1) {
    const name = db.torrentTasks[index].name;
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

// route to serve downloaded files
app.get('/api/files/:name', (req, res) => {
    const fileName = req.params.name;
    const downloadsDir = path.join(DATA_DIR, 'downloads');
    
    // Check root base first
    const rootPath = path.join(downloadsDir, fileName);
    if (fs.existsSync(rootPath) && fs.lstatSync(rootPath).isFile()) {
        res.setHeader('Content-Type', fileName.endsWith('.mp3') ? 'audio/mpeg' : 'application/epub+zip');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Accept-Ranges', 'bytes');
        return res.sendFile(rootPath);
    }
    
    // Recursive search
    const findFile = (dir: string): string | null => {
        if (!fs.existsSync(dir)) return null;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.lstatSync(fullPath).isDirectory()) {
                const found = findFile(fullPath);
                if (found) return found;
            } else if (item === fileName) {
                return fullPath;
            }
        }
        return null;
    };

    try {
        const foundPath = findFile(downloadsDir);
        if (foundPath) {
            res.setHeader('Content-Type', fileName.endsWith('.mp3') ? 'audio/mpeg' : 'application/epub+zip');
            res.setHeader('Accept-Ranges', 'bytes');
            res.sendFile(foundPath);
        } else {
            res.status(404).send('File not found in local library');
        }
    } catch (err) {
        console.error('File search error:', err);
        res.status(500).send('Error searching filesystem');
    }
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
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bookrr Server running on http://localhost:${PORT}`);
  });
}

startServer();
