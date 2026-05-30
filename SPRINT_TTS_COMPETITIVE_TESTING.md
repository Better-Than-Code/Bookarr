# Sprint: Client-Side TTS A/B Testing & Caching Infrastructure

## Objective
Evaluate, integrate, and A/B test various purely client-side Text-to-Speech (TTS) engines and models (such as Piper, Kokoro, VITS, SpeechT5) functioning entirely in-browser. To bypass network constraints, CORS issues, and third-party repository downtime (e.g., Hugging Face), we will utilize our existing caching method: the Node.js backend proxy will intelligently pre-cache/download required WASM, ONNX, and JSON model files and serve them locally to the browser client.

## Constraints & Requirements
*   **Purely Client-Side Execution:** No server-side audio generation. The server's role is strictly to act as a reliable static file/model host. Web Workers will execute the TTS using WASM/WebGPU.
*   **Performance:** Must be memory-efficient and capable of running on standard browser hardware without causing OOM crashes.
*   **Offline / Local Capability:** Enforce local caching of the binary blobs and models so the Web Worker uses deterministic, stable downloads. Files are fetched from our server.

## Phases

### Phase 1: Local Model Hosting & Server Proxy Setup
**Goal:** Expand the existing model caching endpoints on the server to act as a resilient host mapping for all required Web Worker engine assets.
*   **Task 1.1:** Standardize the backend `/api/models/*` route mapping. For every target engine, the server will ensure `.onnx`, `.wasm`, `.json`, and `.bin` config files are downloaded to the local server disk (`/applet/data/models` or similar) on first request or initialization.
*   **Task 1.2:** Configure static asset serving in `server.ts` to push these large assets to the client with heavy caching headers (`Cache-Control: max-age=31536000`), ensuring the browser natively caches them.
*   **Task 1.3:** Modify the client-side worker initialization parameters (`env.localModelPath`, `env.backends.onnx.wasm.wasmPaths`, etc.) to absolutely point to our local server URLs instead of allowing fallback to third-party endpoints.

### Phase 2: Engine Integration & Web Worker Unification
**Goal:** Implement abstraction in `tts-worker.js` that can spin up different requested engines dynamically while sharing audio buffer parsing logic.
*   **Task 2.1 - Transformers.js (Kokoro & SpeechT5):** Ensure `ONNXRuntime-Web` configuration properly uses our single-threaded / multi-threaded limits without SharedArrayBuffer faults. Ensure fallback gracefully from WebGPU to WASM. 
*   **Task 2.2 - Piper/VITS-Web:** Standardize the Piper WASM implementation through the same proxy pipeline. Expose voice IDs logically.
*   **Task 2.3 - Engine Factory:** Create a clean switch inside `initSynthesizer(modelId)` where the worker logic branches based on the requested model vendor without leaking memory (i.e. properly destroying references when switching engines).

### Phase 3: A/B Testing Infrastructure & UI
**Goal:** Allow users to easily toggle between engines in settings and measure reliability.
*   **Task 3.1:** Add "Engine Architecture" dropdown in `BookrrSettings.tsx` containing options like: `Kokoro (Transformers.js)`, `Piper (WASM)`, `SpeechT5 (Transformers.js)`, and native browser fallback.
*   **Task 3.2:** Wire up A/B testing analytics (console logging latency to initial audio buffer (`TTFB`), synthesis duration per character, WebGPU success rates).
*   **Task 3.3:** Add an "Engine Diagnostic" overlay for developers to view memory utilization, loaded model size, and fallback states when an engine crashes and auto-restarts on Native TTS.

## Definition of Done
1. No external CDN mapping (`huggingface.co`) is used by `tts-worker.js` directly—everything routes through the local server address cache.
2. Spark TTS and all server-side generation dependencies have been officially removed from the planned architectures.
3. Users can gracefully switch robust engine implementations in settings and test which provides the best latency/quality ratio on their unique hardware constraints.
