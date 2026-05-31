import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  ReactNode,
} from "react";

export interface ReadAloudState {
  isSpeaking: boolean;
  isPaused: boolean;
  isBuffering: boolean;
  sentences: string[];
  currentIndex: number;
  bookId: string | null;
  bookTitle: string | null;
  speed: number;
  selectedVoiceName: string;
  chapterIndex: number;
  engine: "native" | "neural";
  neuralDownloadProgress: number;
  neuralDownloadIsIndeterminate: boolean;
  neuralDownloadSpeed: string;
  neuralStatus: "idle" | "loading" | "ready" | "error";
  neuralStatusMessage: string;
  neuralHardware: string;
  neuralDownloadFileProgressList: any[];
  selectedModelId: string;
}

interface ReadAloudContextValue {
  state: ReadAloudState;
  startSpeaking: (
    bookId: string,
    bookTitle: string,
    sentences: string[],
    startIndex: number,
    chapterIndex: number,
    voiceName?: string,
    speed?: number,
    engine?: "native" | "neural",
  ) => void;
  stopTts: () => void;
  pauseTts: () => void;
  resumeTts: () => void;
  setSpeed: (speed: number) => void;
  setVoiceName: (voiceName: string) => void;
  setEngine: (engine: "native" | "neural") => void;
  nextSentence: () => void;
  prevSentence: () => void;
  setCurrentIndex: (index: number) => void;
  registerCallback: (
    onNextChapter?: () => void,
    onSentenceChange?: (index: number) => void,
  ) => void;
  initializeNeuralEngine: () => void;
  cancelNeuralEngine: () => void;
  resetNeuralEngine: () => void;
  setNeuralModel: (modelId: string) => void;
  setNeuralBackend: (backend: string) => void;
  loadNeuralModelManually: (file: File) => void;
}

const ReadAloudContext = createContext<ReadAloudContextValue | undefined>(
  undefined,
);

export const ReadAloudProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ReadAloudState>(() => {
    return {
      isSpeaking: false,
      isPaused: false,
      isBuffering: false,
      sentences: [],
      currentIndex: 0,
      bookId: null,
      bookTitle: null,
      speed: 1,
      selectedVoiceName: "",
      chapterIndex: 0,
      engine:
        (localStorage.getItem("bookrr-pref-engine") as "native" | "neural") ||
        "native",
      neuralDownloadProgress: 0,
      neuralDownloadIsIndeterminate: false,
      neuralDownloadSpeed: "",
      neuralStatus: "idle",
      neuralStatusMessage: "",
      neuralHardware: "",
      neuralDownloadFileProgressList: [],
      selectedModelId:
        localStorage.getItem("bookrr_tts_model_id") ||
        "kokoro/Kokoro-82M-v1.0-ONNX",
    };
  });

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const getAudioKey = (
    bookId: string,
    chapIdx: number,
    sentenceIdx: number,
    speed: number,
    voice: string,
  ) => `${bookId}::${chapIdx}::${sentenceIdx}::${speed}::${voice}`;

  const isSpeakingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  useEffect(() => {
    isSpeakingRef.current = state.isSpeaking;
    isPausedRef.current = state.isPaused;
  }, [state.isSpeaking, state.isPaused]);

  const preloadedAudioRef = useRef<
    Record<
      string,
      {
        audio: Float32Array | Blob | ArrayBuffer;
        samplingRate: number;
        isPiperTransfer?: boolean;
      }
    >
  >({});
  const requestedAudioRef = useRef<Record<string, boolean>>({});
  const onAudioReadyCallbackRef = useRef<
    Record<
      string,
      (
        audio: Float32Array | Blob | ArrayBuffer,
        sr: number,
        isPiper?: boolean,
      ) => void
    >
  >({});
  const onAudioErrorCallbackRef = useRef<Record<string, () => void>>({});
  const workerRef = useRef<Worker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsKeepAliveIntervalRef = useRef<any>(null);

  const floatTo16BitPCM = (
    output: DataView,
    offset: number,
    input: Float32Array,
  ) => {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const encodeWAV = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * 2, true);
    floatTo16BitPCM(view, 44, samples);
    return new Blob([view], { type: "audio/wav" });
  };

  useEffect(() => {
    // Create a robust 5-second silent audio element to keep the app alive in the background
    const audio = new Audio();
    audio.loop = true;

    // Generate 5 seconds of silence at 22050Hz
    const sampleRate = 22050;
    const buffer = new Float32Array(5 * sampleRate);
    const wavBlob = encodeWAV(buffer, sampleRate);
    const audioUrl = URL.createObjectURL(wavBlob);

    audio.src = audioUrl;
    silentAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const onNextChapterRef = useRef<(() => void) | undefined>(undefined);
  const onSentenceChangeRef = useRef<((index: number) => void) | undefined>(
    undefined,
  );

  const registerCallback = (
    onNextChapter?: () => void,
    onSentenceChange?: (index: number) => void,
  ) => {
    if (onNextChapter) onNextChapterRef.current = onNextChapter;
    if (onSentenceChange) onSentenceChangeRef.current = onSentenceChange;
  };

  const initWorker = (force = false) => {
    console.log(
      `[TTS Context] initWorker called. force=${force}, currentWorker=${!!workerRef.current}`,
    );
    if (force && workerRef.current) {
      console.log("[TTS Context] Terminating existing worker for re-init.");
      workerRef.current.terminate();
      workerRef.current = null;
    }

    if (!workerRef.current && typeof window !== "undefined") {
      const customModelId =
        localStorage.getItem("bookrr_tts_model_id") ||
        "kokoro/Kokoro-82M-v1.0-ONNX";
      const isKokoro = customModelId.startsWith("kokoro/");

      console.log(`[TTS Context] Creating new Worker. isKokoro=${isKokoro}`);
      setState((prev) => ({
        ...prev,
        neuralStatus: "loading",
        neuralDownloadProgress: 0,
        neuralDownloadIsIndeterminate: false,
        neuralDownloadSpeed: "",
        neuralDownloadFileProgressList: [],
      }));

      const workerUrl = isKokoro
        ? `./kokoro-worker.js?v=${Date.now()}`
        : `./tts-worker.js?v=${Date.now()}`;
      const worker = new Worker(workerUrl, { type: "module" });
      worker.onmessage = (e) => {
        const {
          type,
          audio,
          samplingRate,
          message,
          percent,
          speed,
          fileProgressList,
          totalLoadedMB,
          totalSizeMB,
          reqId,
          durationMs,
          isPiperTransfer,
        } = e.data;
        if (type === "audio") {
          if (reqId) {
            console.log(
              `[TTS Analytics] Engine Audio TTFB: reqId=${reqId}, Duration: ${durationMs}ms`,
            );
            console.log(
              `[TTS Context] Worker audio recv reqId=${reqId}, isPiperTransfer=${isPiperTransfer}`,
            );
            preloadedAudioRef.current[reqId] = {
              audio,
              samplingRate,
              isPiperTransfer,
            };
            if (onAudioReadyCallbackRef.current[reqId]) {
              console.log(
                `[TTS Context] Preloaded audio ready for ${reqId}, playing now.`,
              );
              onAudioReadyCallbackRef.current[reqId](
                audio,
                samplingRate,
                isPiperTransfer,
              );
              delete onAudioReadyCallbackRef.current[reqId];
            } else {
              console.log(`[TTS Context] Preloaded audio stored for ${reqId}`);
            }
          }
        } else if (type === "error") {
          console.error(
            `[TTS Context] Worker Error for reqId: ${reqId}: ${message}`,
          );
          if (reqId && onAudioErrorCallbackRef.current[reqId]) {
            onAudioErrorCallbackRef.current[reqId]();
            delete onAudioErrorCallbackRef.current[reqId];
          }
          setState((prev) => ({
            ...prev,
            isBuffering: false,
            neuralStatus: "error",
            neuralStatusMessage: message,
            neuralDownloadSpeed: "",
          }));
        } else if (type === "ready") {
          setState((prev) => ({
            ...prev,
            neuralStatus: "ready",
            neuralDownloadProgress: 100,
            neuralDownloadIsIndeterminate: false,
            isBuffering: false,
            neuralDownloadSpeed: "",
            neuralDownloadFileProgressList: [],
          }));
        } else if (type === "init_hardware") {
          setState((prev) => ({
            ...prev,
            neuralHardware: e.data.hardwareMessage,
          }));
        } else if (type === "status") {
          setState((prev) => ({
            ...prev,
            isBuffering:
              (message === "Synthesizing..." ||
                message === "Synthesizing (Piper WASM)...") &&
              !reqId, // only show buffering globally if not prefetching
            neuralStatus:
              message === "Synthesizing..." ||
              message === "Synthesizing (Piper WASM)..."
                ? prev.neuralStatus
                : "loading",
            neuralStatusMessage: message,
          }));
        } else if (type === "progress") {
          setState((prev) => ({
            ...prev,
            isBuffering: true,
            neuralStatus: "loading",
            neuralDownloadProgress: e.data.percent,
            neuralDownloadIsIndeterminate: e.data.isIndeterminate,
            neuralDownloadSpeed: e.data.speed || prev.neuralDownloadSpeed,
            neuralStatusMessage: `Downloading... (Total: ${e.data.totalLoadedMB}/${e.data.totalSizeMB}MB)`,
            neuralDownloadFileProgressList: e.data.fileProgressList || [],
          }));
        }
      };
      worker.onerror = (err) => {
        console.error("[TTS Context] Worker DOM Error:", err);
        setState((prev) => ({
          ...prev,
          isBuffering: false,
          neuralStatus: "error",
        }));
      };
      workerRef.current = worker;

      const customBackend =
        localStorage.getItem("bookrr_tts_backend") || "auto";
      worker.postMessage({
        type: "init",
        force: force,
        modelId: customModelId,
        backend: customBackend,
      });
    } else if (workerRef.current) {
      const customModelId =
        localStorage.getItem("bookrr_tts_model_id") ||
        "kokoro/Kokoro-82M-v1.0-ONNX";
      const customBackend =
        localStorage.getItem("bookrr_tts_backend") || "auto";
      workerRef.current.postMessage({
        type: "init",
        force: force,
        modelId: customModelId,
        backend: customBackend,
      });
    }
    return workerRef.current;
  };

  const initializeNeuralEngine = () => {
    console.log("[TTS Context] initializeNeuralEngine manually triggered");
    initWorker(); // Do not force clear cache, let it use cache if available
  };

  const cancelNeuralEngine = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      setState((prev) => ({
        ...prev,
        neuralStatus: "idle",
        neuralDownloadProgress: 0,
        neuralDownloadSpeed: "",
        neuralStatusMessage: "Download cancelled by user",
      }));
    }
  };

  const resetNeuralEngine = () => {
    console.log("[TTS Context] resetNeuralEngine triggered");
    initWorker(true);
  };

  const setNeuralModel = (modelId: string) => {
    console.log("[TTS Context] Changing neural model to", modelId);
    localStorage.setItem("bookrr_tts_model_id", modelId);
    // Restart worker with new model
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      neuralStatus: "idle",
      neuralHardware: "",
      neuralDownloadProgress: 0,
      neuralStatusMessage: "Model changed. Need to initialize.",
      selectedModelId: modelId,
    }));
    // We optionally could auto-start initWorker() here
    initWorker();
  };

  const setNeuralBackend = (backend: string) => {
    console.log("[TTS Context] Changing neural backend to", backend);
    localStorage.setItem("bookrr_tts_backend", backend);
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      neuralStatus: "idle",
      neuralHardware: "",
      neuralDownloadProgress: 0,
      neuralStatusMessage: "Backend changed. Need to initialize.",
    }));
    initWorker();
  };

  const loadNeuralModelManually = (file: File) => {
    console.log(
      "[TTS Context] loadNeuralModelManually triggered for file:",
      file.name,
    );
    if (!workerRef.current) {
      initWorker();
    }
    if (workerRef.current) {
      setState((prev) => ({
        ...prev,
        neuralStatus: "loading",
        neuralStatusMessage: `Uploading ${file.name}...`,
      }));
      workerRef.current.postMessage({ type: "manual-upload", file });
    }
  };

  useEffect(() => {
    // Disable automatic neural model downloading.
    // The user must explicitly initialize the download via settings
    // or by playing an audiobook for the first time.
    if (state.engine === "neural" && state.neuralStatus === "idle") {
      // Optional: We can simply set the message to indicate readiness for download
    }
  }, [state.engine]);

  const startTtsKeepAlive = () => {
    if (ttsKeepAliveIntervalRef.current) {
      clearInterval(ttsKeepAliveIntervalRef.current);
    }
    ttsKeepAliveIntervalRef.current = setInterval(() => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }
    }, 10000);
  };

  const stopTtsKeepAlive = () => {
    if (ttsKeepAliveIntervalRef.current) {
      clearInterval(ttsKeepAliveIntervalRef.current);
      ttsKeepAliveIntervalRef.current = null;
    }
  };

  const updateMediaSession = (text: string, title: string) => {
    if (
      typeof window !== "undefined" &&
      "mediaSession" in navigator &&
      (window as any).MediaMetadata
    ) {
      try {
        navigator.mediaSession.metadata = new (window as any).MediaMetadata({
          title: text || "Reading content...",
          artist: "Ebook Reader",
          album: title || "EPUB / PDF Book",
        });

        navigator.mediaSession.setActionHandler("play", resumeTts);
        navigator.mediaSession.setActionHandler("pause", pauseTts);
        navigator.mediaSession.setActionHandler("previoustrack", prevSentence);
        navigator.mediaSession.setActionHandler("nexttrack", nextSentence);

        navigator.mediaSession.playbackState = "playing";
      } catch (e) {
        console.warn("MediaSession registration failed:", e);
      }
    }
  };

  const playRawAudio = (
    audioData: Float32Array | Blob | ArrayBuffer,
    sampleRate: number,
    isPiperTransfer: boolean = false,
    onEnded: () => void,
  ) => {
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio();
    }

    let audioUrl: string = "";
    try {
      const isBlob =
        audioData instanceof Blob ||
        (audioData &&
          (audioData as any).size !== undefined &&
          (audioData as any).type !== undefined);
      console.log(
        "[TTS Context] playRawAudio started. isBlob:",
        isBlob,
        "typeof audioData:",
        typeof audioData,
      );

      if (isPiperTransfer) {
        let properBlob = new Blob([audioData as ArrayBuffer], {
          type: "audio/wav",
        });
        audioUrl = URL.createObjectURL(properBlob);
        console.log(
          "[TTS Context] Created audioUrl from Piper Transfer:",
          audioUrl,
        );
      } else if (isBlob) {
        let properBlob = new Blob([audioData as Blob], { type: "audio/wav" });
        audioUrl = URL.createObjectURL(properBlob);
        console.log("[TTS Context] Created audioUrl from Blob:", audioUrl);
      } else {
        console.log(
          "[TTS Context] Found Float32Array, length:",
          (audioData as Float32Array).length,
        );
        const wavBlob = encodeWAV(audioData as Float32Array, sampleRate);
        audioUrl = URL.createObjectURL(wavBlob);
        console.log(
          "[TTS Context] Created audioUrl from WAV encode:",
          audioUrl,
        );
      }
    } catch (e) {
      console.error("[TTS Context] Error converting audioData to URL:", e);
      onEnded();
      return;
    }

    const audio = audioElementRef.current;

    const handleEnded = () => {
      console.log("[TTS Context] Audio has ended or error emitted.");
      URL.revokeObjectURL(audioUrl);
      audio.onended = null;
      audio.onerror = null;
      if (isSpeakingRef.current && !isPausedRef.current) {
        onEnded();
      } else {
        console.log(
          "[TTS Context] Playback ended/aborted but player is paused or stopped. Skipping automatic advancement.",
        );
      }
    };

    audio.loop = false;
    audio.src = audioUrl;
    audio.onended = handleEnded;
    audio.onerror = (e) => {
      console.error("[TTS Context] Audio audioElement error!", audio.error);
      if (isSpeakingRef.current && !isPausedRef.current) {
        handleEnded();
      } else {
        console.log(
          "[TTS Context] Suppressed error advancement because player is not in active speaking state.",
        );
      }
    };
    audio.load();
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        console.warn(
          "[TTS Context] Audio playback playPromise failed/aborted:",
          e.name,
          e.message || e,
        );
        if (e.name === "AbortError") {
          console.log(
            "[TTS Context] Playback aborted intentionally. Ignoring auto-advancement.",
          );
          return;
        }
        if (e.name === "NotAllowedError") {
          console.log(
            "[TTS Context] Playback not allowed. Setting player to paused state to allow user interaction.",
          );
          isPausedRef.current = true;
          setState((prev) => ({ ...prev, isPaused: true }));
          return;
        }
        if (isSpeakingRef.current && !isPausedRef.current) {
          handleEnded();
        } else {
          console.log(
            "[TTS Context] Suppressed abort/play failure advancement because player is not in active speaking state.",
          );
        }
      });
    }
  };

  const startSpeakingFromIndex = (
    index: number,
    sentencesList: string[],
    speedVal: number,
    voiceNameVal: string,
    engineVal: "native" | "neural" = state.engine,
    bookIdVal: string | null = state.bookId,
    bookTitleVal: string | null = state.bookTitle,
    chapIdxVal: number = state.chapterIndex,
  ) => {
    if (typeof window === "undefined") return;

    // Stop current speech
    if ("speechSynthesis" in window) {
      if ((window as any)._activeUtterances) {
        (window as any)._activeUtterances.forEach((u: any) => {
          u.onend = null;
          u.onerror = null;
        });
        (window as any)._activeUtterances = [];
      }
      window.speechSynthesis.cancel();
    }
    // Ensure primary speech audio element is gracefully paused and detached from previous handlers
    if (audioElementRef.current) {
      try {
        audioElementRef.current.onended = null;
        audioElementRef.current.onerror = null;
        audioElementRef.current.pause();

        // Unlock the primary audio element by immediately playing a silent base64 data URI
        // This satisfies browser auto-play user-gesture requirements before the async neural model finishes returning audio.
        audioElementRef.current.src =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audioElementRef.current.play().catch(() => {});
      } catch (e) {}
    }

    // Start background keepalive (secondary)
    silentAudioRef.current?.play().catch(() => {});

    let nextIdx = index;
    let textToSpeak = "";
    while (nextIdx < sentencesList.length) {
      textToSpeak = sentencesList[nextIdx];
      if (textToSpeak && textToSpeak.trim()) {
        break;
      }
      nextIdx++;
    }

    if (nextIdx >= sentencesList.length) {
      if (onNextChapterRef.current) {
        onNextChapterRef.current();
      } else {
        stopTts();
      }
      return;
    }

    const indexToSpeak = nextIdx;

    isSpeakingRef.current = true;
    isPausedRef.current = false;

    setState((prev) => ({
      ...prev,
      isSpeaking: true,
      isPaused: false,
      isBuffering: false,
      currentIndex: indexToSpeak,
      sentences: sentencesList,
      bookId: bookIdVal,
      bookTitle: bookTitleVal,
      chapterIndex: chapIdxVal,
      speed: speedVal,
      selectedVoiceName: voiceNameVal,
      engine: engineVal,
    }));

    if (onSentenceChangeRef.current) {
      onSentenceChangeRef.current(indexToSpeak);
    }

    if (engineVal === "neural") {
      const worker = initWorker();
      if (worker) {
        const customModelId =
          localStorage.getItem("bookrr_tts_model_id") ||
          "kokoro/Kokoro-82M-v1.0-ONNX";
        const safeNeuralVoice = customModelId;

        const reqKey = getAudioKey(
          bookIdVal || "",
          chapIdxVal,
          indexToSpeak,
          speedVal,
          safeNeuralVoice,
        );

        // Clear any lingering readiness callbacks from skipped sentences so they don't interrupt current playback when they finally return from worker
        onAudioReadyCallbackRef.current = {};
        onAudioErrorCallbackRef.current = {};

        const playCallback = (
          audio: Float32Array | ArrayBuffer | Blob,
          samplingRate: number,
          isPiperTransfer: boolean = false,
        ) => {
          delete preloadedAudioRef.current[reqKey];
          delete onAudioErrorCallbackRef.current[reqKey];
          playRawAudio(audio, samplingRate, isPiperTransfer, () => {
            startSpeakingFromIndex(
              indexToSpeak + 1,
              sentencesList,
              speedVal,
              voiceNameVal,
              engineVal,
              bookIdVal,
              bookTitleVal,
              chapIdxVal,
            );
          });
          setState((prev) => ({ ...prev, isBuffering: false }));
        };

        const errorCallback = () => {
          delete onAudioReadyCallbackRef.current[reqKey];
          startSpeakingFromIndex(
            indexToSpeak + 1,
            sentencesList,
            speedVal,
            voiceNameVal,
            engineVal,
            bookIdVal,
            bookTitleVal,
            chapIdxVal,
          );
        };

        // Compute valid req ids we care about right now
        const validReqIds = [reqKey];
        const workerActiveReqIds = [reqKey];
        for (let i = -1; i <= 5; i++) {
          if (
            i !== 0 &&
            indexToSpeak + i >= 0 &&
            indexToSpeak + i < sentencesList.length
          ) {
            const key = getAudioKey(
              bookIdVal || "",
              chapIdxVal,
              indexToSpeak + i,
              speedVal,
              safeNeuralVoice,
            );
            validReqIds.push(key);
            if (i > 0) workerActiveReqIds.push(key);
          }
        }

        // Clean up refs for dropped prefetch requests so we don't hang if user navigation reverses, and prevent memory leaks
        Object.keys(requestedAudioRef.current).forEach((key) => {
          if (!validReqIds.includes(key) && !preloadedAudioRef.current[key]) {
            delete requestedAudioRef.current[key];
          }
        });
        Object.keys(preloadedAudioRef.current).forEach((key) => {
          if (!validReqIds.includes(key)) {
            delete preloadedAudioRef.current[key];
          }
        });

        worker.postMessage({
          type: "set_active_reqs",
          activeReqIds: workerActiveReqIds,
        });

        if (preloadedAudioRef.current[reqKey]) {
          console.log(`[TTS Context] Using preloaded audio for ${reqKey}`);
          playCallback(
            preloadedAudioRef.current[reqKey].audio,
            preloadedAudioRef.current[reqKey].samplingRate,
            preloadedAudioRef.current[reqKey].isPiperTransfer,
          );
        } else {
          console.log(`[TTS Context] Fetching audio on-demand for ${reqKey}`);
          setState((prev) => ({ ...prev, isBuffering: true }));
          onAudioReadyCallbackRef.current[reqKey] = playCallback;
          onAudioErrorCallbackRef.current[reqKey] = errorCallback;
          if (!requestedAudioRef.current[reqKey]) {
            requestedAudioRef.current[reqKey] = true;
            worker.postMessage({
              type: "speak",
              text: textToSpeak,
              speed: speedVal,
              modelId: customModelId,
              backend: localStorage.getItem("bookrr_tts_backend") || "auto",
              voice: safeNeuralVoice,
              reqId: reqKey,
            });
          }
        }

        // PREFETCH subsequent sentences (lookahead of 4)
        for (let i = 1; i <= 4; i++) {
          const prefetchIdx = indexToSpeak + i;
          if (prefetchIdx < sentencesList.length) {
            const nextText = sentencesList[prefetchIdx];
            if (nextText && nextText.trim()) {
              const prefetchKey = getAudioKey(
                bookIdVal || "",
                chapIdxVal,
                prefetchIdx,
                speedVal,
                safeNeuralVoice,
              );
              if (
                !preloadedAudioRef.current[prefetchKey] &&
                !requestedAudioRef.current[prefetchKey]
              ) {
                console.log(`[TTS Context] Prefetching ${prefetchKey}`);
                requestedAudioRef.current[prefetchKey] = true;
                worker.postMessage({
                  type: "speak",
                  text: nextText,
                  speed: speedVal,
                  modelId: customModelId,
                  backend: localStorage.getItem("bookrr_tts_backend") || "auto",
                  voice: safeNeuralVoice,
                  reqId: prefetchKey,
                });
              }
            }
          }
        }
      }
    } else {
      // Native Speech Synthesis
      if (!("speechSynthesis" in window)) return;

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utteranceRef.current = utterance;

      // Keep active reference
      (window as any)._activeUtterances =
        (window as any)._activeUtterances || [];
      (window as any)._activeUtterances.push(utterance);

      if (voiceNameVal) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find((v) => v.name === voiceNameVal);
        if (voice) utterance.voice = voice;
      }

      utterance.rate = speedVal;

      utterance.onend = () => {
        const idxArr = (window as any)._activeUtterances.indexOf(utterance);
        if (idxArr > -1) {
          (window as any)._activeUtterances.splice(idxArr, 1);
        }
        if (isSpeakingRef.current && !isPausedRef.current) {
          startSpeakingFromIndex(
            indexToSpeak + 1,
            sentencesList,
            speedVal,
            voiceNameVal,
            engineVal,
            bookIdVal,
            bookTitleVal,
            chapIdxVal,
          );
        }
      };

      utterance.onerror = (e: any) => {
        const idxArr = (window as any)._activeUtterances.indexOf(utterance);
        if (idxArr > -1) {
          (window as any)._activeUtterances.splice(idxArr, 1);
        }
        console.warn("[TTS Context] Native speech error:", e.error);
        if (e.error !== "interrupted" && e.error !== "canceled") {
          if (isSpeakingRef.current && !isPausedRef.current) {
            startSpeakingFromIndex(
              indexToSpeak + 1,
              sentencesList,
              speedVal,
              voiceNameVal,
              engineVal,
              bookIdVal,
              bookTitleVal,
              chapIdxVal,
            );
          }
        }
      };

      window.speechSynthesis.speak(utterance);
      startTtsKeepAlive();
    }

    updateMediaSession(textToSpeak, bookTitleVal || "Book");
  };

  const startSpeaking = (
    bookId: string,
    bookTitle: string,
    sentences: string[],
    startIndex: number,
    chapterIndex: number,
    voiceName = state.selectedVoiceName,
    speed = state.speed,
    engine = state.engine,
  ) => {
    startSpeakingFromIndex(
      startIndex,
      sentences,
      speed,
      voiceName,
      engine,
      bookId,
      bookTitle,
      chapterIndex,
    );
  };

  const pauseTts = () => {
    if (typeof window !== "undefined") {
      if ("speechSynthesis" in window) window.speechSynthesis.pause();
      if (audioContextRef.current) audioContextRef.current.suspend();
      if (audioElementRef.current) audioElementRef.current.pause();
    }
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    silentAudioRef.current?.pause();
    stopTtsKeepAlive();
    isPausedRef.current = true;
    setState((prev) => ({ ...prev, isPaused: true }));
  };

  const resumeTts = () => {
    if (typeof window !== "undefined") {
      if (state.engine === "neural") {
        if (audioContextRef.current) audioContextRef.current.resume();
        if (audioElementRef.current)
          audioElementRef.current.play().catch(() => {});
        silentAudioRef.current?.play().catch(() => {});
      } else {
        if ("speechSynthesis" in window) window.speechSynthesis.resume();
        startTtsKeepAlive();
      }
    }
    isPausedRef.current = false;
    setState((prev) => ({ ...prev, isPaused: false }));
  };

  const stopTts = () => {
    if (typeof window !== "undefined") {
      if ("speechSynthesis" in window) {
        if ((window as any)._activeUtterances) {
          (window as any)._activeUtterances.forEach((u: any) => {
            u.onend = null;
            u.onerror = null;
          });
          (window as any)._activeUtterances = [];
        }
        window.speechSynthesis.cancel();
      }
      if (audioElementRef.current) {
        try {
          audioElementRef.current.onended = null;
          audioElementRef.current.onerror = null;
          audioElementRef.current.pause();
          audioElementRef.current.src = "";
        } catch (e) {}
      }
    }
    silentAudioRef.current?.pause();
    stopTtsKeepAlive();

    // Clear pending callbacks so they don't unexpectedly trigger after stop
    onAudioReadyCallbackRef.current = {};
    onAudioErrorCallbackRef.current = {};

    isSpeakingRef.current = false;
    isPausedRef.current = false;

    setState((prev) => ({
      ...prev,
      isSpeaking: false,
      isPaused: false,
      isBuffering: false,
      sentences: [],
      currentIndex: 0,
      bookId: null,
      bookTitle: null,
    }));
  };

  const setSpeed = (speed: number) => {
    setState((prev) => ({ ...prev, speed }));
    if (state.isSpeaking && state.bookId) {
      startSpeakingFromIndex(
        state.currentIndex,
        state.sentences,
        speed,
        state.selectedVoiceName,
        state.engine,
      );
    }
  };

  const setVoiceName = (voiceName: string) => {
    setState((prev) => ({ ...prev, selectedVoiceName: voiceName }));
    if (state.isSpeaking && state.bookId) {
      startSpeakingFromIndex(
        state.currentIndex,
        state.sentences,
        state.speed,
        voiceName,
        state.engine,
      );
    }
  };

  const setEngine = (engine: "native" | "neural") => {
    localStorage.setItem("bookrr-pref-engine", engine);
    setState((prev) => ({ ...prev, engine }));
    if (state.isSpeaking && state.bookId) {
      startSpeakingFromIndex(
        state.currentIndex,
        state.sentences,
        state.speed,
        state.selectedVoiceName,
        engine,
      );
    }
  };

  const nextSentence = () => {
    const nextIdx = state.currentIndex + 1;
    if (nextIdx < state.sentences.length) {
      startSpeakingFromIndex(
        nextIdx,
        state.sentences,
        state.speed,
        state.selectedVoiceName,
        state.engine,
      );
    }
  };

  const prevSentence = () => {
    const prevIdx = state.currentIndex - 1;
    if (prevIdx >= 0) {
      startSpeakingFromIndex(
        prevIdx,
        state.sentences,
        state.speed,
        state.selectedVoiceName,
        state.engine,
      );
    }
  };

  const setCurrentIndex = (index: number) => {
    if (index >= 0 && index < state.sentences.length) {
      startSpeakingFromIndex(
        index,
        state.sentences,
        state.speed,
        state.selectedVoiceName,
        state.engine,
      );
    }
  };

  // Clean-up on provider unmount
  useEffect(() => {
    return () => {
      stopTtsKeepAlive();
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const contextValue = React.useMemo(
    () => ({
      state,
      startSpeaking,
      stopTts,
      pauseTts,
      resumeTts,
      setSpeed,
      setVoiceName,
      setEngine,
      nextSentence,
      prevSentence,
      setCurrentIndex,
      registerCallback,
      initializeNeuralEngine,
      cancelNeuralEngine,
      resetNeuralEngine,
      setNeuralModel,
      setNeuralBackend,
      loadNeuralModelManually,
    }),
    [state],
  );

  return (
    <ReadAloudContext.Provider value={contextValue}>
      {children}
    </ReadAloudContext.Provider>
  );
};

export const useReadAloud = () => {
  const context = useContext(ReadAloudContext);
  if (!context)
    throw new Error("useReadAloud must be used within ReadAloudProvider");
  return context;
};
