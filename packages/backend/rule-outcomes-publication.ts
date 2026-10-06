import type {FastifyInstance} from 'fastify';
import {readState, storageConfiguration} from './storage.ts';
import {currentValuationHistory} from './judgment.ts';
import {currentTotalReturnHistory, refreshTotalReturnHistory} from './total-return-history.ts';
import {ruleOutcomesForHistory} from './rule-outcomes.ts';
import {OUTCOME_INDICES, type OutcomeIndex} from './total-return-source.ts';

export async function ruleOutcomesPublication(index: OutcomeIndex) {
  const [state, returns] = await Promise.all([readState(), currentTotalReturnHistory(index)]);
  const valuation = currentValuationHistory(state, index);
  if (valuation.index_code !== index) throw new Error('rule_outcomes_pe_identity_mismatch');
  return {
    index_code: index, index_name: OUTCOME_INDICES[index].name,
    total_return_code: returns.total_return_code, source_url: returns.source_url,
    checked_at: returns.checked_at,
    ...ruleOutcomesForHistory(valuation.points, returns.points),
  };
}
export type RuleOutcomesPublication = Awaited<ReturnType<typeof ruleOutcomesPublication>>;

/** One API registration line; official checks also append the dividend-inclusive closes. */
export function registerRuleOutcomes(app: FastifyInstance, {networkChecks = false}: {networkChecks?: boolean} = {}) {
  app.get<{Querystring: {index?: string}}>('/publication/rule-outcomes', async (req, reply) => {
    const index = req.query.index ?? '000300';
    if (!Object.hasOwn(OUTCOME_INDICES, index)) return reply.code(400).send({error: 'unknown_index'});
    return ruleOutcomesPublication(index as OutcomeIndex);
  });
  let refreshing: Promise<unknown> | null = null;
  app.addHook('onResponse', async (req, reply) => {
    if (!networkChecks || storageConfiguration().readOnly || storageConfiguration().testMode || reply.statusCode >= 400) return;
    const path = req.url.split('?')[0];
    const explicitCheck = req.method === 'POST' && ['/reading/research/check', '/owner/research/check'].includes(path);
    // Automatic checks run inside the research service. Its next status/publication read
    // brings the return series up to that completed check without changing that service.
    const afterAutomaticCheck = req.method === 'GET' && ['/reading/research', '/publication/rule-outcomes'].includes(path);
    if (!explicitCheck && !afterAutomaticCheck) return;
    if (refreshing) return;
    if (!explicitCheck) {
      const latestCheck = (await readState()).research_state?.checks.at(-1)?.finished_at;
      if (!latestCheck) return;
      const histories = await Promise.all((Object.keys(OUTCOME_INDICES) as OutcomeIndex[]).map(currentTotalReturnHistory));
      if (histories.every(history => history.checked_at && history.checked_at >= latestCheck)) return;
    }
    refreshing = Promise.allSettled((Object.keys(OUTCOME_INDICES) as OutcomeIndex[]).map(index => refreshTotalReturnHistory(index))).then(results => {
      if (results.some(result => result.status === 'rejected')) console.warn('total_return_check_partial');
    }).finally(() => {refreshing = null;});
  });
  app.addHook('onClose', async () => {await refreshing;});
}
