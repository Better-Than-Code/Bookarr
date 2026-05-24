/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { FolderPlus, CheckCircle2, ArrowRight, ShieldCheck, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveDirectoryHandle } from '../services/LocalFileService';

interface StorageOnboardingProps {
    onComplete: () => void;
}

export default function StorageOnboarding({ onComplete }: StorageOnboardingProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const rootName = localStorage.getItem('bookarr_root_name');
        if (!rootName) {
            // Check if native API is supported
            if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
                // If we are in an iframe, we might not want to show it immediately as it won't work, 
                // but let's show it so they know they NEED to open in a new tab.
                setIsVisible(true);
            }
        }
    }, []);

    const handleInitialize = async () => {
        if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return;
        
        const isInIframe = window.self !== window.top;
        if (isInIframe) {
            alert("Native file access is restricted in the preview iframe. Please click 'Open in New Tab' at the top right to set up your local storage!");
            return;
        }

        setIsInitializing(true);
        try {
            // 1. Pick root "bookarr" folder
            // @ts-ignore
            const handle = await window.showDirectoryPicker({
                id: 'bookarr-root-picker',
                mode: 'readwrite',
                // @ts-ignore
                hint: 'Select or create your "bookarr" root folder'
            });

            // 2. Setup subfolders structure as requested by user
            const downloadHandle = await handle.getDirectoryHandle('download', { create: true });
            const ebooksHandle = await handle.getDirectoryHandle('ebooks', { create: true });
            const audiobooksHandle = await handle.getDirectoryHandle('audiobooks', { create: true });

            // 3. Save handles to LocalFileService (IndexedDB)
            await saveDirectoryHandle('watch', downloadHandle);
            await saveDirectoryHandle('ebooks', ebooksHandle);
            await saveDirectoryHandle('audiobooks', audiobooksHandle);

            // 4. Persist flag
            localStorage.setItem('bookarr_root_name', handle.name);
            localStorage.setItem('bookarr_setup_v1', 'true');

            setSuccess(true);
            setTimeout(() => {
                setIsVisible(false);
                onComplete();
            }, 3000);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('Storage initialization failed:', err);
                alert('Connection failed: ' + err.message);
            }
        } finally {
            setIsInitializing(false);
        }
    };

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mb-8"
            >
                <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 md:p-8">
                    {/* Background Decorative Element */}
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl" />
                    
                    <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 relative z-10 text-left">
                        <div className="p-4 bg-amber-500 rounded-2xl text-black shadow-xl shadow-amber-500/20 shrink-0">
                            {success ? <CheckCircle2 size={32} /> : <FolderPlus size={32} />}
                        </div>
                        
                        <div className="flex-1 space-y-2">
                            <h3 className="text-lg md:text-xl font-extrabold text-neutral-100 tracking-tight">
                                {success ? "Storage Connected!" : "Connect Local Media Storage"}
                            </h3>
                            <p className="text-sm text-neutral-400 max-w-xl leading-relaxed">
                                {success 
                                    ? "Your 'bookarr' folders are successfully mapped. Files will now organize automatically into ebooks/ and audiobooks/ subfolders."
                                    : "Link a folder on your device to enable automatic library organization. We'll set up 'download/', 'ebooks/', and 'audiobooks/' sub-repositories for you."}
                            </p>
                            
                            {!success && (
                                <div className="flex flex-wrap items-center gap-4 pt-2">
                                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-neutral-500">
                                        <ShieldCheck size={12} className="text-emerald-500" />
                                        Private Offline access
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-neutral-500">
                                        <HardDrive size={12} className="text-amber-500" />
                                        Self-Contained Structure
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 w-full md:w-auto">
                            {!success ? (
                                <button
                                    onClick={handleInitialize}
                                    disabled={isInitializing}
                                    className="w-full md:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                                >
                                    {isInitializing ? (
                                        <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Initialize Bookarr Root
                                            <ArrowRight size={16} />
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="px-6 py-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-sm rounded-xl flex items-center justify-center gap-2">
                                    <CheckCircle2 size={16} />
                                    Configuration Saved
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
