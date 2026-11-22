import { fetchAndActivate, getAll, getRemoteConfig, type RemoteConfig } from 'firebase/remote-config';
import type { FirebaseApp } from 'firebase/app';

export interface AppConfig {
  /** Share of confident tickets the cloud also checks, so on-device accuracy keeps being measured. */
  auditSampleRate: number;
  cloudModel: string;
  retrievalK: number;
  /** When on, a ticket routes in the cloud (masked) if the on-device model is not available. */
  allowCloudFallbackRouting: boolean;
  seedBankSize: number;
  escalateOnDisagreement: boolean;
}

export const DEFAULTS: AppConfig = {
  auditSampleRate: 0.1,
  cloudModel: 'gemini-3.5-flash-lite',
  retrievalK: 8,
  allowCloudFallbackRouting: false,
  seedBankSize: 20,
  escalateOnDisagreement: true,
};

const KEYS: Record<keyof AppConfig, string> = {
  auditSampleRate: 'audit_sample_rate',
  cloudModel: 'cloud_model',
  retrievalK: 'retrieval_k',
  allowCloudFallbackRouting: 'allow_cloud_fallback_routing',
  seedBankSize: 'seed_bank_size',
  escalateOnDisagreement: 'escalate_on_disagreement',
};

/** Load Remote Config; on any failure (offline, blocked) keep the defaults. */
export async function loadConfig(app: FirebaseApp): Promise<AppConfig> {
  let rc: RemoteConfig;
  try {
    rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;
    rc.defaultConfig = Object.fromEntries(Object.entries(KEYS).map(([k, key]) => [key, DEFAULTS[k as keyof AppConfig]]));
    await fetchAndActivate(rc);
  } catch {
    return { ...DEFAULTS };
  }
  const all = getAll(rc);
  const out = { ...DEFAULTS };
  for (const [k, key] of Object.entries(KEYS) as [keyof AppConfig, string][]) {
    const v = all[key];
    if (!v) continue;
    const d = DEFAULTS[k];
    if (typeof d === 'number') (out[k] as number) = v.asNumber();
    else if (typeof d === 'boolean') (out[k] as boolean) = v.asBoolean();
    else (out[k] as string) = v.asString() || d;
  }
  return out;
}
