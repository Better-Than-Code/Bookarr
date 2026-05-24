/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Library, Search, Download, Settings, Sparkles, X } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeDownloadsCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, activeDownloadsCount, isOpen, onClose }: SidebarProps) {
  const navItems = [
    { id: 'library', name: 'Audiobooks & E-books', icon: Library },
    { id: 'search', name: 'Global Search', icon: Search },
    { id: 'downloads', name: 'Webtor Downloads', icon: Download, badge: activeDownloadsCount },
    { id: 'settings', name: 'Bookrr Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
          onClick={onClose}
        />
      )}

      <aside
        className={`w-64 bg-[#111] border-r border-[#222] flex flex-col h-screen fixed top-0 bottom-0 z-50 select-none transition-transform duration-300 lg:translate-x-0 lg:left-0 ${
          isOpen ? 'left-0 translate-x-0' : '-left-64 -translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logos & Brand */}
        <div className="p-6 border-b border-[#222] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center font-bold text-black text-xl shadow-md shadow-amber-500/10">
              Br
            </div>
            <div>
              <h1 className="font-sans font-bold text-lg text-neutral-100 tracking-tight leading-none">
                Bookrr
              </h1>
              <span className="text-[10px] font-mono text-amber-500 font-semibold tracking-wider uppercase">
                Media Suite
              </span>
            </div>
          </div>

          {/* Close button for mobile views */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 -mr-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            aria-label="Close navigation panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2 text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
            Media Explorer
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose(); // Automatically close side drawer on selection on mobile!
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-400 border-l-2 border-amber-500 pl-2.5'
                    : 'text-neutral-400 hover:bg-[#181818] hover:text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-neutral-400'}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-black font-semibold font-mono animate-pulse">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Status Footer */}
        <div className="p-4 border-t border-[#222] bg-[#0c0c0c] text-neutral-500 font-mono text-[10px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Indexer:</span>
            <span className="text-emerald-500 font-semibold">● ACTIVE</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Storage:</span>
            <span className="text-neutral-300">Local DB (JSON)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Aggregator:</span>
            <span className="text-amber-500 font-semibold">NATIVE</span>
          </div>
        </div>
      </aside>
    </>
  );
}
