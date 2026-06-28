import { createRequire } from 'node:module';
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Puppeteer is installed in a separate scratch project (see CLAUDE.md).
const require = createRequire('C:/Users/eugek/AppData/Local/Temp/puppeteer-test/');
const puppeteer = require('puppeteer');

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

const OUT_DIR = fileURLToPath(new URL('./temporary screenshots/', import.meta.url));
await mkdir(OUT_DIR, { recursive: true });

// Auto-increment: never overwrite an existing screenshot.
let max = 0;
for (const f of await readdir(OUT_DIR)) {
  const m = f.match(/^screenshot-(\d+)/);
  if (m) max = Math.max(max, Number(m[1]));
}
const n = max + 1;
const name = `screenshot-${n}${label ? `-${label}` : ''}.png`;
const outPath = join(OUT_DIR, name);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

// Scroll through the page so IntersectionObserver scroll-reveals fire, then reset.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
  // Guarantee every scroll-reveal element is shown for the capture.
  document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in'));
});
await new Promise((r) => setTimeout(r, 900)); // let fonts + animations settle
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Saved ${outPath}`);
