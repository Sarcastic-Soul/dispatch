// Plain TF-IDF retrieval over the example bank. No AI involved.
// Same algorithm as eval/harness/src/retrieval.js, which produced the measured results.

const STOP = new Set(
  ("a an and are as at be but by for from has have i im i'm in is it its me my no not of on or our so " +
    "that the this to was we were with you your can cant can't please hi hello thanks thank get got just").split(' '),
);

export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) ?? [];
}

type Vec = Map<string, number>;

export interface Index {
  idf: (w: string) => number;
  vecs: Vec[];
}

export function buildIndex(docs: string[][]): Index {
  const df = new Map<string, number>();
  for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) ?? 0) + 1);
  const n = docs.length;
  const idf = (w: string) => Math.log((n + 1) / ((df.get(w) ?? 0) + 1)) + 1;
  return { idf, vecs: docs.map((doc) => normalise(weigh(doc, idf))) };
}

function weigh(tokens: string[], idf: (w: string) => number): Vec {
  const tf = new Map<string, number>();
  for (const w of tokens) tf.set(w, (tf.get(w) ?? 0) + 1);
  const v: Vec = new Map();
  for (const [w, c] of tf) v.set(w, (1 + Math.log(c)) * idf(w));
  return v;
}

function normalise(v: Vec): Vec {
  let s = 0;
  for (const x of v.values()) s += x * x;
  const norm = Math.sqrt(s) || 1;
  for (const [w, x] of v) v.set(w, x / norm);
  return v;
}

export interface Hit {
  i: number;
  score: number;
}

export function topK(index: Index, queryTokens: string[], k: number): Hit[] {
  const q = normalise(weigh(queryTokens, index.idf));
  const scored = index.vecs.map((v, i) => {
    let s = 0;
    for (const [w, x] of q) s += x * (v.get(w) ?? 0);
    return { i, score: s };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, k);
}

/** Similarity-weighted vote; ties go to the single nearest neighbour's team. */
export function knnVote(neighbours: { team: string; score: number }[]): string | null {
  if (!neighbours.length) return null;
  const tally = new Map<string, number>();
  for (const { team, score } of neighbours) tally.set(team, (tally.get(team) ?? 0) + score);
  let best = neighbours[0].team;
  let bestScore = -1;
  for (const [team, s] of tally) {
    if (s > bestScore + 1e-9) {
      best = team;
      bestScore = s;
    }
  }
  return best;
}

/** Retrieve the k most similar examples (most similar LAST, nearest the new ticket in the prompt) and the kNN vote. */
export function retrieve<T extends { text: string; team: string }>(bank: T[], text: string, k: number) {
  if (!bank.length) return { examples: [] as T[], knn: null as string | null };
  const index = buildIndex(bank.map((b) => tokenize(b.text)));
  const hits = topK(index, tokenize(text), Math.min(k, bank.length));
  return {
    examples: hits.map((h) => bank[h.i]).reverse(),
    knn: knnVote(hits.map((h) => ({ team: bank[h.i].team, score: h.score }))),
  };
}
