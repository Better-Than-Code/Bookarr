import fs from 'fs';
import path from 'path';

const file = path.resolve('data/db.json');
if (fs.existsSync(file)) {
  let data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const ids = new Set();
  let fixed = 0;
  data.books.forEach((book: any) => {
    if (ids.has(book.id)) {
      book.id = `book-scan-${crypto.randomUUID()}`;
      fixed++;
    }
    ids.add(book.id);
  });

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Fixed ${fixed} duplicate IDs in db.json`);
} else {
  console.log('db.json not found');
}
