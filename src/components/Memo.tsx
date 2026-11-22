import { useState } from 'react';
import {
  ArrowsLeftRight,
  Check,
  CheckCircle,
  Cloud,
  Cpu,
  LockKey,
  PaperPlaneTilt,
  PencilSimple,
  Question,
  SpinnerGap,
  WarningDiamond,
} from '@phosphor-icons/react';
import { teamName } from '../core/data';
import type { Desk, DeskState, QueueTicket } from '../state/desk';
import { MaskedText, MaskMore, RawText, TeamPicker } from './bits';
import { clock, secs } from './format';

function maskedSummary(t: QueueTicket): string {
  const kinds = new Set(t.triage?.masked.spans.map((s) => s.kind));
  const names: string[] = [];
  if (kinds.has('STUDENT_ID')) names.push('student ID');
  if (kinds.has('NAME')) names.push('name');
  if (kinds.has('EMAIL')) names.push('email');
  if (kinds.has('PHONE')) names.push('phone number');
  if (!names.length) return 'Nothing personal was found to mask.';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `The ${list} ${names.length === 1 ? 'is' : 'are'} masked here, on your computer.`;
}

function payloadHeading(t: QueueTicket): string {
  if (t.status === 'unsure') return 'What would leave this computer';
  if (t.audit || t.status === 'asking') return t.status === 'done' ? 'What Gemini saw' : 'What Gemini sees';
  return 'Saved as an example, masked';
}

function payloadNote(t: QueueTicket): string {
  if (t.status === 'unsure')
    return 'If you send it, Gemini gets only this text, the team list and the masked similar past tickets.';
  if (t.audit || t.status === 'asking') return 'Gemini got only this text, the team list and the masked similar past tickets.';
  return 'No cloud model saw this ticket. This masked text is kept as an example for your desk.';
}

function Lede({ t }: { t: QueueTicket }) {
  const why = t.triage?.decision.why;
  if (t.status === 'waiting') return <p className="lede">Waiting its turn for the on-device model.</p>;
  if (t.status === 'routing') return <p className="lede">The on-device model is reading this ticket now.</p>;
  if (t.status === 'error') return <p className="lede">The on-device model could not route this ticket.</p>;
  if (t.status === 'routed')
    return (
      <p className="lede">
        The on-device answer matches the most similar past tickets, so Dispatch routed it here. The ticket text never
        left this computer.
      </p>
    );
  if (t.status === 'done')
    return <p className="lede">A person made the final call. The masked ticket is now an example this desk learns from.</p>;
  if (why === 'no-examples') return <p className="lede">This desk has no past tickets yet, so every ticket gets a second opinion.</p>;
  if (why === 'sample')
    return (
      <p className="lede">
        A spot check. The on-device answer looks fine, but a small share of tickets get a second opinion so the desk keeps
        measuring how often the on-device model is right.
      </p>
    );
  if (!t.triage?.device.team)
    return <p className="lede">The on-device model gave no usable answer, so this one needs a person to decide.</p>;
  return (
    <p className="lede">
      The on-device model and the most similar past tickets point to different teams, so this one needs a person to decide.
    </p>
  );
}

function DeviceAnswer({ t }: { t: QueueTicket }) {
  const tr = t.triage;
  if (!tr) return null;
  const agree = tr.examples.filter((e) => e.team === tr.knn).length;
  const nearest = [...tr.examples].reverse().slice(0, 3);
  const cloud = tr.device.where === 'in_cloud';
  return (
    <section className="block">
      <h3>{cloud ? 'First answer (cloud fallback)' : 'On-device answer'}</h3>
      <p className="team-big">
        {cloud ? <Cloud className="ic" aria-hidden /> : <Cpu className="ic" aria-hidden />}
        {tr.device.team ? teamName(tr.device.team) : 'No answer'}
      </p>
      <p className="timing">
        {cloud ? 'Routed in the cloud on masked text' : 'Routed by the model built into Chrome'} in {secs(tr.device.ms)}
        {tr.examples.length ? `, with ${tr.examples.length} similar past tickets in the prompt` : ', with no past tickets to learn from'}.
      </p>
      {tr.knn && (
        <p className="warn" style={{ marginTop: 12 }}>
          <WarningDiamond className="ic" aria-hidden />
          <span>
            Similar past tickets say <b>{teamName(tr.knn)}</b> ({agree} of {tr.examples.length}).{' '}
            {tr.device.team === tr.knn ? 'They agree.' : 'The two disagree.'}
          </span>
        </p>
      )}
      {nearest.length > 0 && (
        <>
          <p className="similar-h">Most similar past tickets</p>
          <ul className="similar">
            {nearest.map((e) => (
              <li key={e.id}>
                <span>{e.text}</span>
                <b>{teamName(e.team)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function Memo({ state, desk }: { state: DeskState; desk: Desk }) {
  const t = state.tickets.find((x) => x.id === state.selectedId);
  const [picking, setPicking] = useState<string | null>(null);
  if (!t) return <HowItWorks />;
  const tr = t.triage;
  const isPicking = picking === t.id;
  const pick = (team: string) => {
    setPicking(null);
    void desk.confirm(t.id, team);
  };

  return (
    <article className="memo" aria-labelledby="mh" key={t.id}>
      <p className="meta">
        <span>{t.gold ? `Demo ticket ${t.id.split('-')[0]}` : 'Typed ticket'}</span>
        <span>Received {clock(t.receivedAt)}</span>
        {(t.status === 'unsure' || t.status === 'answered') && (
          <span className="st st-unsure">
            <Question className="ic" aria-hidden />
            unsure, needs review
          </span>
        )}
      </p>
      <h2 id="mh">{tr ? <RawText text={t.raw} spans={tr.masked.spans} /> : t.raw}</h2>
      <Lede t={t} />
      <div className="rule" aria-hidden="true" />

      {(t.status === 'waiting' || t.status === 'routing') && (
        <p className="waiting" role="status">
          <SpinnerGap className="ic spin" aria-hidden />
          {t.status === 'routing' ? 'Routing on this computer…' : 'In the queue'}
        </p>
      )}

      {t.status === 'error' && (
        <>
          <p className="errbox">{t.error}</p>
          <div className="btns">
            <button className="btn pri" onClick={() => desk.retry(t.id)}>
              Try again
            </button>
          </div>
        </>
      )}

      {tr && t.status !== 'error' && (
        <div className="cols">
          <DeviceAnswer t={t} />
          <div>
            {t.status !== 'routed' && (
              <section className="block">
                <h3>{payloadHeading(t)}</h3>
                <p className="masked">
                  <MaskedText text={tr.masked.text} onMask={t.status === 'unsure' ? (w) => desk.maskWord(t.id, w) : undefined} />
                </p>
                <p className="note">
                  <LockKey className="ic" aria-hidden />
                  <span>
                    {maskedSummary(t)} {payloadNote(t)}
                  </span>
                </p>
                {t.status === 'unsure' && <MaskMore onMask={(w) => desk.maskWord(t.id, w)} />}
                {t.status === 'unsure' && !isPicking && (
                  <div className="btns">
                    <button className="btn pri" onClick={() => void desk.askGemini(t.id)}>
                      <PaperPlaneTilt className="ic" aria-hidden />
                      Send masked text to Gemini
                    </button>
                    <button className="btn" onClick={() => setPicking(t.id)}>
                      <PencilSimple className="ic" aria-hidden />
                      Route it myself
                    </button>
                  </div>
                )}
                {t.status === 'unsure' && isPicking && (
                  <TeamPicker label="Route to" initial={tr.device.team} onPick={pick} onCancel={() => setPicking(null)} />
                )}
                {t.error && <p className="errbox">{t.error}</p>}
              </section>
            )}
            <Verdict t={t} isPicking={isPicking} setPicking={setPicking} pick={pick} desk={desk} />
          </div>
        </div>
      )}
    </article>
  );
}

function Verdict({
  t,
  isPicking,
  setPicking,
  pick,
  desk,
}: {
  t: QueueTicket;
  isPicking: boolean;
  setPicking: (id: string | null) => void;
  pick: (team: string) => void;
  desk: Desk;
}) {
  if (t.status === 'routed') {
    return (
      <section className="answer quiet" aria-labelledby="vh">
        <h3 id="vh">Routed to {teamName(t.finalTeam)}</h3>
        <p className="why">
          No cloud model saw this ticket. Its text stayed in this browser; only the routing result was logged to your desk.
        </p>
        <hr />
        {isPicking ? (
          <TeamPicker label="Correct team" initial={t.finalTeam} onPick={pick} onCancel={() => setPicking(null)} />
        ) : (
          <>
            <p className="q">Wrong team?</p>
            <div className="btns">
              <button className="btn" onClick={() => setPicking(t.id)}>
                <ArrowsLeftRight className="ic" aria-hidden />
                Change team
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  if (t.status === 'unsure') {
    return (
      <section className="answer quiet" aria-labelledby="vh">
        <h3 id="vh">Gemini's answer</h3>
        <p className="why">Not asked yet. Nothing about this ticket has left this computer.</p>
      </section>
    );
  }

  if (t.status === 'asking') {
    return (
      <section className="answer" aria-labelledby="vh" aria-busy="true">
        <h3 id="vh">Gemini's answer</h3>
        <p className="waiting">
          <SpinnerGap className="ic spin" aria-hidden />
          Asking Gemini…
        </p>
        {t.note && <p className="via">{t.note}</p>}
      </section>
    );
  }

  if (t.status === 'answered' && t.audit) {
    const a = t.audit;
    return (
      <section className="answer" aria-labelledby="vh">
        <h3 id="vh">Gemini's answer</h3>
        <p className="why">
          <b>{teamName(a.team)}</b>
          {a.reason ? ` · ${a.reason}` : ''}
        </p>
        <p className="via">
          <Cloud className="ic" aria-hidden />
          Gemini via Firebase AI Logic · {secs(a.ms)}
        </p>
        <hr />
        {isPicking ? (
          <TeamPicker label="Route to" initial={a.team} onPick={pick} onCancel={() => setPicking(null)} />
        ) : (
          <>
            <p className="q">Your call</p>
            <div className="btns">
              <button className="btn pri" onClick={() => void desk.confirm(t.id, a.team)}>
                <Check className="ic" aria-hidden />
                Confirm
              </button>
              <button className="btn" onClick={() => setPicking(t.id)}>
                <ArrowsLeftRight className="ic" aria-hidden />
                Change team
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  if (t.status === 'done') {
    return (
      <section className="answer" aria-labelledby="vh">
        <h3 id="vh">Routed to {teamName(t.finalTeam)}</h3>
        {t.audit && (
          <p className="why">
            {t.decidedBy === 'gemini' ? 'Gemini suggested it and you confirmed.' : `Gemini suggested ${teamName(t.audit.team)}; you changed it.`}
            {t.audit.reason ? ` "${t.audit.reason}"` : ''}
          </p>
        )}
        {!t.audit && <p className="why">You set the team.</p>}
        <p className="saved">
          <CheckCircle className="ic" aria-hidden />
          Saved, masked, as example #{t.savedAs} for this desk. The next similar ticket can stay on this computer.
        </p>
      </section>
    );
  }

  return null;
}

function HowItWorks() {
  return (
    <article className="memo howto" aria-labelledby="mh">
      <h2 id="mh">How Dispatch routes a ticket</h2>
      <p className="lede">Pick a ticket from the queue to see each step.</p>
      <ol>
        <li>
          <span>
            <b>Mask</b>Student IDs, names, emails and phone numbers are replaced on this computer before any model sees the
            ticket.
          </span>
        </li>
        <li>
          <span>
            <b>Route on device</b>Chrome's built-in model picks a team, guided by the most similar past tickets from this
            desk.
          </span>
        </li>
        <li>
          <span>
            <b>Check</b>If its answer disagrees with those past tickets, the ticket is marked unsure.
          </span>
        </li>
        <li>
          <span>
            <b>Ask Gemini, with your OK</b>You see exactly what would leave the computer. Gemini suggests a team and a short
            reason.
          </span>
        </li>
        <li>
          <span>
            <b>Learn</b>Your final call is saved as a new example, so more tickets stay on device over time.
          </span>
        </li>
      </ol>
    </article>
  );
}
