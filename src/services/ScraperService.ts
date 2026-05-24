import { TorrentSearchResult, IndexerSettings } from '../types';
import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false,
  minVersion: 'TLSv1.2',
  ciphers: 'DEFAULT'
});

async function getMagnetLink(link: string, baseUrl: string, indexerName: string): Promise<string> {
  try {
    const detailsUrl = link.startsWith('http') ? link : `${baseUrl}${link.startsWith('/') ? '' : '/'}${link}`;
    const response = await axios.get(detailsUrl, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': `${baseUrl}/`
      },
      timeout: 10000,
      validateStatus: (status) => status === 200 || status === 403
    });

    if (response.status === 403 || response.data.includes('Just a moment')) {
      console.warn(`${indexerName} details page blocked by Cloudflare (403)`);
      return '';
    }

    const $ = cheerio.load(response.data);
    const magnet = $('a[href^="magnet:"]').attr('href');
    return magnet || '';
  } catch (err) {
    console.error('Error fetching magnet link for', link, err);
    return '';
  }
}

export async function searchNative(indexer: IndexerSettings, query: string, type: 'ebook' | 'audiobook'): Promise<TorrentSearchResult[]> {
  const searchTerm = query;

  if (indexer.name === '1337x') {
    const mirrors = [
      indexer.url,
      'https://1337x.to',
      'https://www.1337x.to',
      'https://1337x.st',
      'https://1337x.tw',
      'https://1337xto.to'
    ];
    
    for (const mirror of mirrors) {
      if (!mirror) continue;
      const cleanMirror = mirror.replace(/\/$/, '');
      try {
        const encodedQuery = encodeURIComponent(searchTerm);
        // Category search: Books is 50, Audiobooks is 52 (usually under 1337x)
        // 1337x category search format: /category-search/query/category/1/
        const categoryMatch = type === 'ebook' ? 'Books' : 'Audiobooks';
        const url = `${cleanMirror}/category-search/${encodedQuery}/${categoryMatch}/1/`;
        
        let response = await axios.get(url, {
          httpsAgent: agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': `${cleanMirror}/`
          },
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status === 200 || status === 403 || status === 404
        });
        
        if (response.status === 404 || (response.status === 200 && !response.data.includes('table-list'))) {
          // Fallback to general search if category search fails
          const generalUrl = `${cleanMirror}/search/${encodedQuery}/1/`;
          const generalResponse = await axios.get(generalUrl, {
            httpsAgent: agent,
            headers: response.config.headers,
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: (status) => status === 200 || status === 403 || status === 404
          });
          if (generalResponse.status === 200) {
            response = generalResponse;
          }
        }

        if (response.status === 403 || response.data.includes('Just a moment')) {
          continue;
        }

        const $ = cheerio.load(response.data);
        const rows = $('table.table-list tbody tr').get();
        if (rows.length === 0) continue;

        const promises = rows.slice(0, 10).map(async (element) => {
          const title = $(element).find('td.coll-1 a').eq(1).text();
          const link = $(element).find('td.coll-1 a').eq(1).attr('href');
          const size = $(element).find('td.coll-4').text().split(' ')[0] + ' ' + $(element).find('td.coll-4').find('span').remove().end().text().trim().split(' ')[0];
          const seeds = parseInt($(element).find('td.coll-2').text()) || 0;
          const peers = parseInt($(element).find('td.coll-3').text()) || 0;

          if (title && link) {
            const magnetLink = await getMagnetLink(link, cleanMirror, '1337x');
            return {
              id: `native-1337x-${link.split('/').pop()}-${Math.random().toString(36).substring(2, 5)}`,
              title,
              size: size.replace(/\s+/g, ' ').trim() || 'N/A',
              seeds,
              peers,
              magnetLink,
              indexer: '1337x',
              type: type,
              publishDate: new Date().toISOString().split('T')[0]
            };
          }
          return null;
        });

        const resolvedResults = await Promise.all(promises);
        const filtered = resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
        if (filtered.length > 0) return filtered;
      } catch (err: any) {
        if (err.code === 'ERR_FR_TOO_MANY_REDIRECTS') {
          console.error(`Redirect loop on 1337x mirror ${cleanMirror}`);
        } else {
          console.error(`Error scraping 1337x mirror ${cleanMirror}:`, err.message);
        }
      }
    }
  }

  if (indexer.name === 'LimeTorrents') {
    try {
      const encodedQuery = encodeURIComponent(searchTerm);
      const category = type === 'ebook' ? 'ebooks' : 'audiobooks';
      const url = `${indexer.url.replace(/\/$/, '')}/search/${category}/${encodedQuery}/1/`;
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Referer': `${indexer.url}/`
        },
        timeout: 10000,
        maxRedirects: 2
      });

      const $ = cheerio.load(response.data);
      const rows = $('.table-list tbody tr').get();
      // Skip the first row if it's the header
      const startIdx = rows[0] && $(rows[0]).find('th').length > 0 ? 1 : 0;
      
      const promises = rows.slice(startIdx, startIdx + 10).map(async (element) => {
        const titleLink = $(element).find('.tdleft a').last();
        const title = titleLink.text().trim();
        const link = titleLink.attr('href');
        const size = $(element).find('td').eq(2).text().trim();
        const seeds = parseInt($(element).find('.tdseed').text()) || 0;
        const peers = parseInt($(element).find('.tdleech').text()) || 0;

        if (title && link) {
          const magnetLink = await getMagnetLink(link, indexer.url, 'LimeTorrents');
          return {
            id: `native-lime-${link.split('/').pop()}-${Math.random().toString(36).substring(2, 5)}`,
            title,
            size: size || 'N/A',
            seeds,
            peers,
            magnetLink,
            indexer: 'LimeTorrents',
            type: type,
            publishDate: new Date().toISOString().split('T')[0]
          };
        }
        return null;
      });

      const resolvedResults = await Promise.all(promises);
      return resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
    } catch (err: any) {
      console.error('Error scraping LimeTorrents:', err.message);
    }
  }

  if (indexer.name === 'TorrentDownloads') {
    try {
      const encodedQuery = encodeURIComponent(searchTerm);
      const categoryId = 2; // 2 is Books/Ebooks
      const url = `${indexer.url.replace(/\/$/, '')}/search/?search=${encodedQuery}&s_cat=${categoryId}`;
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': `${indexer.url}/`
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const rows = $('.inner_container table tr').get();
      const startIdx = rows.findIndex(row => $(row).find('th').length > 0) + 1;
      
      const promises = rows.slice(startIdx, startIdx + 10).map(async (element) => {
        const titleLink = $(element).find('td:nth-child(1) a').eq(0);
        const title = titleLink.text().trim();
        const link = titleLink.attr('href');
        const size = $(element).find('td:nth-child(3)').text().trim();
        const seeds = parseInt($(element).find('td:nth-child(4)').text()) || 0;
        const peers = parseInt($(element).find('td:nth-child(5)').text()) || 0;

        if (title && link) {
          const magnetLink = await getMagnetLink(link, indexer.url, 'TorrentDownloads');
          return {
            id: `native-td-${link.split('/').pop()}-${Math.random().toString(36).substring(2, 5)}`,
            title,
            size: size || 'N/A',
            seeds,
            peers,
            magnetLink,
            indexer: 'TorrentDownloads',
            type: type,
            publishDate: new Date().toISOString().split('T')[0]
          };
        }
        return null;
      });

      const resolvedResults = await Promise.all(promises);
      return resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
    } catch (err: any) {
      console.error('Error scraping TorrentDownloads:', err.message);
    }
  }

  if (indexer.name === 'GloTorrents') {
    try {
      const encodedQuery = encodeURIComponent(searchTerm);
      // Category 51: Books, cat=0 is all
      const categoryId = type === 'ebook' ? 51 : 52; // Assuming 52 for audiobooks or similar
      const url = `${indexer.url.replace(/\/$/, '')}/search_results.php?search=${encodedQuery}&cat=${categoryId}&incldead=0&freeleech=0&inc_video_bitrate=0&inc_audio_bitrate=0`;
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': `${indexer.url}/`
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const rows = $('table.ttable_headertrans tr').get();
      
      const promises = rows.slice(1, 11).map(async (element) => {
        const titleCell = $(element).find('td').eq(1);
        const titleLink = titleCell.find('a').first();
        const title = titleLink.attr('title') || titleLink.text().trim();
        const link = titleLink.attr('href');
        
        const magnetLink = $(element).find('a[href^="magnet:"]').attr('href');
        const size = $(element).find('td').eq(4).text().trim();
        const seedsIdx = 5;
        const peersIdx = 6;
        const seeds = parseInt($(element).find('td').eq(seedsIdx).text()) || 0;
        const peers = parseInt($(element).find('td').eq(peersIdx).text()) || 0;

        if (title && (link || magnetLink)) {
          const finalMagnet = magnetLink || (link ? await getMagnetLink(link, indexer.url, 'GloTorrents') : '');
          return {
            id: `native-glo-${link?.split('id=')?.pop() || Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substring(2, 5)}`,
            title,
            size: size || 'N/A',
            seeds,
            peers,
            magnetLink: finalMagnet,
            indexer: 'GloTorrents',
            type: type,
            publishDate: new Date().toISOString().split('T')[0]
          };
        }
        return null;
      });

      const resolvedResults = await Promise.all(promises);
      return resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
    } catch (err: any) {
      console.error('Error scraping GloTorrents:', err.message);
    }
  }

  if (indexer.name === 'Kickass') {
    try {
      const categoryAppender = type === 'ebook' ? ' category:books' : ' category:audiobooks';
      const encodedQuery = encodeURIComponent(searchTerm + categoryAppender);
      const url = `${indexer.url.replace(/\/$/, '')}/usearch/${encodedQuery}/`;
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `${indexer.url}/`
        },
        timeout: 12000,
        validateStatus: (status) => status === 200 || status === 403
      });

      if (response.status === 403 || response.data.includes('Just a moment')) {
        console.warn(`Kickass blocked by Cloudflare (403) at ${indexer.url}`);
        return [];
      }

      const $ = cheerio.load(response.data);
      const rows = $('tr[id^="torrent_"]').get();
      
      const promises = rows.slice(0, 10).map(async (element) => {
        const titleLink = $(element).find('.cellMainLink');
        const title = titleLink.text().trim();
        const link = titleLink.attr('href');
        const magnetLink = $(element).find('a[title="Torrent magnet link"]').attr('href');
        const size = $(element).find('td').eq(1).text().trim();
        const seeds = parseInt($(element).find('td').eq(3).text()) || 0;
        const peers = parseInt($(element).find('td').eq(4).text()) || 0;

        if (title && (link || magnetLink)) {
          const finalMagnet = magnetLink || (link ? await getMagnetLink(link, indexer.url, 'Kickass') : '');
          return {
            id: `native-ka-${link?.split('/').pop() || Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substring(2, 5)}`,
            title,
            size: size || 'N/A',
            seeds,
            peers,
            magnetLink: finalMagnet,
            indexer: 'Kickass',
            type: type,
            publishDate: new Date().toISOString().split('T')[0]
          };
        }
        return null;
      });

      const resolvedResults = await Promise.all(promises);
      return resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
    } catch (err: any) {
      console.error('Error scraping Kickass:', err.message);
    }
  }

  if (indexer.name === 'The Pirate Bay') {
    const mirrors = [
      indexer.url,
      'https://thepiratebay.org',
      'https://thepiratebay10.org',
      'https://tpb.party',
      'https://thepiratebay.zone'
    ];

    for (const mirror of mirrors) {
      if (!mirror) continue;
      const cleanMirror = mirror.replace(/\/$/, '');
      try {
        const encodedQuery = encodeURIComponent(searchTerm);
        // Category 102: Audio books, 601: E-books
        const categoryId = type === 'ebook' ? 601 : 102;
        const url = `${cleanMirror}/search/${encodedQuery}/1/99/${categoryId}`;
        const response = await axios.get(url, {
          httpsAgent: agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          },
          timeout: 10000,
          validateStatus: (status) => status === 200 || status === 403
        });

        if (response.status === 403 || response.data.includes('Just a moment')) continue;

        const $ = cheerio.load(response.data);
        const rows = $('table#searchResult tr').get();
        if (rows.length === 0) continue;

        const promises = rows.slice(1, 11).map(async (element) => {
          const titleLink = $(element).find('.detLink');
          const title = titleLink.text().trim();
          const link = titleLink.attr('href');
          const magnetLink = $(element).find('a[href^="magnet:"]').attr('href');
          const descText = $(element).find('font.detDesc').text();
          const sizeMatch = descText.match(/Size (.*?),/);
          const size = sizeMatch ? sizeMatch[1] : 'N/A';
          const seeds = parseInt($(element).find('td').eq(2).text()) || 0;
          const peers = parseInt($(element).find('td').eq(3).text()) || 0;

          if (title && (link || magnetLink)) {
            return {
              id: `native-tpb-${link?.split('/').pop() || Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substring(2, 5)}`,
              title,
              size: size.trim(),
              seeds,
              peers,
              magnetLink: magnetLink || '',
              indexer: 'The Pirate Bay',
              type: type,
              publishDate: new Date().toISOString().split('T')[0]
            };
          }
          return null;
        });

        const resolvedResults = await Promise.all(promises);
        const filtered = resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
        if (filtered.length > 0) return filtered;
      } catch (err: any) {
        console.error(`Error scraping TPB mirror ${cleanMirror}:`, err.message);
      }
    }
  }
  
  if (indexer.name === 'SolidTorrents') {
    try {
      const encodedQuery = encodeURIComponent(searchTerm);
      const category = type === 'ebook' ? 'Books' : 'Audiobooks';
      const url = `${indexer.url.replace(/\/$/, '')}/search?q=${encodedQuery}&category=${category}`;
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': `${indexer.url}/`
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const rows = $('.search-result').get();
      
      const promises = rows.slice(0, 10).map(async (element) => {
        const titleLink = $(element).find('a.title');
        const title = titleLink.text().trim();
        const link = titleLink.attr('href');
        const magnetLink = $(element).find('a[href^="magnet:"]').attr('href');
        const stats = $(element).find('.stats').text();
        const sizeMatch = stats.match(/Size: ([\d.]+\s\w+)/);
        const seedsMatch = stats.match(/Seeds: (\d+)/);
        const peersMatch = stats.match(/Peers: (\d+)/);

        if (title && magnetLink) {
          return {
            id: `native-solid-${Math.random().toString(36).substr(2, 9)}`,
            title,
            size: sizeMatch ? sizeMatch[1] : 'N/A',
            seeds: seedsMatch ? parseInt(seedsMatch[1]) : 0,
            peers: peersMatch ? parseInt(peersMatch[1]) : 0,
            magnetLink,
            indexer: 'SolidTorrents',
            type: type,
            publishDate: new Date().toISOString().split('T')[0]
          };
        }
        return null;
      });

      const resolvedResults = await Promise.all(promises);
      return resolvedResults.filter((r): r is TorrentSearchResult => r !== null);
    } catch (err: any) {
      console.error('Error scraping SolidTorrents:', err.message);
    }
  }

  if (indexer.name === 'LibGen') {
    try {
      const encodedQuery = encodeURIComponent(searchTerm);
      // LibGen search: column=def is general search
      const url = `${indexer.url.replace(/\/$/, '')}/search.php?req=${encodedQuery}&column=def`;
      const response = await axios.get(url, {
        httpsAgent: agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        },
        timeout: 15000
      });

      const $ = cheerio.load(response.data);
      // LibGen results are typically in a table with class TableLibgen or just a table with rows
      const rows = $('table.c tbody tr').get();
      if (rows.length === 0) {
          // fallback for different mirrors
          const rowsAlt = $('table tr').get();
          if (rowsAlt.length > 5) {
              // ... continue with rowsAlt
          }
      }

      const results: TorrentSearchResult[] = [];
      
      // LibGen table headers: ID, Author(s), Title, Publisher, Year, Pages, Language, Size, Extension, Mirrors
      // We skip the first row (header)
      for (const row of rows.slice(1, 15)) {
          const cells = $(row).find('td');
          if (cells.length < 10) continue;

          const author = $(cells[1]).text().trim();
          const titleLink = $(cells[2]).find('a').first();
          const title = titleLink.text().trim() || $(cells[2]).text().trim();
          const size = $(cells[7]).text().trim();
          const extension = $(cells[8]).text().trim();
          
          // Mirror 1 is usually the first link in column 10 (9-indexed)
          const mirrorLink = $(cells[9]).find('a').first().attr('href');
          
          if (title && mirrorLink) {
              results.push({
                  id: `libgen-${Math.random().toString(36).substr(2, 9)}`,
                  title: `${author ? author + ' - ' : ''}${title} [${extension.toUpperCase()}]`,
                  size,
                  seeds: 100, // Simulated high availability for DDL
                  peers: 0,
                  magnetLink: '', // No magnet for DDL
                  downloadUrl: mirrorLink, // This is a mirror page link, not a direct file link yet
                  indexer: 'LibGen',
                  type: type,
                  publishDate: new Date().toISOString().split('T')[0]
              });
          }
      }
      return results;
    } catch (err: any) {
      console.error('Error scraping LibGen:', err.message);
    }
  }

  console.warn(`Native scraper not implemented for ${indexer.name}`);
  return [];
}
