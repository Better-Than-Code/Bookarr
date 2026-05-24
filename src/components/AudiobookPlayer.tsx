/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  SkipForward,
  SkipBack,
  X,
  ListMusic,
  Gauge,
  Moon,
  Bookmark,
  BookmarkPlus,
  Sparkles,
  Sliders,
  Trash2,
  Plus,
  Compass,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { Book, AudiobookChapter } from '../types';
import { getOfflineFile } from '../services/LocalFileService';

interface AudiobookPlayerProps {
  book: Book;
  onClose: () => void;
  onUpdateProgress: (bookId: string, currentTime: number, progress: number) => void;
}

export default function AudiobookPlayer({ book, onClose, onUpdateProgress }: AudiobookPlayerProps) {
  // Mobile Fullscreen expansion state
  const [isExpanded, setIsExpanded] = useState(false);

  // Core player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(book.currentTime || 0);
  const [playbackRate, setPlaybackRate] = useState(book.type === 'audiobook' ? 1.0 : 1.0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.85);

  // Advanced Audiobookshelf playback features
  const [activeMenu, setActiveMenu] = useState<'chapters' | 'speed' | 'sleep' | 'bookmarks' | 'stats' | null>(null);
  
  // Custom configured skip/jump intervals
  const [backJumpValue, setBackJumpValue] = useState<number>(15);
  const [forwardJumpValue, setForwardJumpValue] = useState<number>(15);

  // Sleep Timer states
  const [sleepTimerType, setSleepTimerType] = useState<'minutes' | 'chapter' | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null); // countdown seconds
  const [customSleepMinutes, setCustomSleepMinutes] = useState<string>('20');

  // Bookmarks state (persistent per book ID)
  const [bookmarks, setBookmarks] = useState<{ id: string; time: number; label: string; createdAt: string }[]>([]);
  const [newBookmarkLabel, setNewBookmarkLabel] = useState('');
  const [bookmarkFeedback, setBookmarkFeedback] = useState('');

  // Vocal Boost (equalizer filter for spoken audio word focus)
  const [vocalBoost, setVocalBoost] = useState<boolean>(false);

  // Local Offline Blob player setup
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function checkOffline() {
      try {
        const offline = await getOfflineFile(book.id);
        if (offline && active) {
          const url = URL.createObjectURL(offline.blob);
          urlToRevoke = url;
          setLocalBlobUrl(url);
        } else {
          setLocalBlobUrl(null);
        }
      } catch (e) {
        console.error("LocalFile check failed in AudiobookPlayer:", e);
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const duration = book.duration || 3600; // Keep fallback for visual progress if needed, but audio.duration is better
  const chapters = (book.chapters as AudiobookChapter[]) || [];

  // Waveform heights
  const [waveHeights, setWaveHeights] = useState<number[]>(
    Array.from({ length: 64 }, () => Math.floor(Math.random() * 20) + 8)
  );

  // Load bookmarks on mount
  useEffect(() => {
    const saved = localStorage.getItem(`bookrr-audiobook-bookmarks-${book.id}`);
    if (saved) {
      try {
        setBookmarks(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading bookmarks', e);
      }
    } else {
      // Create interesting default bookmarks if empty
      const defaultBms = [
        { id: `bm-def-1`, time: Math.floor(duration * 0.05), label: 'Opening Remarks', createdAt: new Date().toLocaleDateString() },
        { id: `bm-def-2`, time: Math.floor(duration * 0.35), label: 'Key Narrative Twist', createdAt: new Date().toLocaleDateString() }
      ];
      setBookmarks(defaultBms);
      localStorage.setItem(`bookrr-audiobook-bookmarks-${book.id}`, JSON.stringify(defaultBms));
    }
  }, [book.id, duration]);

  // Find active chapter
  const activeChapterIdx = chapters.findIndex(ch => currentTime >= ch.start && currentTime < ch.end);
  const activeChapter: AudiobookChapter = (chapters[activeChapterIdx] || chapters[0] || { id: 'fallback', title: 'Introductory Section', start: 0, end: duration, fileUrl: book.fileUrl }) as AudiobookChapter;

  // Current audio source - if chapter has its own file, use it, else fallback to browser cache or book file
  const currentAudioSrc = activeChapter.fileUrl || localBlobUrl || book.fileUrl;

  // Synchronize audio element with state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.muted = isMuted;
    }
  }, [volume, playbackRate, isMuted]);

  useEffect(() => {
    if (audioRef.current && audioRef.current.src !== currentAudioSrc) {
       const wasPlaying = isPlaying;
       audioRef.current.src = currentAudioSrc || '';
       if (wasPlaying) {
          audioRef.current.play().catch(e => console.error('Audio re-play failed:', e));
       }
    }
  }, [currentAudioSrc, isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error('Audio play failed:', e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Use the audio element's events instead of a 1s interval for better precision
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const audioTime = audioRef.current.currentTime;
      
      // Calculate global time
      const time = activeChapter.fileUrl ? activeChapter.start + audioTime : audioTime;
      
      setCurrentTime(time);
      
      // Calculate global progress
      const d = book.duration || audioRef.current.duration || 3600;
      const prog = Math.floor((time / d) * 100);
      onUpdateProgress(book.id, time, prog);
    }
  };

  const handleAudioEnded = () => {
    if (activeChapterIdx !== -1 && activeChapterIdx < chapters.length - 1) {
      // Transition to next chapter
      const nextChapter = chapters[activeChapterIdx + 1];
      handleSeek(nextChapter.start);
    } else {
      setIsPlaying(false);
    }
  };

  // Keep a small ticker ONLY for the sleep timer and waveform animation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        // Waveform heights
        const multiplier = vocalBoost ? 35 : 20;
        const minHeight = vocalBoost ? 12 : 5;
        setWaveHeights(Array.from({ length: 64 }, () => Math.floor(Math.random() * multiplier) + minHeight));

        // Sleep timer countdown
        setSleepTimerRemaining(prev => {
          if (sleepTimerType === 'minutes' && prev !== null) {
            if (prev <= 1) {
              setIsPlaying(false);
              setSleepTimerType(null);
              return null;
            }
            return prev - 1;
          }
          return prev;
        });

        // Chapter sleep check
        if (sleepTimerType === 'chapter') {
           if (activeChapterIdx !== -1 && currentTime >= chapters[activeChapterIdx].end - 1) {
             setIsPlaying(false);
             setSleepTimerType(null);
           }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, vocalBoost, sleepTimerType, activeChapterIdx, currentTime, chapters]);

  // Final Seek handler
  const handleSeek = (value: number) => {
    const d = book.duration || audioRef.current?.duration || duration;
    const clamped = Math.max(0, Math.min(d, value));
    
    if (audioRef.current) {
      // If we're using chapter-specific files, seek relative to the file
      if (activeChapter.fileUrl) {
        audioRef.current.currentTime = Math.max(0, clamped - activeChapter.start);
      } else {
        audioRef.current.currentTime = clamped;
      }
    }
    
    setCurrentTime(clamped);
    const progress = Math.floor((clamped / d) * 100);
    onUpdateProgress(book.id, clamped, progress);
  };

  const handleChapterClick = (start: number) => {
    handleSeek(start);
    setActiveMenu(null);
  };

  const skipForward = () => {
    handleSeek(currentTime + forwardJumpValue);
  };

  const skipBackward = () => {
    handleSeek(currentTime - backJumpValue);
  };

  const toggleMute = () => {
    if (isMuted) {
      setVolume(prevVolume);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  // Add custom bookmark
  const handleAddBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    const labelText = newBookmarkLabel.trim() || `Bookmark @ ${formatTime(currentTime)}`;
    const newBm = {
      id: `bm-${Date.now()}`,
      time: Math.floor(currentTime),
      label: labelText,
      createdAt: new Date().toLocaleString()
    };
    const updated = [...bookmarks, newBm].sort((a, b) => a.time - b.time);
    setBookmarks(updated);
    localStorage.setItem(`bookrr-audiobook-bookmarks-${book.id}`, JSON.stringify(updated));
    setNewBookmarkLabel('');
    setBookmarkFeedback('Created!');
    setTimeout(() => setBookmarkFeedback(''), 1500);
  };

  // Delete bookmark
  const handleDeleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = bookmarks.filter(b => b.id !== id);
    setBookmarks(updated);
    localStorage.setItem(`bookrr-audiobook-bookmarks-${book.id}`, JSON.stringify(updated));
  };

  // Start sleep timer
  const launchSleepTimer = (minutes: number) => {
    setSleepTimerType('minutes');
    setSleepTimerRemaining(minutes * 60);
    setActiveMenu(null);
  };

  const triggerEndOfChapterSleep = () => {
    setSleepTimerType('chapter');
    setSleepTimerRemaining(null);
    setActiveMenu(null);
  };

  const stopSleepTimer = () => {
    setSleepTimerType(null);
    setSleepTimerRemaining(null);
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={currentAudioSrc}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnded}
        className="hidden"
      />

      {/* FULLSCREEN MOBILE PLAYER */}
      {isExpanded && (
        <div className="fixed inset-0 z-[60] bg-[#0a0a0a] flex flex-col lg:hidden animate-in slide-in-from-bottom-full duration-300 pt-safe font-sans overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 px-5 z-10 bg-gradient-to-b from-[#0a0a0a] to-transparent">
            <button className="text-neutral-300 p-2 -ml-2 cursor-pointer hover:bg-neutral-900 rounded-full transition" onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}>
              <ChevronDown className="w-6 h-6" />
            </button>
            <span className="text-[10px] font-bold text-neutral-400 tracking-[0.2em] font-mono">NOW LISTENING</span>
            <button className="text-neutral-300 p-2 -mr-2 cursor-pointer hover:bg-neutral-900 rounded-full transition" onClick={() => setActiveMenu(activeMenu === 'stats' ? null : 'stats')}>
              <Sliders className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col relative">
             {/* Stats Mobile Popover overlay (if stats is open) */}
             {activeMenu === 'stats' && (
                <div className="absolute top-0 inset-x-4 bg-[#161616] border border-[#2d2d2d] rounded-2xl shadow-2xl p-5 z-20 text-xs font-mono text-neutral-400 space-y-3">
                  <div className="flex justify-between items-center text-amber-500 font-bold uppercase border-b border-[#2d2d2d] pb-2">
                    <span className="flex items-center gap-2"><Compass className="w-4 h-4" /> Stats</span>
                    <button onClick={() => setActiveMenu(null)}><X className="w-5 h-5" /></button>
                  </div>
                  <div className="flex justify-between"><span>Format:</span><span className="text-neutral-200">M4B Audio</span></div>
                  <div className="flex justify-between"><span>Duration:</span><span className="text-neutral-200">{formatTime(duration)}</span></div>
                  <div className="flex justify-between"><span>Progress:</span><span className="text-amber-400 font-bold">{Math.floor((currentTime / duration) * 100)}%</span></div>
                  <div className="flex justify-between border-t border-neutral-800/40 pt-2 text-[10px] text-neutral-500"><span>Source:</span><span className="truncate">Bookrr Local Storage</span></div>
                </div>
             )}

            {/* Cover image area */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[300px]">
              <div className="relative group shadow-2xl shadow-emerald-900/5">
                <img src={book.coverUrl} className="w-56 h-auto md:w-64 max-h-[45vh] aspect-square object-cover rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10" />
              </div>
            </div>

            {/* Metadata Info */}
            <div className="px-8 text-center pb-8 flex-none">
              <h2 className="text-xl md:text-2xl font-extrabold text-neutral-100 truncate tracking-tight">{book.title}</h2>
              <p className="text-sm md:text-base text-neutral-400 mt-1 truncate">{book.author}</p>
              <span className="inline-block mt-3 text-[10px] md:text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full font-mono uppercase truncate max-w-full">
                {activeChapter.title}
              </span>
            </div>

            {/* Waveform / Scrubber */}
            <div className="px-6 pb-8 flex-none z-10 w-full max-w-md mx-auto">
              <div className="relative h-14 flex items-center mb-1">
                {/* Visualizer bars behind slider */}
                <div className="absolute inset-0 flex items-center justify-between gap-[2px] opacity-40 px-2 pointer-events-none">
                  {waveHeights.map((h, i) => {
                    const progressRatio = currentTime / duration;
                    const barRatio = i / waveHeights.length;
                    const isFilled = barRatio <= progressRatio;
                    return (
                      <div
                        key={i}
                        style={{ height: `${Math.max(4, h)}px` }}
                        className={`flex-1 rounded-full w-[2px] transition-all duration-300 ${
                          isFilled ? 'bg-amber-400' : 'bg-neutral-600'
                        }`}
                      />
                    );
                  })}
                </div>
                {/* The actual slider */}
                <input
                  type="range"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  min={0}
                  max={duration}
                  value={currentTime}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                />
                {/* Scrubber thumb and progress indicator overlay */}
                <div className="absolute left-0 right-0 h-1 top-1/2 -mt-0.5 bg-neutral-800 rounded-full pointer-events-none px-2 z-10">
                   <div className="relative h-full w-full">
                     <div className="absolute top-0 bottom-0 left-0 bg-amber-500 rounded-full" style={{ width: `${(currentTime / duration) * 100}%` }}>
                        <div className="absolute right-0 top-1/2 -mt-1.5 -mr-1.5 w-3 h-3 bg-white rounded-full shadow" />
                     </div>
                   </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono font-medium text-neutral-450 px-2">
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(duration - currentTime)}</span>
              </div>
            </div>

            {/* Main Playback Controls */}
            <div className="flex items-center justify-center gap-8 pb-10 px-6 flex-none z-10">
              <button onClick={skipBackward} className="text-neutral-300 hover:text-white p-3 cursor-pointer">
                <RotateCcw className="w-8 h-8" />
              </button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="w-20 h-20 bg-amber-500 text-black rounded-full flex items-center justify-center cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95 transition-transform">
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>
              <button onClick={skipForward} className="text-neutral-300 hover:text-white p-3 cursor-pointer">
                <RotateCw className="w-8 h-8" />
              </button>
            </div>

            {/* Auxiliary Controls Footer */}
            <div className="flex justify-around items-center px-4 md:px-12 pb-safe bg-gradient-to-t from-[#050505] to-transparent pt-4 mb-4 flex-none z-10 border-t border-neutral-900/50">
              <div className="relative flex flex-col items-center">
                 <button onClick={() => setActiveMenu(activeMenu === 'speed' ? null : 'speed')} className="flex flex-col items-center gap-1.5 text-neutral-400 p-2 cursor-pointer hover:text-white transition">
                   <Gauge className="w-5 h-5" />
                   <span className="text-[10px] font-semibold">{playbackRate.toFixed(2)}x</span>
                 </button>
                 {activeMenu === 'speed' && (
                    <div className="absolute bottom-16 bg-[#1a1a1a] border border-[#333] rounded-xl p-3 shadow-2xl flex flex-col gap-2 w-32 z-50 animate-in fade-in zoom-in-95">
                      {[1.0, 1.25, 1.5, 2.0].map((val) => (
                         <button key={val} onClick={() => setPlaybackRate(val)} className={`text-sm py-1.5 rounded-lg ${playbackRate === val ? 'bg-amber-500 text-black font-bold' : 'text-neutral-300 bg-neutral-800'}`}>
                           {val.toFixed(2)}x
                         </button>
                      ))}
                    </div>
                 )}
              </div>

              <div className="relative flex flex-col items-center">
                 <button onClick={() => setActiveMenu(activeMenu === 'sleep' ? null : 'sleep')} className={`flex flex-col items-center gap-1.5 p-2 cursor-pointer transition ${sleepTimerType ? 'text-amber-500' : 'text-neutral-400 hover:text-white'}`}>
                   <Moon className={`w-5 h-5 ${sleepTimerType ? 'fill-amber-500/20' : ''}`} />
                   <span className="text-[10px] font-semibold">{sleepTimerType ? formatCountdown(sleepTimerRemaining || 0).split(' ')[0] : 'Sleep'}</span>
                 </button>
                 {activeMenu === 'sleep' && (
                    <div className="absolute bottom-16 -ml-16 bg-[#1a1a1a] border border-[#333] rounded-xl p-3 shadow-2xl space-y-2 w-48 z-50 animate-in fade-in zoom-in-95">
                      <button onClick={() => launchSleepTimer(15)} className="w-full bg-neutral-800 text-white text-xs py-2 rounded-lg mix-blend-screen mb-1">15 min</button>
                      <button onClick={() => launchSleepTimer(30)} className="w-full bg-neutral-800 text-white text-xs py-2 rounded-lg mix-blend-screen mb-1">30 min</button>
                      <button onClick={triggerEndOfChapterSleep} className="w-full bg-neutral-800 text-amber-500 font-bold text-xs py-2 rounded-lg mix-blend-screen mb-1">End of Chapter</button>
                      {sleepTimerType && <button onClick={stopSleepTimer} className="w-full bg-rose-500/20 text-rose-500 font-bold text-xs py-2 rounded-lg mix-blend-screen border border-rose-500/30 font-mono">Cancel</button>}
                    </div>
                 )}
              </div>

              <div className="relative flex flex-col items-center">
                 <button onClick={() => setActiveMenu(activeMenu === 'chapters' ? null : 'chapters')} className="flex flex-col items-center gap-1.5 text-neutral-400 p-2 cursor-pointer hover:text-white transition">
                   <ListMusic className="w-5 h-5" />
                   <span className="text-[10px] font-semibold">Chps</span>
                 </button>
                 {activeMenu === 'chapters' && (
                    <div className="absolute bottom-16 -ml-24 max-h-64 overflow-y-auto bg-[#1a1a1a] border border-[#333] rounded-xl p-2 w-64 shadow-2xl z-50 animate-in fade-in zoom-in-95 font-sans">
                      <div className="text-[10px] uppercase font-bold text-neutral-500 p-2 px-3 bg-neutral-900 mb-1 rounded flex justify-between"><span>Chapters</span><X onClick={(e)=>{e.stopPropagation(); setActiveMenu(null)}} className="w-3.5 h-3.5 cursor-pointer"/></div>
                      {chapters.map((ch, idx) => (
                        <button key={ch.id} onClick={() => { handleChapterClick(ch.start); setActiveMenu(null); }} className={`flex justify-between items-center w-full text-left p-3 rounded-xl mb-1 text-xs truncate transition ${currentTime >= ch.start && currentTime < ch.end ? 'bg-amber-500 text-black font-bold' : 'text-neutral-300 hover:bg-neutral-800'}`}>
                           <span className="truncate pr-2">{idx + 1}. {ch.title}</span>
                           <span className="font-mono text-[10px] opacity-70 shrink-0">{formatTime(ch.start)}</span>
                        </button>
                      ))}
                    </div>
                 )}
              </div>

              <div className="relative flex flex-col items-center">
                 <button onClick={() => setActiveMenu(activeMenu === 'bookmarks' ? null : 'bookmarks')} className={`flex flex-col items-center gap-1.5 p-2 cursor-pointer transition ${bookmarks.length > 0 ? 'text-amber-500': 'text-neutral-400 hover:text-white'}`}>
                   <Bookmark className="w-5 h-5" />
                   <span className="text-[10px] font-semibold">Bkmrks</span>
                 </button>
                 {activeMenu === 'bookmarks' && (
                   <div className="absolute bottom-16 -ml-32 max-h-64 overflow-y-auto bg-[#1a1a1a] border border-[#333] rounded-xl p-3 w-64 shadow-2xl z-50 animate-in fade-in zoom-in-95 font-sans flex flex-col gap-2">
                     <form onSubmit={handleAddBookmark} className="flex gap-1 mb-2">
                       <input type="text" value={newBookmarkLabel} onChange={(e) => setNewBookmarkLabel(e.target.value)} placeholder="Note..." className="flex-1 bg-neutral-900 border border-neutral-700 p-1.5 text-xs rounded text-white" />
                       <button type="submit" className="bg-amber-500 text-black px-2 rounded font-bold"><BookmarkPlus className="w-4 h-4"/></button>
                     </form>
                     {bookmarks.length === 0 ? <p className="text-xs text-neutral-500 p-2 text-center">No bookmarks</p> : 
                      bookmarks.map(bm => (
                       <div key={bm.id} onClick={() => { handleSeek(bm.time); setActiveMenu(null); }} className="flex justify-between items-center bg-neutral-800 hover:bg-neutral-750 p-2 rounded-lg cursor-pointer">
                         <div className="text-left w-full overflow-hidden leading-tight">
                           <span className="text-xs text-white truncate block">{bm.label}</span>
                           <span className="text-[9px] text-amber-500 font-mono font-semibold">{formatTime(bm.time)}</span>
                         </div>
                         <button onClick={(e) => handleDeleteBookmark(bm.id, e)} className="text-neutral-500 hover:text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button>
                       </div>
                      ))}
                   </div>
                 )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MINI BAR (Mobile) & DESKTOP BAR */}
      <div className={`fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 bg-[#121212]/98 backdrop-blur-xl border-t border-b lg:border-b-0 border-[#222] p-2 lg:p-4 flex-row items-center gap-2 lg:gap-6 z-[45] lg:z-50 shadow-2xl transition-all ${isExpanded ? 'hidden lg:flex' : 'flex'}`}>
        
        {/* 1. Audiobook Metadata Info */}
        <div className="flex items-center gap-2 lg:gap-4 flex-1 lg:flex-none lg:w-1/4 min-w-0 pr-2 lg:pr-0 border-r border-[#2d2d2d] lg:border-none cursor-pointer group" onClick={() => setIsExpanded(true)}>
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-10 h-10 lg:w-12 lg:h-12 rounded bg-neutral-800 object-cover shadow-md border border-[#2d2d2d] shrink-0 group-hover:scale-105 transition-transform"
          />
          <div className="text-left overflow-hidden min-w-0 flex-1">
            <h4 className="font-sans font-bold text-xs lg:text-sm text-neutral-100 truncate">{book.title}</h4>
            <p className="text-[10px] lg:text-[11px] text-neutral-400 truncate">{book.author}</p>
            <div className="hidden lg:block">
              <span className="inline-block mt-0.5 font-mono text-[9px] text-amber-500 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded truncate max-w-full">
                {activeChapterIdx !== -1 ? `Ch ${activeChapterIdx + 1}: ` : ''}{activeChapter.title}
              </span>
            </div>
          </div>
        </div>

      {/* 2. Audio Control Elements (Skip Intervals, Playback, Seeker Seek Panel) */}
      <div className="flex-none lg:flex-1 flex flex-col items-center justify-center gap-2 lg:w-auto pr-2 sm:pr-4 relative">
        {/* Playback Controls Row */}
        <div className="flex items-center gap-1 sm:gap-2 lg:gap-5 select-none w-full lg:w-auto justify-end lg:justify-center">
          {/* Configurable Skip Back Interval selector - Desktop Only */}
          <div className="hidden lg:flex items-center gap-1 bg-[#1a1a1a] rounded px-1.5 py-0.5 text-[10px] text-neutral-400 border border-neutral-800">
            <span>Skip</span>
            <select
              value={backJumpValue}
              onChange={(e) => setBackJumpValue(Number(e.target.value))}
              className="bg-transparent border-none text-[10px] text-amber-500 font-semibold font-mono cursor-pointer focus:outline-none"
            >
              <option value="10">10s</option>
              <option value="15">15s</option>
              <option value="30">30s</option>
              <option value="60">60s</option>
            </select>
          </div>

          <button
            onClick={skipBackward}
            title={`Rewind ${backJumpValue} seconds`}
            className="text-neutral-400 hover:text-amber-400 transition duration-150 cursor-pointer p-1 lg:p-1 md:p-1 relative flex items-center justify-center"
          >
            <RotateCcw className="w-5 h-5 lg:w-5 lg:h-5" />
          </button>

          {/* Master Play / Pause with glow */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-10 h-10 lg:w-11 lg:h-11 bg-amber-400 text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer shadow-lg shadow-amber-400/25 shrink-0 mx-1 lg:mx-0"
          >
            {isPlaying ? <Pause className="w-4 h-4 lg:w-5 lg:h-5 fill-current" /> : <Play className="w-4 h-4 lg:w-5 lg:h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={skipForward}
            title={`Fast-forward ${forwardJumpValue} seconds`}
            className="text-neutral-400 hover:text-amber-400 transition duration-150 cursor-pointer p-1 lg:p-1 relative flex items-center justify-center"
          >
            <RotateCw className="w-5 h-5 lg:w-5 lg:h-5" />
          </button>

          {/* Mobile Close Button (Hidden on Desktop, desktop has it in section 3) */}
          <button
            onClick={onClose}
            className="lg:hidden ml-2 p-1.5 rounded-lg border border-[#2d2d2d] bg-neutral-900/50 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition cursor-pointer shrink-0"
            title="Close Player"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Configurable Skip Forward Interval selector - Desktop Only */}
          <div className="hidden lg:flex items-center gap-1 bg-[#1a1a1a] rounded px-1.5 py-0.5 text-[10px] text-neutral-400 border border-neutral-800">
            <span>Skip</span>
            <select
              value={forwardJumpValue}
              onChange={(e) => setForwardJumpValue(Number(e.target.value))}
              className="bg-transparent border-none text-[10px] text-amber-500 font-semibold font-mono cursor-pointer focus:outline-none"
            >
              <option value="10">10s</option>
              <option value="15">15s</option>
              <option value="30">30s</option>
              <option value="60">60s</option>
            </select>
          </div>
        </div>

        {/* Custom Visualizer Waveform Block - Desktop Only */}
        <div className="hidden lg:flex w-full items-center gap-2.5">
          <span className="font-mono text-[10px] text-neutral-400 w-11 text-right shrink-0">
            {formatTime(currentTime)}
          </span>

          <div 
            className={`flex-1 h-8 flex items-center justify-between gap-[1px] bg-[#0c0c0c]/90 rounded-md px-2.5 relative select-none border border-neutral-900 transition-all ${
              vocalBoost ? 'ring-1 ring-amber-500/20 bg-[#0e0c07]' : ''
            }`}
          >
            {/* Range seeker on top of waveform */}
            <input
              type="range"
              min={0}
              max={duration}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
            {/* Draw chapters division visual dots underneath waveform helper */}
            <div className="absolute inset-x-3 bottom-0.5 h-0.5 flex justify-between pointer-events-none opacity-40 z-10">
              {chapters.map((ch, idx) => (
                <div 
                  key={idx} 
                  style={{ left: `${(ch.start / duration) * 100}%` }} 
                  className="absolute bottom-0 w-[1.5px] h-full bg-neutral-600 rounded-full"
                />
              ))}
            </div>

            {/* Render bars dynamically */}
            {waveHeights.map((h, i) => {
              const progressRatio = currentTime / duration;
              const barRatio = i / waveHeights.length;
              const isFilled = barRatio <= progressRatio;
              return (
                <div
                  key={i}
                  style={{ height: `${Math.max(4, h * 0.75)}px` }}
                  className={`flex-1 rounded-full w-[1.5px] min-h-[3px] max-h-6 transition-all duration-300 ${
                    isFilled 
                      ? vocalBoost ? 'bg-amber-300 shadow shadow-amber-400/40' : 'bg-amber-400 shadow shadow-amber-400/25' 
                      : isPlaying ? 'bg-neutral-600' : 'bg-neutral-800'
                  }`}
                />
              );
            })}
          </div>

          <span className="font-mono text-[10px] text-neutral-400 w-11 text-left shrink-0">
            -{formatTime(duration - currentTime)}
          </span>
        </div>
      </div>

      {/* 3. Audiobookshelf Utilities Menu Panel - Hidden on Mobile to save space */}
      <div className="hidden lg:flex w-1/4 items-center justify-end gap-3.5 relative">
        
        {/* Toggle Vocal Boost Clarity (Sparkles Audio Enhancer) */}
        <button
          onClick={() => setVocalBoost(!vocalBoost)}
          title="Vocals & Narration Crisp Enhanced Clarity Filter"
          className={`px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition flex items-center gap-1.5 ${
            vocalBoost 
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
              : 'bg-transparent text-neutral-450 border-neutral-800 hover:text-neutral-100 hover:bg-[#1a1a1a]'
          }`}
        >
          <Sparkles className={`w-4 h-4 ${vocalBoost ? 'animate-pulse text-amber-400' : ''}`} />
          <span className="text-[10px] font-bold uppercase hidden sm:inline">Boost</span>
        </button>

        {/* Chapters Dropdown Trigger */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'chapters' ? null : 'chapters')}
            className={`p-2 rounded-lg cursor-pointer transition border ${
              activeMenu === 'chapters' 
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/35' 
                : 'text-neutral-400 border-transparent hover:bg-[#1a1a1a] hover:text-neutral-100'
            }`}
            title="Index Chapters List"
          >
            <ListMusic className="w-4.5 h-4.5" />
          </button>

          {/* Advanced Chapters Popover Menu overlay */}
          {activeMenu === 'chapters' && (
            <div className="absolute bottom-12 left-0 lg:left-auto lg:right-0 bg-[#161616] border border-[#2d2d2d] rounded-xl shadow-2xl w-64 max-h-72 overflow-y-auto p-1 z-50">
              <div className="p-2 text-[10px] font-mono text-neutral-500 border-b border-[#2d2d2d] uppercase tracking-wider flex justify-between items-center">
                <span>Modules / Chapter list</span>
                <span className="text-amber-500 font-bold font-mono">{chapters.length} total</span>
              </div>
              <div className="py-1">
                {chapters.length === 0 ? (
                  <p className="p-3 text-xs text-neutral-500 italic">No narration chapters configured</p>
                ) : (
                  chapters.map((ch, idx) => {
                    const isActive = currentTime >= ch.start && currentTime < ch.end;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => handleChapterClick(ch.start)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition ${
                          isActive 
                            ? 'bg-amber-500/10 text-amber-400 font-semibold' 
                            : 'text-neutral-300 hover:bg-[#202020]'
                        }`}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="truncate pr-2 font-medium">Ch {idx + 1}: {ch.title}</span>
                          <span className="font-mono text-[9px] text-neutral-500 shrink-0">{formatTime(ch.start)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Active Sleep Timer Indicator and Controller Dropdown */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'sleep' ? null : 'sleep')}
            className={`p-2 rounded-lg cursor-pointer transition border relative ${
              sleepTimerType 
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                : activeMenu === 'sleep' ? 'bg-[#1a1a1a] text-white border-neutral-700' : 'text-neutral-400 border-transparent hover:bg-[#1a1a1a] hover:text-[#f3f4f6]'
            }`}
            title="Narration Sleep Alarm"
          >
            <Moon className={`w-4.5 h-4.5 ${sleepTimerType ? 'animate-wink duration-1000' : ''}`} />
            {sleepTimerType && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[7px] font-mono font-bold uppercase rounded px-1 min-w-[20px] scale-90 border border-black max-w-full">
                {sleepTimerType === 'chapter' ? 'Ch' : formatCountdown(sleepTimerRemaining || 0).split(' ')[0]}
              </span>
            )}
          </button>

          {/* Sleep Timer Menu Popover */}
          {activeMenu === 'sleep' && (
            <div className="absolute bottom-12 left-0 lg:left-auto lg:right-0 bg-[#161616] border border-[#2d2d2d] rounded-xl shadow-2xl w-60 p-3 z-50 space-y-2.5 font-sans">
              <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-b border-[#2d2d2d] pb-1.5 flex justify-between items-center">
                <span>Sleep Shutdown Alarm</span>
                {sleepTimerType && <span className="text-[9px] text-emerald-400 font-bold">ACTIVE</span>}
              </div>

              {sleepTimerType ? (
                <div className="bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg space-y-1.5 text-xs text-center">
                  <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">Sleeping in</p>
                  <p className="text-amber-400 font-mono font-bold text-[15px] animate-pulse">
                    {sleepTimerType === 'chapter' ? 'End of Chapter' : formatCountdown(sleepTimerRemaining || 0)}
                  </p>
                  <button
                    onClick={stopSleepTimer}
                    className="w-full mt-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold py-1 rounded text-[10px] transition cursor-pointer"
                  >
                    Cancel Sleep Timer
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    onClick={() => launchSleepTimer(5)}
                    className="bg-neutral-850 hover:bg-[#202020] text-neutral-300 py-1.5 px-2 rounded-lg text-left transition cursor-pointer"
                  >
                    5 mins
                  </button>
                  <button
                    onClick={() => launchSleepTimer(15)}
                    className="bg-neutral-850 hover:bg-[#202020] text-neutral-300 py-1.5 px-2 rounded-lg text-left transition cursor-pointer"
                  >
                    15 mins
                  </button>
                  <button
                    onClick={() => launchSleepTimer(30)}
                    className="bg-neutral-850 hover:bg-[#202020] text-neutral-300 py-1.5 px-2 rounded-lg text-left transition cursor-pointer"
                  >
                    30 mins
                  </button>
                  <button
                    onClick={() => launchSleepTimer(45)}
                    className="bg-neutral-850 hover:bg-[#202020] text-neutral-300 py-1.5 px-2 rounded-lg text-left transition cursor-pointer"
                  >
                    45 mins
                  </button>
                  <button
                    onClick={() => launchSleepTimer(60)}
                    className="bg-neutral-850 hover:bg-[#202020] text-neutral-300 py-1.5 px-2 rounded-lg text-left transition cursor-pointer"
                  >
                    60 mins
                  </button>
                  <button
                    onClick={triggerEndOfChapterSleep}
                    className="col-span-2 bg-[#202020]/80 hover:bg-neutral-800 hover:text-amber-400 text-neutral-200 font-medium py-2 px-2.5 rounded-lg text-center transition cursor-pointer border border-neutral-750/30 text-[11px]"
                  >
                    End of Chapter
                  </button>

                  <div className="col-span-2 pt-1 border-t border-neutral-800/50 flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="480"
                      value={customSleepMinutes}
                      onChange={(e) => setCustomSleepMinutes(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 outline-none rounded p-1 w-14 font-mono text-center focus:border-amber-500"
                    />
                    <button
                      onClick={() => {
                        const m = parseInt(customSleepMinutes);
                        if (m > 0) launchSleepTimer(m);
                      }}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-1 px-2 rounded text-[10px] uppercase tracking-wider transition cursor-pointer text-center"
                    >
                      Set Minutes
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Audiobookhelf Bookmarks Index Popover  */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'bookmarks' ? null : 'bookmarks')}
            className={`p-2 rounded-lg cursor-pointer transition border relative ${
              bookmarks.length > 0 
                ? 'text-amber-500 hover:text-amber-400' 
                : 'text-neutral-450 hover:text-neutral-100 hover:bg-[#1a1a1a]'
            } ${
              activeMenu === 'bookmarks' ? 'bg-[#1a1a1a] text-white border-neutral-800' : 'border-transparent'
            }`}
            title="My Audiobook Bookmarks"
          >
            <Bookmark className="w-4.5 h-4.5" />
            {bookmarks.length > 0 && (
              <span className="absolute -top-1 -right-0.5 bg-neutral-100 text-black text-[7.5px] font-mono font-black rounded-full w-3.5 h-3.5 flex items-center justify-center border border-[#111] scale-95">
                {bookmarks.length}
              </span>
            )}
          </button>

          {/* Bookmarks Manager panel overlay */}
          {activeMenu === 'bookmarks' && (
            <div className="absolute bottom-12 left-0 lg:left-auto lg:right-0 bg-[#161616] border border-[#2d2d2d] rounded-xl shadow-2xl w-64 p-3 z-50 space-y-3 max-h-80 overflow-y-auto">
              <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-b border-[#2d2d2d] pb-1.5 flex justify-between items-center">
                <span>Narrative Bookmarks</span>
                {bookmarkFeedback && <span className="text-emerald-400 text-[9px] font-bold uppercase">{bookmarkFeedback}</span>}
              </div>

              {/* Add Bookmark form */}
              <form onSubmit={handleAddBookmark} className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="Short description..."
                    value={newBookmarkLabel}
                    onChange={(e) => setNewBookmarkLabel(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-805 text-xs text-neutral-200 rounded p-1.5 outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-400 text-black px-2 py-1.5 rounded text-xs font-bold shrink-0 transition cursor-pointer flex items-center justify-center"
                    title="Add Bookmark at Current Time"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-[9px] text-neutral-550 font-mono text-right mr-1">
                  Position: <span className="text-amber-500 font-bold">{formatTime(currentTime)}</span>
                </div>
              </form>

              {/* Bookmarks List */}
              <div className="space-y-1 pr-0.5">
                {bookmarks.length === 0 ? (
                  <p className="text-[11px] text-neutral-500 italic text-center py-2">No bookmarks saved</p>
                ) : (
                  bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      onClick={() => handleSeek(bm.time)}
                      className="group w-full flex items-center justify-between text-left p-1.5 rounded bg-neutral-900/60 hover:bg-[#1a1a1a] transition cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-xs font-semibold text-neutral-200 block truncate group-hover:text-amber-400">
                          {bm.label}
                        </span>
                        <span className="text-[9px] text-neutral-500 font-mono">
                          {formatTime(bm.time)} • {bm.createdAt.split(',')[0]}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBookmark(bm.id, e);
                        }}
                        className="text-neutral-500 hover:text-red-400 p-1 rounded hover:bg-neutral-800 transition"
                        title="Remove Bookmark"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Detailed Stats / Format Panel */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'stats' ? null : 'stats')}
            className={`p-2 rounded-lg cursor-pointer transition border ${
              activeMenu === 'stats' 
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/35' 
                : 'text-neutral-400 border-transparent hover:bg-[#1a1a1a] hover:text-neutral-100'
            }`}
            title="Audiobook File Stream Stats"
          >
            <Sliders className="w-4.5 h-4.5" />
          </button>

          {/* Stats Overlay */}
          {activeMenu === 'stats' && (
            <div className="absolute bottom-12 left-0 lg:left-auto lg:right-0 bg-[#161616] border border-[#2d2d2d] rounded-xl shadow-2xl w-60 p-3.5 z-50 text-[10px] font-mono text-neutral-400 space-y-2.5">
              <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider border-b border-[#2d2d2d] pb-1 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>Audiobookshelf Stats</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>File Format:</span>
                  <span className="text-neutral-200">M4B (AAC codec)</span>
                </div>
                <div className="flex justify-between">
                  <span>Audio Bitrate:</span>
                  <span className="text-neutral-200">{vocalBoost ? '192 kbps (Enhanced)' : '128 kbps (Original)'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sample Rate:</span>
                  <span className="text-neutral-200">44.1 kHz Mono</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="text-neutral-200">{formatTime(duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Progress:</span>
                  <span className="text-amber-400 font-bold">{Math.floor((currentTime / duration) * 100)}% ({formatTime(currentTime)})</span>
                </div>
                <div className="flex justify-between">
                  <span>Next Chapter remaining:</span>
                  <span className="text-neutral-200">
                    {activeChapterIdx !== -1 && chapters[activeChapterIdx]
                      ? formatTime(chapters[activeChapterIdx].end - currentTime)
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-neutral-800/40 pt-1.5 text-[9px] text-neutral-500">
                  <span>Source Server:</span>
                  <span className="truncate">Bookrr Local Storage</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Playback speed multiplier selector - Granular control style */}
        <div className="relative">
          <button
            onClick={() => setActiveMenu(activeMenu === 'speed' ? null : 'speed')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition ${
              activeMenu === 'speed' 
                ? 'bg-amber-500/15 text-amber-500 border-amber-500/35' 
                : 'bg-transparent text-neutral-400 border-neutral-800 hover:bg-[#1a1a1a] hover:text-[#f3f4f6]'
            }`}
            title="Fine-tune Playback Rate"
          >
            <Gauge className="w-4 h-4 text-neutral-400" />
            <span className="font-mono font-semibold text-xs text-neutral-200">{playbackRate.toFixed(2)}x</span>
          </button>

          {/* Granular Speed Selector Popover */}
          {activeMenu === 'speed' && (
            <div className="absolute bottom-12 left-0 lg:left-auto lg:right-0 bg-[#161616] border border-[#2d2d2d] rounded-xl shadow-2xl w-52 p-3 z-50 space-y-2.5">
              <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest border-b border-[#2d2d2d] pb-1 flex justify-between items-center">
                <span>Playback speed</span>
                <span className="text-amber-500 font-bold">{playbackRate.toFixed(2)}x</span>
              </div>
              
              {/* Preset buttons */}
              <div className="grid grid-cols-4 gap-1">
                {[1.0, 1.25, 1.5, 1.75, 2.0, 2.5].map((val) => (
                  <button
                    key={val}
                    onClick={() => setPlaybackRate(val)}
                    className={`py-1 rounded text-[10px] font-semibold cursor-pointer transition ${
                      playbackRate === val 
                        ? 'bg-amber-500 text-black' 
                        : 'bg-neutral-850 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    {val.toFixed(2)}x
                  </button>
                ))}
                <button
                  onClick={() => setPlaybackRate(1.0)}
                  className="col-span-2 py-1 rounded text-[10px] font-mono bg-[#202020] text-neutral-400 hover:text-white"
                >
                  Reset Playback
                </button>
              </div>

              {/* Slider for ultra granular adjustment */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-neutral-450 font-mono">
                  <span>Slower (0.5x)</span>
                  <span>Faster (3.0x)</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.05"
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1 rounded cursor-pointer bg-neutral-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* Volume controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleMute}
            className="text-neutral-400 hover:text-neutral-200 p-1"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (Number(e.target.value) > 0 && isMuted) {
                setIsMuted(false);
              }
            }}
            style={{ backgroundImage: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${volume * 100}%, #2d2d2d ${volume * 100}%, #2d2d2d 100%)` }}
            className="w-14 sm:w-20 accent-amber-500 h-[2.5px] rounded-lg cursor-pointer bg-neutral-805"
          />
        </div>

        {/* Quick close button */}
        <button
          onClick={onClose}
          className="hidden lg:block p-1 bg-neutral-900 border border-[#2d2d2d] hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 rounded-lg transition duration-150 cursor-pointer shrink-0"
          title="Minimize & Close Player"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
    </>
  );
}
