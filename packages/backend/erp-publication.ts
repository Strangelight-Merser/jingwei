import type {FastifyInstance} from 'fastify';
import {bundledErp} from './erp.ts';
import {isIndexCode} from './valuation-indexes.ts';

export function registerErp(app: FastifyInstance) {
  app.get<{Querystring: {index?: string}}>('/publication/erp', async (req, reply) => {
    const index = req.query.index ?? '000300';
    if (!isIndexCode(index)) return reply.code(400).send({error: 'unknown_index'});
    return bundledErp(index);
  });
}
