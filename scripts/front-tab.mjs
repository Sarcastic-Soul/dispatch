// Bring the debug Chrome tab whose URL contains the given text to the front (background tabs get throttled).
// Usage: node scripts/front-tab.mjs <url-part>
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9333');
const page = browser.contexts()[0].pages().find((p) => p.url().includes(process.argv[2]));
if (page) await page.bringToFront();
console.log(page ? `front: ${page.url()}` : 'no such tab');
process.exit(0); // never browser.close()
