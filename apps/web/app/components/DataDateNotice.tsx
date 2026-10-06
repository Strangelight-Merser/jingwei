import {date} from '../lib/format.ts';
import './data-date-notice.css';

export function DataDateNotice({asOf}: {asOf: string}) {
  const age = Math.floor((Date.now() - Date.parse(`${asOf}T00:00:00+08:00`)) / 86_400_000);
  return age > 10 ? <p className="data-date-notice" role="status">估值数据已有 {age} 天未更新，以下仍按 {date(asOf)} 的最新可用数据给出。</p> : null;
}
