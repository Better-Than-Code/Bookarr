/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Library, Search, Download, Settings, Sparkles, X } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeDownloadsCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  activeDownloadsCount,
  isOpen,
  onClose,
}: SidebarProps) {
  const navItems = [
    { id: "library", name: "Audiobooks & E-books", icon: Library },
    { id: "search", name: "Global Search", icon: Search },
    {
      id: "downloads",
      name: "Webtor Downloads",
      icon: Download,
      badge: activeDownloadsCount,
    },
    { id: "settings", name: "Bookrr Settings", icon: Settings },
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
        className={`w-64 bg-[#0a0a0a]/90 backdrop-blur-2xl border-r border-[#1a1a1a] flex flex-col h-screen fixed top-0 bottom-0 z-50 select-none transition-transform duration-300 lg:translate-x-0 outline-none ${
          isOpen
            ? "left-0 translate-x-0"
            : "-left-64 -translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logos & Brand */}
        <div className="p-7 flex items-center justify-between pb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center font-display italic font-bold text-black text-xl shadow-lg shadow-amber-500/20">
              Br
            </div>
            <div>
              <h1 className="font-display font-semibold text-xl text-neutral-100 tracking-tight leading-none">
                Bookrr
              </h1>
              <span className="text-[9px] font-sans text-neutral-500 font-bold tracking-widest uppercase">
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
        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto hide-scrollbar">
          <div className="px-3 mb-4 text-[10px] font-sans font-bold text-neutral-600 uppercase tracking-widest flex items-center gap-2">
            <span className="w-3 border-t border-neutral-700 block"></span>
            Menu
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
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm transition-all duration-300 cursor-pointer ${
                  isActive
                    ? "bg-[#151515] text-amber-500 shadow-inner border border-[#222]"
                    : "text-neutral-400 hover:bg-[#111] hover:text-neutral-200 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${isActive ? "stroke-2" : "stroke-[1.5]"}`}
                  />
                  <span
                    className={`font-medium tracking-wide ${isActive ? "font-semibold" : ""}`}
                  >
                    {item.name}
                  </span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500 text-black font-semibold animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Status Footer */}
        <div className="p-6 text-neutral-500 font-mono text-[10px] space-y-2 mt-auto">
          <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span>Network</span>
              <div className="flex items-center gap-1.5 opacity-90">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span>
                <span className="text-emerald-500 font-semibold tracking-wider">
                  ONLINE
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[#222] pt-2">
              <span>Catalog</span>
              <span className="text-neutral-300">Local DB</span>
            </div>
            <div className="flex items-center justify-between border-t border-[#222] pt-2">
              <span>Engine</span>
              <span className="text-amber-500 font-semibold tracking-wider">
                NATIVE
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
