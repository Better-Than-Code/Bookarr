/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Download, Database, Users, Calendar, ShieldCheck, HelpCircle } from 'lucide-react';
import { TorrentSearchResult, BookrrConfig, IndexerSettings } from '../types';

interface IndexerSearchProps {
  onAddTorrent: (torrent: TorrentSearchResult) => void;
  recentLogs: any[];
  searchState: {
    query: string;
    type: 'ebook' | 'audiobook';
    results: TorrentSearchResult[];
    searchedOnce: boolean;
  };
  setSearchState: React.Dispatch<React.SetStateAction<{
    query: string;
    type: 'ebook' | 'audiobook';
    results: TorrentSearchResult[];
    searchedOnce: boolean;
  }>>;
  config: BookrrConfig;
  indexers: IndexerSettings[];
  setActiveTab: (tab: string) => void;
}

export default function IndexerSearch({
  onAddTorrent,
  recentLogs,
  searchState,
  setSearchState,
  config,
  indexers,
  setActiveTab
}: IndexerSearchProps) {
  const [searchQuery, setSearchQuery] = useState(searchState.query);
  const [searchType, setSearchType] = useState<'ebook' | 'audiobook'>(searchState.type);
  const [searchResults, setSearchResults] = useState<TorrentSearchResult[]>(searchState.results);
  const [searchedOnce, setSearchedOnce] = useState(searchState.searchedOnce);
  
  // Debounce search query to prevent excessive calls
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery && searchQuery !== searchState.query) {
        handleSearch(searchQuery);
      }
    }, 600) as unknown as number; // Slightly longer for better typing flow
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Synchronize local search state with App-level state
  useEffect(() => {
    setSearchState({
      query: searchQuery,
      type: searchType,
      results: searchResults,
      searchedOnce
    });
  }, [searchQuery, searchType, searchResults, searchedOnce]);

  useEffect(() => {
    if (searchState.query && !searchState.searchedOnce) {
      handleSearch(searchState.query);
    }
  }, [searchState.query, searchState.searchedOnce]);

  const [enrichedData, setEnrichedData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [completedIndexers, setCompletedIndexers] = useState<string[]>([]);
  const [searchProgress, setSearchProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspectedFiles, setInspectedFiles] = useState<Record<string, any[]>>({});

  // Initial trigger to fetch defaults
  const handleSearch = async (e?: React.FormEvent | string) => {
    if (e && typeof e !== 'string') e.preventDefault();
    const queryVal = (typeof e === 'string' ? e : searchQuery).trim();
    
    // Only search if we have a real query
    if (!queryVal) return;

    // Avoid re-searching the same query if results are already present
    if (queryVal === searchState.query && searchedOnce && searchResults.length > 0 && !isLoading) {
        return;
    }

    setSearchedOnce(true);
    setIsLoading(true);
    setSearchProgress(5);
    setCompletedIndexers([]);
    setStatusMessage('Querying book repositories...');
    setSearchResults([]);
    setEnrichedData({});
    
    try {
      const response = await fetch(`/api/search/stream?q=${encodeURIComponent(queryVal)}&type=${searchType}`);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        let buffer = '';
        let resultCount = 0;
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          // Keep the last part in buffer because it might be incomplete
          buffer = blocks.pop() || '';
          
          for (const block of blocks) {
            if (block.startsWith('data: ')) {
              const data = block.slice(6);
              if (data === '[DONE]') {
                setSearchProgress(100);
                setStatusMessage(`Complete. Found ${resultCount} verified results.`);
                setTimeout(() => setIsLoading(false), 800);
                return;
              }
              try {
                const results = JSON.parse(data);
                
                if (results.status) {
                  setStatusMessage(results.status);
                  // Extract indexer name if possible
                  if (results.status.includes('Completed')) {
                     const parts = results.status.split(' ');
                     if (parts[0]) setCompletedIndexers(prev => [...prev, parts[0]]);
                  }
                  setSearchProgress(prev => Math.min(95, prev + 10));
                  continue;
                }

                if (Array.isArray(results) && results.length > 0 && results[0].error) {
                    console.error('Search error from indexer:', results[0].error);
                } else {
                    // Simple "fuzzy" logic: Filter results that don't match query keywords fairly well
                    const queryTerms = queryVal.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                    const filtered = results.filter(res => {
                        if (res.error) return true;
                        const title = res.title.toLowerCase();
                        if (queryTerms.length === 0) return true;
                        if (title.includes(queryVal.toLowerCase())) return true;
                        const matches = queryTerms.filter(term => title.includes(term));
                        return matches.length >= Math.ceil(queryTerms.length * 0.4);
                    });

                    if (filtered.length > 0) {
                        resultCount += filtered.length;
                        setSearchResults(prev => {
                          const combined = [...prev, ...filtered];
                          // Sort by quality score: seeds * 2 + peers + (size_weight)
                          return combined.sort((a, b) => {
                            const scoreA = (a.seeds * 3) + (a.peers * 1);
                            const scoreB = (b.seeds * 3) + (b.peers * 1);
                            return scoreB - scoreA;
                          });
                        });
                        setSearchProgress(prev => Math.min(98, prev + 5));
                        
                        // Prefetch top results metadata immediately
                        filtered.slice(0, 3).forEach(res => enrichResult(res));
                    }
                }
              } catch (e) {
                console.error('Failed to parse search message', e, block);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching torrent indexes', error);
      setStatusMessage('Connection failed. Indexer offline.');
    } finally {
      // Don't setIsLoading(false) here because [DONE] message should handle it
    }
  };

  const enrichResult = async (result: TorrentSearchResult) => {
      if (enrichedData[result.id]) return;
      try {
          const response = await fetch(`/api/metadata?resultId=${result.id}&title=${encodeURIComponent(result.title)}&type=${result.type}`);
          const data = await response.json();
          setEnrichedData(prev => ({ ...prev, [result.id]: data }));
      } catch (err) {
          console.error("Enrichment failed", err);
      }
  };

  const inspectTorrent = async (result: TorrentSearchResult) => {
    if (inspectedFiles[result.id]) {
        // Toggle off if already open
        setInspectedFiles(prev => {
            const next = { ...prev };
            delete next[result.id];
            return next;
        });
        return;
    }
    
    setInspectingId(result.id);
    try {
        const response = await fetch(`/api/torrents/inspect?magnet=${encodeURIComponent(result.magnetLink)}`);
        if (response.ok) {
            const data = await response.json();
            setInspectedFiles(prev => ({ ...prev, [result.id]: data.files }));
        } else {
            setStatusMessage('Failed to fetch file records. Tracker might be slow.');
            setTimeout(() => setStatusMessage(''), 3000);
        }
    } catch (err) {
        console.error('Inspection failed', err);
    } finally {
        setInspectingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="bg-[#151515] rounded-2xl p-6 border border-[#222]">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-amber-500/10 text-amber-400 font-semibold uppercase tracking-wider font-mono px-2 py-0.5 rounded">
              Bookrr Aggregator
            </span>
            <span className="text-xs text-neutral-500 font-mono">
              v2.0.0 (Native Scrapers)
            </span>
          </div>
          <h2 className="text-xl font-bold font-sans text-neutral-100 tracking-tight">
            Global Media Search
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Search native tracker indexers simultaneously for audiobooks and e-books. All results are enriched via OpenLibrary and sent directly to local storage.
          </p>

          {/* Prompt Form */}
          <form onSubmit={handleSearch} className="flex flex-col gap-2 mt-4">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSearchType('ebook')}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${searchType === 'ebook' ? 'bg-amber-500 text-black' : 'bg-[#1e1e1e] text-neutral-400 hover:text-neutral-100'}`}
              >
                Ebook
              </button>
              <button
                type="button"
                onClick={() => setSearchType('audiobook')}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${searchType === 'audiobook' ? 'bg-amber-500 text-black' : 'bg-[#1e1e1e] text-neutral-400 hover:text-neutral-100'}`}
              >
                Audiobook
              </button>
            </div>
            <div className="flex gap-2 w-full">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                <input
                  type="text"
                  placeholder="Search for books or authors (e.g. 'Andy Weir', 'Tolkien')..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#2a2a2a] text-sm text-neutral-100 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-amber-500 text-black px-6 py-3 rounded-xl text-sm font-semibold hover:bg-amber-400 transition cursor-pointer"
              >
                {isLoading ? 'Searching...' : 'Explore'}
              </button>
            </div>
            
            {/* Search Progress Component */}
            {isLoading && (
              <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span className="text-[10px] font-mono text-amber-500 font-bold uppercase tracking-wider">
                      {statusMessage}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500">{searchProgress}%</span>
                </div>
                
                <div className="w-full bg-[#1e1e1e] h-1 rounded-full overflow-hidden border border-[#2a2a2a]">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                    style={{ width: `${searchProgress}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {indexers.filter(idx => idx.enabled).map(idx => (
                    <div 
                      key={idx.name}
                      className={`text-[9px] px-1.5 py-0.5 rounded-md border font-mono transition-colors ${
                        completedIndexers.includes(idx.name) 
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                          : 'bg-[#1a1a1a] text-neutral-600 border-[#222]'
                      }`}
                    >
                      {idx.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Grid Results */}
      <div className="space-y-4 text-left">
        <div className="flex items-center justify-between">
          <span className="font-sans font-bold text-sm text-neutral-300">
            {searchResults.length} Tracker Results Found
          </span>
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Encrypted Indexing</span>
          </div>
        </div>

        {/* List Content */}
        {searchResults.length === 0 ? (
          <div className="p-12 text-center bg-[#111] rounded-2xl border border-[#222]">
            <HelpCircle className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <p className="text-neutral-400 font-sans text-sm font-medium">
                {!searchedOnce ? 'Ready to explore indexers?' : 'No results found for your query.'}
            </p>
            <p className="text-neutral-600 font-sans text-xs mt-1">
                {!searchedOnce 
                    ? 'Enter a title or author above and hit Explore to start aggregating results.' 
                    : 'Try another keyword, use different terms, or verify your indexer settings.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {searchResults.map((result) => (
              <React.Fragment key={result.id}>
                <div
                  onMouseEnter={() => enrichResult(result)}
                className={`p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition duration-200 border ${
                  result.error ? 'bg-[#1a0a0a] border-red-900/30' : 'bg-[#121212] border-[#222] hover:border-[#333]'
                }`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      result.error ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {result.error ? 'Indexer Error' : (result.type === 'audiobook' ? 'Audiobook' : 'E-Book')}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500">
                      {result.indexer}
                    </span>
                    {enrichedData[result.id] && !result.error && (
                      <span className="text-[10px] font-mono text-emerald-500">+ Meta</span>
                    )}
                  </div>
                  <h3 className="font-sans font-semibold text-sm text-neutral-200 leading-tight">
                    {result.title}
                  </h3>
                  {result.error ? (
                    <p className="text-xs text-red-400 mt-1">{result.error}</p>
                  ) : enrichedData[result.id] && (
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-1">{enrichedData[result.id].description}</p>
                  )}
                  {!result.error && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono text-neutral-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      {result.size}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      <Users className="w-3.5 h-3.5 text-emerald-500" />
                      {result.seeds} Seeds
                    </span>
                    <span className="flex items-center gap-1">
                      {result.peers} Peers
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {result.publishDate}
                    </span>
                  </div>
                  )}
                </div>

                {!result.error && (
                  <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => inspectTorrent(result)}
                        disabled={inspectingId === result.id}
                        className="bg-[#1a1a1a] border border-[#2d2d2d] text-neutral-400 hover:text-neutral-200 px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                        title="View files in torrent"
                    >
                        {inspectingId === result.id ? '...' : (inspectedFiles[result.id] ? 'Hide' : 'Inspect')}
                    </button>
                    <button
                        onClick={() => {
                        onAddTorrent(result);
                        setStatusMessage(`Added [${result.title}] to local queue!`);
                        setTimeout(() => setStatusMessage(''), 4000);
                        }}
                        className="bg-amber-500 text-black border border-amber-600 hover:bg-amber-400 px-4 py-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer group shrink-0"
                    >
                        <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                        <span>Download</span>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Inspection Drawer */}
              {inspectedFiles[result.id] && (
                  <div className="bg-[#0a0a0a]/50 border-x border-b border-[#222] rounded-b-xl -mt-4 mx-2 p-3 space-y-1.5 animate-in slide-in-from-top-4 duration-300">
                    <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest pl-1 mb-1">
                        Files inside Torrent Pack
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                        {inspectedFiles[result.id].map((file, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] text-neutral-500 py-1 border-b border-[#1a1a1a] last:border-none px-1">
                                <span className="truncate pr-4">{file.name}</span>
                                <span className="font-mono text-neutral-600 shrink-0">{file.size}</span>
                            </div>
                        ))}
                    </div>
                  </div>
              )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Action Banner Toast if added */}
      {statusMessage && (
        <div className="fixed bottom-24 right-6 bg-[#161616] border border-amber-500/20 text-neutral-200 text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-bounce z-50">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}
