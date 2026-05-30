import { KokoroTTS, env } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';

// env exported by kokoro.web.js is restricted and doesn't have backends
// env.allowLocalModels = false;
// env.useBrowserCache = true;


let synthesizer = null;
let lastLoadedModelId = null;
let initPromise = null;
let taskQueue = [];
let isProcessingQueue = false;
let validReqIds = new Set();
let isDownloading = false;

// Custom callback to report download progress
const constructProgressCallback = () => {
    let globalTotalMB = 0;
    let globalLoadedMB = 0;
    let fileProgressMap = new Map();

    return (progressInfo) => {
        if (progressInfo.status === 'initiate' || progressInfo.status === 'download' || progressInfo.status === 'progress' || progressInfo.status === 'done') {
            const fileName = progressInfo.name || progressInfo.file || 'model';
            let current = fileProgressMap.get(fileName) || { loaded: 0, total: 82000000 };
            
            if (progressInfo.status === 'progress') {
                current.loaded = progressInfo.loaded || current.loaded;
                current.total = progressInfo.total || current.total;
            } else if (progressInfo.status === 'done') {
                current.loaded = current.total; // 100%
            }
            
            fileProgressMap.set(fileName, current);

            let newTotal = 0;
            let newLoaded = 0;
            for (const details of fileProgressMap.values()) {
                newTotal += details.total || 0;
                newLoaded += details.loaded || 0;
            }

            globalTotalMB = newTotal / (1024 * 1024);
            globalLoadedMB = newLoaded / (1024 * 1024);
            
            const fileProgressList = Array.from(fileProgressMap.entries()).map(([k, v]) => ({
                fileName: k,
                status: (v.loaded >= v.total && v.total > 0) ? "Validating" : "Loading...",
                loaded: v.loaded || 0,
                total: v.total || 0,
                percentage: v.total > 0 ? Math.round((v.loaded / v.total) * 100) : 0,
                loadedMB: (v.loaded / (1024 * 1024)).toFixed(2),
                totalMB: (v.total / (1024 * 1024)).toFixed(2)
            }));

            self.postMessage({
                type: 'progress',
                percent: newTotal > 0 ? (newLoaded / newTotal) * 100 : 0,
                totalSizeMB: globalTotalMB.toFixed(2),
                totalLoadedMB: globalLoadedMB.toFixed(2),
                fileProgressList
            });
        }
    };
};

async function initSynthesizer(forceBypass = false, customModelId = "Xenova/kokoro-v0_19") {
    const huggingfaceModelId = 'onnx-community/Kokoro-82M-v1.0-ONNX'; // Kokoro-82M is the standard fast small model
    
    if (synthesizer && lastLoadedModelId === huggingfaceModelId && !forceBypass) {
        self.postMessage({ type: 'ready', message: `Model ${lastLoadedModelId} already loaded.` });
        return true;
    }

    if (initPromise && !forceBypass) {
        return initPromise;
    }

    initPromise = (async () => {
        try {
            isDownloading = true;
            self.postMessage({ type: 'init_start', message: `Initializing pipeline for ${huggingfaceModelId}...` });
            
            // Force env configuration to load entirely offline from our local static models folder
            if (env) {
                const basePath = self.location.href.substring(0, self.location.href.lastIndexOf('/') + 1);
                env.allowLocalModels = true;
                env.allowRemoteModels = false;
                env.localModelPath = basePath + 'models/';
                env.remoteHost = basePath + 'models/';
                env.remotePathTemplate = '{model}/';
            }
            
            const isWebGPU = typeof navigator !== 'undefined' && navigator.gpu;
            
            if (isWebGPU) {
                console.log(`[Kokoro Worker] Initializing WebGPU (fp16) for hardware acceleration...`);
                try {
                    synthesizer = await KokoroTTS.from_pretrained(huggingfaceModelId, {
                        dtype: 'fp16', 
                        device: 'webgpu',
                        progress_callback: constructProgressCallback()
                    });
                } catch (err) {
                    console.warn(`[Kokoro Worker] WebGPU initialization failed: ${err.message}. Falling back to WASM.`);
                }
            }

            if (!synthesizer) {
                console.log(`[Kokoro Worker] Initializing WASM (q8)...`);
                synthesizer = await KokoroTTS.from_pretrained(huggingfaceModelId, {
                    dtype: 'q8', 
                    device: 'wasm',
                    progress_callback: constructProgressCallback()
                });
            }

            isDownloading = false;
            lastLoadedModelId = huggingfaceModelId;
            self.postMessage({ type: 'ready', message: 'Kokoro TTS pipeline loaded successfully.' });
            return true;
        } catch (err) {
            isDownloading = false;
            initPromise = null;
            self.postMessage({ type: 'error', message: `Initialization failed: ${err.message}` });
            throw err;
        }
    })();

    return initPromise;
}

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (taskQueue.length > 0) {
        const { text, reqId, voice } = taskQueue.shift();
        if (reqId && validReqIds.size > 0 && !validReqIds.has(reqId)) {
            console.log(`[Kokoro Worker] Skipping dropped reqId: ${reqId}`);
            continue;
        }

        try {
            await initSynthesizer();
            
            const requestStart = Date.now();
            
            self.postMessage({ type: 'synth_start', reqId, text });

            console.log(`[Kokoro Worker] Generating for text: "${text}" with voice: ${voice}`);
            
            let kokoroVoice = voice;
            if (!voice || voice === 'default' || voice === '') {
                kokoroVoice = 'af_heart';
            }

            // Generate TTS audio
            const output = await synthesizer.generate(text, {
                voice: kokoroVoice
            });

            console.log(`[Kokoro Worker] Generate output complete. Keys:`, Object.keys(output));

            if (!output || !output.audio) {
                console.error("[Kokoro Worker] Invalid output format: waveform audio is missing.", output);
                throw new Error("Invalid output format: waveform audio is missing.");
            }

            let rawAudio = output.audio;
            // The KokoroTTS.generate returns an object with audio Float32Array and sampling_rate
            const rawSamplingRate = output.sampling_rate || 24000;
            
            console.log(`[Kokoro Worker] Extracted raw audio length:`, rawAudio?.length, `sampleRate:`, rawSamplingRate);

            // Ensure we have a pure, transferable Float32Array not bound to WASM memory
            let safeAudio = new Float32Array(rawAudio);
            
            console.log(`[Kokoro Worker] Configured safeAudio with length:`, safeAudio.length);

            if (reqId && validReqIds.size > 0 && !validReqIds.has(reqId)) {
                console.log(`[Kokoro Worker] reqId cancelled, skipping send: ${reqId}`);
                continue;
            }

            const durationMs = Date.now() - requestStart;
            console.log(`[Kokoro Worker] Synthesized successfully in ${durationMs}ms`);

            self.postMessage({
                type: "audio",
                audio: safeAudio,
                samplingRate: rawSamplingRate,
                reqId,
                durationMs,
                isPiperTransfer: false
            }, [safeAudio.buffer]);

        } catch (err) {
            console.error("Kokoro Worker Synthesis Error:", err);
            self.postMessage({ type: "error", message: `Synthesis Failed: ${err.message}`, reqId });
        }
    }

    isProcessingQueue = false;
}

self.onmessage = async (e) => {
    const { type, text, force, modelId, reqId, activeReqIds } = e.data;

    if (type === "set_active_reqs" && Array.isArray(activeReqIds)) {
        validReqIds = new Set(activeReqIds);
        taskQueue = taskQueue.filter(task => !task.reqId || validReqIds.has(task.reqId));
        return;
    }

    if (type === "init") {
        try {
            await initSynthesizer(force, modelId);
        } catch (err) {}
    } else if (type === "speak") {
        taskQueue.push(e.data);
        processQueue();
    }
};
