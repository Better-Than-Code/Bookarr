/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Book, AudiobookChapter, EbookChapter } from '../types';
import { Play, BookOpen, RefreshCw, PlusCircle, Search, SlidersHorizontal, BookMarked, Layers, Trash2 } from 'lucide-react';

interface LibraryDashboardProps {
  books: Book[];
  onPlayAudiobook: (book: Book) => void;
  onReadEbook: (book: Book) => void;
  onManualImport: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onSyncLibrary: () => void;
  isSyncing: boolean;
}

export default function LibraryDashboard({
  books,
  onPlayAudiobook,
  onReadEbook,
  onDeleteBook,
  onSyncLibrary,
  isSyncing,
}: LibraryDashboardProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'audiobook' | 'ebook'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedProgress, setSelectedProgress] = useState('All');
  const [showImportForm, setShowImportForm] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);

  // New book manual form state
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newType, setNewType] = useState<'audiobook' | 'ebook'>('ebook');
  const [newGenres, setNewGenres] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCoverUrl, setNewCoverUrl] = useState('');
  const [newLength, setNewLength] = useState(120); // pages or duration minutes

  // Get all unique genres from book list
  const genres = ['All', ...Array.from(new Set(books.flatMap(b => b.genres)))];

  // Filters setup
  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          book.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = activeFilter === 'all' || book.type === activeFilter;
    const matchesGenre = selectedGenre === 'All' || book.genres.includes(selectedGenre);
    
    let matchesProgress = true;
    if (selectedProgress === 'Unread') matchesProgress = book.progress === 0;
    else if (selectedProgress === 'In Progress') matchesProgress = book.progress > 0 && book.progress < 100;
    else if (selectedProgress === 'Completed') matchesProgress = book.progress === 100;

    return matchesSearch && matchesType && matchesGenre && matchesProgress;
  });

  // Separate in-progress books for a "Continue" shelf
  const inProgressBooks = filteredBooks.filter(book => book.progress > 0 && book.progress < 100);
  const otherBooks = filteredBooks.filter(book => book.progress === 0 || book.progress === 100);

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newAuthor) return;

    const finalCover = newCoverUrl.trim() || (
      newType === 'audiobook' 
        ? 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=400' 
        : 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=400'
    );

    const bookPayload: any = {
      title: newTitle,
      author: newAuthor,
      type: newType,
      coverUrl: finalCover,
      description: newDescription || 'Manually cataloged classical volume.',
      genres: newGenres.split(',').map(g => g.trim()).filter(Boolean),
      isDownloaded: true,
      size: newType === 'audiobook' ? '180 MB' : '1.5 MB',
    };

    if (newType === 'audiobook') {
      bookPayload.duration = newLength * 60; // in seconds
      bookPayload.chapters = [
        { id: 'ch-1', title: 'Chapter 1', start: 0, end: 600 },
        { id: 'ch-2', title: 'Chapter 2', start: 600, end: 1200 },
      ];
    } else {
      bookPayload.pages = newLength;
      bookPayload.chapters = [
        { id: 'ch-1', title: 'Introduction', content: 'Welcome to this manually indexed electronic book content. You can start reading chapters here.' }
      ];
    }

    try {
      const response = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookPayload)
      });
      if (response.ok) {
        onSyncLibrary(); // Refresh state from parent
        // Reset form
        setNewTitle('');
        setNewAuthor('');
        setNewGenres('');
        setNewDescription('');
        setNewCoverUrl('');
        setShowImportForm(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Inner BookCard component for clean rendering
  const renderBookItem = (book: Book) => {
    const isAudio = book.type === 'audiobook';
    return (
      <div key={book.id} className="group flex flex-col relative w-full mb-4">
        {/* Book Cover Container */}
        <div 
          onClick={() => {
             if (!book.isDownloaded) return alert("The local file for this book is missing. Please remove and re-download.");
             isAudio ? onPlayAudiobook(book) : onReadEbook(book);
          }}
          className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-xl shadow-black/40 border border-neutral-800 group-hover:border-amber-500/80 group-hover:scale-105 transition-all duration-300 cursor-pointer"
        >
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
          
          {/* Play/Read hover action overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-200">
            {!book.isDownloaded ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  alert("The local file for this book is missing or was deleted. Please remove it and re-download.");
                }}
                className="w-12 h-12 bg-rose-500/80 rounded-full flex items-center justify-center text-white hover:scale-110 cursor-pointer shadow shadow-rose-500/20"
                title="File Missing"
              >
                <BookOpen className="w-5 h-5 opacity-50" />
              </button>
            ) : isAudio ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayAudiobook(book);
                }}
                className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-black hover:scale-110 cursor-pointer shadow shadow-amber-500/20"
                title="Listen now"
              >
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReadEbook(book);
                }}
                className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-black hover:scale-110 cursor-pointer shadow shadow-amber-500/20"
                title="Read now"
              >
                <BookOpen className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Format Indicator Tag corner */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <div className="bg-black/85 backdrop-blur-md text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded text-neutral-300">
              {isAudio ? 'AUDIO' : 'EPUB'}
            </div>
            {book.fileUrl && (
              <div className="bg-emerald-500/90 text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shadow-sm">
                NATIVE
              </div>
            )}
          </div>

          {/* Progress micro-bar bottom alignment */}
          {book.progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-900 border-t border-black/50">
              <div
                style={{ width: `${book.progress}%` }}
                className={`h-full ${book.progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
            </div>
          )}
        </div>

        {/* Content Info */}
        <div className="mt-2 text-left w-full space-y-0.5">
          <h5 
            onClick={() => {
               if (!book.isDownloaded) return alert("The local file for this book is missing. Please remove and re-download.");
               isAudio ? onPlayAudiobook(book) : onReadEbook(book);
            }}
            className="font-sans font-bold text-xs sm:text-sm text-neutral-200 truncate group-hover:text-amber-400 cursor-pointer transition leading-snug"
          >
            {book.title}
          </h5>
          <p className="text-[10px] sm:text-xs text-neutral-400 truncate tracking-tight">
            {book.author}
          </p>
          
          <div className="flex justify-between items-center text-[9px] font-mono text-neutral-500 pt-1 leading-none">
            <span>{isAudio ? formatDuration(book.duration || 0) : `${book.pages || '?'} pgs`}</span>
            {book.progress > 0 ? (
              <span className={book.progress === 100 ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
                {book.progress}%
              </span>
            ) : (
              <span className="text-transparent selection:text-transparent">0%</span>
            )}
          </div>

          <div className="absolute top-1 right-1 sm:top-auto sm:right-auto sm:relative sm:flex sm:justify-end sm:-mt-3 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBookToDelete(book);
              }}
              className="bg-black/60 sm:bg-transparent rounded-full p-1.5 sm:p-1 text-neutral-500 hover:text-red-400 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer"
              title="Delete this book"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header with Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111] p-4 sm:p-5 rounded-2xl border border-[#222]">
        <div className="text-left">
          <h2 className="text-lg sm:text-xl font-extrabold text-neutral-100 tracking-tight flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-amber-500" />
            <span>Library</span>
          </h2>
          <p className="text-[10px] sm:text-xs text-neutral-400 mt-1">
            Browse and manage your downloaded media.
          </p>
        </div>

        {/* Sync & Manual Import Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onSyncLibrary}
            disabled={isSyncing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-[#2d2d2d] bg-[#161616] hover:bg-[#202020] text-xs font-semibold text-neutral-300 hover:text-amber-400 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setShowImportForm(!showImportForm)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-amber-500 text-black px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold hover:bg-amber-400 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Manual</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Sliders & Search Filters */}
      <div className="bg-[#121212] border border-[#222] p-3 sm:p-4 rounded-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Toggle Pills: All / Audiobooks / Ebooks */}
        <div className="flex items-center bg-[#0c0c0c] p-1 rounded-lg border border-[#242424] overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveFilter('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              activeFilter === 'all' ? 'bg-amber-500 text-black shadow' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setActiveFilter('audiobook')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              activeFilter === 'audiobook' ? 'bg-amber-500 text-black shadow' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Audiobooks
          </button>
          <button
            onClick={() => setActiveFilter('ebook')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
              activeFilter === 'ebook' ? 'bg-amber-500 text-black shadow' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            E-books
          </button>
        </div>

        {/* Inputs */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Text input filter */}
          <div className="relative w-full sm:w-auto flex-1 md:flex-initial">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#1a1a1a] border border-[#2c2c2c] text-xs text-neutral-200 rounded-lg py-2 pl-9 pr-3 w-full sm:w-36 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Genre select */}
            <div className="flex-1 sm:flex-none flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2c2c2c] rounded-lg px-2.5 py-2">
              <Layers className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="bg-transparent text-xs text-neutral-300 border-none focus:outline-none cursor-pointer w-full"
              >
                {genres.map(g => (
                  <option key={g} value={g} className="bg-[#1a1a1a]">{g}</option>
                ))}
              </select>
            </div>

            {/* Progress state select */}
            <div className="flex-1 sm:flex-none flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2c2c2c] rounded-lg px-2.5 py-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <select
                value={selectedProgress}
                onChange={(e) => setSelectedProgress(e.target.value)}
                className="bg-transparent text-xs text-neutral-300 border-none focus:outline-none cursor-pointer w-full"
              >
                <option value="All" className="bg-[#1a1a1a]">All Status</option>
                <option value="Unread" className="bg-[#1a1a1a]">Unread (0%)</option>
                <option value="In Progress" className="bg-[#1a1a1a]">In Progress</option>
                <option value="Completed" className="bg-[#1a1a1a]">Completed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Manual Add Entry Form Overlay Drawer / Modal card */}
      {showImportForm && (
        <div className="bg-[#161616] border border-amber-500/25 p-4 sm:p-5 rounded-2xl text-left space-y-4">
          <h4 className="font-sans font-bold text-sm text-amber-500">Manual Entry</h4>
          <form onSubmit={handleCreateBook} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="space-y-1.5">
              <label className="text-neutral-400 block">Title *</label>
              <input
                type="text"
                required
                placeholder="The Odyssey..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-400 block">Author *</label>
              <input
                type="text"
                required
                placeholder="Homer..."
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-400 block">Format</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'audiobook' | 'ebook')}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              >
                <option value="ebook">E-book</option>
                <option value="audiobook">Audiobook</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-400 block">Length ({newType === 'audiobook' ? 'Mins' : 'Pages'})</label>
              <input
                type="number"
                min={1}
                value={newLength}
                onChange={(e) => setNewLength(Number(e.target.value))}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-400 block">Genres (csv)</label>
              <input
                type="text"
                placeholder="Fantasy, Sci-Fi..."
                value={newGenres}
                onChange={(e) => setNewGenres(e.target.value)}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-neutral-400 block">Cover URL</label>
              <input
                type="text"
                placeholder="https://..."
                value={newCoverUrl}
                onChange={(e) => setNewCoverUrl(e.target.value)}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-neutral-400 block">Description (Optional)</label>
              <textarea
                placeholder="Synopsis..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => setShowImportForm(false)}
                className="px-4 py-2 hover:bg-[#202020] text-neutral-400 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-amber-500 text-black px-4 py-2 hover:bg-amber-400 rounded font-semibold cursor-pointer"
              >
                Add 
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Display Grids */}
      <div className="space-y-10 pb-8">
        
        {filteredBooks.length === 0 ? (
          <div className="p-16 text-center bg-[#111] rounded-2xl border border-[#222]">
            <BookMarked className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
            <p className="text-white font-sans text-sm font-semibold">No books found.</p>
            <p className="text-[#cccccc] font-sans text-xs mt-2 italic">
              Try adjusting your filters or triggering a download.
            </p>
          </div>
        ) : (
          <>
            {/* Continue Reading Section (Horizontal scroll for mobile) */}
            {inProgressBooks.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-sans font-bold text-lg text-neutral-200 px-1 border-b border-[#222] pb-2">Continue Listening & Reading</h3>
                <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-4">
                  {inProgressBooks.map(book => (
                    <div key={book.id} className="min-w-[140px] max-w-[140px] sm:min-w-[160px] sm:max-w-[160px]">
                      {renderBookItem(book)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All / Rest of Books Grid */}
            {otherBooks.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-sans font-bold text-lg text-neutral-200 px-1 border-b border-[#222] pb-2">Library</h3>
                <div className="grid grid-cols-2 min-[500px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {otherBooks.map(book => renderBookItem(book))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modern Confirmation Overlay Dialog */}
      {bookToDelete && (
        <div 
          onClick={() => setBookToDelete(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none cursor-default"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#111111] border border-neutral-800 rounded-2xl max-w-sm w-full p-6 text-left shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-500/80" />
            
            <h3 className="font-sans font-extrabold text-[#eeeeee] text-base mb-2 select-text">
              Delete Title?
            </h3>
            
            <p className="text-xs text-neutral-400 leading-relaxed mb-4 select-text">
              Are you sure you want to permanently delete <strong className="text-neutral-200">"{bookToDelete.title}"</strong> by {bookToDelete.author}?
            </p>

            <div className="flex items-center gap-3 justify-end text-xs font-mono">
              <button
                onClick={() => setBookToDelete(null)}
                className="px-4 py-2 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteBook(bookToDelete.id);
                  setBookToDelete(null);
                }}
                className="bg-red-500/90 text-white font-semibold hover:bg-red-600 px-4 py-2 rounded-lg cursor-pointer transition shadow shadow-red-500/20"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function formatDuration(secs: number) {
  if (!secs) return '0h';
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}
