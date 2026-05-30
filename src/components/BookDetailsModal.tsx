/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Book as BookIcon, X, BookOpen, Play, Download, Search, RefreshCw, FolderOpen, Database, Layers, Save, Edit2, Image as ImageIcon, Tag } from 'lucide-react';
import { Book } from '../types';
import MetadataSearchModal from './MetadataSearchModal';

interface BookDetailsModalProps {
  book: Book;
  onClose: () => void;
  onPlay: (book: Book) => void;
  onRead: (book: Book) => void;
  isAvailable: boolean;
  onUpdateBook: () => void;
}

import { ensureFilePermission, getDirectoryHandle, verifyDirectoryPermission, saveFileHandle, saveOfflineFile } from '../services/LocalFileService';
import { sanitizePathName } from '../services/LocalOrganizerService';

export default function BookDetailsModal({ book, onClose, onPlay, onRead, isAvailable, onUpdateBook }: BookDetailsModalProps) {
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [organizingStatus, setOrganizingStatus] = useState<string | null>(null);

  // Edit states
  const [editData, setEditData] = useState({
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    description: book.description,
    genres: book.genres.join(', '),
    filePath: book.filePath || '',
    publisher: book.publisher || '',
    year: book.year || '',
    isbn: book.isbn || ''
  });

  const [searchTitle, setSearchTitle] = useState(book.title);

  useEffect(() => {
    setEditData({
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      description: book.description,
      genres: book.genres.join(', '),
      filePath: book.filePath || '',
      publisher: book.publisher || '',
      year: book.year || '',
      isbn: book.isbn || ''
    });
    setSearchTitle(book.title);
  }, [book.id]);

  const selectResult = (result: any) => {
    setEditData(prev => ({
      ...prev,
      title: result.title || prev.title,
      author: result.author || prev.author,
      coverUrl: result.coverUrl || prev.coverUrl,
      description: result.description || prev.description,
      genres: Array.isArray(result.genres) ? result.genres.join(', ') : (result.genres || prev.genres),
      publisher: result.publisher || prev.publisher,
      year: result.year || prev.year,
      isbn: result.isbn || prev.isbn
    }));
    setShowMetadataSearch(false);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedBook = {
        title: editData.title,
        author: editData.author,
        coverUrl: editData.coverUrl,
        description: editData.description,
        genres: editData.genres.split(',').map(g => g.trim()).filter(g => g),
        filePath: editData.filePath,
        year: editData.year,
        publisher: editData.publisher,
        isbn: editData.isbn
      };

      const res = await fetch(`/api/books/${book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBook)
      });
      
      if (res.ok) {
        setIsEditing(false);
        onUpdateBook();
      } else {
        const errorText = await res.text();
        alert('Failed to save changes: ' + errorText);
      }
    } catch (e: any) {
      console.error('Failed to save book updates', e);
      alert('Network error when saving updates: ' + (e.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOrganize = async () => {
    const destType = book.type === 'audiobook' ? 'audiobooks' : 'ebooks';
    try {
      setOrganizingStatus('Checking local storage configuration...');
      const handle = await getDirectoryHandle(destType);
      
      if (!handle) {
        setOrganizingStatus(null);
        alert(`The organized destination directory for ${book.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'} is unconfigured on this device. Please connect it in Settings folder selection.`);
        return;
      }
      
      const hasPerm = await verifyDirectoryPermission(handle, true, true);
      if (!hasPerm) {
        setOrganizingStatus(null);
        alert(`Missing write permission to write into your device's organized ${destType} folder.`);
        return;
      }

      setOrganizingStatus('Fetching file from server staging area...');
      if (!book.fileUrl) {
        setOrganizingStatus(null);
        alert('File URL is not available on the server. Make sure download has finished.');
        return;
      }

      // Fetch the file from server
      const fileRes = await fetch(book.fileUrl);
      if (!fileRes.ok) {
        throw new Error(`Server returned HTTP ${fileRes.status}`);
      }
      const blob = await fileRes.blob();

      setOrganizingStatus('Writing organized file onto your device storage...');
      const authorFolder = sanitizePathName(book.author);
      const bookFolder = sanitizePathName(book.title);
      const ext = book.filePath ? book.filePath.split('.').pop() || 'epub' : 'epub';
      const finalFileName = `${bookFolder} - ${authorFolder}.${ext}`;

      // Create folders as needed
      const authorDirHandle = await handle.getDirectoryHandle(authorFolder, { create: true });
      const bookDirHandle = await authorDirHandle.getDirectoryHandle(bookFolder, { create: true });
      
      // Write file contents
      const fileHandle = await bookDirHandle.getFileHandle(finalFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      setOrganizingStatus('Registering file inside IndexedDB database...');

      // Save offline file and handle locally
      const relativeDest = `${book.type === 'audiobook' ? 'Audiobooks' : 'Ebooks'}/${authorFolder}/${bookFolder}/${finalFileName}`;
      await saveOfflineFile(book.id, finalFileName, blob, relativeDest);
      await saveFileHandle(book.id, fileHandle, relativeDest);

      setOrganizingStatus('Updating library database...');
      // Sync status with server
      const updateRes = await fetch(`/api/books/${book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDownloaded: true, filePath: relativeDest })
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Server failed to update book status: ${errText}`);
      }

      setOrganizingStatus(null);
      alert(`Successfully organized "${book.title}" on your device storage!\nLocation: Bookrr > ${destType} > ${authorFolder} > ${bookFolder}`);
      onUpdateBook();
    } catch (e: any) {
      console.error('Failed to organize file locally:', e);
      setOrganizingStatus(null);
      alert(`Local organization failed: ${e.message || String(e)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-[#222] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] relative">
        {organizingStatus && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50 text-neutral-200 px-8 text-center animate-in fade-in duration-300">
            <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mb-4" />
            <h4 className="font-sans font-bold text-base mb-1 tracking-tight text-neutral-100">{organizingStatus}</h4>
            <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">Please keep this browser window active. Writing directly to your device directories.</p>
          </div>
        )}
        
        {/* Header */}
        <div className="p-4 border-b border-[#222] flex items-center justify-between bg-[#181818]">
          <div className="flex items-center gap-3">
            <h2 className="font-sans font-bold text-lg text-neutral-100">
              {isEditing ? 'Editing Metadata' : 'Book Details'}
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold uppercase tracking-wider">
              {book.type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="p-2 hover:bg-[#222] rounded-lg text-neutral-400 hover:text-white transition flex items-center gap-2 text-xs font-bold"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            ) : (
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="p-2 bg-amber-500 hover:bg-amber-400 rounded-lg text-black transition flex items-center gap-2 text-xs font-bold disabled:opacity-50"
              >
                <Save className={`w-4 h-4 ${isSaving ? 'animate-pulse' : ''}`} />
                Save Changes
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-[#222] rounded-lg text-neutral-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-transparent">
          <div className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row gap-8">
            {/* Poster / Cover Section */}
            <div className="flex flex-col gap-4 w-full md:w-48 shrink-0">
              <div className="relative group">
                <img 
                  src={isEditing ? editData.coverUrl : book.coverUrl} 
                   alt={book.title} 
                   className="w-full aspect-[2/3] object-cover rounded-xl shadow-2xl border border-[#333]" 
                />
                {isEditing && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl backdrop-blur-xs">
                     <ImageIcon className="w-8 h-8 text-white/50" />
                  </div>
                )}
              </div>
              
              {isEditing && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Cover URL</label>
                  <input 
                    type="text" 
                    value={editData.coverUrl}
                    onChange={(e) => setEditData(prev => ({ ...prev, coverUrl: e.target.value }))}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                    placeholder="https://..."
                  />
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="flex-1 space-y-5">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Title</label>
                    <input 
                      type="text" 
                      value={editData.title}
                      onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 text-neutral-100 font-bold focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Author</label>
                    <input 
                      type="text" 
                      value={editData.author}
                      onChange={(e) => setEditData(prev => ({ ...prev, author: e.target.value }))}
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2 text-neutral-300 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Genres (comma separated)</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600" />
                      <input 
                        type="text" 
                        value={editData.genres}
                        onChange={(e) => setEditData(prev => ({ ...prev, genres: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg pl-9 pr-4 py-2 text-xs text-neutral-300 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Year</label>
                        <input 
                          type="text" 
                          value={editData.year}
                          onChange={(e) => setEditData(prev => ({ ...prev, year: e.target.value }))}
                          className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2 text-xs text-neutral-300 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">ISBN</label>
                        <input 
                          type="text" 
                          value={editData.isbn}
                          onChange={(e) => setEditData(prev => ({ ...prev, isbn: e.target.value }))}
                          className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2 text-xs text-neutral-300 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Publisher</label>
                      <input 
                        type="text" 
                        value={editData.publisher}
                        onChange={(e) => setEditData(prev => ({ ...prev, publisher: e.target.value }))}
                        className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2 text-xs text-neutral-300 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="font-sans font-bold text-3xl text-neutral-100 leading-tight tracking-tight">{book.title}</h3>
                  <p className="text-amber-500 font-bold text-sm tracking-wide">{book.author}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {book.genres.map(g => (
                        <span key={g} className="text-[10px] font-bold bg-neutral-800 text-neutral-400 px-2.5 py-1 rounded-md border border-white/5 uppercase tracking-wider">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest pl-1">Description</label>
                {isEditing ? (
                  <textarea 
                    value={editData.description}
                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    rows={6}
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-xs text-neutral-300 leading-relaxed focus:outline-none focus:border-amber-500/50 resize-none"
                  />
                ) : (
                  <p className="text-neutral-400 text-sm leading-relaxed max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#222]">
                    {book.description || "No description provided."}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {/* Detailed Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#181818] p-4 rounded-xl border border-white/5 space-y-2">
              <div className="text-[10px] uppercase font-bold text-neutral-500 flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" /> 
                System Path
              </div>
              {isEditing ? (
                <input 
                  type="text" 
                  value={editData.filePath}
                  onChange={(e) => setEditData(prev => ({ ...prev, filePath: e.target.value }))}
                  className="w-full bg-[#121212] border border-[#333] rounded-lg px-3 py-1.5 font-mono text-[10px] text-neutral-400 focus:outline-none focus:border-amber-500/30"
                />
              ) : (
                <p className="font-mono text-[11px] text-neutral-300 break-all bg-black/20 p-2 rounded border border-white/5">
                  {book.filePath || 'Remote Link / Pending Download'}
                </p>
              )}
            </div>

            <div className="bg-[#181818] p-4 rounded-xl border border-white/5 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-2">
                <div className="text-[10px] uppercase font-bold text-neutral-500">File Integrity</div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isAvailable ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {isAvailable ? 'Verified' : 'Missing'}
                </div>
              </div>
              <div className="text-xs text-neutral-400 flex items-center gap-2">
                <Database className="w-3 h-3" />
                Size: {book.size || "Unknown"}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-[#222] flex flex-wrap gap-3">
              <button 
                onClick={async () => {
                  const hasPerms = await ensureFilePermission(book.id);
                  if (!hasPerms) {
                    alert('Permission to read file was denied. You may need to safely Re-Link the file from Configure or Sync folders again.');
                    return;
                  }
                  book.type === 'audiobook' ? onPlay(book) : onRead(book);
                }}
                disabled={!isAvailable}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition shadow-lg ${isAvailable ? 'bg-amber-500 text-black hover:bg-amber-400 active:scale-95' : 'bg-[#222] text-neutral-600 cursor-not-allowed opacity-50'}`}
              >
                {book.type === 'audiobook' ? <Play className="w-5 h-5 fill-current" /> : <BookOpen className="w-5 h-5" />}
                {book.type === 'audiobook' ? 'Launch Player' : 'Open Reader'}
              </button>

              <div className="flex gap-2 w-full md:w-auto">
                <button 
                  onClick={() => setShowMetadataSearch(true)}
                  disabled={isSyncingMeta}
                  title="Search & Sync with providers"
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition border border-white/5"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingMeta ? 'animate-spin' : ''}`} />
                  Sync
                </button>

                {isEditing && (
                  <div className="flex-1 min-w-[200px] relative">
                    <input 
                      type="text" 
                      value={searchTitle}
                      onChange={(e) => setSearchTitle(e.target.value)}
                      placeholder="Custom search query..."
                      className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl pl-3 pr-10 py-3 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/50"
                    />
                    <button 
                      onClick={() => setShowMetadataSearch(true)}
                      disabled={isSyncingMeta}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-neutral-700 rounded-lg text-amber-500"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </div>
                )}
                
                <button 
                  onClick={handleOrganize}
                  title="Move and rename files"
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white transition border border-white/5"
                >
                  <Layers className="w-4 h-4" />
                  Organize
                </button>
                
                {!isAvailable && (
                  <button 
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs bg-neutral-800 text-amber-500 hover:bg-neutral-700 transition border border-amber-500/20 shadow-md shadow-amber-500/5 animate-pulse"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showMetadataSearch && (
        <MetadataSearchModal 
            initialTitle={searchTitle || editData.title || book.title}
            bookType={book.type}
            onSelect={selectResult}
            onClose={() => setShowMetadataSearch(false)}
        />
      )}
    </div>
  );
}

