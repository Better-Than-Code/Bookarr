/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, HardDrive, Terminal, Plus, Layers, CheckCircle2, Trash2, Activity, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { BookrrConfig, IndexerSettings, MessageLog } from '../types';

interface IndexerSettingsProps {
  config: BookrrConfig;
  indexers: IndexerSettings[];
  logs: MessageLog[];
  onSaveConfig: (updated: { config: BookrrConfig; indexers: IndexerSettings[] }) => void;
  onClearLogs?: () => void;
}

export default function BookrrSettings({ config, indexers, logs, onSaveConfig }: IndexerSettingsProps) {
  // Form configurations
  const [webtorEnabled, setWebtorEnabled] = useState(config.webtorEnabled ?? true);
  const [localDownloadPath, setLocalDownloadPath] = useState(config.localDownloadPath || '');

  // Indexers management
  const [localIndexers, setLocalIndexers] = useState<IndexerSettings[]>(indexers || []);
  const [saveStatus, setSaveStatus] = useState('');

  // New indexer states
  const [showAddIndexer, setShowAddIndexer] = useState(false);
  const [newIndexerName, setNewIndexerName] = useState('');
  const [newIndexerUrl, setNewIndexerUrl] = useState('');
  const [newIndexerApiKey, setNewIndexerApiKey] = useState('');
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const [checkResult, setCheckResult] = useState<{ status: 'online' | 'offline'; error?: string } | null>(null);

  useEffect(() => {
    setWebtorEnabled(config.webtorEnabled);
    setLocalDownloadPath(config.localDownloadPath);
    setLocalIndexers(indexers);
  }, [config, indexers]);

  const checkHealth = async (url: string) => {
    try {
      const response = await fetch('/api/indexers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      return await response.json();
    } catch (e) {
      return { status: 'offline', error: 'Service Unavailable' };
    }
  };

  const handleCheckIndexer = async () => {
    if (!newIndexerUrl) return;
    setIsCheckingNew(true);
    setCheckResult(null);
    const result = await checkHealth(newIndexerUrl);
    setCheckResult(result);
    setIsCheckingNew(false);
  };

  const toggleIndexer = (id: string) => {
    const updated = localIndexers.map(ind => {
      if (ind.id === id) {
        return { ...ind, enabled: !ind.enabled };
      }
      return ind;
    });
    setLocalIndexers(updated);
  };

  const handleUpdateIndexerApiKey = (id: string, key: string) => {
    const updated = localIndexers.map(ind => {
      if (ind.id === id) {
        return { ...ind, apiKey: key };
      }
      return ind;
    });
    setLocalIndexers(updated);
  };

  const handleAddIndexer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIndexerName || !newIndexerUrl) return;

    let status: 'online' | 'offline' | 'unknown' = 'unknown';
    if (checkResult) {
      status = checkResult.status;
    } else {
      // Check quickly if we haven't already
      const result = await checkHealth(newIndexerUrl);
      status = result.status;
    }

    const newIdx: IndexerSettings = {
      id: `ind-${Date.now()}`,
      name: newIndexerName,
      url: newIndexerUrl,
      apiKey: newIndexerApiKey,
      enabled: true,
      type: 'native',
      status,
      lastChecked: new Date().toISOString()
    };
    const updated = [...localIndexers, newIdx];
    setLocalIndexers(updated);

    onSaveConfig({
      config: {
        webtorEnabled,
        localDownloadPath
      },
      indexers: updated
    });

    setNewIndexerName('');
    setNewIndexerUrl('');
    setNewIndexerApiKey('');
    setCheckResult(null);
    setShowAddIndexer(false);
    setSaveStatus('New tracker added successfully!');
    setTimeout(() => {
      setSaveStatus('');
    }, 4000);
  };

  const handleDeleteIndexer = (id: string) => {
    if (!window.confirm('Delete this tracker indexer link from your torrent indexers list?')) {
      return;
    }
    const updated = localIndexers.filter(ind => ind.id !== id);
    setLocalIndexers(updated);
    
    onSaveConfig({
      config: {
        webtorEnabled,
        localDownloadPath
      },
      indexers: updated
    });

    setSaveStatus('Tracker removed successfully!');
    setTimeout(() => {
      setSaveStatus('');
    }, 4000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      config: {
        webtorEnabled,
        localDownloadPath
      },
      indexers: localIndexers
    });
    setSaveStatus('Bookrr settings saved locally!');
    setTimeout(() => {
      setSaveStatus('');
    }, 4000);
  };

  return (
    <div className="space-y-6">
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
        
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-6">
            
            <div className="flex items-center gap-3 pb-4 border-b border-[#222]">
              <Settings className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-sans font-bold text-sm text-neutral-100">Bookrr Media Suite</h3>
                <p className="text-[11px] text-neutral-400">Configure your internal media server and download behavior</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider font-mono">WebTorrent Client</h4>
              <div className="flex items-center justify-between bg-[#161616] p-3 rounded-lg border border-neutral-900">
                <div className="text-left py-0.5">
                  <span className="text-xs font-semibold text-neutral-300 block">Integrated Downloader</span>
                  <p className="text-[10px] text-neutral-500 font-sans mt-0.5 leading-snug">Automatically stream and download books from indexers</p>
                </div>
                <input
                  type="checkbox"
                  checked={webtorEnabled}
                  onChange={(e) => setWebtorEnabled(e.target.checked)}
                  className="w-4.5 h-4.5 text-amber-500 bg-neutral-900 border-neutral-700 rounded focus:ring-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1 font-mono text-[11px]">
                <label className="text-neutral-400 block font-semibold">Watch Folder / Target Directory</label>
                <input
                  type="text"
                  value={localDownloadPath}
                  onChange={(e) => setLocalDownloadPath(e.target.value)}
                  placeholder="/data/downloads"
                  className="w-full bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg p-2.5 focus:outline-none focus:border-amber-500 text-neutral-100 text-xs"
                />
                <p className="text-[10px] text-neutral-500 font-sans leading-snug mt-1">Files downloaded or placed here (.epub, .mp3, .m4b) will be automatically picked up when this app starts or when scanning.</p>
              </div>
            </div>

            <div className="pt-2 border-t border-[#222] flex items-center justify-between">
              {saveStatus ? (
                <span className="text-[10px] font-mono text-emerald-500 font-semibold flex items-center gap-1.5 animate-pulse">
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                  {saveStatus}
                </span>
              ) : <div />}

              <button
                type="submit"
                className="bg-amber-500 text-black px-6 py-2.5 rounded-xl text-xs font-semibold hover:bg-amber-400 transition cursor-pointer ml-auto"
              >
                Save Settings
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="font-sans font-bold text-sm text-neutral-100">Integrated Indexers</h3>
                  <p className="text-[11px] text-neutral-400">Native scrapers acting as your internal media tracker aggregator</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddIndexer(!showAddIndexer)}
                className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Custom</span>
              </button>
            </div>

            {showAddIndexer && (
              <form onSubmit={handleAddIndexer} className="bg-[#181818] border border-amber-500/25 p-4 rounded-xl space-y-3 text-xs font-mono">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-neutral-400 block">Indexer Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MyTracker"
                      value={newIndexerName}
                      onChange={(e) => setNewIndexerName(e.target.value)}
                      className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-neutral-400 block flex items-center justify-between">
                      Base URL
                      <button 
                        type="button"
                        onClick={handleCheckIndexer}
                        disabled={!newIndexerUrl || isCheckingNew}
                        className="text-amber-500 hover:text-amber-400 disabled:text-neutral-600 disabled:cursor-not-allowed transition flex items-center gap-1"
                      >
                        {isCheckingNew ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                        Check
                      </button>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="https://..."
                      value={newIndexerUrl}
                      onChange={(e) => {
                        setNewIndexerUrl(e.target.value);
                        setCheckResult(null);
                      }}
                      className="w-full bg-[#202020] border border-[#333] p-2 rounded focus:outline-none text-neutral-200"
                    />
                    {checkResult && (
                      <div className={`mt-1 text-[10px] flex items-center gap-1.5 ${checkResult.status === 'online' ? 'text-emerald-500' : 'text-red-400'}`}>
                        {checkResult.status === 'online' ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {checkResult.status === 'online' ? 'Tracker Reachable' : checkResult.error || 'Connection Failed'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddIndexer(false)}
                    className="px-3 py-1.5 hover:bg-[#202020] text-neutral-400 rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-amber-500 text-black px-4 py-1.5 hover:bg-amber-400 rounded font-semibold cursor-pointer"
                  >
                    Add Indexer
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {localIndexers.map((ind) => (
                <div
                  key={ind.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#161616] border border-[#242424] p-3 rounded-xl hover:border-neutral-750 gap-3 transition group"
                >
                  <div className="flex items-center gap-3 text-left min-w-0">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={ind.enabled}
                        onChange={() => toggleIndexer(ind.id)}
                        className="w-4 h-4 text-amber-500 bg-neutral-900 border-neutral-700 rounded focus:ring-amber-500 cursor-pointer shrink-0"
                      />
                      {ind.status && (
                        <div 
                          className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-[#161616] ${
                            ind.status === 'online' ? 'bg-emerald-500' : 
                            ind.status === 'offline' ? 'bg-red-500' : 'bg-neutral-500'
                          }`}
                          title={ind.error || (ind.status === 'online' ? 'Online' : 'Offline')}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-200 block truncate">{ind.name}</span>
                        {ind.lastChecked && (
                          <span className="text-[8px] text-neutral-600 font-mono hidden group-hover:block transition-opacity animate-in fade-in duration-300">
                            (Checked: {new Date(ind.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-neutral-500 font-mono block truncate">{ind.url}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-neutral-500 uppercase font-bold px-2 py-0.5 border border-neutral-800 rounded bg-neutral-900">
                      {ind.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteIndexer(ind.id)}
                      className="text-neutral-500 hover:text-red-400 p-1 rounded hover:bg-neutral-800 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-amber-500" />
              <h3 className="font-sans font-bold text-sm text-neutral-100">Bookrr Service Logs</h3>
            </div>

            <div className="bg-[#080808] border border-[#202020] rounded-xl p-4 h-56 font-mono text-xs overflow-y-auto space-y-1.5 scrollbar-thin select-all">
              {logs.map((log) => {
                let textCol = 'text-neutral-300';
                if (log.level === 'warn') textCol = 'text-amber-500';
                else if (log.level === 'error') textCol = 'text-red-400';
                else if (log.level === 'success') textCol = 'text-emerald-400';

                return (
                  <div key={log.id} className="text-left flex items-start gap-2 select-text leading-relaxed">
                    <span className="text-neutral-600 shrink-0 select-none text-[10px]">
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]
                    </span>
                    <span className={`uppercase font-bold shrink-0 select-none text-[10px] ${
                      log.source === 'webtor' ? 'text-amber-500' : 'text-neutral-500'
                    }`}>
                      [{log.source}]
                    </span>
                    <span className={textCol}>{log.message}</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
