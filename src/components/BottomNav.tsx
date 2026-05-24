import React from 'react';
import { Library, Search, Download, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeDownloadsCount: number;
}

export default function BottomNav({ activeTab, setActiveTab, activeDownloadsCount }: BottomNavProps) {
  const navItems = [
    { id: 'library', name: 'Library', icon: Library },
    { id: 'search', name: 'Search', icon: Search },
    { id: 'downloads', name: 'Downloads', icon: Download, badge: activeDownloadsCount },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#111] border-t border-[#222] z-40 pb-safe select-none">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative cursor-pointer ${
                isActive ? 'text-amber-500' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Icon className="w-6 h-6 stroke-[1.5]" />
              <span className="text-[10px] font-medium leading-none">{item.name}</span>
              
              {item.badge && item.badge > 0 ? (
                <span className="absolute top-2 right-1/4 translate-x-2 -translate-y-1 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full z-10 animate-pulse">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
