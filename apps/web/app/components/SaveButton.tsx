import { useEffect, useState } from 'react';
import type {ReaderSituation} from '../../../../packages/contracts/reader-situation.ts';

declare global { interface Window { jingwei?: { readSaved:()=>string[]; writeSaved:(slugs:string[])=>void; readSituation?:()=>ReaderSituation|null; writeSituation?:(value:ReaderSituation|null)=>void; platform:string; version:string } } }

export const SAVED_KEY = 'jingwei.saved.articles';
const SAVED_CHANGED = 'jingwei:saved-changed';

// Keep browser-only storage behind the effect so server rendering stays usable.
export function readSavedArticles(): string[] {
  const value: unknown = window.jingwei ? window.jingwei.readSaved() : JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Invalid saved article list');
  return [...new Set(value.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))];
}

export function useSavedArticles() {
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    function refresh() {
      try {
        setSlugs(readSavedArticles());
        setUnavailable(false);
      } catch {
        setSlugs(null);
        setUnavailable(true);
      }
    }
    function storageChanged(event: StorageEvent) {
      if (event.key === SAVED_KEY || event.key === null) refresh();
    }
    refresh();
    window.addEventListener('storage', storageChanged);
    window.addEventListener(SAVED_CHANGED, refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener(SAVED_CHANGED, refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);
  return { slugs, unavailable };
}

export function SaveButton({ slug, title, viewingHistorical = false, onSavedChange }: { slug: string; title?: string; viewingHistorical?: boolean; onSavedChange?: (saved: boolean) => void }) {
  const { slugs, unavailable } = useSavedArticles();
  const [writeFailed, setWriteFailed] = useState(false);
  const saved = slugs?.includes(slug) ?? false;
  function toggle() {
    try {
      // Read again at the moment of the click, preserving changes from other tabs.
      const current = readSavedArticles();
      const next = current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug];
      if(window.jingwei)window.jingwei.writeSaved(next);else localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      setWriteFailed(false);
      window.dispatchEvent(new Event(SAVED_CHANGED));
      onSavedChange?.(next.includes(slug));
    } catch {
      setWriteFailed(true);
    }
  }
  const disabled = unavailable || writeFailed || slugs === null;
  const label = unavailable || writeFailed ? '收藏暂不可用' : slugs === null ? '读取收藏中' : saved ? '已收藏 · 取消' : '收藏文章';
  const button = <button type="button" className="save" onClick={toggle} disabled={disabled} aria-pressed={saved}
    aria-label={disabled ? label : `${saved ? '取消收藏' : '收藏'}${title ? `：${title}` : '文章'}${viewingHistorical ? '，收藏打开最新版本' : ''}`}>
    <svg viewBox="0 0 20 20" width="17" height="17" fill={saved ? 'currentColor' : 'none'} aria-hidden="true"><path d="M5 3h10v14l-5-3-5 3V3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
    {label}
  </button>;
  return viewingHistorical ? <span className="save-control">{button}<small>收藏后打开最新版本</small></span> : button;
}
