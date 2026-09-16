#!/usr/bin/env node
/**
 * Vendors the tesseract.js engine into public/tesseract/ so the photo import runs with
 * no network access. The wasm and worker come from node_modules; only the English
 * training data has to be fetched, and only once.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'public', 'tesseract');

// Tesseract picks a core variant at run time from what the browser supports — plain,
// SIMD or relaxed-SIMD, each with or without the legacy model. Every one it might ask
// for has to be here, or it 404s on exactly the modern browsers that support the fastest
// build. The wasm is base64-embedded in these files, so there is nothing else to fetch.
const CORE_FILES = [
  'tesseract-core.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

const TRAINED_DATA = 'eng.traineddata.gz';
// The same integer-quantised LSTM model tesseract.js fetches by default for oem=1.
const TRAINED_DATA_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

async function copyFrom(pkg, file) {
  const source = join(root, 'node_modules', pkg, file);
  if (!(await exists(source))) {
    throw new Error(`Missing ${source} — run \`npm install\` first.`);
  }
  // Flatten into public/tesseract/, since that is the single directory we serve from.
  const name = file.split('/').pop();
  await copyFile(source, join(target, name));
  console.log(`  copied ${name}`);
}

async function download(url, destination) {
  if (await exists(destination)) {
    console.log(`  ${TRAINED_DATA} already present`);
    return;
  }
  console.log(`  downloading ${TRAINED_DATA}…`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function main() {
  await mkdir(target, { recursive: true });
  console.log(`Vendoring tesseract into ${target}`);

  await copyFrom('tesseract.js', 'dist/worker.min.js');
  for (const file of CORE_FILES) await copyFrom('tesseract.js-core', file);
  await download(TRAINED_DATA_URL, join(target, TRAINED_DATA));

  console.log('Done — photo import will now work offline.');
}

main().catch((error) => {
  console.error(`\nsetup:ocr failed: ${error.message}`);
  process.exit(1);
});
