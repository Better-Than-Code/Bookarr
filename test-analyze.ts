import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import EPub from 'epub';

const filePath = process.argv[2];
if (!filePath) {
   console.error("No file provided");
   process.exit(1);
}

console.log("Analyzing", filePath);

const epub = new EPub(filePath) as any;
epub.on('error', (err: any) => console.log("ERROR", err));
epub.on('end', () => {
    console.log("EPUB parsed.");
    console.log("toc length:", epub.toc?.length);
    console.log("spine length:", epub.spine?.contents?.length);
    console.log("flow length:", epub.flow?.length);
    const flow = epub.flow || epub.spine?.contents || [];
    console.log("Using sections:", flow.length);
    
    if (flow.length > 0) {
        epub.getChapter(flow[0].id, (err: any, text: string) => {
             console.log("First chapter get:", err ? "ERROR" : "SUCCESS", text ? text.length + " bytes" : "no text");
        });
    }
});
epub.parse();
