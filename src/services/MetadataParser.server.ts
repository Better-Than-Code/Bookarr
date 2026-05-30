/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Book } from '../types';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import EPub from 'epub';
import * as mm from 'music-metadata';

export async function getMetadataFromFile(filePath: string): Promise<Partial<Book>> {
  let title = '';
  let author = '';
  let description = '';
  let chapters: any[] = [];
  let duration = 0;

  try {
    const baseName = path.basename(filePath);
    const nameWithoutExt = baseName.replace(/\.[^/.]+$/, "");

    // Try pattern: "Title - Author" or "Author - Title"
    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      if (parts.length >= 2) {
        // Simple heuristic: Usually we map as "Title" and "Author"
        author = parts[1].trim();
        title = parts[0].trim();
        
        // Remove years or bracketed text like (2011) from the guessed title/author
        title = title.replace(/\s*[\[\(].*[\]\)]\s*/g, '').trim();
        author = author.replace(/\s*[\[\(].*[\]\)]\s*/g, '').trim();
      }
    } else if (nameWithoutExt.includes('-')) {
      const parts = nameWithoutExt.split('-');
      if (parts.length >= 2) {
        author = parts[1].trim();
        title = parts[0].trim();
        title = title.replace(/\s*[\[\(].*[\]\)]\s*/g, '').trim();
        author = author.replace(/\s*[\[\(].*[\]\)]\s*/g, '').trim();
      }
    }

    if (!title) {
      title = nameWithoutExt.replace(/[^a-zA-Z0-9\s]/gi, ' ').trim() || nameWithoutExt;
    }
    if (!author) {
      author = 'Unknown Author';
    }
  } catch (e) {
    console.error('Error parsing filename-based metadata:', e);
  }

  const isAudio = filePath.toLowerCase().match(/\.(mp3|m4b|m4a|aac|ogg|flac|wav)$/);

  if (isAudio) {
    try {
      const metadata = await mm.parseFile(filePath, { duration: true, skipCovers: true, includeChapters: true });
      if (metadata.common.title) title = metadata.common.title;
      if (metadata.common.artist) author = metadata.common.artist;
      if (metadata.common.comment && metadata.common.comment.length > 0) {
        description = metadata.common.comment.join('\n');
      }
      
      if (metadata.format.duration) {
        duration = metadata.format.duration;
      }

      // Extract chapters if present in M4B / MP4 metadata or ID3 CHAP frames
      // music-metadata exposes chapters via metadata.format.chapters
      const fileChapters = metadata.format?.chapters || [];
      if (Array.isArray(fileChapters) && fileChapters.length > 0) {
        let fallbackStartTime = 0;
        chapters = fileChapters.map((ch: any, idx: number) => {
          let chStart = fallbackStartTime;
          let chDuration = 0;

          if (ch.time !== undefined) {
             chStart = ch.time;
          } else if (ch.start !== undefined && ch.timeScale !== undefined) {
             chStart = ch.start / ch.timeScale;
             if (ch.end) {
                 chDuration = (ch.end / ch.timeScale) - chStart;
             }
          } else if (ch.sampleOffset !== undefined && metadata.format.sampleRate) {
             chStart = ch.sampleOffset / metadata.format.sampleRate;
          } else if (ch.start !== undefined && !ch.timeScale) {
             // For ID3v2 chapters (mutagen), start is often in milliseconds!
             chStart = ch.start / 1000;
             if (ch.end) {
                 chDuration = (ch.end / 1000) - chStart;
             }
          }

          const chapterObj = {
            id: `ch-${Date.now()}-${idx}`,
            title: ch.title || `Chapter ${idx + 1}`,
            start: chStart,
            end: chStart + chDuration,
            url: `/api/files/${encodeURIComponent(path.basename(filePath))}#t=${chStart}`
          };
          fallbackStartTime = chStart + chDuration;
          return chapterObj;
        });

        // Ensure sequential chapter ends if they were zero
        for (let i = 0; i < chapters.length; i++) {
            if (!chapters[i].end || chapters[i].end <= chapters[i].start) {
                if (i < chapters.length - 1) {
                    chapters[i].end = chapters[i+1].start;
                } else {
                    chapters[i].end = duration > chapters[i].start ? duration : chapters[i].start + 3600;
                }
            }
        }
      }
    } catch (e) {
      console.error('Failed to parse audio metadata:', e);
    }
  }

  if (filePath.toLowerCase().endsWith('.epub')) {
    const epubMeta = await new Promise<Partial<Book>>((resolve) => {
      try {
        const EPubClass = (EPub as any).default || (EPub as any).EPub || EPub;
        const epub = new EPubClass(filePath) as any;
        epub.on('end', () => {
          resolve({
            title: epub.metadata.title,
            author: epub.metadata.creator,
            description: epub.metadata.description,
          });
        });
        epub.on('error', () => {
          resolve({});
        });
        epub.parse();
      } catch (e) {
        resolve({});
      }
    });

    if (epubMeta.title) title = epubMeta.title;
    if (epubMeta.author) author = epubMeta.author;
    if (epubMeta.description) description = epubMeta.description;
  }

  // We will return everything we found!
  const result: Partial<Book> = {
    title: title || 'Unknown Title',
    author: author || 'Unknown Author',
  };

  if (description) result.description = description;
  if (duration > 0) result.duration = duration;
  if (chapters && chapters.length > 0) result.chapters = chapters;

  return result;
}
