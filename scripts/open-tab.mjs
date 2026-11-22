// Open a URL in a new tab of the debuggable Chrome Beta (port 9333) and leave it running.
// Usage: node scripts/open-tab.mjs <url>
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9333');
const page = await browser.contexts()[0].newPage();
await page.goto(process.argv[2]);
console.log('opened', page.url());
process.exit(0); // never browser.close(): it would quit the user's debug Chrome
