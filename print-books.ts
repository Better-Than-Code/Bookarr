import * as fs from 'fs';
const db = JSON.parse(fs.readFileSync('./data/db.json', 'utf-8'));
for(const book of db.books) {
    console.log(book.title, "| format:", book.isAudiobook ? "audio" : "ebook", "| file:", book.filePath, "| chapters size:", book.chapters?.length, "| url:", book.fileUrl);
}
