// Checks the published site after a deploy: the live build is this commit, and
// the sandbox and every Story Narrative story load, render and run with no
// console errors. Usage: node scripts/verify-live.mjs <site url> <commit sha>
import { chromium } from 'playwright';

const [site = 'https://chadbercea.github.io/agent-game-zero/', sha] = process.argv.slice(2);
const base = site.endsWith('/') ? site : `${site}/`;

/** The pages to load, and what has to be true once each one is running. */
const PAGES = [
  { name: 'Sandbox', path: '', running: () => window.sandbox?.scene.rovo.drone.fade > 0 },
  {
    name: 'Story Narrative / Rovo on the Atlassian Grid',
    path: 'storybook/iframe.html?id=story-narrative-rovo-on-the-atlassian-grid--working',
    running: () => window.__story?.rovo.drone.fade > 0,
  },
  {
    name: 'Story Narrative / Rovo ships a feature',
    path: 'storybook/iframe.html?id=story-narrative-rovo-ships-a-feature--feature',
    running: () => window.__story?.rovo.drone.fade > 0,
  },
];

// Pages can lag the deploy by a minute or two: wait until the live build is this commit.
if (sha) {
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    const live = await fetch(`${base}version.json?${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (live?.sha === sha) break;
    if (Date.now() > deadline) throw new Error(`Live build is ${live?.sha ?? 'missing'}, expected ${sha}`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  console.log(`✓ live build is ${sha}`);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
for (const { name, path, running } of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: 'load' });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
    await page.waitForSelector('canvas', { timeout: 30_000 });
    await page.waitForFunction(running, null, { timeout: 60_000 });
    // Let it play a few seconds so errors during the run show up too.
    await page.waitForTimeout(5_000);
    if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`);
    console.log(`✓ ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
  } finally {
    await page.close();
  }
}
await browser.close();
if (failures.length) process.exit(1);
