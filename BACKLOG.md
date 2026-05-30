# Backlog

## Issue: Book mapping lost after clearing browser cache
**Status**: Fixed
**Description**
Book is no longer pointing to the correct local file after clearing browser cache and giving permissions again. Attempted to select refresh and nothing happens.

**Expected**
Upon app load after giving folder permissions the books should then see their local disk files, if they had been saved, if not prior to clearing they would bend to be downloaded again. they should be mapped to the local disk.

**Actual**
Clear browser cache, Reloaded page, library entries are there but the missing file integrity is missing and not point to the local file although the settings folders for the ebooks are set and the book is present
Book is now mapped to: System path `/app/applet/data/downloads/`

**Steps to reproduce**
1. Clear browser cache
2. Reload page 
3. Open ebook card
4. File integrity : missing

## Issue: Device filepath defaulting to downloads folder
**Status**: Fixed
**Description**
Offline books do not appear they are being saved to and read from the user selected folders for ebooks and audiobooks. 
**Actual** 
Ebook files appear in `/app/applet/data/downloads/author/title/title_author.ext` instead of utilizing the device-specific local disk handle.
**Fix Implemented**
Built `autoRelinkLibrary` inside the Local Organizer Service. When the Storage Onboarding prompt returns successfully with valid folder permissions, it now automatically traverses mapped directories without prompting, identifies known books gracefully, and recreates missing IndexedDB entries with exact local handles restoring "Device Filepath" integrity out-of-the-box. We also improved `saveFileHandle` to write the internal device paths into the DB rather than falling back to placeholders.

## Issue: White Page Ereader
**Status**: Fixed
**Fix Implemented**
Fixed a critical `ReferenceError` crashing the `EbookReader` component. Variables related to file parsing (`displayUrl`, `isEpub`) were being referenced inside a `useEffect` dependency array before they were initialized due to lexical declaration ordering (`const` hoisting without initialization). We also added an `ErrorBoundary` wrapping the reader so future isolated component failures do not result in a silent white screen unmount.


