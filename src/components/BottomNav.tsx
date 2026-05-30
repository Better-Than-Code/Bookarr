import React from "react";
import { Library, Search, Download, Settings } from "lucide-react";

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeDownloadsCount: number;
}

export default function BottomNav({
  activeTab,
  setActiveTab,
  activeDownloadsCount,
}: BottomNavProps) {
  const navItems = [
    { id: "library", name: "Library", icon: Library },
    { id: "search", name: "Search", icon: Search },
    {
      id: "downloads",
      name: "Downloads",
      icon: Download,
      badge: activeDownloadsCount,
    },
    { id: "settings", name: "Settings", icon: Settings },
  ];

  return (
    <nav className="lg:hidden fixed bottom-4 left-4 right-4 z-40 pb-safe pointer-events-none select-none">
      <div className="bg-[#111]/85 backdrop-blur-3xl border border-[#222] shadow-2xl flex justify-around items-center h-16 px-3 pointer-events-auto max-w-[360px] mx-auto rounded-3xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative cursor-pointer transition-all duration-300 ${
                isActive
                  ? "text-amber-500 scale-105"
                  : "text-neutral-500 hover:text-neutral-300 scale-100"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-[22px] h-[22px] transition-all ${isActive ? "stroke-2 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "stroke-[1.5]"}`}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full z-10 animate-pulse border border-[#111]">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[9px] font-medium leading-none tracking-wide transition-opacity ${isActive ? "opacity-100" : "opacity-70"}`}
              >
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
