import type {FastifyInstance} from 'fastify';
import {buildCheckup, parseHoldings} from './holdings.ts';
import {holdingsSchema, parseRequestSchema} from './holdings-validation.ts';
import {refreshFundList, seedFundList} from './fund-list.ts';
import {judgmentOverviewPublication} from './judgment.ts';
import type {HoldingJudgments} from './holdings.ts';

export function registerHoldings(app: FastifyInstance, {networkChecks = false}: {networkChecks?: boolean} = {}) {
  let list = seedFundList(), refreshing: Promise<void> | null = null;
  app.post('/holdings/parse', async (req, reply) => {
    const parsed = parseRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({error: 'invalid_holdings_parse_request'});
    return parseHoldings(parsed.data, list.funds);
  });
  app.post('/holdings/checkup', async (req, reply) => {
    const parsed = holdingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({error: 'invalid_holdings'});
    const judgments: HoldingJudgments = {};
    for (const judgment of (await judgmentOverviewPublication()).indexes) if (judgment) judgments[judgment.index_code] = judgment;
    return buildCheckup(parsed.data, judgments);
  });
  app.addHook('onResponse', async (req, reply) => {
    if (!networkChecks || reply.statusCode >= 400 || req.method !== 'POST' || !['/reading/research/check', '/owner/research/check'].includes(req.url.split('?')[0]) || refreshing) return;
    refreshing = refreshFundList(list).then(updated => {list = updated;}).catch(() => {console.warn('public_fund_list_check_failed');}).finally(() => {refreshing = null;});
  });
  app.addHook('onClose', async () => {await refreshing;});
}
