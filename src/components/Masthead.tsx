import { Cloud, Cpu, Warning } from '@phosphor-icons/react';
import type { DeskState } from '../state/desk';

const DEVICE_TEXT: Record<DeskState['device'], string> = {
  checking: 'Checking for the on-device model…',
  available: 'On-device model ready · built into Chrome',
  downloadable: 'On-device model not downloaded yet',
  downloading: 'Downloading the on-device model…',
  unavailable: 'No on-device model on this computer',
  unsupported: 'This browser has no on-device model',
};

export function Masthead({ state }: { state: DeskState }) {
  const ok = state.device === 'available' || state.device === 'checking';
  const model = state.config.cloudModel.replace(/^gemini-/, 'Gemini ').replace(/-flash-lite$/, ' Flash-Lite').replace(/-flash$/, ' Flash');
  return (
    <header className="mast">
      <div>
        <h1>Dispatch</h1>
        <p>Northfield State University · IT Service Desk</p>
      </div>
      <ul className="chips" aria-label="System status">
        <li className={ok ? 'chip' : 'chip warn-chip'}>
          {ok ? <Cpu className="ic" aria-hidden /> : <Warning className="ic" aria-hidden />}
          {state.cloudRouting && !ok ? 'Routing in the cloud on masked text' : DEVICE_TEXT[state.device]}
        </li>
        <li className="chip">
          <Cloud className="ic" aria-hidden />
          Cloud · {model} via Firebase AI Logic
        </li>
      </ul>
    </header>
  );
}
