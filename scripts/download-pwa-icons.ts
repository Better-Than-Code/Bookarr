import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function downloadFile(url: string, dest: string) {
  try {
    console.log(`Downloading ${url} to ${dest}...`);
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const writer = fs.createWriteStream(dest);
    response.data.pipe(writer);
    
    return new Promise<void>((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`Successfully downloaded to ${dest}`);
        resolve();
      });
      writer.on('error', (err) => {
        console.error(`Error writing file ${dest}:`, err);
        reject(err);
      });
    });
  } catch (err) {
    console.error(`Failed to download ${url}:`, err);
    throw err;
  }
}

async function main() {
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  const icon192Url = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Open%20book/3D/open_book_3d.png';
  const icon512Url = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Open%20book/3D/open_book_3d.png';
  
  const dest192 = path.join(publicDir, 'icon-192.png');
  const dest512 = path.join(publicDir, 'icon-512.png');
  
  await downloadFile(icon192Url, dest192);
  await downloadFile(icon512Url, dest512);
  console.log('PWA icon fetching completed!');
}

main().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
