import { getGenerativeModel, InferenceMode, Schema, type AI, type GenerativeModel } from 'firebase/ai';
import type { AuditResult, RouteResult } from './types';

const EXPECTED = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

export type DeviceStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelStatic {
  availability(opts?: unknown): Promise<Exclude<DeviceStatus, 'unsupported'>>;
}

/** Is Chrome's built-in model (Prompt API) usable in this browser? */
export async function deviceStatus(): Promise<DeviceStatus> {
  const LM = (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  if (!LM) return 'unsupported';
  try {
    return await LM.availability(EXPECTED);
  } catch {
    return 'unavailable';
  }
}

export interface Models {
  route: GenerativeModel;
  audit: GenerativeModel;
}

/**
 * Two models through one SDK:
 * - route: Chrome's on-device model. Only falls back to the cloud (on masked text) when the
 *   admin turns on allowCloudFallbackRouting, e.g. for staff whose browser has no on-device model.
 * - audit: Gemini in the cloud, used only for unsure tickets, and only after the staffer approves the masked text.
 */
export function makeModels(ai: AI, teamIds: string[], cloudModel: string, allowCloudFallback: boolean): Models {
  const route = getGenerativeModel(ai, {
    mode: allowCloudFallback ? InferenceMode.PREFER_ON_DEVICE : InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: EXPECTED,
      promptOptions: {
        responseConstraint: {
          type: 'object',
          properties: { team: { type: 'string', enum: teamIds } },
          required: ['team'],
        },
      },
    },
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: Schema.object({ properties: { team: Schema.enumString({ enum: teamIds }) } }),
      },
    },
  });
  const audit = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: Schema.object({
          properties: { team: Schema.enumString({ enum: teamIds }), reason: Schema.string() },
          propertyOrdering: ['team', 'reason'],
        }),
      },
    },
  });
  return { route, audit };
}

/** Start the on-device model download. Chrome requires this to happen inside a user gesture. */
export function downloadDeviceModel(models: Models, onProgress: (p: number) => void): Promise<void> {
  return models.route.initializeDeviceModel(onProgress);
}

export async function routeTicket(model: GenerativeModel, prompt: string): Promise<RouteResult> {
  const t0 = performance.now();
  try {
    const res = await model.generateContent(prompt);
    const team = (JSON.parse(res.response.text()) as { team?: string }).team ?? null;
    return { team, where: res.response.inferenceSource ?? 'on_device', ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { team: null, where: null, ms: Math.round(performance.now() - t0), error: String(e) };
  }
}

export async function auditTicket(model: GenerativeModel, prompt: string): Promise<AuditResult> {
  const t0 = performance.now();
  const res = await model.generateContent(prompt);
  const body = JSON.parse(res.response.text()) as { team: string; reason?: string };
  const usage = res.response.usageMetadata;
  return {
    team: body.team,
    reason: (body.reason ?? '').trim(),
    ms: Math.round(performance.now() - t0),
    promptTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
  };
}
