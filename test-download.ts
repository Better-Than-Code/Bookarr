import * as fs from 'fs';
import * as http from 'https';
import epubParser from 'epub-parser';

const file = fs.createWriteStream("testbook.epub");
http.get("https://www.gutenberg.org/ebooks/11.epub.images", function(response) {
  response.pipe(file);
  file.on('finish', function() {
    file.close(() => {
        epubParser.open('testbook.epub', (err: any, data: any) => {
           if (err) console.error(err);
           else {
               console.log("EPUB Parsed!");
               console.log("Sections count:", data.easy.epub3 ? "?" : "???", data?.easy?.length);
               if(data.easy) {
                  // data.easy is an array or object?
                  console.log(Array.isArray(data.easy));
                  // console.log(Object.keys(data.easy));
               }
           }
        });
    });
  });
});
