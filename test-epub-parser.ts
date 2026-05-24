import * as http from 'https';
import * as fs from 'fs';
import epubParser from 'epub-parser';

const url = "https://raw.githubusercontent.com/IDPF/epub3-samples/master/30/wasteland/wasteland.epub";

http.get(url, (res) => {
    const file = fs.createWriteStream('wasteland.epub');
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        epubParser.open('wasteland.epub', (err: any, data: any) => {
            console.log(err ? "ERROR: " + err : "SUCCESS");
            if (data && data.easy) {
                console.log(data.easy.length);
                if (data.easy[0]) console.log(Object.keys(data.easy[0]));
            }
        });
    });
});
