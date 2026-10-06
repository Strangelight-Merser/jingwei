import {publication} from './api.server.ts';
import {CHANNEL_INDICES, ruleCardData, type PublicRuleJudgment} from './rule-card.ts';

export async function readChannelJudgment(request: Request) {
  const code = new URL(request.url).searchParams.get('index') ?? '000300';
  if (!Object.hasOwn(CHANNEL_INDICES, code)) throw new Response('该指数尚未提供规则卡', {status: 404});
  const judgment = await publication<PublicRuleJudgment | null>(`judgment?index=${encodeURIComponent(code)}`);
  if (!judgment) throw new Response('估值判断暂不可用', {status: 404});
  return {judgment, card: ruleCardData(judgment, code)};
}

// Public, read-only JSON for channels that render their own card. No reader information is accepted.
export async function ruleCardJson({request}: {request: Request}) {
  const headers = {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'};
  try {
    const {card} = await readChannelJudgment(request);
    return Response.json(card, {headers});
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    return Response.json({error: await error.text()}, {status: error.status, headers});
  }
}
