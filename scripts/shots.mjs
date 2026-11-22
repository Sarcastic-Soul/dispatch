// Screenshots for visual QA in Playwright's Chromium with a fake on-device model (no Gemini calls).
// Usage: node scripts/shots.mjs <out-dir>
import { chromium } from 'playwright';

const out = process.argv[2];
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => {
    let n = 0;
    window.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => {
          await new Promise((r) => setTimeout(r, 300));
          return JSON.stringify({ team: ++n % 2 ? 'resnet' : 'identity-access' });
        },
        destroy() {},
      }),
    };
  });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => document.querySelectorAll('.queue .st').length >= 6 && ![...document.querySelectorAll('.queue .st')].some((e) => /waiting|routing/.test(e.textContent)), null, { timeout: 60000 });
  await page.screenshot({ path: `${out}/app-${w}-empty.png`, fullPage: true });
  const unsure = page.locator('.queue li', { hasText: 'unsure' }).first();
  await unsure.locator('button').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/app-${w}-unsure.png`, fullPage: true });
  const routed = page.locator('.queue li', { hasText: 'routed on device' }).first();
  if (await routed.count()) {
    await routed.locator('button').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/app-${w}-routed.png`, fullPage: w > 400 });
  }
  await page.close();
}
await browser.close();
console.log('done');
