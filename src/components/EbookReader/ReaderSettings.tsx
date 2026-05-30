/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useReaderSettings } from '../../hooks/useReaderSettings';
import { Settings, Type, LayoutGrid, Palette } from 'lucide-react';

interface Props {
  settings: ReturnType<typeof useReaderSettings>;
}

export default function ReaderSettings({ settings }: Props) {
  const [tab, setTab] = useState<'font' | 'layout' | 'themes'>('font');

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-neutral-500/10 p-1">
        {[
          { id: 'font', label: 'FONT', icon: Type },
          { id: 'layout', label: 'LAYOUT', icon: LayoutGrid },
          { id: 'themes', label: 'THEMES', icon: Palette }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            aria-label={`Switch to ${t.label} settings`}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-bold tracking-widest transition-all rounded-xl ${tab === t.id ? 'bg-amber-600 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">
        {tab === 'font' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Font Size</h3>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => settings.setFontSize(Math.max(12, settings.fontSize - 2))} 
                aria-label="Decrease font size"
                className="p-2 border rounded"
              >-</button>
              <span>{settings.fontSize}px</span>
              <button 
                onClick={() => settings.setFontSize(Math.min(32, settings.fontSize + 2))} 
                aria-label="Increase font size"
                className="p-2 border rounded"
              >+</button>
            </div>
            <h3 className="font-semibold">Font Family</h3>
            <div className="grid grid-cols-2 gap-2">
              {['sans', 'serif', 'mono', 'dyslexic'].map((font) => (
                <button
                  key={font}
                  onClick={() => settings.setFontFamily(font as any)}
                  aria-label={`Select ${font} font`}
                  className={`p-2 rounded border ${settings.fontFamily === font ? 'bg-amber-100 border-amber-600' : 'bg-white border-neutral-200'}`}
                >
                  {font.charAt(0).toUpperCase() + font.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'layout' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Line Spacing</h3>
            <div className="grid grid-cols-3 gap-2">
              {['compact', 'comfort', 'loose'].map((spacing) => (
                <button
                  key={spacing}
                  onClick={() => settings.setLineSpacing(spacing as any)}
                  aria-label={`Select ${spacing} line spacing`}
                  className={`p-2 rounded border ${settings.lineSpacing === spacing ? 'bg-amber-100 border-amber-600' : 'bg-white border-neutral-200'}`}
                >
                  {spacing.charAt(0).toUpperCase() + spacing.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'themes' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Themes</h3>
            <div className="grid grid-cols-2 gap-2">
              {['light', 'sepia', 'night', 'amoled'].map((themeName) => (
                <button
                  key={themeName}
                  onClick={() => settings.setTheme(themeName as any)}
                  aria-label={`Select ${themeName} theme`}
                  className={`p-2 rounded border ${settings.theme === themeName ? 'bg-amber-100 border-amber-600' : 'bg-white border-neutral-200'}`}
                >
                  {themeName.charAt(0).toUpperCase() + themeName.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
