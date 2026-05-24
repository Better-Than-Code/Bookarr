import epubParser from 'epub-parser';
import * as fs from 'fs';

// find a downloaded epub
const base = './data/downloads';
let file = '';
if (fs.existsSync(base)) {
  const dirs = fs.readdirSync(base);
  for (const dir of dirs) {
    if (dir.endsWith('.epub')) { file = base + '/' + dir; break; }
    const sub = base + '/' + dir;
    if (fs.statSync(sub).isDirectory()) {
       const subs = fs.readdirSync(sub);
       for (const s of subs) {
          if (s.endsWith('.epub')) { file = sub + '/' + s; break; }
       }
    }
  }
}
console.log("Found:", file);
if (file) {
  epubParser.open(file, (err: any, data: any) => {
    if (err) console.error(err);
    else console.log(Object.keys(data));
  });
}
