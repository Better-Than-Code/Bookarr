# SPRINT: Client-Side Staging & Offline-First Organization

## 📋 Overview & Strategic Alignment
This sprint focuses on migrating the **Staging / Download Area** from a server-side storage dependency to a pure, client-side browser-mediated storage workflow. 

By utilizing the **File System Access API**, Bookrr can download magnet links / torrents directly in the browser (via client-side WebTorrent) or receive files locally, stage them in the browser-linked `download` directory, and organize them into the user's local `ebooks` or `audiobooks` folders. This eliminates server storage requirements, keeps the app extremely lightweight, secures user privacy, and ensures a seamless offline-first experience.

---

## 👥 Virtual Team Consensus

*   **The PM**: *"Transitioning staging completely to the client side is a major win for product simplicity. Hosting costs drop to near zero, scaling limits disappear, and the user remains in complete control of where their books are stored on their personal drive. It removes a major point of confusion (Server vs. Device staging)."*
*   **The Lead Developer**: *"Technically, this is elegant. We already have the browser Directory Handles in `BookrrSettings.tsx`. We can wire up client-side operations to write directly into the `download` sub-folder handle. This lets us read files from staging, parse metadata client-side, and move them directly to the `ebooks` or `audiobooks` directory handles using standard File System Access API operations."*
*   **The QA/Focus Group Lead**: *"This delivers a stellar personal-cloud UX. The 'Novice User' won't have to wonder why some books are 'on the server' and others are 'local'—it's all stored right in their selected local directory. We must ensure we handle permissions beautifully and give excellent visual feedback during local file transfers."*

---

## 🎯 Definition of Done (DoD)
1.  **Zero Server Storage Dependency**: The backend `server.ts` does not require thick, persistent disk space for book staging. All downloads or files go straight to browser-managed storage.
2.  **Integrated Browser Staging UI**: The staging area is rendered on the client from the linked local `download/` (or `staging/`) directory.
3.  **Local File Transfer & Metadata Discovery**: Moving files from staging to target libraries happens entirely client-side, triggering the standard parser and writer APIs inside the browser.
4.  **No Code Integrity Breaking**: Linter is 100% green, app builds successfully, and existing core features (like search, indexers, and ereader/player) work flawlessly.

---

## 🗺️ Roadmap & Sprint Tasks

### Phase 1: Browser-Side Staging Directory Listing & Read
*   [x] **Task 1.1**: Enhance `LocalOrganizerService` to support reading, scanning, and monitoring files directly from the linked `download/` directory handle.
*   [x] **Task 1.2**: Update the files state in `LibraryDashboard` or `BookrrSettings` to read from the local directory handle instead of fetching from `/api/scan-library` for staging.

### Phase 2: Client-Side WebTorrent & Torrent Staging Integration
*   [x] **Task 2.1**: Configure client-side `WebTorrent` client (or equivalent stream-to-browser downloader) to write incoming file chunks directly to the `download/` folder handle.
*   [x] **Task 2.2**: Display direct local transfer progress, download speeds, and file write states directly on the Staging card.

### Phase 3: Pure Browser-Side Book Organization (Move & Parse)
*   [x] **Task 3.1**: Build client-side metadata parsing (using existing JS parsers) to extract epub cover/metadata and mp3 ID3 tags directly in the browser when organizing from staging.
*   [x] **Task 3.2**: Implement a client-side "Move" function that reads a file from the `download/` folder handle, writes it to the `ebooks/` or `audiobooks/` folder handle, and deletes the origin file from `download/` once verified.
*   [x] **Task 3.3**: Automatically link and record the newly organized local file into the client's IndexedDB.

### Phase 4: Focus Group Review & QA Verification
*   [x] **Task 4.1**: Test with a large audiobook file and a standard epub to ensure browser memory stays stable.
*   [x] **Task 4.2**: Verify that reload/auth-relink routines successfully re-scan both the staging and the organized libraries out-of-the-box.
