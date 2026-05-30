import fs from 'fs';
import path from 'path';
import axios from 'axios';

const KOKORO_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_BASE = `https://huggingface.co/${KOKORO_REPO}/resolve/main/`;
const KOKORO_DEST = path.join(process.cwd(), 'public', 'models', KOKORO_REPO);

const PIPER_REPO = 'diffusionstudio/piper-voices';
const PIPER_BASE = `https://huggingface.co/${PIPER_REPO}/resolve/main/`;
const PIPER_DEST = path.join(process.cwd(), 'public', 'models', 'piper-voices');

const kokoroFiles = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'generation_config.json',
  'preprocessor_config.json',
  'onnx/model_quantized.onnx',
  // Common voices
  'voices/af.bin',
  'voices/af_heart.bin',
  'voices/af_bella.bin',
  'voices/af_nicole.bin',
  'voices/af_sarah.bin',
  'voices/am_adam.bin',
  'voices/bf_emma.bin',
  'voices/bm_george.bin'
];

const piperFiles = [
  'en/en_US/libritts/high/en_US-libritts-high.onnx',
  'en/en_US/libritts/high/en_US-libritts-high.onnx.json'
];

async function downloadFile(url: string, destPath: string) {
  if (fs.existsSync(destPath)) {
    console.log(`[Skipped] Already exists: ${destPath}`);
    return;
  }

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[Downloading] ${url} -> ${destPath}`);
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    fs.writeFileSync(destPath, Buffer.from(response.data));
    console.log(`[Success] Saved ${destPath} (${response.data.byteLength} bytes)`);
  } catch (err: any) {
    console.error(`[Error] Failed to download ${url}: ${err.message}`);
  }
}

async function run() {
  console.log('--- STARTING VOICE MODEL DOWNLOAD ---');
  
  // 1. Download Kokoro Files
  for (const file of kokoroFiles) {
    const url = KOKORO_BASE + file;
    const dest = path.join(KOKORO_DEST, file);
    await downloadFile(url, dest);
  }

  // 2. Download Piper Files
  for (const file of piperFiles) {
    const url = PIPER_BASE + file;
    const dest = path.join(PIPER_DEST, file);
    await downloadFile(url, dest);
  }

  console.log('--- ALL DOWNLOADS COMPLETED ---');
}

run().catch(console.error);
