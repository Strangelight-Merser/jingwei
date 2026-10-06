import{Link}from'react-router';
export function CurrentChange({summary}:{summary?:string|null}){if(!summary)return null;return <section className="current-change"><h2>本期改变</h2><p>{summary}</p><p>这里对照解读文章当前已存版本与上一版的正文、条件和来源。历史人工编辑未记录真实系统触发证据；规则改判另见判断变化页。</p><p>费用实施、渠道条件与可比跟踪口径仍需核查，不据此改动估值规则的判断。</p><Link to="/changes" className="text-link">从第1版看到现在：改动与原文 →</Link></section>;}
