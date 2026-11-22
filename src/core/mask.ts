import type { MaskKind, MaskSpan, Masked } from './types';

// Deterministic masking. Runs before ANY model sees the ticket, on-device or cloud,
// because routing never needs who wrote the ticket.
const NAME_WORD = "[A-Z][a-z'-]+";
const FULL_NAME = `${NAME_WORD}(?:\\s+(?:${NAME_WORD}|[A-Z]\\.))?`;

// Each pattern with a capture group masks only group 1; without one, the whole match.
const PATTERNS: [MaskKind, RegExp][] = [
  ['EMAIL', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/dg],
  ['STUDENT_ID', /\bN\d{8}\b/dgi],
  // Phone numbers and extensions: (555) 123-4567, 555-123-4567, ext 4417, ext. 4417, x4417
  ['PHONE', /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\b(?:ext\.?\s?|x)\d{3,5}\b/dgi],
  // Titled names: Dr. Okafor, Prof Lin, Coach Delaney, Ms. Rivera
  ['NAME', new RegExp(`\\b(?:Dr|Prof|Professor|Coach|Mr|Mrs|Ms|Mx|Dean)\\.?\\s+${FULL_NAME}`, 'dg')],
  // Self-introductions: "my name is Maria Lopez", "I'm Priya Nair"
  ['NAME', new RegExp(`\\b(?:[Mm]y name is|I am|I'm)\\s+(${FULL_NAME})`, 'dg')],
  // Dash sign-offs: "thx - Gabriela Santos", "- Tomasz W., N02348817"
  ['NAME', new RegExp(`(?:^|\\s)[-\u2013\u2014]\\s*(${FULL_NAME})(?=\\s*(?:[,.]|$|\\n|N\\d{8}))`, 'dg')],
  // Word sign-offs at the end: "thanks, Maria", "Cheers Jordan Lee"
  ['NAME', new RegExp(`\\b(?:[Tt]hanks|[Tt]hank you|[Tt]hx|[Cc]heers|[Rr]egards|[Bb]est|[Ss]incerely)[,!.]?\\s+(${FULL_NAME})\\.?\\s*$`, 'dg')],
  // A name right before a student ID: "Obinna Eze, N07733402"
  ['NAME', new RegExp(`\\b(${NAME_WORD}(?:\\s+${NAME_WORD})+)\\s*,?\\s*(?=N\\d{8}\\b)`, 'dg')],
  // A bare full name closing the ticket: "... call me now x6612. Peter Lindgren"
  ['NAME', new RegExp(`(?:[.!?]\\s+|\\n)(${NAME_WORD}\\s+${NAME_WORD})\\.?\\s*$`, 'dg')],
];

/** Mask personal details. `extraNames` lets a caller add names found elsewhere (e.g. a roster). */
export function mask(text: string, extraNames: string[] = []): Masked {
  const spans: MaskSpan[] = [];
  for (const [kind, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const [start, end] = m.indices?.[1] ?? m.indices?.[0] ?? [m.index ?? 0, (m.index ?? 0) + m[0].length];
      spans.push({ start, end, kind });
    }
  }
  for (const name of extraNames) {
    if (name.trim().length < 2) continue;
    const re = new RegExp(`\\b${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const m of text.matchAll(re)) spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: 'NAME' });
  }
  const merged = mergeSpans(spans);
  let out = '';
  let pos = 0;
  for (const s of merged) {
    out += text.slice(pos, s.start) + `[${s.kind}]`;
    pos = s.end;
  }
  out += text.slice(pos);
  return { text: out, spans: merged };
}

function mergeSpans(spans: MaskSpan[]): MaskSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: MaskSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}
