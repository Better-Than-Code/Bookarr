// Allow vits-web to spawn multi-threaded ONNX workers for faster TTS generation
// Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 1, configurable: true });

let piperModule;
async function loadPiper() {
    if (!piperModule) {
        piperModule = await import("./vits-web.js");
    }
    return piperModule;
}

let synthesizer = null;
let lastLoadedModelId = null;
let initPromise = null;

async function initSynthesizer(
  forceBypass = false,
  customModelId = "piper/en_US-libritts-high",
  customBackend = "auto"
) {
  if (synthesizer && !forceBypass && customModelId === lastLoadedModelId) return synthesizer;

  if (synthesizer && customModelId !== lastLoadedModelId) {
      console.log(`[Worker] Model switch detected. Disposing old engine...`);
      synthesizer = null;
  }

  if (initPromise && !forceBypass) {
      if (customModelId === lastLoadedModelId) return initPromise;
  }
  
  initPromise = (async () => {
    try {
      globalThis.piperBackend = customBackend;
      // Normalize model ID - we only support Piper now
      let modelId = customModelId;
      if (!modelId.startsWith("piper/")) {
          console.warn(`[Worker] Unsupported model ${modelId} passed. Defaulting to piper/en_US-libritts-high.`);
          modelId = "piper/en_US-libritts-high";
      }

      const p = await loadPiper();
      const parts = modelId.split("/");
      const voiceId = parts[1];
      const speakerId = parts[2] ? parseInt(parts[2]) : undefined;
      
      console.log(`[Worker] Initializing Piper engine for voice: ${voiceId} speaker: ${speakerId}`);
      
      // Announce hardware backend for UI
      self.postMessage({
         type: "init_hardware",
         hardwareMessage: "Piper Engine - WebAssembly CPU Optimized"
      });
      
      self.postMessage({ type: "status", message: `Verifying cached files for ${voiceId}...` });
      
      try {
          const stored = await p.stored();
          console.log(`[Worker] Currently stored models in browser cache:`, stored);
          if (!stored.includes(voiceId)) {
              console.log(`[Worker] Model ${voiceId} not found in cache. Starting download...`);
              self.postMessage({ type: "status", message: `Downloading ${voiceId}...` });
              await p.download(voiceId, (prog) => {
                 let percent = 0;
                 let isIndeterminate = false;
                 if (prog.total && prog.total > 0) {
                     percent = (prog.loaded / prog.total) * 100;
                 } else {
                     isIndeterminate = true;
                }
                 
                 const loadedMB = (prog.loaded / (1024 * 1024)).toFixed(1);
                 const totalMB = (prog.total && prog.total > 0) ? (prog.total / (1024 * 1024)).toFixed(1) : "?";
                 
                 self.postMessage({
                     type: "progress",
                     percent: percent,
                     isIndeterminate: isIndeterminate,
                     speed: "",
                     fileProgressList: [{
                         fileName: `${voiceId}.onnx`,
                         status: (percent >= 100 && !isIndeterminate) ? "Validating Target Cache" : "Loading Streams",
                         loaded: prog.loaded,
                         total: prog.total || 0,
                         percentage: isIndeterminate ? 0 : Math.round(percent)
                     }],
                     totalLoadedMB: loadedMB,
                     totalSizeMB: totalMB
                 });
              });
              self.postMessage({ type: "status", message: `Verifying written caches...` });
              const finalStored = await p.stored();
              if (!finalStored.includes(voiceId)) throw new Error("Failed cache verification: Model not accessible after download.");
          } else {
              self.postMessage({ type: "status", message: `Cache Hit: Verified ${voiceId} locally.` });
              console.log(`[Worker] Cache hit logic passed for ${voiceId}`);
          }
      } catch (tryErr) {
          console.error("Piper Download verify error:", tryErr);
          const availVoices = await p.voices();
          console.log("Piper Available voices keys:", Object.keys(availVoices));
          throw new Error(`Failed to download Piper voice ${voiceId}: ${tryErr.message}`);
      }

      // Set interactive synthesizer
      synthesizer = async (text) => {
          try {
              console.log(`[Worker Piper] Starting prediction for text: "${text.substring(0, 20)}..."`);
              self.postMessage({ type: "status", message: "Synthesizing (Piper WASM)..." });
              const wavBlob = await p.predict({ text: text, voiceId: voiceId, speakerId: speakerId });
              console.log(`[Worker Piper] Generated Blob size: ${wavBlob.size} bytes`);
              
              if (wavBlob.size <= 44) {
                   throw new Error("Piper generated empty audio buffer.");
              }
              const buffer = await wavBlob.arrayBuffer();
              return { audio: buffer, sampling_rate: 22050, isPiperTransfer: true };
          } catch(e) {
              console.error("[Worker Piper] TTS Error:", e);
              if (e.message && (e.message.includes('protobuf parsing failed') || e.message.includes('invalid ONNX'))) {
                  console.log("[Worker Piper] Detected corrupt model, clearing cache for voiceId:", voiceId);
                  try { await p.remove(voiceId); } catch(ex){}
                  try {
                     self.postMessage({ type: "error", message: "Corrupted AI model file detected and cleared. Please try speaking again to redownload." });
                  } catch(ex){}
                  throw new Error("Corrupt model cleared. Restart required.");
              }
              throw e;
          }
      };
      
      synthesizer.isPiper = true;
      lastLoadedModelId = modelId;
      self.postMessage({ type: "ready" });
      return synthesizer;
    } catch (err) {
      console.error("[Worker] Piper init failed:", err);
      initPromise = null;
      self.postMessage({ type: "error", message: `Initialization failed: ${err.message}` });
      throw err;
    }
  })(); 
  
  return initPromise;
}

let validReqIds = new Set();
let isProcessingQueue = false;
let taskQueue = [];

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    const { text, force, modelId, reqId } = task;

    if (reqId && validReqIds.size > 0 && !validReqIds.has(reqId)) {
      console.log(`[Worker] Skipping cancelled reqId: ${reqId}`);
      continue;
    }

    try {
      if (!synthesizer || (modelId && modelId !== lastLoadedModelId)) {
        await initSynthesizer(force, modelId);
      }

      self.postMessage({ type: "status", message: "Synthesizing (Piper WASM)..." });

      const requestStart = Date.now();
      const output = await synthesizer(text);

      if (!output) {
        throw new Error("No output generated by neural synthesizer.");
      }

      let rawAudio = output.audio || output.data || output.buffer || output.waveform;
      let rawSamplingRate = output.sampling_rate || output.samplingRate || 22050;

      if (!rawAudio) {
         throw new Error("Invalid output format: waveform audio is missing.");
      }

      const isBlob = rawAudio instanceof Blob || (rawAudio && rawAudio.size !== undefined && rawAudio.type !== undefined);
      const isPiperTransfer = !!output.isPiperTransfer;

      if (!(rawAudio instanceof Float32Array) && !isBlob && !isPiperTransfer) {
         if (rawAudio.buffer instanceof ArrayBuffer) {
            rawAudio = new Float32Array(rawAudio.buffer);
         } else {
            rawAudio = Float32Array.from(rawAudio);
         }
      }

      // Only send if still valid
      if (reqId && validReqIds.size > 0 && !validReqIds.has(reqId)) {
        console.log(
          `[Worker] Dropping completed but cancelled reqId: ${reqId}`
        );
        continue;
      }

      const isBlobTransfer = isBlob || isPiperTransfer;
      const transferable = isBlobTransfer ? [] : [rawAudio.buffer].filter(Boolean);

      const durationMs = Date.now() - requestStart;
      console.log(`[Worker] Synthesized in ${durationMs}ms`);

      self.postMessage(
        {
          type: "audio",
          audio: rawAudio,
          samplingRate: rawSamplingRate,
          reqId,
          durationMs,
          isPiperTransfer
        },
        transferable
      );
    } catch (err) {
      console.error("Worker Synthesis Error:", err);
      self.postMessage({
        type: "error",
        message: `Synthesis Failed: ${err.message}`,
        reqId,
      });
    }
  }

  isProcessingQueue = false;
}

self.onmessage = async (e) => {
  const { type, text, force, modelId, reqId, activeReqIds } = e.data;

  if (type === "set_active_reqs" && Array.isArray(activeReqIds)) {
    validReqIds = new Set(activeReqIds);
    // Cleanup queue by removing cancelled tasks
    taskQueue = taskQueue.filter(
      (task) => !task.reqId || validReqIds.has(task.reqId)
    );
    return;
  }

  if (type === "init") {
    try {
      await initSynthesizer(force, modelId);
    } catch (err) {
      // Error already posted in initSynthesizer
    }
  } else if (type === "speak") {
    taskQueue.push(e.data);
    processQueue();
  }
};
