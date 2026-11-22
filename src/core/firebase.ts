import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { firebaseConfig, recaptchaEnterpriseSiteKey } from '../firebase-config';

export interface Services {
  app: FirebaseApp;
  appCheck: AppCheck;
  ai: AI;
  db: Firestore;
}

let services: Services | null = null;

/**
 * App Check guards the Gemini API calls.
 * - Local development: a registered debug token from .env.development.local (gitignored), exchanged over REST.
 * - Deployed: reCAPTCHA Enterprise (score based, no challenge shown to the user).
 */
function startAppCheck(app: FirebaseApp): AppCheck {
  // Only in `vite dev`: production builds never contain the debug token (it lives in .env.development.local).
  const debugToken = import.meta.env.DEV ? (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) : undefined;
  if (debugToken) {
    const provider = new CustomProvider({
      getToken: async () => {
        const url =
          `https://firebaseappcheck.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
          `/apps/${firebaseConfig.appId}:exchangeDebugToken?key=${firebaseConfig.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ debugToken }),
        });
        if (!res.ok) throw new Error(`App Check debug exchange failed: ${res.status}`);
        const body = (await res.json()) as { token: string; ttl: string };
        return { token: body.token, expireTimeMillis: Date.now() + parseFloat(body.ttl) * 1000 };
      },
    });
    return initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
  }
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export function getServices(): Services {
  if (services) return services;
  const app = initializeApp(firebaseConfig);
  const appCheck = startAppCheck(app);
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    // Examples stay readable offline, so on-device routing keeps working without a network.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  services = { app, appCheck, ai, db };
  return services;
}

/** Anonymous sign-in: every visitor gets a private desk. */
export function signIn(): Promise<User> {
  const auth = getAuth(getServices().app);
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) {
        stop();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((e) => {
      stop();
      reject(e);
    });
  });
}
