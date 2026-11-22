import { chromium } from 'playwright';
import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const b = await chromium.launch();
for (const n of [1,2,3]) {
  if (only && String(n)!==only) continue;
  for (const [w,h,tag] of [[1440,900,'1440'],[390,844,'390']]) {
    const p = await b.newPage({ viewport:{width:w,height:h} });
    await p.goto('file://'+dir+`/option-${n}.html`);
    await p.waitForLoadState('networkidle'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
    const sw = await p.evaluate(()=>document.documentElement.scrollWidth);
    console.log(n,tag,'scrollWidth',sw,'height',await p.evaluate(()=>document.documentElement.scrollHeight));
    await p.screenshot({ path: dir+`/option-${n}-${tag}.png` });
    await p.screenshot({ path: dir+`/option-${n}-${tag}-full.png`, fullPage:true });
    await p.close();
  }
}
await b.close();
