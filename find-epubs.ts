import * as fs from 'fs';
import * as path from 'path';

function findEpubs(dir: string) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const full = path.join(dir, item);
        if (item.endsWith('.epub')) console.log("EPUB:", full);
        else if (fs.statSync(full).isDirectory()) findEpubs(full);
    }
}
findEpubs('./data/downloads');
