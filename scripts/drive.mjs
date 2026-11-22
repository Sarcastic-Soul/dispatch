// Dev helper: drive the app in a running Chrome (started with --remote-debugging-port) so the real
// on-device model is used. Usage: node scripts/drive.mjs <out-dir> [steps...]
// Steps: shot:<name> | wait:<ms> | click:<text> | select:<index> | eval:<js> | width:<px> | until:<js>
import { chromium } from '@playwright/test';

const [out = '.', ...steps] = process.argv.slice(2);
const url = process.env.APP_URL ?? 'http://localhost:5173/';
const browser = await chromium.connectOverCDP(process.env.CDP ?? 'http://localhost:9333');
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().startsWith(url));
if (!page) {
  page = await ctx.newPage();
  await page.goto(url);
}
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`.slice(0, 300));
});
page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`));

for (const step of steps) {
  const [cmd, ...rest] = step.split(':');
  const arg = rest.join(':');
  if (cmd === 'shot') await page.screenshot({ path: `${out}/${arg}.png`, fullPage: true });
  else if (cmd === 'view') await page.screenshot({ path: `${out}/${arg}.png` });
  else if (cmd === 'wait') await page.waitForTimeout(Number(arg));
  else if (cmd === 'click') await page.getByRole('button', { name: arg }).first().click();
  else if (cmd === 'select') await page.locator('.queue .item').nth(Number(arg)).click();
  else if (cmd === 'width') await page.setViewportSize({ width: Number(arg), height: 900 });
  else if (cmd === 'reload') await page.reload();
  else if (cmd === 'until') await page.waitForFunction(arg, null, { timeout: 180_000, polling: 1000 });
  else if (cmd === 'eval') console.log(JSON.stringify(await page.evaluate(arg)));
  else if (cmd === 'text') console.log((await page.locator(arg || 'body').innerText()).slice(0, 4000));
}
if (logs.length) console.log('--- console ---\n' + logs.join('\n'));
process.exit(0); // do not close: that would quit the shared Chrome
