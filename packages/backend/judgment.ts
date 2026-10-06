// Reader-facing rule judgment: bundled official history plus any newer rows this machine fetched.
import {readState, mutateState, type State} from './storage.ts';
import {seedHistory, refreshPeHistory, mergePeHistory, type ValuationHistory} from './valuation-history.ts';
import {evaluateValuationRule} from './valuation-rule.ts';

export function currentValuationHistory(state: State): ValuationHistory {
  const seed = seedHistory();
  const stored = state.valuation_history;
  if (!stored) return seed;
  return {...stored, points: mergePeHistory(seed.points, stored.points)};
}

export async function judgmentPublication() {
  const state = await readState();
  const history = currentValuationHistory(state);
  const result = evaluateValuationRule(history.points);
  return result && {...result, source_url: history.source_url, checked_at: history.checked_at};
}

/** Fetches newer official rows; a failure keeps the last good history and its dates. */
export async function refreshValuationState(fetcher?: typeof fetch) {
  const before = currentValuationHistory(await readState());
  const after = await refreshPeHistory(before, {fetcher});
  // Only rows beyond the bundled seed are stored; the seed ships with every build.
  const seedLast = seedHistory().points.at(-1)!.date;
  const revisedFrom = new Date(`${seedLast}T00:00:00Z`);
  revisedFrom.setUTCDate(revisedFrom.getUTCDate() - 30);
  const keepFrom = revisedFrom.toISOString().slice(0, 10);
  await mutateState(async state => {
    state.valuation_history = {...after, points: after.points.filter(p => p.date >= keepFrom)};
  });
  return {rows: after.points.length, last: after.points.at(-1)?.date ?? null};
}
