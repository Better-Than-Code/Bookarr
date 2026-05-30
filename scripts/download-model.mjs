import fs from 'fs';
import path from 'path';

const REPO = 'onnx-community/Kokoro-82M-ONNX';
const BASE_URL = `https://huggingface.co/${REPO}/resolve/main/`;
const DEST = path.join(process.cwd(), 'public', 'models', REPO);

const filesToDownload = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'generation_config.json',
    'preprocessor_config.json',
    'onnx/model_quantized.onnx',
    'voices/af.bin'
];

async function download() {
    for (const file of filesToDownload) {
        const destPath = path.join(DEST, file);
        if (fs.existsSync(destPath)) {
            console.log(`Skipping ${file}, already exists`);
            continue;
        }
        
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        console.log(`Downloading ${file}...`);
        
        const res = await fetch(BASE_URL + file);
        if (!res.ok) {
            console.error(`Failed to download ${file}: ${res.status}`);
            continue;
        }
        
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(buffer));
        console.log(`Saved ${file} (${buffer.byteLength} bytes)`);
    }
}

download().catch(console.error);
