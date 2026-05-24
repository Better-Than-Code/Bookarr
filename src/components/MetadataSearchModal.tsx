/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Search, RefreshCw, AlertCircle, Check, Loader2, Globe, BookOpen, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MetadataCandidate {
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  genres: string[];
  year?: string;
  publisher?: string;
  isbn?: string;
  type?: 'ebook' | 'audiobook';
  source: string;
  score: number;
}

interface MetadataSearchModalProps {
  initialTitle: string;
  bookType: 'audiobook' | 'ebook';
  onSelect: (metadata: any) => void;
  onClose: () => void;
}

export default function MetadataSearchModal({ initialTitle, bookType, onSelect, onClose }: MetadataSearchModalProps) {
  const [query, setQuery] = useState(initialTitle);
  const [results, setResults] = useState<MetadataCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providersStatus, setProvidersStatus] = useState<{name: string, status: 'idle' | 'loading' | 'success' | 'error'}[]>([
    { name: 'OpenLibrary', status: 'idle' },
    { name: 'iTunes', status: 'idle' },
    { name: 'Google Books / Amazon', status: 'idle' }
  ]);

  const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidate | null>(null);
  const [isAutoAdding, setIsAutoAdding] = useState(false);

  const search = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResults([]);
    setSelectedCandidate(null);
    
    // Reset status
    setProvidersStatus(prev => prev.map(p => ({ ...p, status: 'loading' })));

    try {
      const q = new URLSearchParams({
        title: searchQuery,
        type: bookType,
        all: 'true'
      }).toString();

      const res = await fetch(`/api/metadata?${q}`);
      
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || 'Failed to fetch metadata');
      }

      const data = await res.json();
      
      if (Array.isArray(data)) {
        // Find best match for auto-adding
        const bestMatch = data.find((d: any) => d.score > 0.85);
        
        if (bestMatch && !isAutoAdding) {
            setIsAutoAdding(true);
            setResults(data);
            setSelectedCandidate(bestMatch);
            // Delay slightly for visual feedback then auto-process
            setTimeout(() => {
                onSelect(bestMatch);
            }, 1200);
            return;
        }

        setResults(data);
        const sources = new Set(data.map((d: any) => d.source));
        setProvidersStatus(prev => prev.map(p => ({
            ...p,
            status: sources.has(p.name) ? 'success' : 'idle'
        })));
      } else {
        setResults([data]);
        if (data.score > 0.85) {
            setSelectedCandidate(data);
            setTimeout(() => onSelect(data), 1000);
        }
      }
    } catch (err: any) {
      setError(err.message);
      setProvidersStatus(prev => prev.map(p => ({ ...p, status: 'error' })));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    search(initialTitle);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#181818]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
                {bookType === 'audiobook' ? <Music className="w-5 h-5 text-amber-500" /> : <BookOpen className="w-5 h-5 text-amber-500" />}
            </div>
            <div>
                <h2 className="font-bold text-neutral-100 italic">Metadata Scraper</h2>
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Global Provider Network</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-[#141414] border-b border-white/5">
            <div className="relative">
                <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search(query)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-11 py-3 text-sm text-neutral-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all font-medium"
                    placeholder="Enter book title or author..."
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <button 
                  onClick={() => search(query)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 transition"
                >
                    {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </button>
            </div>
            
            <div className="flex gap-4 mt-3 overflow-x-auto pb-1 scrollbar-none">
                {providersStatus.map(p => (
                    <div key={p.name} className="flex items-center gap-2 shrink-0">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                            p.status === 'success' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                            p.status === 'loading' ? 'bg-amber-500 animate-pulse' : 
                            p.status === 'error' ? 'bg-red-500' : 'bg-neutral-700'
                        }`} />
                        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">{p.name}</span>
                    </div>
                ))}
            </div>
        </div>

        {/* Results / Preview */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0a0a] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isLoading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-amber-500/50" />
                <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Consulting global archives...</p>
            </div>
          )}

          {isAutoAdding && selectedCandidate && (
             <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4 relative">
                   <Check className="w-8 h-8 text-green-500 animate-in zoom-in duration-500" />
                   <div className="absolute inset-0 rounded-full border-2 border-green-500/20 animate-ping" />
                </div>
                <h4 className="text-lg font-bold text-neutral-100 italic">High Confidence Match Found</h4>
                <p className="text-sm text-neutral-500 mt-1">Applying metadata from {selectedCandidate.source}...</p>
                <div className="mt-8 flex gap-4 items-center bg-[#141414] p-4 rounded-2xl border border-white/5 animate-in slide-in-from-bottom-4 duration-700">
                    <img src={selectedCandidate.coverUrl} className="w-12 h-16 rounded shadow-lg" alt="" />
                    <div className="text-left">
                        <div className="text-xs font-bold text-neutral-300">{selectedCandidate.title}</div>
                        <div className="text-[10px] text-neutral-500">{selectedCandidate.author}</div>
                    </div>
                </div>
             </div>
          )}

          {selectedCandidate && !isAutoAdding && (
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="h-full flex flex-col"
            >
               <div className="flex items-center gap-2 mb-4">
                  <button 
                    onClick={() => setSelectedCandidate(null)}
                    className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition"
                  >
                    ← Back to results
                  </button>
               </div>
               
               <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-6">
                  <div className="flex gap-6">
                      <img src={selectedCandidate.coverUrl} className="w-24 h-36 rounded-xl shadow-2xl border border-white/10" alt="" />
                      <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                             <div className="text-[8px] font-black bg-amber-500 text-black px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                {selectedCandidate.source}
                             </div>
                             <div className="flex items-center gap-1 text-[8px] font-black bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-white/5">
                                {selectedCandidate.type === 'audiobook' ? <Music className="w-2 h-2" /> : <BookOpen className="w-2 h-2" />}
                                {selectedCandidate.type || 'unknown'}
                             </div>
                             <div className="text-[8px] font-black bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                Score: {Math.round(selectedCandidate.score * 100)}%
                             </div>
                          </div>
                          <h3 className="text-xl font-bold text-white leading-tight mb-1">{selectedCandidate.title}</h3>
                          <p className="text-neutral-400 font-medium">{selectedCandidate.author}</p>
                          
                          <div className="mt-4 flex flex-wrap gap-2">
                             {selectedCandidate.year && <span className="text-[10px] px-2 py-1 bg-black/40 text-neutral-500 rounded-lg font-bold border border-white/5">{selectedCandidate.year}</span>}
                             {selectedCandidate.publisher && <span className="text-[10px] px-2 py-1 bg-black/40 text-neutral-500 rounded-lg font-bold border border-white/5 truncate max-w-[120px]">{selectedCandidate.publisher}</span>}
                             {selectedCandidate.genres.map(g => (
                                <span key={g} className="text-[10px] px-2 py-1 bg-black/40 text-neutral-500 rounded-lg font-bold border border-white/5">{g}</span>
                             ))}
                          </div>
                      </div>
                  </div>

                  <div className="border-t border-white/5 pt-4">
                     <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mb-2">Description Update</h4>
                     <p className="text-xs text-neutral-400 leading-relaxed max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/5">
                        {selectedCandidate.description || 'No description available for this catalog entry.'}
                     </p>
                  </div>

                  <div className="pt-4 flex gap-3">
                     <button 
                        onClick={() => onSelect(selectedCandidate)}
                        className="flex-1 bg-amber-500 text-black font-bold py-3 rounded-xl hover:bg-amber-400 transition transform active:scale-[0.98] shadow-lg shadow-amber-500/20"
                     >
                        Confirm & Import
                     </button>
                  </div>
               </div>
            </motion.div>
          )}

          {error && !selectedCandidate && (
            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                    <h4 className="text-sm font-bold text-red-500">Service Interruption</h4>
                    <p className="text-xs text-neutral-400 mt-1">{error}</p>
                    <button 
                      onClick={() => search(query)}
                      className="mt-3 text-[10px] font-bold uppercase tracking-widest text-amber-500 hover:text-amber-400"
                    >
                        Force Retry
                    </button>
                </div>
            </div>
          )}

          {!selectedCandidate && !isAutoAdding && (
            <AnimatePresence mode="popLayout">
              {results.map((res, i) => (
                  <motion.div 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={`${res.source}-${i}`}
                      onClick={() => setSelectedCandidate(res)}
                      className="group bg-[#141414] border border-white/5 p-3 rounded-xl flex gap-4 hover:border-amber-500/30 cursor-pointer transition-all active:scale-[0.99] relative overflow-hidden"
                  >
                      {/* Background Source Badge */}
                      <div className="absolute -right-2 -bottom-2 opacity-[0.03] pointer-events-none group-hover:opacity-10 transition-opacity">
                          <Globe className="w-24 h-24" />
                      </div>

                      <div className="relative">
                          <img 
                            src={res.coverUrl || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=100'} 
                            className="w-16 h-24 object-cover rounded-lg shadow-lg border border-white/10 transition group-hover:scale-105" 
                            alt="" 
                          />
                          <div className="absolute top-1 left-1 flex gap-1">
                              <div className="bg-black/60 backdrop-blur-sm text-[8px] font-bold px-1.5 py-0.5 rounded border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                  {res.source}
                              </div>
                              <div className="bg-black/60 backdrop-blur-sm text-[8px] font-bold px-1 py-0.5 rounded border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                                  {res.type === 'audiobook' ? <Music className="w-1.5 h-1.5 text-amber-500" /> : <BookOpen className="w-1.5 h-1.5 text-neutral-400" />}
                              </div>
                          </div>
                      </div>

                      <div className="flex-1 min-w-0 py-1">
                          <div className="flex justify-between items-start">
                              <h4 className="font-bold text-neutral-100 truncate group-hover:text-amber-500 transition leading-tight">{res.title}</h4>
                              <div className={`text-[10px] font-black px-1.5 py-0.5 rounded ml-2 ${
                                  res.score > 0.8 ? 'text-green-500' : 'text-neutral-500'
                              }`}>
                                  {Math.round(res.score * 100)}%
                              </div>
                          </div>
                          <p className="text-xs text-neutral-400 font-medium truncate mt-0.5">{res.author}</p>
                          
                          <div className="mt-3 flex flex-wrap gap-1.5">
                              {res.year && <span className="text-[9px] px-1.5 py-0.5 bg-neutral-800 text-neutral-500 rounded font-bold">{res.year}</span>}
                              {res.genres.slice(0, 2).map(g => (
                                  <span key={g} className="text-[9px] px-1.5 py-0.5 bg-neutral-800 text-neutral-500 rounded font-bold truncate max-w-[80px]">{g}</span>
                              ))}
                          </div>

                          <p className="text-[10px] text-neutral-500 line-clamp-2 mt-2 leading-relaxed">
                              {res.description || 'No summary available for this catalog entry.'}
                          </p>
                      </div>

                      <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                          <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center shadow-lg border border-white/10">
                              <Check className="w-4 h-4 text-neutral-400" />
                          </div>
                      </div>
                  </motion.div>
              ))}
            </AnimatePresence>
          )}

          {results.length === 0 && !isLoading && !error && !selectedCandidate && (
            <div className="text-center py-16 text-neutral-500">
               <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                <Search className="w-6 h-6 opacity-20" />
               </div>
               <h4 className="font-bold text-neutral-400">Archive Cache Empty</h4>
               <p className="text-xs mt-1 max-w-[240px] mx-auto text-neutral-500">Try adjusting your search terms or checking another repository.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#121212] border-t border-white/5 text-[10px] text-neutral-600 flex justify-between items-center font-bold uppercase tracking-widest">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 opacity-50" />
                Live Connection: Universal Archives
            </div>
            <div className="italic opacity-50">v2.4.0 Extended Catalog</div>
        </div>
      </motion.div>
    </div>
  );
}
