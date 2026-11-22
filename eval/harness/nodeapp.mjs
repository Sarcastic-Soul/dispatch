// Firebase app + App Check for Node scripts. App Check is enforced on AI Logic and Node has no
// attestation provider, so the registered debug token (gitignored file) is exchanged over REST.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';

const here = new URL('.', import.meta.url).pathname;
export const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const DATA = here + '../data/';

export function makeAI() {
  const cfg = readJSON(here + 'config.json');
  const app = initializeApp(cfg);
  const debugToken = readFileSync(here + '.appcheck-debug-token', 'utf8').trim();
  initializeAppCheck(app, {
    isTokenAutoRefreshEnabled: false,
    provider: new CustomProvider({
      getToken: async () => {
        const url = `https://firebaseappcheck.googleapis.com/v1/projects/${cfg.projectId}/apps/${cfg.appId}:exchangeDebugToken?key=${cfg.apiKey}`;
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debugToken }) });
        if (!res.ok) throw new Error(`exchangeDebugToken ${res.status}`);
        const body = await res.json();
        return { token: body.token, expireTimeMillis: Date.now() + parseInt(body.ttl, 10) * 1000 };
      },
    }),
  });
  return getAI(app, { backend: new GoogleAIBackend() });
}
