import type { DeskState } from '../state/desk';
import { computeStats, firstAcc, lastAcc, lastKept, MEASURED, pct, type Stats } from '../state/stats';

const W = 540;
const H = 290;
const L = 54;
const R = 520;
const T = 24;
const B = 240;

function Chart({ stats, bank }: { stats: Stats; bank: number }) {
  const maxX = Math.max(130, Math.ceil((Math.max(bank, ...stats.windows.map((w) => w.bank)) + 10) / 10) * 10);
  const x = (v: number) => L + ((R - L) * v) / maxX;
  const y = (v: number) => B - (B - T) * v;
  const line = (pts: { x: number; y: number }[]) => pts.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const acc = MEASURED.deviceAcc.map((p) => ({ x: p.bank, y: p.acc }));
  const kept = MEASURED.kept.map((p) => ({ x: p.bank, y: p.share }));
  const xTicks = [...new Set([0, ...MEASURED.deviceAcc.map((p) => p.bank), ...(maxX > 160 ? [Math.round(maxX / 40) * 20] : [])])];
  const mid = acc[Math.floor(acc.length / 2)];
  const k1 = kept[kept.length - 2];
  const k2 = kept[kept.length - 1];
  const h = MEASURED.hybrid;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Measured: on-device answers kept ${MEASURED.kept.map((k) => `${pct(k.share)} at ${k.bank}`).join(', ')} examples. On-device accuracy ${pct(firstAcc.acc)} with ${firstAcc.bank} examples, ${pct(lastAcc.acc)} with ${lastAcc.bank}. Hybrid accuracy at ${h.bank}: ${pct(h.acc)}; all-cloud ${pct(h.allCloudAcc)}.${stats.windows.length ? ` This desk: ${stats.windows.map((w) => `${pct(w.share)} kept at about ${Math.round(w.bank)} examples`).join(', ')}.` : ''}`}
    >
      <g className="grid">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={R} y1={y(v)} y2={y(v)} className={v === 0 ? 'base' : ''} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={B + 18} textAnchor="middle">
            {v}
          </text>
        ))}
        <text x={(L + R) / 2} y={B + 38} textAnchor="middle">
          examples saved
        </text>
      </g>
      <line className="sys" x1={L} x2={R} y1={y(h.acc)} y2={y(h.acc)} />
      <text className="sysl" x={R} y={y(h.acc) - 7} textAnchor="end">
        Hybrid accuracy at {h.bank}: {pct(h.acc)} (all-cloud {pct(h.allCloudAcc)})
      </text>
      <polyline className="acc" points={line(acc)} />
      {acc.map((p) => (
        <circle key={p.x} className="acc" cx={x(p.x)} cy={y(p.y)} r={3.5} />
      ))}
      <text className="accl" x={x(mid.x)} y={y(mid.y) - 12} textAnchor="middle">
        On-device accuracy
      </text>
      <polyline className="kept" points={line(kept)} />
      {kept.map((p) => (
        <g key={p.x}>
          <circle className="kept" cx={x(p.x)} cy={y(p.y)} r={5} />
          <text className="val" x={x(p.x)} y={y(p.y) + 20} textAnchor="middle">
            {pct(p.y)}
          </text>
        </g>
      ))}
      <text className="keptl" x={x((k1.x + k2.x) / 2)} y={y((k1.y + k2.y) / 2) + 32} textAnchor="middle">
        Kept on device
      </text>
      {stats.windows.map((w, i) => (
        <rect key={i} className="live-pt" x={x(w.bank) - 5} y={y(w.share) - 5} width={10} height={10} />
      ))}
    </svg>
  );
}

export function Learning({ state }: { state: DeskState }) {
  const stats = computeStats(state.events);
  const live = stats.total >= 10;
  const inTen = live ? Math.round((10 * stats.kept) / stats.total) : Math.round(10 * lastKept.share);
  const bank = state.examples.length;
  const learned = state.examples.filter((e) => e.source !== 'seed').length;

  return (
    <section className="learn" aria-labelledby="lh">
      <div className="learn-in">
        <div>
          {live ? (
            <p className="live">THIS DESK, {stats.total} TICKETS</p>
          ) : (
            <p className="live">
              MEASURED ON {MEASURED.tickets} TEST TICKETS, {lastKept.bank} EXAMPLES
            </p>
          )}
          <h2 id="lh">
            {inTen} in 10
            <small>tickets never left the browser</small>
          </h2>
          <p className="lead">
            Every ticket a person confirms is saved, masked, as an example for this desk. With more examples, the on-device
            answer and the similar past tickets agree more often, so fewer tickets need the cloud.
          </p>
          <div className="facts">
            <div>
              <b>{bank}</b>
              <span>
                examples on this desk ({learned} learned here, {bank - learned} starter)
              </span>
            </div>
            <div>
              <b>
                {stats.cloudCalls} of {stats.total}
              </b>
              <span>tickets sent to Gemini on this desk</span>
            </div>
            <div>
              <b>{stats.deviceAcc.n ? pct(stats.deviceAcc) : `${pct(firstAcc.acc)} → ${pct(lastAcc.acc)}`}</b>
              <span>
                {stats.deviceAcc.n
                  ? `on-device accuracy on ${stats.deviceAcc.n} labelled demo tickets (final: ${pct(stats.systemAcc)})`
                  : `measured on-device accuracy, with ${firstAcc.bank || 'no'} examples and with ${lastAcc.bank}`}
              </span>
            </div>
          </div>
        </div>
        <figure className="fig">
          <Chart stats={stats} bank={bank} />
          <div className="legend">
            <span>
              <i />
              kept on device, measured
            </span>
            <span>
              <i className="g" />
              on-device accuracy, measured
            </span>
            <span>
              <i className="o" />
              kept on device, this desk (per 10 tickets)
            </span>
          </div>
          <figcaption>Measured on {MEASURED.tickets} synthetic test tickets; see eval/RESULTS.md in the repo.</figcaption>
        </figure>
      </div>
    </section>
  );
}
