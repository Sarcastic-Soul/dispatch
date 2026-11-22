export interface Team {
  id: string;
  name: string;
  description: string;
}

/** A labelled past ticket. `text` is always the masked text, never the raw ticket. */
export interface Example {
  id: string;
  text: string;
  team: string;
  source: 'seed' | 'gemini-confirmed' | 'staff';
  createdAt: number;
}

export type MaskKind = 'STUDENT_ID' | 'EMAIL' | 'PHONE' | 'NAME';

export interface MaskSpan {
  start: number;
  end: number;
  kind: MaskKind;
}

export interface Masked {
  /** Text with personal details replaced by [KIND] tokens. */
  text: string;
  /** Spans in the ORIGINAL text that were replaced. */
  spans: MaskSpan[];
}

export type InferenceWhere = 'on_device' | 'in_cloud';

export interface RouteResult {
  team: string | null;
  where: InferenceWhere | null;
  ms: number;
  error?: string;
}

export interface AuditResult {
  team: string;
  reason: string;
  ms: number;
  promptTokens?: number;
  outputTokens?: number;
}

export type EscalationReason = 'no-examples' | 'disagree' | 'sample';

export interface Decision {
  escalate: boolean;
  why: EscalationReason | null;
}
