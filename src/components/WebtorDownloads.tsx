/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Trash2, Pause, Play, CheckCircle2, ChevronDown, Award, Compass, FileAudio, FileText, Database } from 'lucide-react';
import { TorrentTask, IndexerSettings } from '../types';

interface WebtorDownloadsProps {
  tasks: TorrentTask[];
  onCancelTask: (taskId: string) => void;
  indexers: IndexerSettings[];
}

export default function WebtorDownloads({ tasks, onCancelTask, indexers }: WebtorDownloadsProps) {
  const activeDownloadsCount = tasks.filter(t => t.status === 'downloading').length;
  
  // Compute aggregate stats safely
  const totalSpeedBytes = tasks.reduce((acc, t) => {
    if (t.status !== 'downloading') return acc;
    const match = t.downloadSpeed.match(/([\d.]+)\s*MB\/s/);
    if (match) return acc + parseFloat(match[1]) * 1024 * 1024;
    const kbMatch = t.downloadSpeed.match(/([\d.]+)\s*KB\/s/);
    if (kbMatch) return acc + parseFloat(kbMatch[1]) * 1024;
    return acc;
  }, 0);

  const downloadSpeed = totalSpeedBytes > 1024 * 1024 
    ? (totalSpeedBytes / (1024 * 1024)).toFixed(1) + ' MB/s'
    : (totalSpeedBytes / 1024).toFixed(0) + ' KB/s';
    
  const diskSpace = '218.4 GB Free';

  return (
    <div className="space-y-6">
      
      {/* Overall stats board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Webtor Active Streams</p>
          <p className="text-xl font-sans font-extrabold text-neutral-200 mt-1">{activeDownloadsCount} Torrent Streams</p>
        </div>
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Overall Download Speed</p>
          <p className="text-xl font-sans font-extrabold text-amber-500 mt-1">{downloadSpeed}</p>
        </div>
        <div className="bg-[#121212] border border-[#222] p-4 rounded-xl text-left">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Local Disk Available</p>
          <p className="text-xl font-sans font-extrabold text-neutral-200 mt-1">{diskSpace}</p>
        </div>
      </div>

      {/* Main tasks panel */}
      <div className="space-y-4 text-left">
        <h3 className="font-sans font-bold text-sm text-neutral-300">
          Downloading Queue / Torrent Tasks
        </h3>

        {tasks.length === 0 ? (
          <div className="p-12 text-center bg-[#111] rounded-2xl border border-[#222]">
            <Compass className="w-8 h-8 text-neutral-600 mx-auto mb-2 animate-spin duration-3000" />
            <p className="text-neutral-400 font-sans text-sm font-medium">Your torrent downloader is idle.</p>
            <p className="text-neutral-600 font-sans text-xs mt-1">
              Navigate to the Indexer Search or Gemini Butler to queue and download torrents locally.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const isCompleted = task.status === 'completed';
              return (
                <div
                  key={task.id}
                  className="bg-[#121212] border border-[#222] p-5 rounded-2xl space-y-4 shadow-sm"
                >
                  {/* Task identity bar */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isCompleted ? (
                          <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono animate-pulse">
                            <Download className="w-3 h-3" /> Streaming
                          </span>
                        )}
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Indexer Source: {task.indexer}
                        </span>
                      </div>
                      <h4 className="font-sans font-bold text-sm text-neutral-200 truncate mt-1">
                        {task.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                         <Database size={10} className="text-neutral-600" />
                         <span className="text-[9px] font-mono text-neutral-600 truncate uppercase">
                           Locally stored in: /data/downloads/{task.name}
                         </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onCancelTask(task.id)}
                      className="text-neutral-500 hover:text-red-400 p-2 hover:bg-neutral-800 rounded-lg transition shrink-0 cursor-pointer"
                      title="Delete torrent and cache directory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Slider Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-mono text-neutral-500">
                      <span>Progress: {task.progress}%</span>
                      <span>{task.size} total</span>
                    </div>
                    <div className="w-full bg-[#1e1e1e] h-2 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${task.progress}%` }}
                        className={`h-full transition-all duration-300 ${
                          isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Speeds and Stats if downloading */}
                  {!isCompleted && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#181818] p-3 rounded-lg text-xs font-mono text-neutral-400">
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">DL Speed</span>
                        <span className="text-neutral-200 mt-0.5 block font-semibold">{task.downloadSpeed}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">UL Speed</span>
                        <span className="text-neutral-200 mt-0.5 block">{task.uploadSpeed}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">ETA Remaining</span>
                        <span className="text-neutral-200 mt-0.5 block font-semibold">{task.eta}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 block uppercase">Connected peers</span>
                        <span className="text-neutral-200 mt-0.5 block font-semibold">
                          {task.numPeers || 0} active connections
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Files inside Torrent list */}
                  <div className="space-y-1.5 border-t border-[#222] pt-3.5">
                    <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest pl-1 mb-1">
                      Torrent Folder Contents
                    </p>
                    <div className="space-y-1">
                      {task.files.map((file, i) => (
                        <div
                          key={i}
                          className="flex justify-between items-center text-xs text-neutral-400 py-1.5 hover:bg-neutral-800 rounded px-1.5 border-b border-neutral-900 last:border-none"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {file.type === 'audio' ? (
                              <FileAudio className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            ) : file.type === 'ebook' ? (
                              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-600 shrink-0 rotate-270" />
                            )}
                            <span className="truncate text-neutral-300 font-medium">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
                            <span className="text-neutral-500">{file.size}</span>
                            <span className={file.progress === 100 ? 'text-emerald-500' : 'text-amber-500'}>
                              {file.progress}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Description Info Corner */}
      <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 text-left">
        <div className="flex items-start gap-3">
          <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h5 className="font-sans font-bold text-xs text-amber-400">Webtor Automation Bridge</h5>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              Upon completed torrent execution, the server backend automatically unpackages ePUB text files or MP3 audio tracks, maps the corresponding AudiobookShelf directory schemas, and binds them to your media dashboard instantly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
