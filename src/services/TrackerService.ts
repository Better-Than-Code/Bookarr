/**
 * TrackerService.ts
 * Internal mediator for handling searches for books and audiobooks.
 */
import { TorrentSearchResult, IndexerSettings, BookrrConfig } from "../types";
import { searchNative } from "./ScraperService";

export interface SearchOptions {
  query: string;
  type: "ebook" | "audiobook";
}

export async function searchAllIndexers(
  opts: SearchOptions,
  _config: BookrrConfig,
  configuredIndexers: IndexerSettings[],
  onResult: (results: TorrentSearchResult[]) => void,
  onStatus?: (status: string) => void,
): Promise<void> {
  const activeIndexers = configuredIndexers.filter((i) => i.enabled);

  if (onStatus)
    onStatus(`Initializing search across ${activeIndexers.length} indexers...`);

  await Promise.all(
    activeIndexers.map(async (indexer) => {
      try {
        if (onStatus) onStatus(`Querying indexer: ${indexer.name}...`);
        const results = await searchNative(indexer, opts.query, opts.type);
        if (onStatus)
          onStatus(`Received ${results.length} results from ${indexer.name}`);
        onResult(results);
      } catch (err: any) {
        console.error(`Error searching indexer ${indexer.name}:`, err);
        onResult([
          {
            id: `error-${indexer.name}`,
            title: `Error searching ${indexer.name}`,
            size: "N/A",
            seeds: 0,
            peers: 0,
            magnetLink: "",
            indexer: indexer.name,
            type: opts.type,
            publishDate: new Date().toISOString().split("T")[0],
            error: err.message,
          },
        ]);
      }
    }),
  );
}
