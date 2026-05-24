/**
 * MetadataService.ts
 * Real service to enrich search results with book/author metadata using OpenLibrary and Google Books.
 */
import axios from 'axios';
import { compareTwoStrings } from 'string-similarity';
import { Book, TorrentSearchResult } from '../types';

interface MetadataCandidate extends Partial<Book> {
  score: number;
  source: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Simple in-memory cache to prevent hammered APIs for the same query
const metadataCache = new Map<string, any>();
const providerCooldowns = new Map<string, number>();

async function fetchWithRetry(url: string, providerName: string, retries = 2): Promise<any> {
    if (metadataCache.has(url)) return metadataCache.get(url);
    
    // Check if provider is in cooldown
    const cooldownUntil = providerCooldowns.get(providerName) || 0;
    if (Date.now() < cooldownUntil) {
        throw new Error(`${providerName} is cooling down due to previous rate limits`);
    }

    try {
        const fetchWithRetry = async (url: string, options: any, retries = 2): Promise<any> => {
            try {
                return await axios.get(url, options);
            } catch (err: any) {
                if (retries > 0 && (err.code === 'ECONNABORTED' || err.message.includes('timeout') || err.response?.status >= 500)) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return fetchWithRetry(url, options, retries - 1);
                }
                throw err;
            }
        };

        const res = await fetchWithRetry(url, {
            timeout: 300000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://google.com'
            }
        });
        metadataCache.set(url, res.data);
        return res.data;
    } catch (err: any) {
        const status = err.response?.status;
        const isTimeout = err.code === 'ECONNABORTED' || err.message.includes('timeout');

        // If 429, set cooldown for 2 minutes to be respectful and safe
        if (status === 429) {
            console.error(`[Metadata] ${providerName} hit 429 rate limit. Setting 1-minute cooldown.`);
            providerCooldowns.set(providerName, Date.now() + 60000);
            throw new Error(`${providerName} rate limited`);
        }

        if (isTimeout && retries > 0) {
            const waitTime = (3 - retries) * 4000 + Math.random() * 500;
            console.warn(`[Metadata] ${providerName} timed out. Retrying in ${Math.round(waitTime)}ms...`);
            await sleep(waitTime);
            return fetchWithRetry(url, providerName, retries - 1);
        }

        console.error(`[Metadata] ${providerName} fetch failed: ${status || err.message}`);
        throw new Error(`${providerName} unavailable`);
    }
}

export async function enrichMetadata(result: TorrentSearchResult, returnAll: boolean = false): Promise<any> {
    const startTime = Date.now();
    const MAX_PROCESS_TIME = 25000; // 25s hard limit for the whole enrichment

    // 1. Aggressive cleaning to find the actual "Book Title"
    let cleanTitle = result.title
        .replace(/\b(ebook|pdf|epub|mobi|azw3|audiobook|mp3|m4b|flac|aac|unabridged|retail|web|h128|h64|x264|1080p|720p|vppv|hq|brrip|dvd|mp4|aac2|ac3|multi|v\d+)\b/gi, '')
        .replace(/\b(edition|revised|expanded|collection|complete|set|read by|readaloud|narrated by)\b/gi, '')
        .replace(/[\[\(\{\]\)\}]/g, ' ')
        .replace(/[^a-zA-Z0-9' -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Primary query + any curated content if available
    const queryVariants = Array.from(new Set([cleanTitle, result.title])).filter(q => q.length > 2);

    const candidates: MetadataCandidate[] = [];

    const providers = [
        {
            name: 'OpenLibrary',
            search: async (q: string) => {
                const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5`;
                const data = await fetchWithRetry(url, 'OpenLibrary');
                if (!data.docs) return [];
                return data.docs.map((doc: any) => ({
                    title: doc.title,
                    author: doc.author_name?.join(', ') || 'Unknown Author',
                    description: Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : (doc.first_sentence || ''),
                    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
                    genres: doc.subject?.slice(0, 3) || ['General'],
                    year: doc.first_publish_year?.toString(),
                    publisher: doc.publisher?.[0],
                    pages: doc.number_of_pages_median,
                    isbn: doc.isbn?.[0],
                    type: 'ebook'
                }));
            }
        },
        {
            name: 'iTunes',
            search: async (q: string) => {
                // iTunes is extremely stable and great for audiobook/ebook metadata
                const entity = result.type === 'audiobook' ? 'audiobook' : 'ebook';
                const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=${entity}&limit=5`;
                const data = await fetchWithRetry(url, 'iTunes');
                if (!data.results) return [];
                return data.results.map((item: any) => ({
                    title: item.collectionName || item.trackName,
                    author: item.artistName,
                    description: item.longDescription || item.description || '',
                    coverUrl: item.artworkUrl100?.replace('100x100bb', '600x600bb'),
                    genres: item.primaryGenreName ? [item.primaryGenreName] : ['General'],
                    year: item.releaseDate?.split('-')[0],
                    publisher: item.copyright,
                    duration: item.trackTimeMillis,
                    type: result.type // Inherit requested type
                }));
            }
        },
        {
            name: 'Google Books / Amazon',
            search: async (q: string) => {
                // Public volume search - includes many Amazon listed books
                const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`;
                const data = await fetchWithRetry(url, 'Google Books / Amazon');
                if (!data.items) return [];
                return data.items.map((item: any) => {
                    const info = item.volumeInfo;
                    const identifiers = info.industryIdentifiers || [];
                    const isbn13 = identifiers.find((i: any) => i.type === 'ISBN_13')?.identifier;
                    const isbn10 = identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier;
                    const isbn = isbn13 || isbn10 || identifiers[0]?.identifier;

                    return {
                        title: info.title,
                        author: info.authors?.join(', ') || 'Unknown Author',
                        description: info.description || info.subtitle || '',
                        coverUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:').replace('&edge=curl', ''),
                        genres: info.categories || ['General'],
                        year: info.publishedDate?.split('-')[0],
                        publisher: info.publisher,
                        pages: info.pageCount,
                        isbn: isbn,
                        type: 'ebook' // Usually ebooks
                    };
                });
            }
        }
    ];

    // Try variants.
    for (const query of queryVariants.slice(0, 2)) {
        // Stop if we've taken too long
        if (Date.now() - startTime > MAX_PROCESS_TIME) break;

        // Run all providers for this query in parallel
        try {
            const providerPromises = providers.map(async (provider, index) => {
                // Pre-check cooldown to avoid even attempting and logging errors
                const coolingUntil = providerCooldowns.get(provider.name) || 0;
                if (Date.now() < coolingUntil) return;

                try {
                    // Small jitter stagger based on index (0ms, 600ms, etc)
                    await sleep(index * 600 + Math.random() * 200); 
                    
                    const results = await provider.search(query);
                    for (const res of results) {
                        const titleScore = compareTwoStrings(query.toLowerCase(), (res.title || '').toLowerCase());
                        const authorMatch = query.toLowerCase().includes(res.author?.split(',')[0].toLowerCase().trim()) ? 0.2 : 0;
                        
                        // Clean description if it's HTML
                        let finalDesc = res.description || '';
                        if (finalDesc.includes('<') && finalDesc.includes('>')) {
                            finalDesc = finalDesc.replace(/<[^>]*>?/gm, '');
                        }

                        // Type match bonus/penalty
                        let typeScore = 0;
                        if (res.type && res.type === result.type) {
                            typeScore = 0.1;
                        } else if (res.type && res.type !== result.type) {
                            typeScore = -0.1;
                        }

                        candidates.push({ ...res, description: finalDesc, score: titleScore + authorMatch + typeScore, source: provider.name });
                    }
                } catch (err: any) {
                    // If it's a known rate limit, cooldown, or timeout, log more carefully
                    const isCoolingDown = err.message.includes('cooling down') || err.message.includes('rate limit');
                    if (isCoolingDown || err.message.includes('timeout')) {
                        console.warn(`[Metadata] Provider ${provider.name} currently limited: ${err.message}`);
                    } else {
                        console.warn(`[Metadata] Provider ${provider.name} failed: ${err.message}`);
                    }
                }
            });

            await Promise.all(providerPromises);
        } catch (err) {
            // Variant failed
        }

        // If we found any strong candidates, don't try the next variant
        if (candidates.some(c => c.score > 0.8)) break;
        
        // Small gap between variants if first one didn't yield results
        await sleep(1000);
    }

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    if (returnAll) return candidates;

    if (candidates.length > 0) {
    let best = candidates[0];

    // Targeted ISBN enrichment if description is weak but ISBN is present
    if (best.isbn && (!best.description || best.description.length < 50)) {
        try {
            const isbnUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${best.isbn}&format=json&jscmd=data`;
            const data = await fetchWithRetry(isbnUrl, 'OpenLibrary ISBN');
            const bookKey = `ISBN:${best.isbn}`;
            if (data[bookKey]) {
                const details = data[bookKey];
                best.description = details.notes || details.summary || (Array.isArray(details.excerpts) ? details.excerpts[0]?.text : undefined) || best.description;
                best.publisher = details.publishers?.[0]?.name || best.publisher;
                best.pages = details.number_of_pages || best.pages;
                if (!best.coverUrl && details.cover?.large) {
                    best.coverUrl = details.cover.large;
                }
            }
        } catch (e) {
            // ISBN lookup failed, skip
        }
    }

    return {
      ...best,
      description: best.description?.length > 1500 ? best.description.substring(0, 1500) + '...' : best.description,
      coverUrl: best.coverUrl || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=400',
    };
  }

  // Final fallback
  return {
    title: cleanTitle,
    author: 'Unknown Author',
    description: 'No metadata found. You can edit this manually.',
    type: result.type,
    coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=400'
  };
}

