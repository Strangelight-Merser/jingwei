import {useEffect, useRef, useState} from 'react';
import {BAND_JUDGMENTS, type ValuationBand} from '../../../../packages/backend/valuation-rule.ts';
import type {Judgment} from './RuleJudgment.tsx';
import {date} from '../lib/format.ts';

const STORAGE_KEY = 'jingwei.reader.reading-guide.dismissed';
const BANDS: ValuationBand[] = ['low', 'mid', 'high', 'extreme'];
const TITLES = ['经纬每天看什么数', '百分位是什么意思', '四个区间，分别怎么做'];

function PlainHint({term, children}: {term: string; children: React.ReactNode}) {
  return <details className="home-plain-hint">
    <summary>{term}<span aria-hidden="true">?</span></summary>
    <p>{children}</p>
  </details>;
}

/** The example uses the homepage's latest CSI 300 judgment, including its date and rule. */
export function ReadingGuide({judgment: j}: {judgment: Judgment}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const historyWindow = j.full_window ? `近${j.rule.window_years}年里` : `${date(j.window_start)}以来`;
  const cheaperDays = `${historyWindow}有 ${j.percentile}% 的日子，比今天便宜或一样贵。`;
  const ranges = [`低于 ${j.rule.low}`, `${j.rule.low} 至不足 ${j.rule.high}`, `${j.rule.high} 至不足 ${j.rule.extreme}`, `${j.rule.extreme} 及以上`];

  useEffect(() => {
    let dismissed = false;
    // The first-run welcome comes first; this guide only opens by itself once that is done.
    try {dismissed = localStorage.getItem(STORAGE_KEY) === '1' || localStorage.getItem('jingwei.reader.first-run.done') !== '1';} catch {}
    if (!dismissed && !dialog.current?.open) dialog.current?.showModal();
  }, []);

  function openGuide() {
    setStep(0);
    dialog.current?.showModal();
  }
  function rememberDismissal() {
    try {localStorage.setItem(STORAGE_KEY, '1');} catch {}
  }

  return <>
    <div className="home-reading-keywords" aria-label="读懂估值判断">
      <div>
        <PlainHint term="滚动市盈率">把指数价格与最近12个月的盈利相比，倍数越低，表示为同样的盈利付的钱越少。</PlainHint>
        <PlainHint term="百分位">把当前估值与近{j.rule.window_years}年每天的估值排一排；数字越小，历史上比现在便宜的日子越少。</PlainHint>
      </div>
      <button type="button" onClick={openGuide}>如何阅读 <span aria-hidden="true">→</span></button>
    </div>
    <dialog ref={dialog} className="home-reading-guide" aria-labelledby="reading-guide-title" onClose={rememberDismissal}>
      <header>
        <span>30 秒读懂经纬</span>
        <button type="button" aria-label="关闭阅读引导" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <div className="home-guide-progress" aria-label={`第 ${step + 1} 步，共 ${TITLES.length} 步`}>
        {TITLES.map((title, i) => <span key={title} className={i === step ? 'is-current' : ''} aria-current={i === step ? 'step' : undefined}>{i + 1}</span>)}
      </div>
      <h2 id="reading-guide-title">{TITLES[step]}</h2>
      <p className="home-guide-context">以{j.index_name}为例 · 数据截至 <time dateTime={j.as_of}>{date(j.as_of)}</time></p>
      <div className="home-guide-content" aria-live="polite">
        {step === 0 && <>
          <p>经纬每天查看中证指数公布的<strong>滚动市盈率</strong>，看指数价格相当于最近12个月盈利的多少倍。</p>
          <div className="home-guide-example"><small>本期滚动市盈率</small><strong>{j.pe_ttm}<span> 倍</span></strong></div>
          <p>再与近{j.rule.window_years}年的估值比较，按公开规则给出新增资金和已有持仓的判断。</p>
        </>}
        {step === 1 && <>
          <div className="home-guide-example"><small>本期百分位</small><strong>{j.percentile}<span> / 100</span></strong></div>
          <p className="home-guide-plain">{cheaperDays}</p>
          <p>数字越小，说明估值在过去的日子里越靠近便宜的一端。这里比的是估值，分位并不表示买入后的收益率。</p>
        </>}
        {step === 2 && <>
          <div className="home-guide-bands">
            {BANDS.map((band, i) => <div key={band} className={j.band === band ? 'is-current' : ''}>
              <div><strong>{BAND_JUDGMENTS[band].label}</strong><small>分位 {ranges[i]}</small></div>
              <p>新钱：{BAND_JUDGMENTS[band].new_money.title}<br/>持仓：{BAND_JUDGMENTS[band].held.title}</p>
            </div>)}
          </div>
          <p className="home-guide-confirm">当前已确认：<strong>{j.judgment.label}</strong>。新分位连续{j.rule.confirm_days}个数据日落入另一区间，才会改判。</p>
        </>}
      </div>
      <div className="home-guide-actions">
        {step > 0 ? <button type="button" onClick={() => setStep(step - 1)}>上一步</button> : <span>可随时关闭</span>}
        {step < TITLES.length - 1 ? <button type="button" className="primary" onClick={() => setStep(step + 1)}>下一步 →</button> : <button type="button" className="primary" onClick={() => dialog.current?.close()}>开始阅读</button>}
      </div>
    </dialog>
  </>;
}
