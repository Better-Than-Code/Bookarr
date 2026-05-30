/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

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
  Columns,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Loader2,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, EbookChapter } from '../types';
import { useReadAloud } from '../context/ReadAloudContext';
import { useReaderSettings } from '../hooks/useReaderSettings';
import ReaderSettings from './EbookReader/ReaderSettings';
import { getOfflineFile } from '../services/LocalFileService';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;


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
  cfiRange?: string;
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

function findElementContainingText(root: Document | HTMLElement, searchText: string): HTMLElement | null {
  if (!searchText) return null;
  const cleanSearch = searchText.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleanSearch) return null;

  let bestMatch: HTMLElement | null = null;
  let minLength = Infinity;

  // Use textContent instead of innerText to make it 100x faster and prevent layout thrashing/stutters.
  const elements = root.querySelectorAll('p, span, div, li, td, th, h1, h2, h3, h4, h5, h6');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    
    // Skip large layout wrapper divs that contain other element types to avoid matching the wrapper
    if (el.tagName === 'DIV' && el.querySelector('p, span, li, td')) {
      continue;
    }

    const text = el.textContent || '';
    const cleanText = text.trim().toLowerCase().replace(/\s+/g, ' ');

    if (cleanText.includes(cleanSearch)) {
      if (cleanText.length < minLength) {
        minLength = cleanText.length;
        bestMatch = el;
      }
    }
  }

  // Fallback: search including divs if no match was found
  if (!bestMatch) {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      const text = el.textContent || '';
      const cleanText = text.trim().toLowerCase().replace(/\s+/g, ' ');

      if (cleanText.includes(cleanSearch)) {
        if (cleanText.length < minLength) {
          minLength = cleanText.length;
          bestMatch = el;
        }
      }
    }
  }

  return bestMatch;
}

export default function EbookReader({ book, onClose, onUpdateProgress }: EbookReaderProps) {
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [localFileContent, setLocalFileContent] = useState<ArrayBuffer | null>(null);
  const [isOfflineChecked, setIsOfflineChecked] = useState(false);

  const fileUrl = book.fileUrl || '';
  const displayUrl = localBlobUrl || fileUrl;
  const chapters = (book.chapters as EbookChapter[]) || [];
  const hasRealFile = !!displayUrl;
  const isPdf = fileUrl.toLowerCase().endsWith('.pdf');
  const isTxt = fileUrl.toLowerCase().endsWith('.txt');
  const isMobi = fileUrl.toLowerCase().endsWith('.mobi');
  const isUnsupportedEbook = fileUrl.toLowerCase().endsWith('.azw3') || fileUrl.toLowerCase().endsWith('.djvu') || isMobi;
  const isEpub = fileUrl.toLowerCase().endsWith('.epub') || (book.type === 'ebook' && !isPdf && !isTxt && !isUnsupportedEbook && !isMobi);
  
  // With react-reader, EPUBs never fail to render client-side even if backend extraction failed
  const extractionFailed = !isEpub && !isPdf && !isTxt && !isMobi && !isUnsupportedEbook && hasRealFile && chapters.length === 0;
  
  // Immersive view logic: only show native view (iframe) for non-epub or if explicitly desired
  const isNativeView = (hasRealFile && chapters.length === 0 && !isEpub && !isUnsupportedEbook && !isMobi) || isPdf;

  useEffect(() => {
    console.log("EbookReader rendering state:", { 
      bookId: book.id,
      fileUrl: book.fileUrl,
      chaptersLength: book.chapters?.length,
      displayUrl,
      isEpub,
      isPdf,
      hasRealFile,
      isNativeView,
      extractionFailed
    });
  }, [book, displayUrl, isEpub, isPdf, hasRealFile, isNativeView, extractionFailed]);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function checkOffline() {
      try {
        const offline = await getOfflineFile(book.id);
        if (offline && active) {
          const url = URL.createObjectURL(offline.blob);
          const buffer = await offline.blob.arrayBuffer();
          if (active) {
            urlToRevoke = url;
            setLocalBlobUrl(url);
            setLocalFileContent(buffer);
          }
        }
      } catch (e) {
        console.error("LocalFile check failed in EbookReader:", e);
      } finally {
        if (active) {
          setIsOfflineChecked(true);
        }
      }
    }

    checkOffline();

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [book.id]);

  // ReactReader integration states
  const [epubLocation, setEpubLocation] = useState<string | null>(() => {
    return localStorage.getItem(`bookrr-cfi-${book.id}`) || null;
  });
  const [toc, setToc] = useState<any[]>([]);
  const [currentChapterTitle, setCurrentChapterTitle] = useState<string>(book.title);
  const [numPdfPages, setNumPdfPages] = useState<number | null>(null);
  const [pdfScale, setPdfScale] = useState<number>(1.0);
  const [epubProgress, setEpubProgress] = useState<number>(() => {
    const saved = localStorage.getItem(`bookrr-progress-${book.id}`);
    return saved ? parseInt(saved) : (book.progress || 0);
  });
  const renditionRef = useRef<any>(null);
  const prefetchTimeoutRef = useRef<any>(null);

  // Helper to recursively find active TOC item by href
  const findTocItemByHref = (tocList: any[], href: string): any => {
    const targetPath = href.split('#')[0];
    for (const item of tocList) {
      if (item.href) {
        const itemPath = item.href.split('#')[0];
        if (itemPath === targetPath || targetPath.endsWith(itemPath) || itemPath.endsWith(targetPath)) {
          return item;
        }
      }
      if (item.subitems && item.subitems.length > 0) {
        const found = findTocItemByHref(item.subitems, href);
        if (found) return found;
      }
    }
    return null;
  };

  const navigateToHref = (href: string) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
    }
  };

  const handleLocationChanged = (loc: string) => {
    setEpubLocation(loc);
    localStorage.setItem(`bookrr-cfi-${book.id}`, loc);
    
    if (readAloudState.isSpeaking && readAloudState.bookId === book.id) return;

    if (renditionRef.current) {
      const currentLocation = renditionRef.current.currentLocation();
      if (currentLocation && currentLocation.start) {
        const idx = currentLocation.start.index;
        const total = renditionRef.current.book.spine.length || 1;
        const calculatedP = Math.floor((idx / total) * 100);
        setEpubProgress(calculatedP);
        
        // Save progress to local preferences and update progress
        localStorage.setItem(`bookrr-progress-${book.id}`, calculatedP.toString());
        localStorage.setItem(`bookrr-last-page-${book.id}`, idx.toString());
        onUpdateProgress(book.id, idx, calculatedP);
        
        // Find TOC label
        const currentHref = currentLocation.start.href;
        if (toc && toc.length > 0) {
          const item = findTocItemByHref(toc, currentHref);
          if (item) {
            setCurrentChapterTitle(item.label);
            const tIdx = toc.findIndex(x => x.id === item.id || x.href === item.href);
            if (tIdx !== -1) {
              setActiveChapterIndex(tIdx);
            }
          }
        } else {
          setActiveChapterIndex(idx);
        }
      }
    }
  };

  // Reader core state
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(() => {
    const saved = localStorage.getItem(`bookrr-last-page-${book.id}`);
    return saved ? parseInt(saved) : (book.currentPage || 0);
  });
  
  const {
    theme, setTheme,
    fontSize, setFontSize,
    fontFamily, setFontFamily,
    margins, setMargins,
    lineSpacing, setLineSpacing,
    textAlign, setTextAlign,
    isDualPage, setIsDualPage,
    isPagedMode, setIsPagedMode
  } = useReaderSettings(book.id);
  const {
    state: readAloudState,
    startSpeaking,
    stopTts: globalStopTts,
    pauseTts,
    resumeTts,
    registerCallback
  } = useReadAloud();

  const [immersiveMode, setImmersiveMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const lastHighlightedElementRef = useRef<{
    element: HTMLElement;
    originalBackground: string;
    originalColor: string;
    originalTransition: string;
    originalBorderRadius: string;
    originalPadding: string;
  } | null>(null);

  const clearLastTtsHighlight = useCallback(() => {
    if (lastHighlightedElementRef.current) {
      const { element, originalBackground, originalColor, originalTransition, originalBorderRadius, originalPadding } = lastHighlightedElementRef.current;
      try {
        element.style.background = originalBackground;
        element.style.color = originalColor;
        element.style.transition = originalTransition;
        element.style.borderRadius = originalBorderRadius;
        element.style.padding = originalPadding;
      } catch (e) {
        console.warn("Failed to clear highlight style:", e);
      }
      lastHighlightedElementRef.current = null;
    }
  }, []);

  const highlightAndScrollToText = useCallback((textToFind: string) => {
    if (!textToFind) {
      clearLastTtsHighlight();
      return;
    }

    clearLastTtsHighlight();

    let highlightBg = 'rgba(254, 240, 138, 0.65)';
    let highlightText = '#171717';
    
    if (theme === 'sepia') {
      highlightBg = 'rgba(217, 119, 6, 0.25)';
      highlightText = '#433422';
    } else if (theme === 'soft') {
      highlightBg = 'rgba(74, 119, 74, 0.25)';
      highlightText = '#2d3a2d';
    } else if (theme === 'dusk') {
      highlightBg = 'rgba(99, 102, 241, 0.35)';
      highlightText = '#ffffff';
    } else if (theme === 'night') {
      highlightBg = 'rgba(255, 255, 255, 0.15)';
      highlightText = '#f5f5f5';
    } else if (theme === 'amoled') {
      highlightBg = 'rgba(255, 255, 255, 0.2)';
      highlightText = '#ffffff';
    }

    let targetElement: HTMLElement | null = null;

    if (isEpub) {
      if (renditionRef.current) {
        try {
          const contents = renditionRef.current.getContents();
          if (contents && contents.length > 0) {
            for (const content of contents) {
              const doc = content.document;
              if (doc) {
                targetElement = findElementContainingText(doc, textToFind);
                if (targetElement) break;
              }
            }
          }
        } catch (e) {
          console.error("Error searching iframe document for TTS text:", e);
        }
      }
    } else {
      if (scrollContainerRef.current) {
        targetElement = findElementContainingText(scrollContainerRef.current, textToFind);
      }
    }

    if (!targetElement) return;

    try {
      const originalBackground = targetElement.style.background || '';
      const originalColor = targetElement.style.color || '';
      const originalTransition = targetElement.style.transition || '';
      const originalBorderRadius = targetElement.style.borderRadius || '';
      const originalPadding = targetElement.style.padding || '';

      lastHighlightedElementRef.current = {
        element: targetElement,
        originalBackground,
        originalColor,
        originalTransition,
        originalBorderRadius,
        originalPadding
      };

      targetElement.style.transition = 'all 0.3s ease';
      targetElement.style.borderRadius = '6px';
      targetElement.style.padding = '2px 6px';
      targetElement.style.background = highlightBg;
      targetElement.style.color = highlightText;

      // Only scroll into view if NOT already comfortably visible to avoid layout thrashing and stutters.
      const isVisible = (() => {
        try {
          const rect = targetElement.getBoundingClientRect();
          const doc = targetElement.ownerDocument || document;
          const viewHeight = doc.documentElement.clientHeight || window.innerHeight;
          // Comfortably visible means vertically within 15% to 85% of viewport
          return rect.top >= viewHeight * 0.15 && rect.bottom <= viewHeight * 0.85;
        } catch (e) {
          return false;
        }
      })();

      if (!isVisible) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    } catch (e) {
      console.error("Failed to highlight and scroll target element:", e);
    }
  }, [theme, isEpub, clearLastTtsHighlight]);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem(`bookrr-last-page-${book.id}`, activeChapterIndex.toString());
  }, [activeChapterIndex, book.id]);

  // Sync highlighting with global player
  useEffect(() => {
    if (readAloudState.isSpeaking && readAloudState.bookId === book.id) {
      // Re-apply highlight if we just opened the book
      if (readAloudState.sentences[readAloudState.currentIndex]) {
        highlightAndScrollToText(readAloudState.sentences[readAloudState.currentIndex]);
      }
    }

    registerCallback(
      // onNextChapter
      () => {
        if (activeChapterIndex < chapters.length - 1) {
          setActiveChapterIndex(prev => prev + 1);
        }
      },
      // onSentenceChange
      (index) => {
        if (readAloudState.bookId === book.id) {
          const sentence = readAloudState.sentences[index];
          if (sentence) {
            highlightAndScrollToText(sentence);
          }
        }
      }
    );
  }, [readAloudState.isSpeaking, readAloudState.bookId, book.id, activeChapterIndex, chapters.length, registerCallback, highlightAndScrollToText]);

  // Overlay states
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'contents' | 'bookmarks' | 'highlights' | 'info'>('contents');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'font' | 'layout' | 'themes'>('font');
  const [showSearch, setShowSearch] = useState(false);

  // Settings that affect TTS
  const [ttsRate, setTtsRate] = useState<number>(() => {
    return parseFloat(localStorage.getItem('bookrr-pref-ttsRate') || '1.0');
  });
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(() => {
    return localStorage.getItem('bookrr-pref-selectedVoice') || '';
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const wakeLockRef = useRef<any>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);

  const isTtsSpeaking = readAloudState.isSpeaking && readAloudState.bookId === book.id;
  const isTtsPaused = readAloudState.isPaused;

  const stripHtml = (htmlContent: string) => {
    if (typeof document !== 'undefined') {
      const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
      return doc.body.textContent || '';
    }
    return htmlContent.replace(/<[^>]*>/g, '');
  };

  const getEpubText = (): string => {
    if (renditionRef.current) {
      try {
        const contents = renditionRef.current.getContents();
        if (contents && contents.length > 0) {
          return contents.map((c: any) => c.document?.body?.innerText || '').join('\n');
        }
      } catch (e) {
        console.error("Failed to extract Epub text content:", e);
      }
    }
    return '';
  };

  const prepareTtsText = () => {
    let rawText = '';
    if (isEpub) {
      rawText = getEpubText();
      if (!rawText) {
        rawText = currentChapterTitle || book.title;
      }
    } else {
      rawText = stripHtml(currentChapter.content);
    }

    // Sanitize and replace abbreviations to prevent false sentence termination and sound more natural
    const sanitizeText = (text: string): string => {
      return text
        .replace(/\bMr\./gi, 'Mister')
        .replace(/\bMrs\./gi, 'Missus')
        .replace(/\bMs\./gi, 'Miss')
        .replace(/\bDr\./gi, 'Doctor')
        .replace(/\bProf\./gi, 'Professor')
        .replace(/\bSt\./gi, 'Saint')
        .replace(/\be\.g\./gi, 'for example')
        .replace(/\bi\.e\./gi, 'that is')
        .replace(/\bvs\./gi, 'versus')
        .replace(/\bco\./gi, 'company')
        .replace(/\betc\./gi, 'etcetera')
        .replace(/\bhwy\./gi, 'highway')
        .replace(/\bRd\./gi, 'Road')
        .replace(/\bSt\.\b/gi, 'Street')
        .replace(/\bAve\./gi, 'Avenue')
        .replace(/\bJan\./gi, 'January')
        .replace(/\bFeb\./gi, 'February')
        .replace(/\bMar\./gi, 'March')
        .replace(/\bApr\./gi, 'April')
        .replace(/\bJun\./gi, 'June')
        .replace(/\bJul\./gi, 'July')
        .replace(/\bAug\./gi, 'August')
        .replace(/\bSep\./gi, 'September')
        .replace(/\bOct\./gi, 'October')
        .replace(/\bNov\./gi, 'November')
        .replace(/\bDec\./gi, 'December');
    };

    // Split into paragraphs post-sanitizing
    const paragraphs = rawText
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const sentences: string[] = [];
    paragraphs.forEach(p => {
      // Apply abbreviation sanitization on the paragraph
      const sanitizedParagraph = sanitizeText(p);

      // Split sentences using regex or simple match
      const m = sanitizedParagraph.match(/[^.!?]+[.!?]+(\s+|$)/g);
      const rawSentences: string[] = [];
      if (m) {
        m.forEach(match => {
          const clean = match.trim();
          if (clean.length > 1) {
            rawSentences.push(clean);
          }
        });
      } else if (sanitizedParagraph.trim().length > 1) {
        rawSentences.push(sanitizedParagraph.trim());
      }

      // Safeguard against ultra-long sentences and aggressively chunk for fast TTS
      rawSentences.forEach(sentence => {
        const isNeural = localStorage.getItem('bookrr_tts_engine') === 'neural';
        const MAX_LEN = isNeural ? 30 : 150;

        if (sentence.length <= MAX_LEN) {
          sentences.push(sentence);
          return;
        }

        const splitPattern = /([,;:\-—()]+)/;
        const rawParts = sentence.split(splitPattern);
        const parts: string[] = [];

        for (let i = 0; i < rawParts.length; i++) {
          let part = rawParts[i];
          if (i > 0 && part.match(/^[,;:\-—()]+$/)) {
            if (parts.length > 0) {
              parts[parts.length - 1] += part;
            } else {
              parts.push(part);
            }
          } else if (part.trim().length > 0) {
            parts.push(part);
          }
        }

        let currentPart = '';
        parts.forEach(part => {
          if ((currentPart + ' ' + part).length <= MAX_LEN) {
            currentPart = currentPart ? (currentPart + ' ' + part) : part;
          } else {
            if (currentPart.trim().length > 1) {
              sentences.push(currentPart.trim());
            }
            currentPart = part;
          }
        });
        if (currentPart.trim().length > 1) {
          sentences.push(currentPart.trim());
        }
      });
    });

    return sentences.filter(s => s.length > 0);
  };

  const handleTtsPlayPause = () => {
    if (readAloudState.isSpeaking && readAloudState.bookId === book.id) {
      if (readAloudState.isPaused) {
        resumeTts();
      } else {
        pauseTts();
      }
      return;
    }

    // Prepare text and start speaking globally
    const sentences = prepareTtsText();
    if (sentences.length > 0) {
      startSpeaking(
        book.id,
        book.title,
        sentences,
        0, 
        activeChapterIndex,
        selectedVoiceName,
        ttsRate
      );
    }
  };

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

  // Drafting / Creation selections for Highlights and Annotations
  const [activeSelectionText, setActiveSelectionText] = useState<string | null>(null);
  const [activeSelectionCfi, setActiveSelectionCfi] = useState<string | null>(null);
  const [annotationNote, setAnnotationNote] = useState<string>('');
  const [selectedHighlightColor, setSelectedHighlightColor] = useState<'amber' | 'emerald' | 'rose' | 'sky' | 'underline'>('amber');

  const clearActiveSelection = () => {
    setActiveSelectionText(null);
    setActiveSelectionCfi(null);
    setAnnotationNote('');
    
    try {
      window.getSelection()?.removeAllRanges();
    } catch (e) {}

    try {
      if (isEpub && renditionRef.current) {
        const contents = renditionRef.current.getContents();
        contents.forEach((content: any) => {
          content.window.getSelection()?.removeAllRanges();
        });
      }
    } catch (e) {}
  };

  const redrawHighlightsOnRendition = useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    // Remove any existing highlights style class
    highlights.forEach(hl => {
      if (hl.cfiRange) {
        try {
          rendition.annotations.remove(hl.cfiRange, "highlight");
        } catch (e) {}
      }
    });

    // Draw all active highlights
    highlights.forEach(hl => {
      if (hl.cfiRange) {
        let fillStyle = 'rgba(251, 191, 36, 0.4)'; // amber
        let borderStyle = 'none';

        if (hl.color === 'emerald') fillStyle = 'rgba(52, 211, 153, 0.4)';
        else if (hl.color === 'rose') fillStyle = 'rgba(248, 113, 113, 0.4)';
        else if (hl.color === 'sky') fillStyle = 'rgba(96, 165, 250, 0.4)';
        else if (hl.color === 'underline') {
          fillStyle = 'transparent';
          borderStyle = '1px solid #d97706';
        }

        try {
          rendition.annotations.add("highlight", hl.cfiRange, { id: hl.id }, null, "epub-selected-annotation", {
            fill: fillStyle,
            outline: borderStyle,
            "border-bottom": hl.color === 'underline' ? '2px dashed #f59e0b' : 'none'
          });
        } catch (e) {
          console.error("Failed to restore annotation:", e);
        }
      }
    });
  }, [highlights]);

  const handleSaveHighlight = () => {
    if (!activeSelectionText) return;

    const newHighlight: HighlightItem = {
      id: `hl-${Date.now()}`,
      chapterIndex: activeChapterIndex,
      text: activeSelectionText,
      note: annotationNote.trim() || undefined,
      color: selectedHighlightColor,
      createdAt: new Date().toISOString(),
      cfiRange: activeSelectionCfi || undefined
    };

    const updated = [...highlights, newHighlight];
    setHighlights(updated);
    localStorage.setItem(`bookrr-highlights-${book.id}`, JSON.stringify(updated));

    if (isEpub && activeSelectionCfi && renditionRef.current) {
      try {
        let fillStyle = 'rgba(251, 191, 36, 0.4)';
        let borderStyle = 'none';

        if (selectedHighlightColor === 'emerald') fillStyle = 'rgba(52, 211, 153, 0.4)';
        else if (selectedHighlightColor === 'rose') fillStyle = 'rgba(248, 113, 113, 0.4)';
        else if (selectedHighlightColor === 'sky') fillStyle = 'rgba(96, 165, 250, 0.4)';
        else if (selectedHighlightColor === 'underline') {
          fillStyle = 'transparent';
          borderStyle = '1px solid #d97706';
        }

        renditionRef.current.annotations.add("highlight", activeSelectionCfi, { id: newHighlight.id }, null, "epub-selected-annotation", {
          fill: fillStyle,
          outline: borderStyle,
          "border-bottom": selectedHighlightColor === 'underline' ? '2px dashed #f59e0b' : 'none'
        });
      } catch (e) {
        console.error("Error drawing live annotation:", e);
      }
    }

    clearActiveSelection();
  };

  const handleNonEpubSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      setActiveSelectionText(selection.toString().trim());
      setActiveSelectionCfi(null);
    }
  };

  const currentChapter = chapters[activeChapterIndex] || { title: 'No Content', content: 'This book has no chapters configured.' };
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeStyle = THEMES[theme];

  const customReaderStyles = useMemo(() => {
    let bgHex = '#ffffff';
    let textHex = '#171717';
    
    if (theme === 'light') { bgHex = '#ffffff'; textHex = '#171717'; }
    else if (theme === 'sepia') { bgHex = '#f4ecd8'; textHex = '#433422'; }
    else if (theme === 'soft') { bgHex = '#e3f0e3'; textHex = '#2d3a2d'; }
    else if (theme === 'dusk') { bgHex = '#2b2d42'; textHex = '#d4d4d4'; }
    else if (theme === 'night') { bgHex = '#121212'; textHex = '#a3a3a3'; }
    else if (theme === 'amoled') { bgHex = '#000000'; textHex = '#737373'; }

    return {
      ...ReactReaderStyle,
      container: {
        ...ReactReaderStyle.container,
        backgroundColor: bgHex,
        transition: 'background-color 0.3s ease',
      },
      readerArea: {
        ...ReactReaderStyle.readerArea,
        backgroundColor: bgHex,
        transition: 'background-color 0.3s ease',
      },
      reader: {
        ...ReactReaderStyle.reader,
        backgroundColor: bgHex,
        boxShadow: 'none',
      },
      loadingView: {
        ...ReactReaderStyle.loadingView,
        backgroundColor: bgHex,
        color: textHex,
        fontSize: '15px',
        fontFamily: 'serif',
        fontStyle: 'italic',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      },
      arrow: {
        ...ReactReaderStyle.arrow,
        color: textHex,
        background: 'none',
        opacity: 0.35,
        fontSize: '2.5rem',
        padding: '0 15px',
        transition: 'all 0.2s ease',
      },
      arrowHover: {
        ...ReactReaderStyle.arrowHover,
        color: textHex,
        opacity: 0.9,
        transform: 'scale(1.15)',
      },
    };
  }, [theme]);

  const applyThemeToRendition = () => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const fontName = fontFamily === 'sans' ? 'sans-serif' : fontFamily === 'serif' ? 'serif' : fontFamily === 'mono' ? 'monospace' : 'Atkinson Hyperlegible';
    
    let bgHex = '#ffffff';
    let textHex = '#171717';
    
    if (theme === 'light') { bgHex = '#ffffff'; textHex = '#171717'; }
    else if (theme === 'sepia') { bgHex = '#f4ecd8'; textHex = '#433422'; }
    else if (theme === 'soft') { bgHex = '#e3f0e3'; textHex = '#2d3a2d'; }
    else if (theme === 'dusk') { bgHex = '#2b2d42'; textHex = '#d4d4d4'; }
    else if (theme === 'night') { bgHex = '#121212'; textHex = '#a3a3a3'; }
    else if (theme === 'amoled') { bgHex = '#000000'; textHex = '#737373'; }

    rendition.getContents().forEach((content: any) => {
      content.addStylesheet('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible&display=swap');
      
      let padX = '28px';
      if (margins === 'narrow') padX = '8px';
      else if (margins === 'wide') padX = '64px';
      
      // If template contains horizontal flow (paged mode), reduce body margins to prevent multi-column cutoff
      if (isPagedMode) {
        padX = '28px';
      }
      
      content.addStylesheetRules({
        'body': {
          'padding-left': `${padX} !important`,
          'padding-right': `${padX} !important`,
          'font-family': `${fontName} !important`,
          'background-color': `${bgHex} !important`,
          'color': `${textHex} !important`
        },
        'p, span, div, h1, h2, h3, h4, h5, h6, table, tr, td, ul, li': {
          'font-family': `${fontName} !important`,
          'color': `${textHex} !important`
        }
      });
    });

    rendition.themes.register(theme, {
      body: {
        background: bgHex,
        color: textHex,
        'font-family': fontName,
        'line-height': lineSpacing === 'compact' ? '1.4' : lineSpacing === 'comfort' ? '1.8' : '2.2',
        'text-align': textAlign === 'left' ? 'left' : 'justify'
      },
      p: {
        'font-family': fontName,
        'line-height': lineSpacing === 'compact' ? '1.4' : lineSpacing === 'comfort' ? '1.8' : '2.2',
        'text-align': textAlign === 'left' ? 'left' : 'justify'
      }
    });
    
    rendition.themes.select(theme);
    rendition.themes.fontSize(`${fontSize}px`);
  };

  useEffect(() => {
    applyThemeToRendition();
  }, [theme, fontSize, fontFamily, lineSpacing, margins, textAlign, epubLocation]);

  const handleRetryExtraction = async () => {
    setIsProcessing(true);
    try {
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
  const computedProgress = isEpub 
    ? epubProgress 
    : (chapters.length > 0 ? Math.floor(((activeChapterIndex + 1) / chapters.length) * 100) : 0);
    
  const totalChapters = isEpub ? (toc.length || 1) : (chapters.length || 1);

  // Persistence & Initialization
  useEffect(() => {
    const savedBookmarks = localStorage.getItem(`bookrr-bookmarks-${book.id}`);
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks));

    const savedHighlights = localStorage.getItem(`bookrr-highlights-${book.id}`);
    if (savedHighlights) setHighlights(JSON.parse(savedHighlights));
  }, [book.id]);

  // Sync scroll on chapter change
  useEffect(() => {
    if (!isEpub && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeChapterIndex, isEpub]);

  const handleNext = () => {
    if (isEpub) {
      if (renditionRef.current) {
        renditionRef.current.next();
      }
    } else {
      if (activeChapterIndex < chapters.length - 1) {
        const next = activeChapterIndex + 1;
        setActiveChapterIndex(next);
        onUpdateProgress(book.id, next, Math.floor(((next + 1) / chapters.length) * 100));
      }
    }
  };

  const handlePrev = () => {
    if (isEpub) {
      if (renditionRef.current) {
        renditionRef.current.prev();
      }
    } else {
      if (activeChapterIndex > 0) {
        const prev = activeChapterIndex - 1;
        setActiveChapterIndex(prev);
        onUpdateProgress(book.id, prev, Math.floor(((prev + 1) / chapters.length) * 100));
      }
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
        label: isEpub ? currentChapterTitle : (currentChapter.title || 'Untitled Segment'),
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

  const renderTocList = (items: any[], depth = 0): React.ReactNode => {
    return items.map((ch, idx) => {
      const isSelected = currentChapterTitle === ch.label || (renditionRef.current && renditionRef.current.currentLocation()?.start?.href?.split('#')[0] === ch.href?.split('#')[0]);
      
      return (
        <div key={ch.id || `${ch.href}-${idx}`} className="w-full flex flex-col">
          <button
            onClick={() => {
              navigateToHref(ch.href);
              setShowMenu(false);
            }}
            style={{ paddingLeft: `${Math.max(12, depth * 16)}px` }}
            className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-all ${isSelected ? 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
          >
            <div className="flex items-center gap-3 truncate">
              {depth === 0 && (
                <span className={`w-5 h-5 shrink-0 flex items-center justify-center text-[9px] font-mono rounded-lg border ${isSelected ? 'border-amber-500/50 bg-amber-500/10' : 'border-neutral-500/20 opacity-50'}`}>
                  {idx + 1}
                </span>
              )}
              <span className={`text-xs tracking-tight truncate ${isSelected ? 'font-bold font-serif' : 'font-medium opacity-80'}`}>{ch.label}</span>
            </div>
          </button>
          {ch.subitems && ch.subitems.length > 0 && renderTocList(ch.subitems, depth + 1)}
        </div>
      );
    });
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
                <p className={`text-[10px] ${activeStyle.sub} italic truncate`}>{isEpub ? currentChapterTitle : currentChapter.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => setShowSearch(true)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
                <Search size={18} />
              </button>
              <button onClick={toggleBookmark} className={`p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors ${isBookmarked ? 'text-amber-500' : ''}`}>
                <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
              <button 
                onClick={handleTtsPlayPause} 
                className={`p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors relative ${readAloudState.isSpeaking && readAloudState.bookId === book.id ? 'text-amber-600 bg-amber-500/10' : ''}`}
                title="Read Aloud (TTS)"
              >
                <Volume2 size={18} />
                {readAloudState.isSpeaking && readAloudState.bookId === book.id && !readAloudState.isPaused && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
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
        onClick={() => !isEpub && setImmersiveMode(!immersiveMode)}
        className={`flex-1 ${isEpub || isNativeView || extractionFailed ? 'overflow-hidden' : 'overflow-y-auto'} h-full custom-scrollbar`}
      >
        {!isOfflineChecked ? (
          <div className="flex items-center justify-center w-full h-full flex-col gap-2 opacity-50">
            <div className="w-8 h-8 rounded-full border-2 border-t-amber-500 border-r-amber-500 border-b-transparent border-l-transparent animate-spin"></div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#888]">Loading Offline Data</p>
          </div>
        ) : !displayUrl && !localBlobUrl ? (
          <div className="flex items-center justify-center w-full h-full opacity-50 uppercase tracking-widest font-bold text-xs">No book file found.</div>
        ) : displayUrl && isUnsupportedEbook ? (
           <div className={`mx-auto w-full h-full flex flex-col pt-20 pb-32`}>
             <div className="flex-1 flex items-center justify-center p-6">
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className={`max-w-md w-full p-8 rounded-3xl border ${activeStyle.border} ${activeStyle.panel} shadow-2xl text-center space-y-6`}
               >
                 <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto">
                   <Download size={40} />
                 </div>
                 <div className="space-y-4">
                   <h2 className="text-2xl font-bold italic font-serif">Format Not Supported</h2>
                   <p className={`text-sm ${activeStyle.sub} leading-relaxed`}>
                     The web reader currently cannot render this file type directly in the browser. 
                     Please download the file to read it in your preferred e-reader application.
                   </p>
                 </div>
                 <div className="flex flex-col gap-3">
                   <a 
                     href={displayUrl}
                     download={book.title}
                     target="_blank"
                     rel="noreferrer"
                     onClick={(e) => { e.stopPropagation(); }}
                     className={`w-full py-4 rounded-xl bg-amber-600 text-white font-bold flex items-center justify-center gap-2 transition-all hover:bg-amber-700 active:scale-95`}
                   >
                     Download File
                   </a>
                 </div>
               </motion.div>
             </div>
           </div>
        ) : displayUrl && isEpub ? (
          <div className={`w-full h-full transition-all duration-500 ${immersiveMode ? 'pt-2 pb-2' : 'pt-14 pb-16'} relative ${activeStyle.bg}`} style={{ height: '100vh' }}>
            <div className="w-full h-full relative">
              <ReactReader
                url={localFileContent || displayUrl}
                title={book.title}
                location={epubLocation}
                locationChanged={handleLocationChanged}
                showToc={false}
                readerStyles={customReaderStyles}
                epubOptions={{
                  flow: isPagedMode ? 'paginated' : 'scrolled',
                  width: '100%',
                  height: '100%',
                }}
                loadingView={<div className={`flex items-center justify-center h-full w-full ${activeStyle.bg} ${activeStyle.text}`}>Loading Book Content...</div>}
                getRendition={(rendition) => {
                  renditionRef.current = rendition;
                  
                  // Fetch Table of Contents once loaded natively from the EPUB
                  rendition.book.loaded.navigation.then((nav: any) => {
                    if (nav && nav.toc) {
                      setToc(nav.toc);
                    }
                  });

                  // Add custom styles for better readability and selection support
                  rendition.themes.default({
                    'selection': {
                      'background': theme === 'light' ? '#fde68a !important' : '#1e3a8a !important',
                      'color': theme === 'light' ? '#1f2937 !important' : '#ffffff !important'
                    }
                  });

                  // Handle touch/click toggle
                  rendition.on('click', () => {
                    setImmersiveMode(prev => !prev);
                  });

                  // Bind Selection events
                  rendition.on('selected', (cfiRange: string, contents: any) => {
                    const selection = contents.window.getSelection();
                    const selectedText = selection.toString().trim();
                    if (selectedText.length > 0) {
                      setActiveSelectionText(selectedText);
                      setActiveSelectionCfi(cfiRange);
                    }
                  });

                  // Dynamically re-apply theme
                  rendition.on('rendered', () => {
                    applyThemeToRendition();
                    redrawHighlightsOnRendition();
                  });
                  rendition.on('relocated', () => {
                    applyThemeToRendition();
                    redrawHighlightsOnRendition();
                  });
                  
                  applyThemeToRendition();
                }}
              />
            </div>
          </div>
        ) : (
          <div className={`mx-auto w-full h-full flex flex-col pt-20 pb-32 ${marginStyles[margins]} transition-all duration-500`}>
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
                    href={displayUrl} 
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
            <div className="w-full h-full flex flex-col rounded-xl overflow-hidden shadow-2xl border border-neutral-500/20 bg-neutral-100">
              <div className="bg-amber-500/10 p-3 text-[10px] font-mono justify-between border-b border-amber-500/20 text-amber-600 shrink-0 flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Zap size={12} />
                  {isPdf ? 'PDF VIEWER ACTIVE' : 'NATIVE SOURCE VIEW ACTIVE'}
                </div>
                {isPdf && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPdfScale(s => Math.max(0.5, s - 0.25))} className="px-2 py-1 rounded bg-white hover:bg-neutral-100 border border-neutral-200">A-</button>
                    <span className="w-12 text-center">{Math.round(pdfScale * 100)}%</span>
                    <button onClick={() => setPdfScale(s => Math.min(3.0, s + 0.25))} className="px-2 py-1 rounded bg-white hover:bg-neutral-100 border border-neutral-200">A+</button>
                  </div>
                )}
              </div>
              {isPdf ? (
                <div className="flex-1 overflow-auto w-full custom-scrollbar relative flex justify-center p-4">
                  <Document 
                    file={displayUrl} 
                    onLoadSuccess={({ numPages }) => setNumPdfPages(numPages)}
                    loading={<div className="flex items-center justify-center h-64 text-neutral-500">Loading document...</div>}
                    error={<div className="flex items-center justify-center h-64 text-red-500">Failed to load PDF</div>}
                  >
                    {Array.from(new Array(numPdfPages || 0), (el, index) => (
                      <div key={`page_${index + 1}`} className="mb-8 shadow-xl bg-white flex justify-center border border-neutral-300">
                         <Page 
                            pageNumber={index + 1} 
                            scale={pdfScale}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                         />
                      </div>
                    ))}
                  </Document>
                </div>
              ) : (
                <iframe 
                  src={displayUrl} 
                  className="w-full h-full border-none flex-1 bg-white"
                  title={book.title}
                />
              )}
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
                onMouseUp={handleNonEpubSelection}
                onTouchEnd={handleNonEpubSelection}
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
      )}
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
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleTtsPlayPause();
                  }}
                  className={`flex flex-col items-center gap-0.5 transition-opacity ${readAloudState.isSpeaking && readAloudState.bookId === book.id ? 'text-amber-600 opacity-100' : 'opacity-70 hover:opacity-100'}`}
                >
                  <Volume2 size={18} />
                  <span>{readAloudState.isSpeaking && readAloudState.bookId === book.id && !readAloudState.isPaused ? 'SPEAKING' : 'READ ALOUD'}</span>
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

      {/* Side Menu (Drawer) */}
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
                    {isEpub ? (
                      toc.length === 0 ? (
                        <div className="py-20 text-center opacity-30 text-xs italic">Loading chapters from EPUB...</div>
                      ) : (
                        renderTocList(toc)
                      )
                    ) : (
                      chapters.map((ch, idx) => {
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
                      })
                    )}
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
                              <div className={`w-1 h-4 rounded-full ${hl.color === 'amber' ? 'bg-amber-500' : hl.color === 'emerald' ? 'bg-emerald-500' : hl.color === 'rose' ? 'bg-rose-500' : hl.color === 'sky' ? 'bg-sky-500' : 'bg-neutral-500'}`} />
                              <span className={`text-[9px] font-bold uppercase ${activeStyle.sub}`}>Ch {hl.chapterIndex + 1}</span>
                            </div>
                            <button 
                              onClick={() => {
                                if (isEpub && hl.cfiRange && renditionRef.current) {
                                  try {
                                    renditionRef.current.annotations.remove(hl.cfiRange, "highlight");
                                  } catch (e) {
                                    console.error("Failed to remove live annotation style:", e);
                                  }
                                }
                                const updated = highlights.filter(h => h.id !== hl.id);
                                setHighlights(updated);
                                localStorage.setItem(`bookrr-highlights-${book.id}`, JSON.stringify(updated));
                              }}
                              className="text-rose-500 opacity-40 hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className="text-xs italic leading-relaxed line-clamp-3">"{hl.text}"</p>
                          {hl.note && (
                            <div className="p-2.5 rounded bg-amber-500/5 border border-amber-500/10 text-[11px] text-neutral-300 leading-normal flex flex-col gap-1">
                              <span className="font-bold uppercase tracking-wider text-[8px] text-amber-500">Annotation Note</span>
                              <p className="font-sans whitespace-pre-wrap">{hl.note}</p>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-1 border-t border-neutral-500/5">
                            <span className="text-[9px] opacity-40">{new Date(hl.createdAt).toLocaleDateString()}</span>
                            <button 
                              onClick={() => { 
                                if (isEpub) {
                                  if (toc[hl.chapterIndex]) {
                                    navigateToHref(toc[hl.chapterIndex].href);
                                  }
                                } else {
                                  setActiveChapterIndex(hl.chapterIndex);
                                }
                                setShowMenu(false); 
                              }}
                              className="text-[9px] font-bold text-amber-600 hover:underline"
                            >
                              JUMP TO Location
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
                                onClick={() => {
                                  if (isEpub) {
                                    if (toc[bm.chapterIndex]) {
                                      navigateToHref(toc[bm.chapterIndex].href);
                                    }
                                  } else {
                                    setActiveChapterIndex(bm.chapterIndex);
                                  }
                                  setShowMenu(false);
                                }}
                                className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded"
                             >
                               GO TO Location
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
        .rainbow-underline {
          background: linear-gradient(to right, #f59e0b, #10b981, #ef4444, #3b82f6) !important;
        }
      `}} />

      {/* Floating Highlight Annotator Panel */}
      <AnimatePresence>
        {activeSelectionText && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[92%] sm:w-full max-w-lg p-5 rounded-3xl border border-neutral-500/20 bg-neutral-950/95 backdrop-blur-lg shadow-2xl text-left space-y-4 font-sans text-neutral-100"
          >
            {/* Header / Dismiss */}
            <div className="flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <Highlighter className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="text-sm font-bold tracking-tight">Create Highlight & Note</h3>
              </div>
              <button 
                onClick={clearActiveSelection}
                className="p-1.5 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Selected Quote */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 text-xs italic opacity-90 leading-relaxed text-neutral-200 max-h-24 overflow-y-auto custom-scrollbar">
              "{activeSelectionText}"
            </div>

            {/* Color Select */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Highlight Style</label>
              <div className="flex items-center gap-2.5">
                {[
                  { name: 'amber', class: 'bg-amber-400 ring-amber-500/30' },
                  { name: 'emerald', class: 'bg-emerald-450 ring-emerald-500/30' },
                  { name: 'rose', class: 'bg-rose-450 ring-rose-500/30' },
                  { name: 'sky', class: 'bg-sky-450 ring-sky-500/30' },
                  { name: 'underline', class: 'rainbow-underline border border-white/20' }
                ].map((colorObj) => (
                  <button
                    key={colorObj.name}
                    onClick={() => setSelectedHighlightColor(colorObj.name as any)}
                    className={`w-8 h-8 rounded-full transition-all relative flex items-center justify-center cursor-pointer ${
                      colorObj.class
                    } ${
                      selectedHighlightColor === colorObj.name 
                        ? 'scale-110 ring-4 ring-offset-2 ring-offset-black' 
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    {selectedHighlightColor === colorObj.name && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Annotation Text Area */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider font-bold text-neutral-400">Add Personal Annotation (Optional)</label>
              <textarea
                value={annotationNote}
                onChange={(e) => setAnnotationNote(e.target.value)}
                placeholder="Write your thoughts, commentary, or summaries for this passage..."
                className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 resize-none h-18 custom-scrollbar leading-relaxed"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={clearActiveSelection}
                className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-bold text-center transition cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={handleSaveHighlight}
                className="flex-[1.5] py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-xs font-bold text-black text-center transition shadow-lg shadow-amber-500/25 cursor-pointer"
              >
                Save Annotations
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
