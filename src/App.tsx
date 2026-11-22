import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { desk } from './state/desk';
import { Masthead } from './components/Masthead';
import { DeviceNotice } from './components/DeviceNotice';
import { Queue } from './components/Queue';
import { Memo } from './components/Memo';
import { Learning } from './components/Learning';

let started = false;

export default function App() {
  const state = useSyncExternalStore(desk.subscribe, desk.getState);
  const memoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started) return;
    started = true;
    void desk.start();
  }, []);

  // On narrow screens the memo sits below the queue: bring it into view when a ticket is picked.
  useEffect(() => {
    if (state.selectedId && window.matchMedia('(max-width: 820px)').matches) {
      memoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [state.selectedId]);

  return (
    <div className="page">
      <Masthead state={state} />
      {state.phase === 'starting' && (
        <div className="boot" role="status">
          <p>Opening your desk…</p>
        </div>
      )}
      {state.phase === 'failed' && (
        <div className="boot" role="alert">
          <h2>Dispatch could not start</h2>
          <p>{state.startError}</p>
          <button className="btn pri" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      {state.phase === 'ready' && (
        <>
          <main className="main">
            <div>
              <DeviceNotice state={state} desk={desk} />
              <Queue state={state} desk={desk} />
            </div>
            <div ref={memoRef}>
              <Memo state={state} desk={desk} />
            </div>
          </main>
          <Learning state={state} />
          <footer className="foot">
            <span>All tickets are synthetic. Each visitor gets a private desk, signed in anonymously.</span>
            <button
              className="btn"
              onClick={() => {
                if (confirm('Start over? This deletes the examples and stats on your desk.')) void desk.reset();
              }}
            >
              <ArrowCounterClockwise className="ic" aria-hidden />
              Reset my desk
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
