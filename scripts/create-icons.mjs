import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const paper = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="12" y="12" width="232" height="232" rx="48" fill="#efffc9"/><path d="M64 73h128M64 108h90" stroke="#273213" stroke-width="14" stroke-linecap="round"/><circle cx="163" cy="170" r="42" fill="#efffc6" stroke="#273213" stroke-width="10"/><path d="M163 146v26l17 10" fill="none" stroke="#273213" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const tray = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="6" fill="#efffc9"/><path d="M8 10h16M8 15h9M8 20h6" stroke="#273213" stroke-width="2.5" stroke-linecap="round"/></svg>`;
await mkdir('assets', { recursive: true });
await sharp(Buffer.from(paper))
  .resize(256, 256)
  .png()
  .toFile('assets/icon.png');
await sharp(Buffer.from(tray)).resize(32, 32).png().toFile('assets/tray.png');
