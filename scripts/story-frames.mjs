// Screenshot every story frame for review: one PNG per story in story-frames/.
//
//   npm run frames                 # all stories
//   npm run frames -- agent-loop   # one story
//
// Starts the Vite dev server, opens /frames.html (src/frames.tsx) and saves each
// story's section. Exits with 1 if anything is drawn at the edge of a frame.
// Needs Playwright: `npm i -D playwright && npx playwright install chromium`,
// or set CHROME_PATH to a Chrome/Chromium you already have.
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('story-frames needs Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const only = process.argv.slice(2);
const outDir = 'story-frames';
await mkdir(outDir, { recursive: true });

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let atEdge = false;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(new URL('frames.html', url).href);
  const report = page.locator('.frames__report[data-ready=true]');
  await report.waitFor();
  const text = await report.innerText();
  atEdge = text.startsWith('At the edge');
  console.log(text);
  for (const section of await page.locator('.frames__story').all()) {
    const id = await section.getAttribute('id');
    if (only.length && !only.includes(id)) continue;
    const file = `${outDir}/${id}.png`;
    await section.screenshot({ path: file });
    console.log(`  ${file}`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(atEdge ? 1 : 0);
