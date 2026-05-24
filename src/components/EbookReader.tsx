/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Type,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookOpen,
  Search,
  Sparkles,
  Clock,
  Highlighter,
  Sliders,
  Check,
  Plus,
  Trash2,
  Languages,
  ArrowRight,
  Flame,
  MessageSquare,
  AlignLeft,
  AlignJustify,
  FileText,
  HelpCircle,
  Volume2,
  Menu,
  Settings,
  MoreVertical,
  Maximize2,
  Minimize2,
  List,
  Info,
  Calendar,
  Zap,
  Library,
  Columns
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, EbookChapter } from '../types';

interface EbookReaderProps {
  book: Book;
  onClose: () => void;
  onUpdateProgress: (bookId: string, currentPage: number, progress: number) => void;
}

type ReaderTheme = 'light' | 'sepia' | 'soft' | 'dusk' | 'night' | 'amoled';
type FontFamily = 'sans' | 'serif' | 'mono' | 'dyslexic';
type MarginSize = 'narrow' | 'normal' | 'wide';
type LineSpacing = 'compact' | 'comfort' | 'loose';
type TextAlign = 'left' | 'justify';

interface HighlightItem {
  id: string;
  chapterIndex: number;
  text: string;
  note?: string;
  color: 'amber' | 'emerald' | 'rose' | 'sky' | 'underline';
  createdAt: string;
}

interface ReaderBookmark {
  id: string;
  chapterIndex: number;
  label: string;
  createdAt: string;
}

const THEMES: Record<ReaderTheme, any> = {
  light: {
    name: 'Daylight',
    bg: 'bg-[#ffffff]',
    text: 'text-neutral-900',
    sub: 'text-neutral-500',
    border: 'border-neutral-200',
    overlay: 'bg-white/80',
    accent: 'bg-amber-600',
    accentText: 'text-amber-600',
    panel: 'bg-white',
    selection: 'selection:bg-amber-100',
  },
  sepia: {
    name: 'Vintage',
    bg: 'bg-[#f4ecd8]',
    text: 'text-[#433422]',
    sub: 'text-[#8c785d]',
    border: 'border-[#dfd1b8]',
    overlay: 'bg-[#f4ecd8]/80',
    accent: 'bg-[#b68a5d]',
    accentText: 'text-[#b68a5d]',
    panel: 'bg-[#ede3cc]',
    selection: 'selection:bg-[#e0d0af]',
  },
  soft: {
    name: 'Soft Mint',
    bg: 'bg-[#e3f0e3]',
    text: 'text-[#2d3a2d]',
    sub: 'text-[#5a6b5a]',
    border: 'border-[#ceddce]',
    overlay: 'bg-[#e3f0e3]/80',
    accent: 'bg-[#4a774a]',
    accentText: 'text-[#4a774a]',
    panel: 'bg-[#d8e8d8]',
    selection: 'selection:bg-[#c9dbc9]',
  },
  dusk: {
    name: 'Dusk',
    bg: 'bg-[#2b2d42]',
    text: 'text-neutral-300',
    sub: 'text-neutral-500',
    border: 'border-neutral-700',
    overlay: 'bg-[#2b2d42]/80',
    accent: 'bg-indigo-500',
    accentText: 'text-indigo-400',
    panel: 'bg-[#1e1f2f]',
    selection: 'selection:bg-indigo-900',
  },
  night: {
    name: 'Night',
    bg: 'bg-[#121212]',
    text: 'text-neutral-400',
    sub: 'text-neutral-600',
    border: 'border-neutral-800',
    overlay: 'bg-[#121212]/80',
    accent: 'bg-neutral-700',
    accentText: 'text-neutral-300',
    panel: 'bg-[#1a1a1a]',
    selection: 'selection:bg-neutral-800',
  },
  amoled: {
    name: 'AMOLED',
    bg: 'bg-black',
    text: 'text-neutral-500',
    sub: 'text-neutral-700',
    border: 'border-neutral-900',
    overlay: 'bg-black/80',
    accent: 'bg-neutral-800',
    accentText: 'text-neutral-400',
    panel: 'bg-neutral-950',
    selection: 'selection:bg-neutral-900',
  },
};

export default function EbookReader({ book, onClose, onUpdateProgress }: EbookReaderProps) {
  const chapters = (book.chapters as EbookChapter[]) || [];
  const hasRealFile = !!book.fileUrl;
  const isEpub = book.fileUrl?.toLowerCase().endsWith('.epub') || book.type === 'ebook';
  
  // If it's an EPUB but has no chapters, it's a failed extraction
  const extractionFailed = isEpub && hasRealFile && chapters.length === 0;
  
  // Immersive view logic: only show native view (iframe) for non-epub or if explicitly desired
  // For EPUBs without chapters, we show an error instead of a broken iframe
  const isNativeView = hasRealFile && chapters.length === 0 && !isEpub;

  // Reader core state
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(() => {
    const saved = localStorage.getItem(`bookrr-last-page-${book.id}`);
    return saved ? parseInt(saved) : (book.currentPage || 0);
  });
  
  const [theme, setTheme] = useState<ReaderTheme>(() => (localStorage.getItem('bookrr-pref-theme') as ReaderTheme) || 'sepia');
  const [fontSize, setFontSize] = useState<number>(() => parseInt(localStorage.getItem('bookrr-pref-fontSize') || '18'));
  const [fontFamily, setFontFamily] = useState<FontFamily>(() => (localStorage.getItem('bookrr-pref-fontFamily') as FontFamily) || 'serif');
  const [margins, setMargins] = useState<MarginSize>(() => (localStorage.getItem('bookrr-pref-margins') as MarginSize) || 'normal');
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(() => (localStorage.getItem('bookrr-pref-lineSpacing') as LineSpacing) || 'comfort');
  const [textAlign, setTextAlign] = useState<TextAlign>(() => (localStorage.getItem('bookrr-pref-textAlign') as TextAlign) || 'justify');
  const [isDualPage, setIsDualPage] = useState(() => localStorage.getItem('bookrr-pref-isDualPage') === 'true');
  const [isPagedMode, setIsPagedMode] = useState(() => localStorage.getItem('bookrr-pref-isPagedMode') === 'true');
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('bookrr-pref-theme', theme);
    localStorage.setItem('bookrr-pref-fontSize', fontSize.toString());
    localStorage.setItem('bookrr-pref-fontFamily', fontFamily);
    localStorage.setItem('bookrr-pref-margins', margins);
    localStorage.setItem('bookrr-pref-lineSpacing', lineSpacing);
    localStorage.setItem('bookrr-pref-textAlign', textAlign);
    localStorage.setItem('bookrr-pref-isDualPage', isDualPage.toString());
    localStorage.setItem('bookrr-pref-isPagedMode', isPagedMode.toString());
  }, [theme, fontSize, fontFamily, margins, lineSpacing, textAlign, isDualPage, isPagedMode]);

  useEffect(() => {
    localStorage.setItem(`bookrr-last-page-${book.id}`, activeChapterIndex.toString());
  }, [activeChapterIndex, book.id]);

  // Overlay states
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'contents' | 'bookmarks' | 'highlights' | 'info'>('contents');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'font' | 'layout' | 'themes'>('font');
  const [showSearch, setShowSearch] = useState(false);

  // Reading Stats
  const [readingStats, setReadingStats] = useState(() => {
    const saved = localStorage.getItem(`bookrr-stats-${book.id}`);
    return saved ? JSON.parse(saved) : { timeSpent: 0, wordsRead: 0, lastSession: new Date().toISOString() };
  });

  const [currentSessionStart] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setReadingStats((prev: any) => {
        const next = { ...prev, timeSpent: prev.timeSpent + 10 }; // Update every 10s
        localStorage.setItem(`bookrr-stats-${book.id}`, JSON.stringify(next));
        return next;
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [book.id]);

  // Scrubbing preview
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);

  // Interaction states
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([]);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const currentChapter = chapters[activeChapterIndex] || { title: 'No Content', content: 'This book has no chapters configured.' };
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeStyle = THEMES[theme];

  const handleRetryExtraction = async () => {
    setIsProcessing(true);
    try {
      // In a real app, this would call a server endpoint to re-trigger EPUB parsing
      // For now we just simulate it with a refresh request
      const res = await fetch(`/api/books/${book.id}/process`, { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to retry extraction:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculated Progress
  const computedProgress = chapters.length > 0 ? Math.floor(((activeChapterIndex + 1) / chapters.length) * 100) : 0;
  const totalChapters = chapters.length || 1;

  // Persistence & Initialization
  useEffect(() => {
    const savedBookmarks = localStorage.getItem(`bookrr-bookmarks-${book.id}`);
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));

    const savedHighlights = localStorage.getItem(`bookrr-highlights-${book.id}`);
    if (savedHighlights) setHighlights(JSON.parse(savedHighlights));
  }, [book.id]);

  // Sync scroll on chapter change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeChapterIndex]);

  const handleNext = () => {
    if (activeChapterIndex < chapters.length - 1) {
      const next = activeChapterIndex + 1;
      setActiveChapterIndex(next);
      onUpdateProgress(book.id, next, Math.floor(((next + 1) / chapters.length) * 100));
    }
  };

  const handlePrev = () => {
    if (activeChapterIndex > 0) {
      const prev = activeChapterIndex - 1;
      setActiveChapterIndex(prev);
      onUpdateProgress(book.id, prev, Math.floor(((prev + 1) / chapters.length) * 100));
    }
  };

  const toggleBookmark = () => {
    const existing = bookmarks.find(b => b.chapterIndex === activeChapterIndex);
    let updated;
    if (existing) {
      updated = bookmarks.filter(b => b.id !== existing.id);
    } else {
      updated = [...bookmarks, {
        id: `bm-${Date.now()}`,
        chapterIndex: activeChapterIndex,
        label: currentChapter.title,
        createdAt: new Date().toISOString()
      }];
    }
    setBookmarks(updated);
    localStorage.setItem(`bookrr-bookmarks-${book.id}`, JSON.stringify(updated));
  };

  const isBookmarked = bookmarks.some(b => b.chapterIndex === activeChapterIndex);

  // Search logic
  const performSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    const results: any[] = [];
    chapters.forEach((ch, chIdx) => {
      let index = ch.content.toLowerCase().indexOf(query.toLowerCase());
      while (index !== -1) {
        results.push({
          chapterIndex: chIdx,
          chapterTitle: ch.title,
          excerpt: ch.content.substring(Math.max(0, index - 20), Math.min(ch.content.length, index + query.length + 30)),
          index
        });
        index = ch.content.toLowerCase().indexOf(query.toLowerCase(), index + 1);
        if (results.length > 50) break;
      }
    });
    setSearchResults(results);
  };

  // Typography Mappings
  const fontStyles = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
    dyslexic: 'font-[Atkinson-Hyperlegible]'
  };

  const marginStyles = {
    narrow: 'px-4 sm:px-8',
    normal: 'px-6 sm:px-16 lg:px-32',
    wide: 'px-8 sm:px-24 lg:px-64'
  };

  const spacingStyles = {
    compact: 'leading-relaxed',
    comfort: 'leading-loose',
    loose: 'leading-[2.5]'
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col overflow-hidden ${activeStyle.bg} ${activeStyle.text} transition-colors duration-500 font-sans`}>
      
      {/* 1. Header Overlay (MoonReader Style) */}
      <AnimatePresence>
        {!immersiveMode && (
          <motion.header 
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            className={`absolute top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 border-b ${activeStyle.border} ${activeStyle.overlay} backdrop-blur-md shadow-sm`}
          >
            <div className="flex items-center gap-3">
              <button 
                onClick={onClose} 
                className={`p-2 rounded-full transition-colors ${activeStyle.text} hover:bg-black/5 dark:hover:bg-white/5 active:scale-95`}
              >
                <X size={20} />
              </button>
              <div className="flex flex-col truncate max-w-[150px] sm:max-w-[300px]">
                <h1 className="text-sm font-semibold truncate leading-tight">{book.title}</h1>
                <p className={`text-[10px] ${activeStyle.sub} italic truncate`}>{currentChapter.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => setShowSearch(true)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
                <Search size={18} />
              </button>
              <button onClick={toggleBookmark} className={`p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors ${isBookmarked ? 'text-amber-500' : ''}`}>
                <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
              <button onClick={() => setShowSettings(!showSettings)} className={`p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors ${showSettings ? 'bg-black/5 dark:bg-white/5' : ''}`}>
                <Settings size={18} />
              </button>
              <button onClick={() => setShowMenu(true)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
                <Menu size={18} />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* 2. Main Reading Surface */}
      <div 
        ref={scrollContainerRef}
        onClick={() => setImmersiveMode(!immersiveMode)}
        className={`flex-1 overflow-y-auto ${(isNativeView || extractionFailed) ? 'overflow-hidden' : ''} h-full custom-scrollbar`}
      >
        <div className={`mx-auto max-w-5xl h-full flex flex-col pt-20 pb-32 ${marginStyles[margins]}`}>
          {extractionFailed ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`max-w-md w-full p-8 rounded-3xl border ${activeStyle.border} ${activeStyle.panel} shadow-2xl text-center space-y-6`}
              >
                <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                  <FileText size={40} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold italic font-serif">Parsing Failure</h2>
                  <p className={`text-sm ${activeStyle.sub} leading-relaxed`}>
                    We were unable to extract the text content from this EPUB file. 
                    The file remains in your local storage, but the reader system cannot render it in interactive mode.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    disabled={isProcessing}
                    onClick={(e) => { e.stopPropagation(); handleRetryExtraction(); }}
                    className={`w-full py-3 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center gap-2 transition-all hover:bg-amber-700 active:scale-95 disabled:opacity-50`}
                  >
                    {isProcessing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Sparkles size={18} />
                    )}
                    {isProcessing ? 'Processing...' : 'Retry Deep Extraction'}
                  </button>
                  <a 
                    href={book.fileUrl} 
                    download 
                    onClick={(e) => e.stopPropagation()}
                    className={`w-full py-3 rounded-xl border ${activeStyle.border} font-bold text-sm flex items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
                  >
                    Download Original File
                  </a>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className={`text-sm font-medium ${activeStyle.sub} hover:underline`}
                  >
                    Close Reader
                  </button>
                </div>
              </motion.div>
            </div>
          ) : isNativeView ? (
            <div className="w-full h-full flex flex-col rounded-xl overflow-hidden shadow-2xl border border-neutral-500/20 bg-white">
              <div className="bg-amber-500/10 p-3 text-[10px] font-mono text-center border-b border-amber-500/20 text-amber-600 shrink-0 flex items-center justify-center gap-2">
                <Zap size={12} />
                NATIVE SOURCE VIEW ACTIVE
              </div>
              <iframe 
                src={book.fileUrl} 
                className="w-full h-full border-none flex-1"
                title={book.title}
              />
            </div>
          ) : (
            <motion.article 
              key={activeChapterIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className={`w-full ${fontStyles[fontFamily]} ${spacingStyles[lineSpacing]} ${activeStyle.selection} space-y-8`}
              style={{ 
                fontSize: `${fontSize}px`, 
                textAlign: textAlign as any,
                columnCount: isDualPage ? 2 : 1,
                columnGap: '4rem',
                columnRule: isDualPage ? `1px solid ${activeStyle.border.replace('border-', '')}` : 'none'
              }}
            >
              <div className={`text-center mb-16 space-y-4 py-8 border-b-2 ${activeStyle.border}`}>
                <p className={`text-xs tracking-[0.2em] font-medium uppercase ${activeStyle.sub}`}>Chapter {activeChapterIndex + 1}</p>
                <h2 className="text-3xl sm:text-4xl font-bold italic tracking-tight font-serif">{currentChapter.title}</h2>
              </div>

              <div 
                className="prose-content whitespace-pre-wrap sm:text-lg lg:text-xl drop-cap"
                dangerouslySetInnerHTML={{ __html: currentChapter.content }}
              />

              {/* Navigation Helpers at bottom of text */}
              <div className="flex flex-col items-center gap-10 py-20">
                <div className="flex items-center gap-4">
                  <button 
                    disabled={activeChapterIndex === 0}
                    onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                    className={`px-6 py-3 rounded-full border ${activeStyle.border} flex items-center gap-2 text-sm font-medium transition-all hover:scale-105 disabled:opacity-30`}
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>
                  <button 
                    disabled={activeChapterIndex === chapters.length - 1}
                    onClick={(e) => { e.stopPropagation(); handleNext(); }}
                    className={`px-8 py-3 rounded-full ${activeStyle.accent} text-white flex items-center gap-2 text-sm font-bold shadow-lg shadow-black/10 transition-all hover:scale-105 disabled:opacity-30`}
                  >
                    Next Chapter <ChevronRight size={16} />
                  </button>
                </div>
                
                <div className={`text-[11px] ${activeStyle.sub} italic flex flex-col items-center gap-1`}>
                  <span>{book.title} — {book.author}</span>
                  <span className="opacity-60">{computedProgress}% Complete</span>
                </div>
              </div>
            </motion.article>
          )}
        </div>
      </div>

      {/* 3. Footer Control Bar (MoonReader style progress) */}
      <AnimatePresence>
        {!immersiveMode && (
          <motion.footer
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            className={`absolute bottom-0 left-0 right-0 h-16 z-50 flex flex-col ${activeStyle.overlay} backdrop-blur-md border-t ${activeStyle.border} shadow-lg px-2`}
          >
            {/* Progress Scrub Slider */}
            <div className="relative group w-full px-4 -mt-2">
              <AnimatePresence>
                {scrubPreview !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: -20, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-4 px-4 py-2 rounded-xl ${activeStyle.panel} border ${activeStyle.border} shadow-xl z-[70] min-w-[200px] text-center`}
                  >
                    <p className={`text-[9px] font-bold ${activeStyle.sub} uppercase tracking-widest mb-1`}>JUMP TO Chapter {scrubPreview + 1}</p>
                    <p className="text-xs font-bold truncate max-w-[180px]">{chapters[scrubPreview]?.title}</p>
                    <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-2 h-2 rotate-45 ${activeStyle.panel} border-r border-b ${activeStyle.border}`} />
                  </motion.div>
                )}
              </AnimatePresence>
              
              <input 
                type="range"
                min="0"
                max={chapters.length > 0 ? chapters.length - 1 : 0}
                value={activeChapterIndex}
                onMouseEnter={() => setScrubPreview(activeChapterIndex)}
                onMouseLeave={() => setScrubPreview(null)}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  setActiveChapterIndex(idx);
                  setScrubPreview(idx);
                  onUpdateProgress(book.id, idx, Math.floor(((idx + 1) / (chapters.length || 1)) * 100));
                }}
                onClick={(e) => e.stopPropagation()}
                className={`w-full h-1.5 rounded-full cursor-pointer appearance-none transition-all ${activeStyle.bg === 'bg-black' ? 'bg-neutral-800' : 'bg-neutral-200/50'}`}
                style={{ 
                  backgroundSize: `${totalChapters > 1 ? (activeChapterIndex / (totalChapters - 1)) * 100 : 0}% 100%`,
                  backgroundImage: `linear-gradient(${theme === 'night' || theme === 'amoled' ? '#525252' : '#b45309'}, ${theme === 'night' || theme === 'amoled' ? '#525252' : '#b45309'})`,
                  backgroundRepeat: 'no-repeat'
                }}
              />
            </div>

            <div className="flex-1 flex items-center justify-between px-4 sm:px-10 text-[11px] font-medium tracking-tight">
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className={activeStyle.sub}>PROGRESS</span>
                  <span className="font-bold">{activeChapterIndex + 1} / {totalChapters} Ch</span>
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className={activeStyle.sub}>EST. TIME LEFT</span>
                  <span className="font-bold">~{Math.ceil((totalChapters - activeChapterIndex) * 15)} min</span>
                </div>
              </div>

              <div className="flex items-center gap-4 sm:gap-8">
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                  className="flex flex-col items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <Type size={18} />
                  <span>STYLE</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsPagedMode(!isPagedMode); }}
                  className={`flex flex-col items-center gap-0.5 transition-opacity ${isPagedMode ? 'text-amber-600 opacity-100' : 'opacity-70 hover:opacity-100'}`}
                >
                  <BookOpen size={18} />
                  <span>{isPagedMode ? 'PAGED' : 'SCROLL'}</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsDualPage(!isDualPage); }}
                  className={`hidden sm:flex flex-col items-center gap-0.5 transition-opacity ${isDualPage ? 'text-amber-600 opacity-100' : 'opacity-70 hover:opacity-100'}`}
                >
                  <Columns size={18} />
                  <span>COLUMNS</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowMenu(true); setActiveTab('contents'); }}
                  className="flex flex-col items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <List size={18} />
                  <span>CHAPTERS</span>
                </button>
              </div>

              <div className="flex flex-col items-end">
                <span className={activeStyle.sub}>STATUS</span>
                <span className={`font-bold flex items-center gap-1.5 ${activeStyle.accentText}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${theme === 'amoled' ? 'bg-neutral-500' : 'bg-amber-500'} animate-pulse`} />
                  READING
                </span>
              </div>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* 4. Side Menu (Drawer) */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
              className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className={`absolute top-0 left-0 bottom-0 w-[85%] max-w-sm z-[60] ${activeStyle.panel} border-r ${activeStyle.border} shadow-2xl flex flex-col`}
            >
              <div className="p-6 border-b border-neutral-500/10 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg leading-tight">{book.title}</h3>
                  <p className={`text-xs ${activeStyle.sub}`}>{book.author}</p>
                </div>
                <button onClick={() => setShowMenu(false)} className={`p-1.5 rounded-lg ${activeStyle.border} border opacity-50 hover:opacity-100`}>
                  <X size={16} />
                </button>
              </div>

              <div className="flex p-2 gap-1 border-b border-neutral-500/10 text-neutral-400">
                {(['contents', 'bookmarks', 'highlights', 'info'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-[10px] font-bold rounded-md font-mono transition-all ${activeTab === tab ? 'bg-amber-600 text-white shadow-md' : 'opacity-40 hover:opacity-80'}`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'contents' && (
                  <div className="space-y-1">
                    {chapters.map((ch, idx) => {
                      const wordCount = ch.content.split(/\s+/).length;
                      const readingTime = Math.max(1, Math.ceil(wordCount / 225));
                      
                      return (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setActiveChapterIndex(idx);
                            setShowMenu(false);
                            onUpdateProgress(book.id, idx, Math.floor(((idx + 1) / chapters.length) * 100));
                          }}
                          className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all ${activeChapterIndex === idx ? 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                          <div className="flex items-center gap-3 truncate">
                            <span className={`w-6 h-6 shrink-0 flex items-center justify-center text-[10px] font-mono rounded-lg border ${activeChapterIndex === idx ? 'border-amber-500/50 bg-amber-500/10' : 'border-neutral-500/20 opacity-50'}`}>
                              {idx + 1}
                            </span>
                            <span className={`text-sm tracking-tight truncate ${activeChapterIndex === idx ? 'font-bold' : 'font-medium opacity-80'}`}>{ch.title}</span>
                          </div>
                          <div className={`text-[10px] font-mono shrink-0 opacity-40 flex items-center gap-1`}>
                            <Clock size={10} />
                            {readingTime}m
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {activeTab === 'highlights' && (
                  <div className="space-y-3">
                    {highlights.length === 0 ? (
                      <div className="py-20 text-center space-y-4">
                        <Highlighter size={32} className="mx-auto opacity-10" />
                        <p className="opacity-30 text-xs italic">Select text to create highlights and notes.</p>
                      </div>
                    ) : (
                      highlights.map(hl => (
                        <div key={hl.id} className={`p-4 rounded-xl border ${activeStyle.border} bg-black/5 space-y-2`}>
                          <div className="flex justify-between items-start">
                            <div className="flex gap-1">
                              <div className={`w-1 h-4 rounded-full ${hl.color === 'amber' ? 'bg-amber-500' : hl.color === 'emerald' ? 'bg-emerald-500' : hl.color === 'rose' ? 'bg-rose-500' : 'bg-sky-500'}`} />
                              <span className={`text-[9px] font-bold uppercase ${activeStyle.sub}`}>Ch {hl.chapterIndex + 1}</span>
                            </div>
                            <button 
                              onClick={() => {
                                const updated = highlights.filter(h => h.id !== hl.id);
                                setHighlights(updated);
                                localStorage.setItem(`bookrr-highlights-${book.id}`, JSON.stringify(updated));
                              }}
                              className="text-rose-500 opacity-40 hover:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className="text-xs italic leading-relaxed line-clamp-3">"{hl.text}"</p>
                          <div className="flex justify-between items-center pt-1 border-t border-neutral-500/5">
                            <span className="text-[9px] opacity-40">{new Date(hl.createdAt).toLocaleDateString()}</span>
                            <button 
                              onClick={() => { setActiveChapterIndex(hl.chapterIndex); setShowMenu(false); }}
                              className="text-[9px] font-bold text-amber-600 hover:underline"
                            >
                              JUMP TO Chapter
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {activeTab === 'bookmarks' && (
                  <div className="space-y-3">
                    {bookmarks.length === 0 ? (
                      <div className="py-10 text-center opacity-30 text-xs italic">No items stored in library bookmarks.</div>
                    ) : (
                      bookmarks.map(bm => (
                        <div key={bm.id} className={`p-4 rounded-xl border ${activeStyle.border} flex flex-col gap-2`}>
                          <div className="flex justify-between items-start">
                            <h4 className="font-bold text-sm leading-tight line-clamp-1">{bm.label}</h4>
                            <button onClick={(e) => {
                              const updated = bookmarks.filter(b => b.id !== bm.id);
                              setBookmarks(updated);
                              localStorage.setItem(`bookrr-bookmarks-${book.id}`, JSON.stringify(updated));
                            }} className="text-rose-500 opacity-60 hover:opacity-100">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                             <button
                                onClick={() => { setActiveChapterIndex(bm.chapterIndex); setShowMenu(false); }}
                                className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded"
                             >
                               GO TO Ch {bm.chapterIndex + 1}
                             </button>
                             <span className={`text-[9px] font-mono ${activeStyle.sub}`}>{new Date(bm.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {activeTab === 'info' && (
                  <div className="p-4 space-y-6 text-neutral-400">
                    <div className="aspect-[3/4] rounded-lg shadow-lg overflow-hidden border border-neutral-500/20 relative group">
                      <img src={book.coverUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                        <div className="text-white">
                          <p className="text-[10px] font-bold opacity-70">SYNOPSIS PREVIEW</p>
                          <p className="text-xs line-clamp-2">{book.description}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-3">
                          <div className={`p-4 rounded-2xl border ${activeStyle.border} bg-black/5 flex flex-col items-center text-center justify-center`}>
                             <Clock size={20} className="mb-2 text-amber-600" />
                             <span className={`text-[9px] uppercase font-bold ${activeStyle.sub}`}>Time Spent</span>
                             <p className="text-sm font-mono font-bold">{(readingStats.timeSpent / 60).toFixed(1)}h</p>
                          </div>
                          <div className={`p-4 rounded-2xl border ${activeStyle.border} bg-black/5 flex flex-col items-center text-center justify-center`}>
                             <Zap size={20} className="mb-2 text-amber-600" />
                             <span className={`text-[9px] uppercase font-bold ${activeStyle.sub}`}>Read Speed</span>
                             <p className="text-sm font-mono font-bold">225 wpm</p>
                          </div>
                       </div>

                       <div className={`p-4 rounded-2xl border ${activeStyle.border} bg-black/5`}>
                          <div className="flex justify-between items-center mb-3">
                             <span className={`text-[10px] uppercase font-bold ${activeStyle.sub}`}>Scholar Progress</span>
                             <span className="text-[10px] font-bold text-amber-600">{computedProgress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-neutral-500/10 rounded-full overflow-hidden">
                             <div className="h-full bg-amber-600 transition-all duration-1000" style={{ width: `${computedProgress}%` }} />
                          </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-neutral-500/10 bg-black/5 dark:bg-white/5 space-y-4">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600">
                     <Flame size={20} />
                   </div>
                   <div>
                     <p className="text-xs font-bold leading-none">Scholar Streak</p>
                     <p className={`text-[10px] ${activeStyle.sub}`}>5 Days Reading Active</p>
                   </div>
                 </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 5. Quick Settings Panel (Bottom Float) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`absolute bottom-20 left-4 right-4 sm:left-auto sm:right-10 sm:w-[360px] z-50 ${activeStyle.panel} border ${activeStyle.border} shadow-2xl rounded-2xl overflow-hidden flex flex-col`}
          >
            {/* Tabs Header */}
            <div className="flex border-b border-neutral-500/10 p-1">
              {(['font', 'layout', 'themes'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  className={`flex-1 py-3 text-[10px] font-bold tracking-widest transition-all rounded-xl ${settingsTab === tab ? 'bg-amber-600 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">
              {settingsTab === 'themes' && (
                <div className="space-y-4">
                  <span className={`text-[10px] font-bold ${activeStyle.sub} tracking-widest`}>ATMOSPHERE PRESETS</span>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(THEMES) as ReaderTheme[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`h-14 rounded-xl border-2 transition-all flex flex-col items-center justify-center p-2 relative overflow-hidden ${theme === t ? 'border-amber-600 ring-2 ring-amber-500/20' : 'border-neutral-500/10'} ${THEMES[t].bg} ${THEMES[t].text}`}
                      >
                        <span className="text-[11px] font-bold z-10">{THEMES[t].name}</span>
                        {theme === t && <div className="absolute top-1 right-1"><Check size={8} className="text-amber-500" /></div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {settingsTab === 'font' && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-bold ${activeStyle.sub} tracking-widest`}>TEXT SIZE</span>
                      <span className="text-xs font-mono font-bold">{fontSize}px</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setFontSize(Math.max(12, fontSize - 1))} className={`flex-1 h-12 rounded-xl border-2 ${activeStyle.border} hover:bg-black/5 flex items-center justify-center text-sm font-bold`}>A</button>
                      <button onClick={() => setFontSize(Math.min(48, fontSize + 1))} className={`flex-1 h-12 rounded-xl border-2 ${activeStyle.border} hover:bg-black/5 flex items-center justify-center text-xl font-bold`}>A</button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className={`text-[10px] font-bold ${activeStyle.sub} tracking-widest`}>TYPEFACE</span>
                    <div className="grid grid-cols-2 gap-2">
                       {(Object.keys(fontStyles) as FontFamily[]).map(f => (
                          <button
                           key={f}
                           onClick={() => setFontFamily(f)}
                           style={{ fontFamily: f === 'dyslexic' ? 'Atkinson Hyperlegible' : f }}
                           className={`py-3 rounded-xl border-2 text-[11px] transition-all ${fontFamily === f ? 'border-amber-600 bg-amber-600/10 font-bold' : 'border-neutral-500/10'}`}
                          >
                            {f === 'dyslexic' ? 'Hyperlegible' : f.charAt(0).toUpperCase() + f.slice(1)}
                          </button>
                       ))}
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'layout' && (
                <div className="space-y-6">
                  <div className="space-y-3">
                     <span className={`text-[10px] font-bold ${activeStyle.sub} tracking-widest`}>PAGE MARGINS</span>
                     <div className="flex gap-2">
                        {(Object.keys(marginStyles) as MarginSize[]).map(m => (
                           <button
                             key={m}
                             onClick={() => setMargins(m)}
                             className={`flex-1 py-3 rounded-xl border-2 transition-all flex items-center justify-center ${margins === m ? 'border-amber-600 bg-amber-600/10' : 'border-neutral-500/10'}`}
                           >
                             <div className={`h-4 border-l-2 border-r-2 border-current ${m === 'narrow' ? 'w-6' : m === 'normal' ? 'w-4' : 'w-2'}`} />
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="space-y-3">
                     <span className={`text-[10px] font-bold ${activeStyle.sub} tracking-widest`}>LINE SPACING</span>
                     <div className="flex gap-2">
                        {(Object.keys(spacingStyles) as LineSpacing[]).map(s => (
                           <button
                             key={s}
                             onClick={() => setLineSpacing(s)}
                             className={`flex-1 py-3 rounded-xl border-2 text-[10px] font-bold transition-all ${lineSpacing === s ? 'border-amber-600 bg-amber-600/10' : 'border-neutral-500/10'}`}
                           >
                              {s.toUpperCase()}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="space-y-3">
                     <span className={`text-[10px] font-bold ${activeStyle.sub} tracking-widest`}>TEXT ALIGNMENT</span>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => setTextAlign('left')}
                          className={`flex-1 py-3 rounded-xl border-2 flex items-center justify-center ${textAlign === 'left' ? 'border-amber-600 bg-amber-600/10' : 'border-neutral-500/10'}`}
                        >
                           <AlignLeft size={16} />
                        </button>
                        <button 
                          onClick={() => setTextAlign('justify')}
                          className={`flex-1 py-3 rounded-xl border-2 flex items-center justify-center ${textAlign === 'justify' ? 'border-amber-600 bg-amber-600/10' : 'border-neutral-500/10'}`}
                        >
                           <AlignJustify size={16} />
                        </button>
                     </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-neutral-500/10 bg-black/5 dark:bg-white/5 flex justify-between items-center">
               <span className={`text-[9px] font-mono ${activeStyle.sub}`}>DYNAMICS ENGINE ACTIVE</span>
               <div className="flex items-center gap-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                 <span className="text-[9px] font-bold">OPTIMIZED</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Quick Search Overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`w-full max-w-xl ${activeStyle.panel} rounded-2xl border ${activeStyle.border} shadow-2xl flex flex-col max-h-[80vh] overflow-hidden`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-neutral-500/10 flex items-center gap-3">
                <Search size={20} className="text-amber-600" />
                <input 
                  autoFocus
                  placeholder="Query book text..."
                  value={searchQuery}
                  onChange={(e) => performSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-lg font-medium"
                />
                <button onClick={() => setShowSearch(false)} className="p-2 hover:bg-black/5 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {searchResults.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center opacity-30 italic text-sm text-neutral-400">
                    {searchQuery.length < 3 ? 'Type 3+ characters to search locally...' : 'No lexical matches found nearby.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((res, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setActiveChapterIndex(res.chapterIndex);
                          setShowSearch(false);
                          onUpdateProgress(book.id, res.chapterIndex, Math.floor(((res.chapterIndex + 1) / chapters.length) * 100));
                        }}
                        className={`w-full text-left p-4 rounded-xl border ${activeStyle.border} hover:bg-black/5 transition-all group`}
                      >
                         <p className={`text-[10px] font-bold ${activeStyle.sub} mb-1 group-hover:text-amber-600`}>{res.chapterTitle}</p>
                         <p className="text-sm italic leading-relaxed">"...{res.excerpt}..."</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className={`p-3 text-[9px] font-mono px-6 border-t ${activeStyle.border} opacity-40 bg-black/5`}>
                 SCANNING LOCAL CACHE — INDEXED: {chapters.length} SECTIONS
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global CSS Inject for reader specifics like drop-caps */}
      <style dangerouslySetInnerHTML={{ __html: `
        .drop-cap::first-letter {
          float: left;
          font-size: 3.5em;
          line-height: 0.7;
          padding-right: 0.15em;
          padding-top: 0.15em;
          font-weight: 700;
          font-family: serif;
          color: ${activeStyle.accentText.includes('amber') ? '#b45309' : '#737373'};
        }
        .prose-content {
          font-variant-numeric: oldstyle-nums;
          color: inherit !important;
        }
        .prose-content * {
          color: inherit !important;
          background-color: transparent !important;
          max-width: 100% !important;
          height: auto !important;
          position: static !important;
          visibility: visible !important;
          display: inline;
        }
        .prose-content p, .prose-content div, .prose-content h1, .prose-content h2, .prose-content h3, .prose-content h4, .prose-content h5, .prose-content h6, .prose-content section, .prose-content article {
          display: block !important;
          margin-bottom: 1em;
        }
        .prose-content img {
          display: block !important;
          margin: 1.5rem auto;
          max-width: 100% !important;
          border-radius: 0.5rem;
          height: auto !important;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.2);
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
        }
      `}} />
    </div>
  );
}
