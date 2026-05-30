import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generate() {
  const publicDir = path.join(process.cwd(), 'public');
  
  const sources = {
    regular: path.join(publicDir, 'icon.svg'),
    maskable: path.join(publicDir, 'icon-maskable.svg'),
    monochrome: path.join(publicDir, 'icon-monochrome.svg')
  };

  const targets = [
    { src: sources.regular, dest: path.join(publicDir, 'icon-192.png'), size: 192 },
    { src: sources.regular, dest: path.join(publicDir, 'icon-512.png'), size: 512 },
    { src: sources.maskable, dest: path.join(publicDir, 'icon-maskable-192.png'), size: 192 },
    { src: sources.maskable, dest: path.join(publicDir, 'icon-maskable-512.png'), size: 512 },
    { src: sources.monochrome, dest: path.join(publicDir, 'icon-monochrome-192.png'), size: 192 },
    { src: sources.monochrome, dest: path.join(publicDir, 'icon-monochrome-512.png'), size: 512 }
  ];

  console.log('Generating high-quality PWA PNG icons from vector sources using sharp...');

  for (const target of targets) {
    if (!fs.existsSync(target.src)) {
      console.error(`Source file not found: ${target.src}`);
      continue;
    }
    
    try {
      await sharp(target.src)
        .resize(target.size, target.size)
        .png()
        .toFile(target.dest);
      console.log(`Successfully generated: ${path.basename(target.dest)} (${target.size}x${target.size})`);
    } catch (err) {
      console.error(`Failed to generate ${target.dest}:`, err);
    }
  }

  console.log('PWA PNG icon generation completed!');
}

generate().catch(err => {
  console.error('Error running generator:', err);
  process.exit(1);
});
