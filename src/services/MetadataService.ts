/**
 * MetadataService.ts
 * Real service to enrich search results with book/author metadata using OpenLibrary.
 */
import { Book } from '../types';
import { TorrentSearchResult } from '../types';

export async function enrichMetadata(result: TorrentSearchResult): Promise<Partial<Book>> {
  const cleanTitle = result.title
    .replace(/\[Audiobook\]|ePub|MP3|M4B|Unabridged|Read by.*/gi, '')
    .trim();

  try {
    const searchUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanTitle)}&limit=1`;
    const response = await fetch(searchUrl);
    
    if (response.ok) {
      const data = await response.json() as any;
      if (data.docs && data.docs.length > 0) {
        const doc = data.docs[0];
        return {
          title: doc.title || result.title,
          author: doc.author_name ? doc.author_name[0] : 'Unknown Author',
          description: doc.first_sentence ? doc.first_sentence : `A book matching your search for ${cleanTitle}. Found via indexer ${result.indexer}.`,
          coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=200&h=300',
          genres: doc.subject ? doc.subject.slice(0, 3) : ['General'],
          type: result.type,
          pages: doc.number_of_pages_median || (result.type === 'ebook' ? 250 : undefined),
          duration: result.type === 'audiobook' ? 18000 : undefined,
        };
      }
    }
  } catch (error) {
    console.error('Metadata enrichment failed:', error);
  }

  // Minimal non-simulated fallback
  return {
    title: cleanTitle,
    author: 'Metadata Search Failed',
    description: `Metadata could not be automatically retrieved for this item. Source: ${result.indexer}`,
    type: result.type,
  };
}
