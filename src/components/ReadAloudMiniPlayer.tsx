import React, { useState, useEffect } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  Volume2,
  Sliders,
  ChevronUp,
  ChevronDown,
  Sparkles,
  BookOpen,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useReadAloud } from "../context/ReadAloudContext";
import { motion, AnimatePresence } from "motion/react";

interface ReadAloudMiniPlayerProps {
  isReaderOpen?: boolean;
  onOpenReader?: (bookId: string) => void;
}

const US_VOICE_PRESETS = [
  { id: 0, label: "Sarah (Female)" },
  { id: 1, label: "Emily (Female)" },
  { id: 2, label: "Robert (Male)" },
  { id: 3, label: "Michael (Male)" },
  { id: 4, label: "Jessica (Female)" },
  { id: 5, label: "Thomas (Male)" },
  { id: 6, label: "William (Male)" },
  { id: 7, label: "Henry (Male)" },
  { id: 8, label: "David (Male)" },
  { id: 9, label: "Alice (Female)" },
];

const UK_VOICE_PRESETS = [
  { id: 0, label: "Elizabeth (Female)" },
  { id: 1, label: "Charlotte (Female)" },
  { id: 2, label: "Victoria (Female)" },
  { id: 3, label: "Beatrice (Female)" },
  { id: 4, label: "Alistair (Male)" },
  { id: 5, label: "George (Male)" },
  { id: 6, label: "Charles (Male)" },
  { id: 7, label: "Harry (Male)" },
];

export default function ReadAloudMiniPlayer({
  isReaderOpen = false,
  onOpenReader,
}: ReadAloudMiniPlayerProps) {
  const {
    state,
    pauseTts,
    resumeTts,
    setSpeed,
    setVoiceName,
    setEngine,
    setNeuralModel,
    nextSentence,
    prevSentence,
    stopTts,
    initializeNeuralEngine,
    cancelNeuralEngine,
    resetNeuralEngine,
  } = useReadAloud();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Fetch voices dynamically
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const sorted = [...allVoices].sort((a, b) => {
        const langA = a.lang.toLowerCase();
        const langB = b.lang.toLowerCase();
        if (langA.startsWith("en") && !langB.startsWith("en")) return -1;
        if (!langA.startsWith("en") && langB.startsWith("en")) return 1;
        return a.name.localeCompare(b.name);
      });
      setVoices(sorted);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  if (!state.isSpeaking) return null;

  const currentSentence = state.sentences[state.currentIndex] || "";
  const progressPercent =
    state.sentences.length > 0
      ? Math.round(((state.currentIndex + 1) / state.sentences.length) * 100)
      : 0;

  const getLanguageName = (langCode: string) => {
    try {
      const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
      return displayNames.of(langCode.split("-")[0]) || langCode;
    } catch {
      return langCode;
    }
  };

  const isPremiumVoice = (v: SpeechSynthesisVoice) => {
    const lowerName = v.name.toLowerCase();
    return (
      lowerName.includes("premium") ||
      lowerName.includes("natural") ||
      lowerName.includes("online") ||
      lowerName.includes("google") ||
      lowerName.includes("siri") ||
      lowerName.includes("multilingual") ||
      lowerName.includes("microsoft")
    );
  };

  const voicesByGroup = voices.reduce(
    (acc, voice) => {
      const lang = voice.lang.split("-")[0];
      const langName = getLanguageName(lang);
      const category = isPremiumVoice(voice)
        ? `✨ ${langName} (Natural)`
        : `${langName} (Standard)`;
      if (!acc[category]) acc[category] = [];
      acc[category].push(voice);
      return acc;
    },
    {} as Record<string, SpeechSynthesisVoice[]>,
  );

  // Sort groups: Natural English first, then English standard, then others.
  const sortedVoiceGroupKeys = Object.keys(voicesByGroup).sort((a, b) => {
    const isEngA = a.includes("English") || a.includes("en");
    const isEngB = b.includes("English") || b.includes("en");
    if (isEngA && !isEngB) return -1;
    if (!isEngA && isEngB) return 1;

    const isPremiumA = a.includes("✨");
    const isPremiumB = b.includes("✨");
    if (isPremiumA && !isPremiumB) return -1;
    if (!isPremiumA && isPremiumB) return 1;

    return a.localeCompare(b);
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 100, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
        id="read-aloud-global-player"
        className={`fixed z-[95] left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-[600px] ${
          isReaderOpen ? "bottom-20 md:bottom-20" : "bottom-[80px]"
        } bg-[#1a1a1a]/95 border border-white/10 backdrop-blur-3xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] rounded-2xl transition-all duration-300 select-none flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full h-1 bg-white/5 relative overflow-hidden group/progress cursor-pointer rounded-t-2xl shrink-0">
          <motion.div
            className={`absolute left-0 top-0 bottom-0 ${state.engine === "neural" ? "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]" : "bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>

        <div className="px-4 py-3 flex flex-col">
          <div className="flex items-center justify-between gap-3 relative">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => state.bookId && onOpenReader?.(state.bookId)}
                disabled={isReaderOpen}
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
                  isReaderOpen
                    ? "bg-white/5 text-white/30 cursor-default"
                    : state.engine === "neural"
                      ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-400"
                      : "bg-amber-500 text-black shadow-lg shadow-amber-500/20 hover:bg-amber-400"
                }`}
              >
                <BookOpen size={20} className={isReaderOpen ? "opacity-50" : ""} />
              </button>

              <div 
                className="flex flex-col min-w-0 flex-1 cursor-pointer group py-1" 
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest leading-none mb-1.5 flex items-center gap-2">
                  {state.isBuffering || state.neuralStatus === "loading" ? (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${state.engine === "neural" ? "bg-amber-400" : "bg-amber-400"}`} />
                      {state.engine === "neural" && state.neuralStatus === "loading"
                        ? state.neuralStatusMessage || "Setting up engine..."
                        : "Synthesizing..."}
                    </>
                  ) : state.isPaused ? (
                    <span className="text-neutral-500">Paused</span>
                  ) : (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${state.engine === "neural" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"}`} />
                      <span className={state.engine === "neural" ? "text-amber-400" : "text-amber-400"}>Playing</span>
                    </>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90 truncate leading-tight group-hover:text-white transition-colors">
                    {state.bookTitle || "Active Book"}
                  </span>
                  <ChevronUp className={`text-neutral-500 transition-transform duration-300 shrink-0 ${isCollapsed ? "rotate-0" : "rotate-180"}`} size={14} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              <button
                onClick={prevSentence}
                disabled={state.currentIndex === 0}
                className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all disabled:opacity-20 disabled:hover:bg-transparent"
              >
                <SkipBack size={20} fill="currentColor" />
              </button>

              <button
                onClick={state.isPaused ? resumeTts : pauseTts}
                className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
              >
                {state.isPaused ? (
                  <Play size={22} fill="currentColor" className="ml-0.5" />
                ) : (
                  <Pause size={22} fill="currentColor" />
                )}
              </button>

              <button
                onClick={nextSentence}
                disabled={state.currentIndex >= state.sentences.length - 1}
                className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all disabled:opacity-20 disabled:hover:bg-transparent"
              >
                <SkipForward size={20} fill="currentColor" />
              </button>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-2 border-l border-white/10 pl-2">
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${showSettings ? (state.engine === "neural" ? "text-amber-400 bg-amber-500/10" : "text-amber-500 bg-amber-500/10") : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}
                >
                  <Sliders size={18} />
                </button>

                <AnimatePresence>
                  {showSettings && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full right-0 mb-4 w-72 sm:w-80 bg-[#161616] border border-white/10 rounded-2xl shadow-2xl p-5 z-[100] backdrop-blur-xl"
                    >
                      <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest leading-none mb-1">
                            Speech Engine
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setEngine("native")}
                              className={`py-2 px-3 text-[10px] font-bold rounded-xl border transition-all ${
                                state.engine === "native"
                                  ? "bg-amber-500 text-neutral-950 border-amber-500"
                                  : "bg-white/5 text-neutral-400 border-white/5 hover:bg-white/10"
                              }`}
                            >
                              Standard
                            </button>
                            <button
                              onClick={() => setEngine("neural")}
                              className={`py-2 px-3 text-[10px] font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                                state.engine === "neural"
                                  ? "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20"
                                  : "bg-white/5 text-neutral-400 border-white/5 hover:bg-white/10"
                              }`}
                            >
                              <Sparkles size={10} />
                              Neural AI
                            </button>
                          </div>
                        </div>

                        {state.engine === "native" && (
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest leading-none mb-1">
                              Acoustic Profile
                            </label>
                            <select
                              value={state.selectedVoiceName || ""}
                              onChange={(e) => setVoiceName(e.target.value)}
                              className="w-full text-xs py-2.5 px-3 rounded-xl bg-neutral-950 border border-white/5 text-neutral-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                            >
                              <option value="">System Default</option>
                              {sortedVoiceGroupKeys.map((groupKey) => (
                                <optgroup label={groupKey} key={groupKey}>
                                  {voicesByGroup[groupKey].map((voice, idx) => (
                                    <option
                                      key={`${voice.voiceURI || voice.name}-${idx}`}
                                      value={voice.name}
                                    >
                                      {voice.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        )}

                        {state.engine === "neural" && (
                          <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-widest leading-none mb-1">
                              Neural Voice
                            </label>
                            {!state.selectedModelId ||
                            state.selectedModelId.includes("Kokoro") ? (
                              <select
                                value={
                                  [
                                    "af_heart",
                                    "af_alloy",
                                    "af_aoede",
                                    "af_bella",
                                    "af_jessica",
                                    "af_kore",
                                    "af_nicole",
                                    "af_nova",
                                    "af_river",
                                    "af_sarah",
                                    "af_sky",
                                    "am_adam",
                                    "am_echo",
                                    "am_eric",
                                    "am_fenrir",
                                    "am_liam",
                                    "am_michael",
                                    "am_onyx",
                                    "am_puck",
                                    "am_santa",
                                    "bf_emma",
                                    "bf_isabella",
                                    "bm_george",
                                    "bm_lewis",
                                    "bf_alice",
                                    "bf_lily",
                                    "bm_daniel",
                                    "bm_fable",
                                  ].includes(state.selectedVoiceName || "")
                                    ? state.selectedVoiceName
                                    : "af_heart"
                                }
                                onChange={(e) => setVoiceName(e.target.value)}
                                className="w-full text-xs py-2.5 px-3 rounded-xl bg-neutral-950 border border-white/5 text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer"
                              >
                                <optgroup label="American Female">
                                  <option value="af_heart">Heart</option>
                                  <option value="af_alloy">Alloy</option>
                                  <option value="af_aoede">Aoede</option>
                                  <option value="af_bella">Bella</option>
                                  <option value="af_jessica">Jessica</option>
                                  <option value="af_kore">Kore</option>
                                  <option value="af_nicole">Nicole</option>
                                  <option value="af_nova">Nova</option>
                                  <option value="af_river">River</option>
                                  <option value="af_sarah">Sarah</option>
                                  <option value="af_sky">Sky</option>
                                </optgroup>
                                <optgroup label="American Male">
                                  <option value="am_adam">Adam</option>
                                  <option value="am_echo">Echo</option>
                                  <option value="am_eric">Eric</option>
                                  <option value="am_fenrir">Fenrir</option>
                                  <option value="am_liam">Liam</option>
                                  <option value="am_michael">Michael</option>
                                  <option value="am_onyx">Onyx</option>
                                  <option value="am_puck">Puck</option>
                                  <option value="am_santa">Santa</option>
                                </optgroup>
                                <optgroup label="British Female">
                                  <option value="bf_emma">Emma</option>
                                  <option value="bf_isabella">Isabella</option>
                                  <option value="bf_alice">Alice</option>
                                  <option value="bf_lily">Lily</option>
                                </optgroup>
                                <optgroup label="British Male">
                                  <option value="bm_george">George</option>
                                  <option value="bm_lewis">Lewis</option>
                                  <option value="bm_daniel">Daniel</option>
                                  <option value="bm_fable">Fable</option>
                                </optgroup>
                              </select>
                            ) : state.selectedModelId?.includes("libritts") || state.selectedModelId?.includes("vctk") ? (
                              <select
                                value={parseInt(state.selectedModelId.split("/")[2]) || 0}
                                onChange={(e) => {
                                  if (setNeuralModel) {
                                    const val = parseInt(e.target.value) || 0;
                                    const baseModel = state.selectedModelId.split("/").slice(0, 2).join("/");
                                    setNeuralModel(baseModel + "/" + val);
                                  }
                                }}
                                disabled={state.neuralStatus === "loading"}
                                className="w-full text-xs py-2.5 px-3 rounded-xl bg-neutral-950 border border-white/5 text-amber-300 focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-50"
                              >
                                {state.selectedModelId.includes("libritts")
                                  ? US_VOICE_PRESETS.map((preset) => (
                                      <option key={preset.id} value={preset.id}>
                                        {preset.label}
                                      </option>
                                    ))
                                  : UK_VOICE_PRESETS.map((preset) => (
                                      <option key={preset.id} value={preset.id}>
                                        {preset.label}
                                      </option>
                                    ))}
                              </select>
                            ) : (
                              <div className="w-full text-xs py-2.5 px-3 rounded-xl bg-neutral-950/80 border border-white/5 text-neutral-400 font-mono italic">
                                Locked to Default (Single Speaker)
                              </div>
                            )}
                          </div>
                        )}

                        {state.engine === "neural" && (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                                Engine Status
                              </span>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  state.neuralStatus === "ready"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : state.neuralStatus === "loading"
                                      ? "bg-amber-500/20 text-amber-400"
                                      : state.neuralStatus === "error"
                                        ? "bg-rose-500/20 text-rose-400"
                                        : "bg-neutral-500/20 text-neutral-400"
                                }`}
                              >
                                {state.neuralStatus === "ready"
                                  ? "Verified Ready"
                                  : state.neuralStatus === "loading"
                                    ? "Downloading..."
                                    : state.neuralStatus === "error"
                                      ? "Failed"
                                      : "Idle"}
                              </span>
                            </div>

                            {state.neuralStatus === "loading" && (
                              <div className="space-y-1.5">
                                <div className="text-[10px] text-neutral-400 space-y-1 mb-2">
                                  {state.neuralDownloadFileProgressList.map(
                                    (file) => (
                                      <div
                                        key={file.fileName}
                                        className="flex justify-between font-mono"
                                      >
                                        <span className="truncate mr-2">
                                          {file.fileName}
                                        </span>
                                        <span>
                                          {file.status}{" "}
                                          {state.neuralDownloadIsIndeterminate
                                            ? `${(file.loaded / (1024 * 1024)).toFixed(1)} MB`
                                            : `${file.percentage}%`}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-[10px]">
                                  <p className="text-neutral-500 font-medium text-[10px] leading-tight flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    {state.neuralStatusMessage ||
                                      "Setting up..."}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    {state.neuralDownloadSpeed && (
                                      <span className="text-[9px] font-mono text-neutral-600 bg-neutral-900 px-1 py-0.5 rounded">
                                        {state.neuralDownloadSpeed}
                                      </span>
                                    )}
                                    <span className="text-amber-400 font-bold min-w-[30px] text-right drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]">
                                      {state.neuralDownloadIsIndeterminate
                                        ? ""
                                        : `${Math.round(state.neuralDownloadProgress)}%`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden relative shadow-inner border border-white/5">
                                    <motion.div
                                      className="h-full bg-gradient-to-r from-amber-500 to-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                                      initial={{ width: 0 }}
                                      animate={
                                        state.neuralDownloadIsIndeterminate
                                          ? {
                                              left: ["-30%", "100%"],
                                              width: "30%",
                                            }
                                          : {
                                              width: `${state.neuralDownloadProgress}%`,
                                              left: "0%",
                                            }
                                      }
                                      transition={
                                        state.neuralDownloadIsIndeterminate
                                          ? {
                                              duration: 1.5,
                                              repeat: Infinity,
                                              ease: "linear",
                                            }
                                          : {
                                              duration: 0.3,
                                            }
                                      }
                                      style={{ position: "absolute" }}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cancelNeuralEngine();
                                      }}
                                      className="p-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                      title="Cancel"
                                    >
                                      <X size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        resetNeuralEngine();
                                      }}
                                      className="p-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                                      title="Reset Worker"
                                    >
                                      <RefreshCw size={10} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {state.neuralStatus === "idle" && (
                              <p className="text-[10px] text-amber-300/70 font-medium leading-tight">
                                Using high-fidelity VITS on-device neural model.
                                Initial set up requires ~80-160MB download.
                              </p>
                            )}

                            {state.neuralStatus === "ready" && (
                              <div className="space-y-1.5 mt-1">
                                <p className="text-[10px] text-emerald-400/70 font-medium leading-tight flex items-center gap-1.5">
                                  <Sparkles size={10} />
                                  High-fidelity neural engine is active and
                                  ready.
                                </p>
                                <div className="py-1 px-2 mt-1 -mx-1 bg-emerald-500/10 rounded border border-emerald-500/20 text-[9px] font-mono text-emerald-300">
                                  {state.neuralHardware ||
                                    "Neural Engine Ready"}
                                </div>
                              </div>
                            )}

                            {state.neuralStatus === "error" && (
                              <div className="space-y-1 mt-1">
                                <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400">
                                  <AlertTriangle size={10} />
                                  <span>Engine Error</span>
                                </div>
                                <p className="text-[9px] text-neutral-500 leading-tight">
                                  {state.neuralStatusMessage ||
                                    "Check internet connection."}
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resetNeuralEngine();
                                  }}
                                  className="w-full py-1 mt-1 rounded bg-neutral-800 text-neutral-400 text-[9px] font-bold hover:bg-neutral-700 transition-colors border border-white/5"
                                >
                                  Force Reset Engine
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest">
                            Speed: {state.speed.toFixed(2)}x
                          </label>
                          <div className="grid grid-cols-5 gap-1.5">
                            {[0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => (
                              <button
                                key={`speed-${spd}`}
                                onClick={() => setSpeed(spd)}
                                className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                                  state.speed === spd
                                    ? state.engine === "neural"
                                      ? "bg-amber-500 text-white border-amber-500"
                                      : "bg-amber-500 text-neutral-950 border-amber-500"
                                    : "bg-neutral-950 text-neutral-400 border-white/5 hover:text-white hover:bg-neutral-700"
                                }`}
                              >
                                {spd}x
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={stopTts}
                className="w-9 h-9 flex items-center justify-center text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                title="Close Player"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4 pb-2">
                  <div className={`bg-black/40 rounded-xl p-4 border flex items-start gap-3.5 ${state.engine === "neural" ? "border-amber-500/10" : "border-white/5"}`}>
                    <Volume2
                      size={18}
                      className={`shrink-0 mt-0.5 ${state.engine === "neural" ? "text-amber-400" : "text-amber-500"}`}
                    />
                    <p className="text-[15px] sm:text-base text-neutral-200 leading-relaxed italic font-serif">
                      {currentSentence || "Ready to read aloud..."}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
