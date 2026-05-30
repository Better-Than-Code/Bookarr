/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExtractedMetadata {
  title?: string;
  author?: string;
  description?: string;
  coverUrl?: string; // Base64 dataURL or public image link
  pages?: number;
  duration?: number;
}

/**
 * Sequential ZIP Local Header scanner for EPUBs utilizing the native DecompressionStream API.
 */
export async function parseEpubZip(
  arrayBuffer: ArrayBuffer,
): Promise<{ [path: string]: Uint8Array }> {
  const files: { [path: string]: Uint8Array } = {};
  const view = new DataView(arrayBuffer);
  let offset = 0;

  while (offset < arrayBuffer.byteLength - 30) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) {
      // "PK\x03\x04"
      const compression = view.getUint16(offset + 8, true);
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      // Extract filename safety limits
      if (offset + 30 + nameLen > arrayBuffer.byteLength) {
        break;
      }
      const nameBuffer = new Uint8Array(arrayBuffer, offset + 30, nameLen);
      const filename = new TextDecoder("utf-8").decode(nameBuffer);

      const dataOffset = offset + 30 + nameLen + extraLen;
      if (dataOffset + compSize > arrayBuffer.byteLength) {
        break;
      }
      const dataBuffer = new Uint8Array(arrayBuffer, dataOffset, compSize);

      if (compSize > 0) {
        if (compression === 0) {
          // Uncompressed
          files[filename] = dataBuffer;
        } else if (compression === 8) {
          // DEFLATE
          try {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            writer.write(dataBuffer);
            writer.close();
            const decompressed = await new Response(ds.readable).arrayBuffer();
            files[filename] = new Uint8Array(decompressed);
          } catch (e) {
            // Deflate silent failure fallback
          }
        }
      }

      offset = dataOffset + compSize;
    } else {
      // Not local file header, might hit Central Directory. Done scanning.
      break;
    }
  }
  return files;
}

/**
 * Parses Metadata from EPUB files completely client-side.
 */
export async function parseEpubMetadata(
  arrayBuffer: ArrayBuffer,
): Promise<ExtractedMetadata | null> {
  try {
    const files = await parseEpubZip(arrayBuffer);

    // 1. Locate container.xml
    const containerKey = Object.keys(files).find((k) =>
      k.endsWith("container.xml"),
    );
    if (!containerKey) return null;

    const containerXml = new TextDecoder("utf-8").decode(files[containerKey]);
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(
      containerXml,
      "application/xml",
    );

    const rootfile = containerDoc.querySelector("rootfile");
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) return null;

    // 2. Fetch and parse OPF Manifest
    const opfData = files[opfPath];
    if (!opfData) return null;

    const opfXml = new TextDecoder("utf-8").decode(opfData);
    const opfDoc = parser.parseFromString(opfXml, "application/xml");

    const meta: ExtractedMetadata = {};

    // Basic fields
    const titleEl = opfDoc.querySelector("title, dc\\:title");
    const creatorEl = opfDoc.querySelector("creator, dc\\:creator");
    const descEl = opfDoc.querySelector("description, dc\\:description");

    if (titleEl) meta.title = titleEl.textContent?.trim();
    if (creatorEl) meta.author = creatorEl.textContent?.trim();
    if (descEl) meta.description = descEl.textContent?.trim();

    // 3. Extract Cover Art from local directory paths (if specified)
    try {
      // Find cover item id
      let coverId = "";
      const coverMeta = opfDoc.querySelector('meta[name="cover"]');
      if (coverMeta) {
        coverId = coverMeta.getAttribute("content") || "";
      }

      // If metadata format differs, fallback to item containing "cover" media type/id
      const items = Array.from(opfDoc.querySelectorAll("item"));
      let coverItem = items.find((item) => item.getAttribute("id") === coverId);
      if (!coverItem) {
        coverItem = items.find((item) => {
          const id = (item.getAttribute("id") || "").toLowerCase();
          const href = (item.getAttribute("href") || "").toLowerCase();
          return (
            id.includes("cover") &&
            (href.endsWith(".jpg") ||
              href.endsWith(".jpeg") ||
              href.endsWith(".png") ||
              href.endsWith(".webp"))
          );
        });
      }

      if (coverItem) {
        const coverHref = coverItem.getAttribute("href");
        if (coverHref) {
          // Resolve cover href relative to OPF path
          const opfDir = opfPath.includes("/")
            ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
            : "";
          const resolvedPath = pathNormalize(opfDir + coverHref);

          // Search zip file entries by resolved cover path (matching relative segments)
          const zipCoverKey = Object.keys(files).find(
            (k) =>
              k.toLowerCase().endsWith(resolvedPath.toLowerCase()) ||
              k.toLowerCase() === resolvedPath.toLowerCase(),
          );

          if (zipCoverKey && files[zipCoverKey]) {
            const coverBytes = files[zipCoverKey];
            const ext = zipCoverKey.split(".").pop()?.toLowerCase();
            const mime =
              ext === "png"
                ? "image/png"
                : ext === "webp"
                  ? "image/webp"
                  : "image/jpeg";

            // Base64 encode Cover Data
            let binary = "";
            const len = coverBytes.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(coverBytes[i]);
            }
            meta.coverUrl = `data:${mime};base64,${btoa(binary)}`;
          }
        }
      }
    } catch (coverErr) {
      console.warn("Epub cover extraction parsing failed", coverErr);
    }

    return meta;
  } catch (err) {
    console.error("Epub parser main failure:", err);
    return null;
  }
}

function pathNormalize(rawPath: string): string {
  const parts = rawPath.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "." || !part) continue;
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/");
}

/**
 * Parse ID3v2 Tags from MP3/ID3 files client-side.
 */
export function parseId3Metadata(
  arrayBuffer: ArrayBuffer,
): ExtractedMetadata | null {
  try {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);

    // Verify ID3 Signature
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
      // "ID3"
      return null;
    }

    const version = bytes[3]; // e.g., 3 for ID3v2.3, 4 for ID3v2.4
    if (version < 2 || version > 4) return null;

    // Convert tag size (synchsafe: 4 bytes of 7 bits each)
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);

    const meta: ExtractedMetadata = {};
    let offset = 10; // Start of frames

    // Safe bounds
    const endOffset = Math.min(tagSize + 10, arrayBuffer.byteLength);

    while (offset < endOffset - 10) {
      let frameId = "";
      let frameSize = 0;

      if (version === 3 || version === 4) {
        // 4-char Frame ID, 4-byte size
        frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3],
        );

        if (version === 4) {
          // Tag sizes are synchsafe in v2.4
          frameSize =
            ((bytes[offset + 4] & 0x7f) << 21) |
            ((bytes[offset + 5] & 0x7f) << 14) |
            ((bytes[offset + 6] & 0x7f) << 7) |
            (bytes[offset + 7] & 0x7f);
        } else {
          frameSize =
            (bytes[offset + 4] << 24) |
            (bytes[offset + 5] << 16) |
            (bytes[offset + 6] << 8) |
            bytes[offset + 7];
        }

        offset += 10; // Skip frame header
      } else if (version === 2) {
        // 3-char Frame ID, 3-byte size
        frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
        );
        frameSize =
          (bytes[offset + 3] << 16) |
          (bytes[offset + 4] << 8) |
          bytes[offset + 5];
        offset += 6; // Skip header
      }

      if (
        !frameId ||
        frameId.charCodeAt(0) === 0 ||
        frameSize <= 0 ||
        offset + frameSize > endOffset
      ) {
        break;
      }

      const frameData = bytes.subarray(offset, offset + frameSize);

      // Map Frame ID to friendly tags
      if (frameId === "TIT2" || frameId === "TT2") {
        meta.title = decodeTextFrame(frameData);
      } else if (frameId === "TPE1" || frameId === "TP1") {
        meta.author = decodeTextFrame(frameData);
      } else if (frameId === "COMM" || frameId === "COM") {
        meta.description = decodeTextCommentFrame(frameData);
      } else if (frameId === "TLEN" || frameId === "TDRC") {
        const value = decodeTextFrame(frameData);
        if (frameId === "TLEN") {
          const ms = parseInt(value, 10);
          if (!isNaN(ms)) meta.duration = Math.round(ms / 1000); // Record duration seconds
        }
      } else if (frameId === "APIC" || frameId === "PIC") {
        try {
          const cover = decodeApicFrame(frameData, version === 2);
          if (cover) {
            meta.coverUrl = `data:${cover.mimeType};base64,${cover.base64}`;
          }
        } catch (e) {
          // APIC parse error soft fall
        }
      }

      offset += frameSize;
    }

    return meta;
  } catch (err) {
    console.error("ID3 parser failure:", err);
    return null;
  }
}

function decodeTextFrame(data: Uint8Array): string {
  if (data.length === 0) return "";
  const encoding = data[0];
  const payload = data.subarray(1);

  if (encoding === 0) {
    // ISO-8859-1
    return new TextDecoder("windows-1252").decode(payload).trim();
  } else if (encoding === 1) {
    // UTF-16
    return new TextDecoder("utf-16").decode(payload).trim();
  } else if (encoding === 2) {
    // UTF-16BE
    return new TextDecoder("utf-16be").decode(payload).trim();
  } else if (encoding === 3) {
    // UTF-8
    return new TextDecoder("utf-8").decode(payload).trim();
  }
  return new TextDecoder("utf-8").decode(payload).trim();
}

function decodeTextCommentFrame(data: Uint8Array): string {
  if (data.length < 5) return "";
  const encoding = data[0];
  // Skip ISO language identifier (3 bytes)
  let offset = 4;

  // Skip short content description string until null terminator
  if (encoding === 1 || encoding === 2) {
    while (
      offset < data.length - 1 &&
      !(data[offset] === 0 && data[offset + 1] === 0)
    ) {
      offset += 2;
    }
    offset += 2;
  } else {
    while (offset < data.length && data[offset] !== 0) {
      offset++;
    }
    offset++;
  }

  if (offset >= data.length) return "";
  return decodeTextFrame(data.subarray(offset - 1));
}

function decodeApicFrame(
  data: Uint8Array,
  isV2 = false,
): { mimeType: string; base64: string } | null {
  if (data.length < 5) return null;
  const encoding = data[0];
  let offset = 1;

  let mimeType = "";
  if (isV2) {
    // ID3v2.2 uses a 3-character image format instead of MIME type (e.g., "JPG", "PNG")
    const format = String.fromCharCode(
      data[offset],
      data[offset + 1],
      data[offset + 2],
    );
    mimeType = format.toLowerCase() === "png" ? "image/png" : "image/jpeg";
    offset += 3;
  } else {
    // Find null-terminated MIME type string
    while (offset < data.length && data[offset] !== 0) {
      mimeType += String.fromCharCode(data[offset]);
      offset++;
    }
    offset++; // Skip null
  }

  if (offset >= data.length) return null;
  const picType = data[offset];
  offset++;

  // Skip short description name
  if (encoding === 1 || encoding === 2) {
    while (
      offset < data.length - 1 &&
      !(data[offset] === 0 && data[offset + 1] === 0)
    ) {
      offset += 2;
    }
    offset += 2;
  } else {
    while (offset < data.length && data[offset] !== 0) {
      offset++;
    }
    offset++;
  }

  if (offset >= data.length) return null;
  const picData = data.subarray(offset);

  let binary = "";
  const len = picData.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(picData[i]);
  }
  return { mimeType: mimeType || "image/jpeg", base64: btoa(binary) };
}

/**
 * Convenience extractor to automatically parse files of any supported format.
 */
export async function extractFileMetadata(
  file: File,
): Promise<ExtractedMetadata | null> {
  const buf = await file.arrayBuffer();
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "epub") {
    return parseEpubMetadata(buf);
  } else if (ext === "mp3") {
    return parseId3Metadata(buf);
  }
  return null;
}
