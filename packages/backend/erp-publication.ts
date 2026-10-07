import type {FastifyInstance} from 'fastify';
import {erpForHistory} from './erp.ts';
import {hasReturns, isIndexCode, VALUATION_INDEXES, type ReturnIndexCode} from './valuation-indexes.ts';
import {readState, storageConfiguration} from './storage.ts';
import {currentValuationHistory} from './judgment.ts';
import {currentTotalReturnHistory} from './total-return-history.ts';
import {currentBondYields, refreshBondYields} from './bond-yield-history.ts';
import {OUTCOME_INDICES} from './total-return-source.ts';

/**
 * ERP from the same current data the judgment uses: PE as refreshed for the index, the
 * dividend-inclusive closes and the ten-year yield, each bundled seed plus later official rows.
 */
export async function currentErp(index: ReturnIndexCode) {
  const [state, bonds, returns] = await Promise.all([readState(), currentBondYields(), currentTotalReturnHistory(index)]);
  const valuation = currentValuationHistory(state, index);
  const lens = erpForHistory(valuation.points, bonds.points, returns.points);
  if (!lens) return null;
  return {...lens, index_code: index, index_name: VALUATION_INDEXES[index].name, pe_source_url: valuation.source_url, total_return_code: OUTCOME_INDICES[index].code, total_return_source_url: returns.source_url, bond_source_url: bonds.source_url, bond_checked_at: bonds.checked_at};
}

export function registerErp(app: FastifyInstance, {networkChecks = false}: {networkChecks?: boolean} = {}) {
  app.get<{Querystring: {index?: string}}>('/publication/erp', async (req, reply) => {
    const index = req.query.index ?? '000300';
    if (!isIndexCode(index)) return reply.code(400).send({error: 'unknown_index'});
    // ERP compares with the Chinese ten-year yield and needs a total-return series: the A-share trio.
    if (!hasReturns(index)) return reply.code(404).send({error: 'erp_unavailable'});
    return (await currentErp(index)) ?? reply.code(404).send({error: 'erp_unavailable'});
  });
  // The bond yield follows the same checks as the total-return series: an explicit check, or the
  // first read after an automatic research check that is newer than the last bond fetch.
  let refreshing: Promise<unknown> | null = null;
  app.addHook('onResponse', async (req, reply) => {
    if (!networkChecks || storageConfiguration().readOnly || storageConfiguration().testMode || reply.statusCode >= 400 || refreshing) return;
    const path = req.url.split('?')[0];
    const explicitCheck = req.method === 'POST' && ['/reading/research/check', '/owner/research/check'].includes(path);
    const afterAutomaticCheck = req.method === 'GET' && ['/reading/research', '/publication/erp'].includes(path);
    if (!explicitCheck && !afterAutomaticCheck) return;
    if (!explicitCheck) {
      const latestCheck = (await readState()).research_state?.checks.at(-1)?.finished_at;
      const bonds = await currentBondYields();
      if (!latestCheck || (bonds.checked_at && bonds.checked_at >= latestCheck)) return;
    }
    refreshing = refreshBondYields().catch(() => console.warn('bond_yield_check_failed')).finally(() => {refreshing = null;});
  });
  app.addHook('onClose', async () => {await refreshing;});
}
