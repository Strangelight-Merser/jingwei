import type {Checkup, Exposure, HoldingRow, Holdings, OcrLine, ParseRequest, ParseResponse} from '../../../../packages/contracts/holdings.ts';
import type {HoldingsBridge} from './holdings-storage.ts';

export const EXPOSURE_LABELS: Record<Exposure, string> = {
  a_broad: 'A股宽基', a_other_index: 'A股其他指数', a_active: 'A股主动',
  us_equity: '美股', hk_equity: '港股', overseas_other: '其他海外', bond: '债券', money: '货币', other: '其他 / 待确认',
};
export type DraftRow = {row: HoldingRow; amount: string; rematch: boolean};
export const toDraft = (row: HoldingRow): DraftRow => ({row, amount: String(row.amount), rematch: false});

async function post<T>(path: string, body: ParseRequest | Holdings): Promise<T> {
  const response = await fetch(`/holdings/${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  if (!response.ok) throw new Error(response.status === 404
    ? '持仓服务尚未就绪，请稍后重试。'
    : '持仓服务暂时无法完成请求，请重试。');
  return await response.json() as T;
}
export const parseHoldings = (value: ParseRequest) => post<ParseResponse>('parse', value);
export const checkHoldings = (value: Holdings) => post<Checkup>('checkup', value);

/** Images stay in the preload bridge; only recognised lines go to the local API. */
export async function recognizeImages(files: Pick<File, 'arrayBuffer'>[], bridge: HoldingsBridge, progress: (done: number) => void): Promise<OcrLine[][]> {
  if (!bridge.recognizeImage) throw new Error('截图识别需桌面版，请粘贴文字或手动添加。');
  const images: OcrLine[][] = [];
  for (const file of files) {
    images.push(await bridge.recognizeImage(new Uint8Array(await file.arrayBuffer())));
    progress(images.length);
  }
  return images;
}

export function blankDraft(id: string): DraftRow {
  return {row: {id, input_name: '', amount: 0, fund: null, tracked_index: null, exposure: 'other', covered_index: null}, amount: '', rematch: true};
}

export function editName(draft: DraftRow, input_name: string): DraftRow {
  return {...draft, rematch: true, row: {...draft.row, input_name, fund: null, tracked_index: null, exposure: 'other', covered_index: null}};
}

/** Rematch changed names before saving so the old fund/direction cannot survive an edit. */
export async function confirmRows(drafts: DraftRow[], parse = parseHoldings): Promise<HoldingRow[]> {
  if (!drafts.length) throw new Error('请至少添加一只持仓。');
  const values = drafts.map(({row, amount}) => {
    const value = Number(amount);
    if (!row.input_name.trim()) throw new Error('请填写每只持仓的名称。');
    if (!amount.trim() || !Number.isFinite(value) || value < 0) throw new Error('请填写每只持仓的金额，金额不能为负数。');
    return {...row, input_name: row.input_name.trim(), amount: value};
  });
  const rows: HoldingRow[] = [];
  for (const [i, row] of values.entries()) {
    if (!drafts[i].rematch) {rows.push(row); continue;}
    const result = await parse({text: `${row.input_name}\t${row.amount}`});
    if (result.rows.length !== 1) throw new Error(`「${row.input_name}」未能识别为一只持仓，请核对名称。`);
    rows.push({...result.rows[0], id: row.id, input_name: row.input_name, amount: row.amount});
  }
  return rows;
}

export type ImportState = {
  phase: 'loading' | 'empty' | 'recognizing' | 'confirm' | 'saving' | 'checkup';
  saved: Holdings | null; drafts: DraftRow[]; unread: string[]; checkup: Checkup | null; error: string | null;
};
export const initialImportState: ImportState = {phase: 'loading', saved: null, drafts: [], unread: [], checkup: null, error: null};
export type ImportEvent =
  | {type: 'loaded'; saved: Holdings | null} | {type: 'begin'}
  | {type: 'parsed'; result: ParseResponse} | {type: 'edit'; drafts: DraftRow[]}
  | {type: 'saving'} | {type: 'saved'; saved: Holdings}
  | {type: 'checked'; checkup: Checkup} | {type: 'error'; message: string}
  | {type: 'reimport'} | {type: 'cancel'} | {type: 'cleared'};

export function importReducer(state: ImportState, event: ImportEvent): ImportState {
  switch (event.type) {
    case 'loaded': return {...initialImportState, saved: event.saved, phase: event.saved ? 'checkup' : 'empty'};
    case 'begin': return {...state, phase: 'recognizing', error: null};
    case 'parsed': return {...state, phase: 'confirm', drafts: event.result.rows.map(toDraft), unread: event.result.unread, error: null};
    case 'edit': return {...state, drafts: event.drafts, error: null};
    case 'saving': return {...state, phase: 'saving', error: null};
    case 'saved': return {...state, phase: 'checkup', saved: event.saved, checkup: null, drafts: [], unread: [], error: null};
    case 'checked': return {...state, checkup: event.checkup, error: null};
    case 'error': return {...state, error: event.message, phase: state.phase === 'saving' ? 'confirm' : state.phase === 'recognizing' || state.phase === 'loading' ? 'empty' : state.phase};
    case 'reimport': return {...state, phase: 'empty', drafts: [], unread: [], error: null};
    case 'cancel': return {...state, phase: state.saved ? 'checkup' : 'empty', drafts: [], unread: [], error: null};
    case 'cleared': return {...initialImportState, phase: 'empty'};
  }
}
