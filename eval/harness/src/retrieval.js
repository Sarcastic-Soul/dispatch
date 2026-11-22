// Plain-JS TF-IDF retrieval. No AI involved.
const STOP = new Set(('a an and are as at be but by for from has have i im i\'m in is it its me my no not of on or our so ' +
  'that the this to was we were with you your can cant can\'t please hi hello thanks thank get got just').split(' '));

export function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) ?? [];
}

export function buildIndex(docs) {
  const df = new Map();
  for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) || 0) + 1);
  const n = docs.length;
  const idf = (w) => Math.log((n + 1) / ((df.get(w) || 0) + 1)) + 1;
  const vecs = docs.map((doc) => normalise(weigh(doc, idf)));
  return { idf, vecs };
}

function weigh(tokens, idf) {
  const tf = new Map();
  for (const w of tokens) tf.set(w, (tf.get(w) || 0) + 1);
  const v = new Map();
  for (const [w, c] of tf) v.set(w, (1 + Math.log(c)) * idf(w));
  return v;
}

function normalise(v) {
  let s = 0;
  for (const x of v.values()) s += x * x;
  const norm = Math.sqrt(s) || 1;
  for (const [w, x] of v) v.set(w, x / norm);
  return v;
}

export function topK(index, queryTokens, k) {
  const q = normalise(weigh(queryTokens, index.idf));
  const scored = index.vecs.map((v, i) => {
    let s = 0;
    for (const [w, x] of q) s += x * (v.get(w) || 0);
    return { i, score: s };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, k);
}

// Similarity-weighted vote; ties go to the single nearest neighbour's team.
export function knnVote(neighbours) {
  if (!neighbours.length) return null;
  const tally = new Map();
  for (const { team, score } of neighbours) tally.set(team, (tally.get(team) || 0) + score);
  let best = neighbours[0].team, bestScore = -1;
  for (const [team, s] of tally) if (s > bestScore + 1e-9) { best = team; bestScore = s; }
  return best;
}
