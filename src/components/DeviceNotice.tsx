import { Cloud, DownloadSimple } from '@phosphor-icons/react';
import type { Desk, DeskState } from '../state/desk';

/** Shown when tickets cannot be routed on this computer yet. */
export function DeviceNotice({ state, desk }: { state: DeskState; desk: Desk }) {
  if (state.phase !== 'ready' || state.device === 'available' || state.device === 'checking' || state.cloudRouting) return null;

  if (state.device === 'downloadable' || state.device === 'downloading') {
    return (
      <div className="notice" role="status">
        <h3>Download the on-device model</h3>
        <p>
          Chrome has a built-in model, but it is not on this computer yet. It downloads once (a few GB) and then routes
          tickets without a network.
        </p>
        {state.downloadProgress !== null ? (
          <>
            <p>Downloading… {Math.round(state.downloadProgress * 100)}%</p>
            <progress value={state.downloadProgress} max={1} aria-label="Download progress" />
          </>
        ) : (
          <div className="btns">
            <button className="btn pri" onClick={() => void desk.downloadModel()}>
              <DownloadSimple className="ic" aria-hidden />
              Download model
            </button>
            <button className="btn" onClick={() => desk.useCloudRouting()}>
              <Cloud className="ic" aria-hidden />
              Route in the cloud instead
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="notice" role="status">
      <h3>No on-device model here</h3>
      <p>
        Dispatch routes tickets with the model built into desktop Chrome (138 or newer, with enough memory). This browser
        or computer does not have it.
      </p>
      <p>
        You can still try it: tickets are masked on this computer first, then routed by Gemini in the cloud through the same
        Firebase AI Logic call.
      </p>
      <div className="btns">
        <button className="btn pri" onClick={() => desk.useCloudRouting()}>
          <Cloud className="ic" aria-hidden />
          Route in the cloud instead
        </button>
        <button className="btn" onClick={() => void desk.refreshDevice()}>
          Check again
        </button>
      </div>
    </div>
  );
}
