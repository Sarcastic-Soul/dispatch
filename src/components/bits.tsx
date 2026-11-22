import { useId, useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { TEAMS } from '../core/data';
import type { MaskSpan } from '../core/types';

/** Masked text with each [TOKEN] highlighted. With onMask, every other word can be clicked to mask it too. */
export function MaskedText({ text, onMask }: { text: string; onMask?: (word: string) => void }) {
  const parts = text.split(/(\[(?:STUDENT_ID|EMAIL|PHONE|NAME)\])/);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2) return <mark key={i}>{p}</mark>;
        if (!onMask) return <span key={i}>{p}</span>;
        return p.split(/(\s+)/).map((w, j) =>
          /^\s*$/.test(w) ? (
            w
          ) : (
            <button key={`${i}-${j}`} type="button" className="w" tabIndex={-1} title="Mask this word" onClick={() => onMask(w)}>
              {w}
            </button>
          ),
        );
      })}
    </>
  );
}

/** Keyboard-friendly way to mask a word the rules missed. */
export function MaskMore({ onMask }: { onMask: (word: string) => void }) {
  const id = useId();
  const [word, setWord] = useState('');
  return (
    <form
      className="maskmore"
      onSubmit={(e) => {
        e.preventDefault();
        if (word.trim()) onMask(word.trim());
        setWord('');
      }}
    >
      <label htmlFor={id}>Something personal still showing? Click the word above, or type it:</label>
      <span>
        <input id={id} value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
        <button className="btn" type="submit" disabled={!word.trim()}>
          Mask it
        </button>
      </span>
    </form>
  );
}

/** Raw text with the parts that will be masked underlined, so staff can see what is held back. */
export function RawText({ text, spans }: { text: string; spans: MaskSpan[] }) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((s, i) => {
    out.push(text.slice(pos, s.start));
    out.push(
      <span key={i} className="pii" title={`Masked before any model sees it (${s.kind.toLowerCase().replace('_', ' ')})`}>
        {text.slice(s.start, s.end)}
      </span>,
    );
    pos = s.end;
  });
  out.push(text.slice(pos));
  return <>{out}</>;
}

export function TeamPicker({
  initial,
  label,
  onPick,
  onCancel,
}: {
  initial?: string | null;
  label: string;
  onPick: (team: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [team, setTeam] = useState(initial ?? TEAMS[0].id);
  return (
    <div className="picker">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={team} onChange={(e) => setTeam(e.target.value)} autoFocus>
        {TEAMS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="btns">
        <button className="btn pri" onClick={() => onPick(team)}>
          <Check className="ic" aria-hidden />
          Save this team
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
