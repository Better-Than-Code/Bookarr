import * as fs from 'fs';
import * as path from 'path';

const downloads = './data/downloads';
console.log("Downloads dir exists:", fs.existsSync(downloads));
if (fs.existsSync(downloads)) {
    const items = fs.readdirSync(downloads);
    for (const item of items) {
       console.log("-", item);
       const full = path.join(downloads, item);
       if (fs.statSync(full).isDirectory()) {
           console.log("   is dir. contents:", fs.readdirSync(full, {recursive: true}));
       }
    }
}
