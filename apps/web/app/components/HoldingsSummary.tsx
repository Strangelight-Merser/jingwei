import {useEffect, useState} from 'react';
import {Link} from 'react-router';
import type {Holdings} from '../../../../packages/contracts/holdings.ts';
import {checkHoldings} from '../lib/holdings-client.ts';
import {HOLDINGS_CHANGED, HOLDINGS_KEY, readHoldings} from '../lib/holdings-storage.ts';
import {number} from '../lib/format.ts';

export function HoldingsSummary() {
  const [value, setValue] = useState<Holdings | null>(null);
  const [coverage, setCoverage] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      try {
        const saved = await readHoldings();
        if (current !== revision) return;
        setValue(saved); setCoverage(null); setReady(true); setFailed(false);
        if (saved?.rows.length) {
          try {
            const checkup = await checkHoldings(saved);
            if (current === revision && checkup.total > 0) setCoverage((1 - checkup.uncovered_share) * 100);
          } catch { /* A saved list remains accessible while the check-up API is unavailable. */ }
        }
      } catch {if (current === revision) {setFailed(true); setReady(true);}}
    }
    function storage(event: StorageEvent) {if (event.key === HOLDINGS_KEY || event.key === null) void refresh();}
    void refresh();
    window.addEventListener(HOLDINGS_CHANGED, refresh); window.addEventListener('storage', storage);
    return () => {revision++; window.removeEventListener(HOLDINGS_CHANGED, refresh); window.removeEventListener('storage', storage);};
  }, []);
  if (!ready) return null;
  return <p className="situation-holdings"><Link to="/holdings">{failed ? '持仓暂时无法读取 · 查看持仓 →' : value?.rows.length
    ? `已导入 ${value.rows.length} 只${coverage === null ? '' : ` · 规则覆盖 ${number(coverage)}%`} · 查看体检 →`
    : '导入持仓截图 →'}</Link></p>;
}
