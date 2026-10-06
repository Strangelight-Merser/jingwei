import type {Holdings, OcrLine} from '../../../../packages/contracts/holdings.ts';

export type HoldingsBridge = {
  recognizeImage?: (bytes: Uint8Array) => Promise<OcrLine[]>;
  readHoldings?: () => Holdings | null | Promise<Holdings | null>;
  writeHoldings?: (value: Holdings | null) => void | Promise<void>;
};
type Host = {jingwei?: HoldingsBridge; localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>};
export const HOLDINGS_KEY = 'jingwei.holdings';
export const HOLDINGS_CHANGED = 'jingwei:holdings-changed';

export async function readHoldings(host: Host = window): Promise<Holdings | null> {
  try {
    const value = host.jingwei?.readHoldings
      ? await host.jingwei.readHoldings()
      : JSON.parse(host.localStorage.getItem(HOLDINGS_KEY) ?? 'null') as Holdings | null;
    if (value !== null && (!Array.isArray(value.rows) || typeof value.saved_at !== 'string')) throw new Error('invalid_holdings');
    return value;
  } catch {throw new Error('持仓读取失败，请检查本机存储权限。');}
}

export async function writeHoldings(value: Holdings | null, host: Host = window): Promise<void> {
  try {
    if (host.jingwei?.readHoldings) {
      if (!host.jingwei.writeHoldings) throw new Error('holdings_write_unavailable');
      await host.jingwei.writeHoldings(value);
    } else if (value) host.localStorage.setItem(HOLDINGS_KEY, JSON.stringify(value));
    else host.localStorage.removeItem(HOLDINGS_KEY);
  } catch {throw new Error('持仓保存失败，请检查本机存储权限后重试。');}
}
