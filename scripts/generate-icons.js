#!/usr/bin/env node
// Generates placeholder PNG icons for the Shep Portal PWA.
// Uses only Node.js built-ins — no npm dependencies required.
// Run from the shep-portal/ directory: node scripts/generate-icons.js

import fs   from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Build CRC32 lookup table
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF]
  return (crc ^ 0xFFFFFFFF) | 0
}

function pngChunk(type, data) {
  const len  = Buffer.alloc(4);  len.writeUInt32BE(data.length, 0)
  const typeB = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeB, data])
  const crcB = Buffer.alloc(4);  crcB.writeInt32BE(crc32(crcInput), 0)
  return Buffer.concat([len, typeB, data, crcB])
}

function createSolidPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR: width, height, bit depth=8, color type=2 (RGB)
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8]  = 8  // bit depth
  ihdrData[9]  = 2  // RGB
  ihdrData[10] = 0  // compression
  ihdrData[11] = 0  // filter
  ihdrData[12] = 0  // interlace

  // Pixel data: filter byte (0) + RGB per pixel, per row
  const rowSize = 1 + size * 3
  const raw     = Buffer.alloc(size * rowSize)
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0 // filter None
    for (let x = 0; x < size; x++) {
      raw[y * rowSize + 1 + x * 3 + 0] = r
      raw[y * rowSize + 1 + x * 3 + 1] = g
      raw[y * rowSize + 1 + x * 3 + 2] = b
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

// Navy blue background: #0f172a = rgb(15, 23, 42)
const R = 15, G = 23, B = 42

const icons = [
  { name: 'icon-192.png',  size: 192 },
  { name: 'icon-512.png',  size: 512 },
  { name: 'badge-72.png',  size: 72  },
]

for (const { name, size } of icons) {
  const outPath = path.join(outDir, name)
  fs.writeFileSync(outPath, createSolidPNG(size, R, G, B))
  console.log(`✓ ${outPath} (${size}×${size})`)
}

console.log('\nIcons written to public/icons/. Replace with real graphics when ready.')
