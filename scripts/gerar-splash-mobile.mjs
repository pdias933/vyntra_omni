import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.VYNTRA_PLAYWRIGHT_MODULO ?? 'playwright');
const navegador = await chromium.launch({ executablePath: process.env.VYNTRA_CHROME_EXECUTAVEL, headless: true });
try {
  const pagina = await navegador.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  const svg = await readFile(new URL('../apps/mobile/assets/splash.svg', import.meta.url), 'utf8');
  await pagina.setContent('<style>body{margin:0;background:transparent}</style>' + svg);
  await pagina.locator('svg').screenshot({ path: new URL('../apps/mobile/assets/splash.png', import.meta.url).pathname, omitBackground: true });
} finally { await navegador.close(); }
