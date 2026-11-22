import { useState } from 'react';
import { Check, Cloud, Cpu, NotePencil, Plus, Question, SpinnerGap, Warning } from '@phosphor-icons/react';
import type { Desk, DeskState, QueueTicket } from '../state/desk';
import { clock } from './format';

function Status({ t }: { t: QueueTicket }) {
  switch (t.status) {
    case 'waiting':
      return <span className="st">waiting</span>;
    case 'routing':
      return (
        <span className="st">
          <SpinnerGap className="ic spin" aria-hidden />
          routing…
        </span>
      );
    case 'routed':
      return (
        <span className="st">
          {t.triage?.device.where === 'in_cloud' ? <Cloud className="ic" aria-hidden /> : <Cpu className="ic" aria-hidden />}
          {t.triage?.device.where === 'in_cloud' ? 'routed in cloud' : 'routed on device'}
        </span>
      );
    case 'unsure':
    case 'answered':
      return (
        <span className="st st-unsure">
          <Question className="ic" aria-hidden />
          {t.status === 'answered' ? 'Gemini answered, your call' : 'unsure, needs review'}
        </span>
      );
    case 'asking':
      return (
        <span className="st">
          <SpinnerGap className="ic spin" aria-hidden />
          asking Gemini…
        </span>
      );
    case 'done':
      return (
        <span className="st">
          <Check className="ic" aria-hidden />
          {t.decidedBy === 'gemini' ? 'checked by cloud, saved' : 'set by staff, saved'}
        </span>
      );
    case 'error':
      return (
        <span className="st st-err">
          <Warning className="ic" aria-hidden />
          could not route
        </span>
      );
  }
}

function teamLabel(t: QueueTicket) {
  if (t.finalTeam) return t.finalTeam;
  const guess = t.triage?.device.team;
  return guess ? `${guess}?` : '';
}

export function Queue({ state, desk }: { state: DeskState; desk: Desk }) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const open = state.tickets.filter((t) => !['routed', 'done'].includes(t.status)).length;
  const review = state.tickets.filter((t) => t.status === 'unsure' || t.status === 'answered').length;
  const newestFirst = [...state.tickets].reverse();
  const ready = state.phase === 'ready';

  return (
    <section className="queue" aria-labelledby="qh">
      <h2 id="qh">
        Queue{' '}
        <span>
          {open} open · {review} need review
        </span>
      </h2>
      <p className="sub">Newest first. Each ticket is routed on this computer.</p>

      <div className="tools">
        <button className="btn" onClick={() => desk.addDemoTickets(5)} disabled={!ready}>
          <Plus className="ic" aria-hidden />
          5 more tickets
        </button>
        <button className="btn" onClick={() => setWriting((w) => !w)} aria-expanded={writing} disabled={!ready}>
          <NotePencil className="ic" aria-hidden />
          Write a ticket
        </button>
      </div>

      {writing && (
        <form
          className="compose"
          onSubmit={(e) => {
            e.preventDefault();
            desk.addTypedTicket(draft);
            setDraft('');
            setWriting(false);
          }}
        >
          <label htmlFor="draft">New ticket, as a student or staff member would write it</label>
          <textarea
            id="draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. my canvas quiz says access denied, exam closes at 5. N01234567"
            autoFocus
          />
          <div className="btns">
            <button className="btn pri" type="submit" disabled={!draft.trim()}>
              Add to queue
            </button>
          </div>
        </form>
      )}

      <label className="switch">
        <input type="checkbox" checked={state.autopilot} onChange={(e) => desk.setAutopilot(e.target.checked)} disabled={!ready} />
        <span>
          Autopilot
          <small>Approve unsure tickets for me and accept Gemini's team</small>
        </span>
      </label>

      {newestFirst.length === 0 ? (
        <p className="empty">No tickets yet.</p>
      ) : (
        <ul>
          {newestFirst.map((t) => (
            <li key={t.id}>
              <button className="item" aria-current={state.selectedId === t.id} onClick={() => desk.select(t.id)}>
                <span className="l1">
                  <time>{clock(t.receivedAt)}</time>
                  <span className="snip">{t.raw}</span>
                </span>
                <span className="l2">
                  <span className="team">{teamLabel(t)}</span>
                  <Status t={t} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
