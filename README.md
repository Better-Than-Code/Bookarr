# 📚 Bookrr

[![React](https://img.shields.io/badge/React-19.0.1-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com)
[![WebTorrent](https://img.shields.io/badge/WebTorrent-3.0-0F172A?logo=webtorrent&logoColor=white)](https://webtorrent.io)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4.1-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Gemini](https://img.shields.io/badge/Gemini_API-Supported-8E75C2?logo=google&logoColor=white)](https://ai.google.dev)

**Bookrr** is a fully featured, self-hosted book and audiobook media server, tracker searcher, and reader suite. Seamlessly combining modern tracker search indexing (Torznab + native scrapers), an integrated real-time WebTorrent engine, a fully loaded browser-based EPUB reader, a rich audiobook media player, and hybrid client/server data persistence, Bookrr transforms raw magnets and file uploads into an elegant, organized digital bookshelf.

---

## ✨ Features

### 📡 Indexing & Scraping Engine
*   **Fuzzy Tracker Aggregators:** Real-time search query aggregation spanning Torznab indices, native scrapers, and Direct Download (DDL) fallbacks (e.g., LibGen).
*   **Response Streamer:** Powered by SSE (`EventSource`) streaming `/api/search/stream`, pulling torrent seeds, health, and links concurrently and presenting them instantly in the UI.
*   **Pre-download Inspection:** Inspect the files inside a torrent magnet link `/api/torrents/inspect` before starting a download. Filter and identify file types (`ebook`, `audiobook`, or `other`) from raw bittorrent metadata.

### ⚡ Integrated Torrent Client (WebTorrent & DDL)
*   **In-Memory/On-Disk Client Hooks:** Full-featured Node-WebTorrent instance configured with high active connection bounds (`maxConns: 1000`), DHT, local peer discovery (LSD), tracking metrics, and custom tracker injections (`tr` magnets injection).
*   **Zero-Speed Stalling Rescue:** Detects inactive or peerless downloads automatically, forcing peer updates and re-announces down to public servers if speeds bottom out.
*   **Direct Ingestion & Local Uploads:** Supports drag-and-drop manual files upload (`.epub` or mp3/m4b audios) directly to the server with server-side Multer staging.

### 🧠 OpenLibrary & Gemini Auto-Repair
*   **Seamless Title Cleansing:** Regex-driven removal of scene tracker tags (`[Audiobook]`, `ePub`, `M4B`, `Unabridged`, narrator credits) to form precise search parameters.
*   **OpenLibrary Cover Matching:** Asynchronously fetches media characteristics—such as subject genres, page dimensions, high-resolution cover arts, and summaries—dynamically matching on title/author indices.
*   **Gemini-Powered Metadata Recovery:** Auto-corrects processing delays and resolves initial placeholder placeholders. If a resource or crawler gets delayed, the server's background cron task `/api/scan-library` and recovery loops query semantic structures back in order.

### 📖 Immersive Media Players (Reader & Player)
*   **EPUB Ebook Reader:** Clean reading canvas leveraging `react-reader` and customizable layout settings. Full-state persistence for table of contents tracking, font face configurations, font scaling slider, and active-page memory.
*   **Audiobook Player Overlay:** Floating immersive player overlay with playback controls, timeline seeking, customizable playback speeds (e.g. `0.5x` up to `3.0x`), volume/mute toggles, continuous progression tracker, and chapter breakdowns.

### 📁 Hybrid Storage Architecture (Desktop & Server Sync)
*   **Native File System Access API:** Utilize modern browser directory pickers (`window.showDirectoryPicker()`) to let Bookrr parse, organize, and directly sync directory buffers into your physical desktop storage folders offline.
*   **Automated Directory Sorter:** Scans watch repositories and moves files into organized folder schemes structured natively (`/Author/BookTitle/BookTitle - Author.epub`) with strict file-copy fallback mechanisms on server-destined endpoints.

---

## 🏗️ Architecture & Component Structure

```
├── data/                    # SQLite-equivalent JSON flat DB (db.json) and config logs
├── src/
│   ├── App.tsx              # Application shell containing route states, sync, & trackers
│   ├── types.ts             # Domain schema models (Book, TorrentTask, IndexerSettings, etc.)
│   ├── index.css            # Global Tailwind CSS configurations and visual themes
│   ├── components/          # Polished UI Layout Components
│   │   ├── LibraryDashboard.tsx     # Your personal grid collection with sorting overlays
│   │   ├── IndexerSearch.tsx        # EventSource SSE stream-search tracker component
│   │   ├── WebtorDownloads.tsx     # Active client queues, speed lines, & file indicators
│   │   ├── AudiobookPlayer.tsx      # Hovering playback controls with custom seek timelines
│   │   ├── EbookReader.tsx          # Configurable EPUB reader canvas
│   │   ├── BookrrSettings.tsx       # Tracker indexes, logs, & Local Folder mounting tools
│   │   ├── StorageOnboarding.tsx    # Responsive initial setup guide
│   │   ├── Sidebar.tsx              # Rich vertical menu
│   │   └── BottomNav.tsx            # Optimized mobile tab controller
│   └── services/            # Front-end API connectors and browser FS mounts
│       ├── LocalFileService.ts      # Browser FileSystem Handle indexDB wrapper
│       ├── LocalOrganizerService.ts # Local file structural sort, write checks, & cleanups
│       ├── MetadataService.ts       # OpenLibrary and generic scrapers handler
│       ├── TrackerService.ts        # Tracker endpoints checks
│       └── ScraperService.ts        # High-performance search scrapers
├── server.ts                # Express backend containing WebTorrent client and Gemini integrations
└── tsconfig.json            # Strict TypeScript configuration
```

---

## ⚙️ Environment Variables

Copy the `.env.example` configurations to generate a `.env` file at the root:

```env
# Server secret overrides
PORT=3000
NODE_ENV=production

# Gemini API Integration (Optional but highly recommended for auto-recovery)
GEMINI_API_KEY=your_gemini_api_key_here
```

*Note: Sensitive variables must remain in the server context and are never exposed to client-facing scripts.*

---

## 📦 Installation & Setup

Ensure you have [Node.js](https://nodejs.org/) (v18+) and npm installed on your machine.

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
The server will initialize on port `3000` with hot module building handled internally by the Express-Vite middleware stack.

### 3. Production Build & Execution
Compile both frontend and backend bundles and launch them inside a production-engineered container or server environment:
```bash
npm run build
npm start
```
The build process bundles backend scripts using `esbuild` down to a consolidated, startup-optimized `dist/server.cjs` file, cleanly resolving module references to prevent filesystem conflicts.

---

## 🤝 Project Intent

Bookrr represents a modern, lightweight approach to books server architectures. Rejecting complicated databases or heavy setups, it combines simple flat file synchronization algorithms, clean web standards, dynamic streaming UI buffers, and semantic AI helpers to provide an elite, beautiful reading suite anywhere in the world. Enjoy reading! 🚀
