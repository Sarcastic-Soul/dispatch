import type { Unsubscribe } from 'firebase/firestore';
import { auditTicket, deviceStatus, downloadDeviceModel, makeModels, routeTicket, type DeviceStatus, type Models } from '../core/ai';
import { DEFAULTS, loadConfig, type AppConfig } from '../core/config';
import { BANK_ORDER, HOLDOUT, TEAM_IDS, TEAMS } from '../core/data';
import { getServices, signIn } from '../core/firebase';
import { mask } from '../core/mask';
import { auditPrompt, triage, type Triage } from '../core/pipeline';
import { addExample, logEvent, resetDesk, seedIfEmpty, watchEvents, watchExamples, type TicketEvent } from '../core/store';
import type { AuditResult, Example } from '../core/types';

export type TicketStatus =
  | 'waiting' // in the queue, not routed yet
  | 'routing' // on-device model is working on it
  | 'routed' // confident, routed on-device, done
  | 'unsure' // needs a person: preview the masked text, then ask Gemini or route it yourself
  | 'asking' // masked text sent to Gemini
  | 'answered' // Gemini answered, waiting for the staffer's call
  | 'done' // a person confirmed or changed the team; saved as an example
  | 'error';

export interface QueueTicket {
  id: string;
  raw: string;
  /** Known right team for the labelled demo tickets; null for typed tickets. */
  gold: string | null;
  receivedAt: number;
  status: TicketStatus;
  triage?: Triage;
  bankSize?: number;
  audit?: AuditResult;
  error?: string;
  finalTeam?: string;
  decidedBy?: 'device' | 'gemini' | 'staff';
  savedAs?: number;
  /** Extra words the staffer chose to mask before anything leaves the computer. */
  extraMasks?: string[];
  /** Short status line while asking Gemini, e.g. waiting out the per-minute limit. */
  note?: string;
}

export type Phase = 'starting' | 'ready' | 'failed';

export interface DeskState {
  phase: Phase;
  startError?: string;
  uid?: string;
  config: AppConfig;
  device: DeviceStatus | 'checking';
  downloadProgress: number | null;
  /** Local switch: route in the cloud (masked text) because this browser has no on-device model. */
  cloudRouting: boolean;
  autopilot: boolean;
  examples: Example[];
  events: (TicketEvent & { createdAt: number })[];
  tickets: QueueTicket[];
  selectedId: string | null;
}

type Listener = () => void;

const LS_NEXT = 'dispatch.nextDemo';
const readNext = () => {
  try {
    return Number(localStorage.getItem(LS_NEXT) ?? 0) || 0;
  } catch {
    return 0;
  }
};
const writeNext = (n: number) => {
  try {
    localStorage.setItem(LS_NEXT, String(n));
  } catch {
    /* storage blocked: the demo just restarts from the first ticket */
  }
};

/** Seconds to wait when Gemini's free tier per-minute limit was hit; 0 for any other error. */
export function perMinuteWait(e: unknown): number {
  const s = String(e);
  if (!/per minute|PerMinute/i.test(s)) return 0;
  return Math.min(60, Number(/retry in ([\d.]+)s/.exec(s)?.[1] ?? 20));
}

export function friendlyError(e: unknown): string {
  const s = String(e);
  if (perMinuteWait(e)) return "Gemini's free tier allows 15 requests a minute and this demo is busy. Try again in a minute.";
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(s)) return "Gemini's free daily limit for this demo project is used up. Route it yourself for now.";
  if (/App Check|401|403/i.test(s)) return 'The cloud call was blocked by App Check. Reload the page and try again.';
  if (/network|Failed to fetch|offline/i.test(s)) return 'No network. On-device routing still works; Gemini needs a connection.';
  return s.replace(/^Error:\s*/, '').slice(0, 240);
}

export class Desk {
  state: DeskState = {
    phase: 'starting',
    config: DEFAULTS,
    device: 'checking',
    downloadProgress: null,
    cloudRouting: false,
    autopilot: false,
    examples: [],
    events: [],
    tickets: [],
    selectedId: null,
  };
  private listeners = new Set<Listener>();
  private models: Models | null = null;
  private pumping = false;
  private nextDemo = readNext();
  private unsubs: Unsubscribe[] = [];
  private seq = 0;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;

  private set(patch: Partial<DeskState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private patchTicket(id: string, patch: Partial<QueueTicket>) {
    this.set({ tickets: this.state.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }

  private ticket(id: string) {
    return this.state.tickets.find((t) => t.id === id);
  }

  async start() {
    try {
      const device = deviceStatus();
      const { app, db } = getServices();
      const [user, config] = await Promise.all([signIn(), loadConfig(app)]);
      this.models = makeModels(getServices().ai, TEAM_IDS, config.cloudModel, config.allowCloudFallbackRouting);
      const seed = BANK_ORDER.slice(0, config.seedBankSize).map((t) => ({ id: t.id, team: t.team, text: mask(t.text).text }));
      await seedIfEmpty(db, user.uid, seed);
      // Wait for the first examples snapshot, so the first ticket is routed with this desk's examples, not an empty bank.
      await new Promise<void>((loaded, failed) => {
        this.unsubs.push(
          watchExamples(
            db,
            user.uid,
            (examples) => {
              this.set({ examples });
              loaded();
            },
            failed,
          ),
          watchEvents(db, user.uid, (events) => this.set({ events })),
        );
      });
      this.set({ phase: 'ready', uid: user.uid, config, device: await device, cloudRouting: config.allowCloudFallbackRouting });
      this.addDemoTickets(6);
    } catch (e) {
      this.set({ phase: 'failed', startError: friendlyError(e) });
    }
  }

  /** Can tickets be routed right now? */
  get canRoute() {
    return this.state.phase === 'ready' && (this.state.device === 'available' || this.state.cloudRouting);
  }

  addDemoTickets(n: number) {
    const now = Date.now();
    const fresh: QueueTicket[] = [];
    for (let i = 0; i < n; i++) {
      const t = HOLDOUT[this.nextDemo % HOLDOUT.length];
      this.nextDemo++;
      fresh.push({ id: `${t.id}-${this.nextDemo}`, raw: t.text, gold: t.team, receivedAt: now + i, status: 'waiting' });
    }
    writeNext(this.nextDemo);
    this.set({ tickets: [...this.state.tickets, ...fresh] });
    void this.pump();
  }

  addTypedTicket(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const id = `typed-${Date.now()}-${this.seq++}`;
    this.set({
      tickets: [...this.state.tickets, { id, raw: clean, gold: null, receivedAt: Date.now(), status: 'waiting' }],
      selectedId: id,
    });
    void this.pump();
  }

  select(id: string | null) {
    this.set({ selectedId: id });
  }

  setAutopilot(on: boolean) {
    this.set({ autopilot: on });
    if (on) {
      // Clear anything already waiting for a person, oldest first.
      void this.pump();
    }
  }

  /** For browsers without an on-device model: route the masked text in the cloud through the same SDK call. */
  useCloudRouting() {
    const { config } = this.state;
    this.models = makeModels(getServices().ai, TEAM_IDS, config.cloudModel, true);
    this.set({ cloudRouting: true });
    void this.pump();
  }

  async downloadModel() {
    if (!this.models) return;
    this.set({ downloadProgress: 0, device: 'downloading' });
    try {
      await downloadDeviceModel(this.models, (p) => this.set({ downloadProgress: p }));
    } catch {
      /* status check below tells the user what happened */
    }
    this.set({ downloadProgress: null, device: await deviceStatus() });
    void this.pump();
  }

  async refreshDevice() {
    this.set({ device: await deviceStatus() });
    void this.pump();
  }

  retry(id: string) {
    this.patchTicket(id, { status: 'waiting', error: undefined });
    void this.pump();
  }

  /** Route waiting tickets one at a time, oldest first. Runs autopilot steps inline so the bank grows in order. */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        if (!this.canRoute || !this.models) break;
        if (this.state.autopilot) {
          const pending = this.state.tickets.find((t) => t.status === 'unsure' || t.status === 'answered');
          if (pending) {
            await this.autopilotStep(pending.id);
            continue;
          }
        }
        const next = this.state.tickets.find((t) => t.status === 'waiting');
        if (!next) break;
        await this.route(next.id);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async autopilotStep(id: string) {
    const t = this.ticket(id);
    if (!t) return;
    if (t.status === 'unsure') await this.askGemini(id);
    const after = this.ticket(id);
    if (after?.status === 'answered' && after.audit) await this.confirm(id, after.audit.team);
    else if (after?.status === 'unsure') this.set({ autopilot: false }); // Gemini failed: stop and let a person decide
  }

  private async route(id: string) {
    const t = this.ticket(id);
    if (!t || !this.models) return;
    const { config, examples } = this.state;
    this.patchTicket(id, { status: 'routing', bankSize: examples.length });
    const models = this.models;
    const result = await triage(t.raw, {
      teams: TEAMS,
      bank: examples,
      k: config.retrievalK,
      auditSampleRate: config.auditSampleRate,
      escalateOnDisagreement: config.escalateOnDisagreement,
      route: (prompt) => routeTicket(models.route, prompt),
    });
    if (result.device.error && !result.device.team) {
      this.patchTicket(id, { status: 'error', triage: result, error: friendlyError(result.device.error) });
      return;
    }
    if (!result.decision.escalate && result.device.team) {
      this.patchTicket(id, { status: 'routed', triage: result, finalTeam: result.device.team, decidedBy: 'device' });
      await this.log(id);
      return;
    }
    this.patchTicket(id, { status: 'unsure', triage: result });
  }

  /** The staffer spotted something personal the rules missed: mask it everywhere in this ticket. */
  maskWord(id: string, word: string) {
    const t = this.ticket(id);
    const w = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!t?.triage || t.status !== 'unsure' || w.length < 2) return;
    const extraMasks = [...(t.extraMasks ?? []), w];
    this.patchTicket(id, { extraMasks, triage: { ...t.triage, masked: mask(t.raw, extraMasks) } });
  }

  /** Only called after the staffer has seen the masked text (or turned on autopilot). */
  async askGemini(id: string) {
    const t = this.ticket(id);
    if (!t?.triage || !this.models || t.status === 'asking') return;
    this.patchTicket(id, { status: 'asking', error: undefined, note: undefined });
    const prompt = auditPrompt(t.triage, TEAMS);
    for (let attempt = 0; ; attempt++) {
      try {
        const audit = await auditTicket(this.models.audit, prompt);
        this.patchTicket(id, { status: 'answered', audit, note: undefined });
        return;
      } catch (e) {
        const wait = perMinuteWait(e);
        if (wait && attempt < 2) {
          this.patchTicket(id, {
            note: `Gemini's free tier allows 15 requests a minute. Trying again in ${Math.ceil(wait)} s.`,
          });
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        this.patchTicket(id, { status: 'unsure', error: friendlyError(e), note: undefined });
        return;
      }
    }
  }

  /** A person's final call. Saves the masked ticket as a new example for this desk. */
  async confirm(id: string, team: string) {
    const t = this.ticket(id);
    if (!t?.triage) return;
    const decidedBy = t.audit && t.audit.team === team ? 'gemini' : 'staff';
    const { uid } = this.state;
    const { db } = getServices();
    this.patchTicket(id, { status: 'done', finalTeam: team, decidedBy, savedAs: this.state.examples.length + 1 });
    if (uid) {
      await addExample(db, uid, {
        text: t.triage.masked.text,
        team,
        source: decidedBy === 'gemini' ? 'gemini-confirmed' : 'staff',
      });
    }
    await this.log(id);
    void this.pump();
  }

  private async log(id: string) {
    const t = this.ticket(id);
    const { uid } = this.state;
    if (!t?.triage || !t.finalTeam || !uid) return;
    const ev: TicketEvent = {
      ticketId: t.id,
      devicePred: t.triage.device.team,
      knnPred: t.triage.knn,
      escalated: t.triage.decision.escalate,
      why: t.triage.decision.why,
      cloudTeam: t.audit?.team ?? null,
      finalTeam: t.finalTeam,
      decidedBy: t.decidedBy ?? 'staff',
      routeWhere: t.triage.device.where,
      deviceMs: t.triage.device.ms,
      cloudMs: t.audit?.ms ?? null,
      bankSize: t.bankSize ?? 0,
      gold: t.gold,
    };
    try {
      await logEvent(getServices().db, uid, ev);
    } catch {
      /* stats are best effort; routing already happened */
    }
  }

  async reset() {
    const { uid, config } = this.state;
    if (!uid) return;
    const { db } = getServices();
    this.set({ autopilot: false, tickets: [], selectedId: null });
    await resetDesk(db, uid);
    const seed = BANK_ORDER.slice(0, config.seedBankSize).map((t) => ({ id: t.id, team: t.team, text: mask(t.text).text }));
    await seedIfEmpty(db, uid, seed);
    this.nextDemo = 0;
    writeNext(0);
    this.addDemoTickets(6);
  }
}

export const desk = new Desk();

if (import.meta.env.DEV) (globalThis as unknown as { desk: Desk }).desk = desk;
