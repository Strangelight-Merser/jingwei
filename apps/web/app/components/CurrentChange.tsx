import{Link}from'react-router';
export function CurrentChange({summary}:{summary?:string|null}){if(!summary)return null;return <section className="current-change"><h2>本期改变</h2><p>{summary}</p><p>依据：当前已存版本与上一版的正文、条件和来源对照。历史人工编辑未记录真实系统触发证据。</p><p>仍未解决：沪深300同样本盈利、费用实施与渠道条件、可比跟踪口径；新AI判断尚未生成。</p><Link to="/changes" className="text-link">从第1版看到现在：改动与原文 →</Link></section>;}
