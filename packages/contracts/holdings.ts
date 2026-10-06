// Holdings import and check-up. Everything here stays on the reader's device: images are recognised
// locally, and the confirmed list is saved like the reader situation (desktop file / browser storage).
import type {IndexCode} from '../backend/valuation-indexes.ts';
import type {ValuationBand} from '../backend/valuation-rule.ts';

/** One recognised text line. Coordinates are 0–1 of the image, origin at the top left. */
export type OcrLine = {text: string; x: number; y: number; w: number; h: number; confidence?: number};

/** A holding read from a screenshot or pasted text, before matching. Amount is in yuan. */
export type ParsedHolding = {name: string; amount: number | null};

/** A public fund list entry (code, official short name, type as published). */
export type FundMatch = {code: string; name: string; type: string};

/** Where the money actually goes. Only `a_broad` holdings tracking a covered index get a rule judgment. */
export type Exposure = 'a_broad' | 'a_other_index' | 'a_active' | 'us_equity' | 'hk_equity' | 'overseas_other' | 'bond' | 'money' | 'other';

export type HoldingRow = {
  id: string;
  /** Name as recognised or typed; kept so the reader can see what was read. */
  input_name: string;
  amount: number;
  fund: FundMatch | null;
  /** Index the fund tracks, from its name; null for active, bond and money funds. */
  tracked_index: string | null;
  exposure: Exposure;
  /** Set only for 000300 / 000905 / 000016. */
  covered_index: IndexCode | null;
};

export type Holdings = {saved_at: string; rows: HoldingRow[]};

export type Checkup = {
  total: number;
  by_exposure: {exposure: Exposure; label: string; amount: number; share: number}[];
  /** Two or more holdings tracking the same index add no diversification. */
  duplicates: {tracked_index: string; row_ids: string[]; amount: number}[];
  covered: {row_id: string; index: IndexCode; index_name: string; band: ValuationBand; band_label: string; new_money_title: string; held_title: string}[];
  /** Share of the total the valuation rule says nothing about. */
  uncovered_share: number;
  /** Short factual notes, at most one per topic (e.g. QDII, C shares). */
  notes: string[];
};

/** POST /holdings/parse body: OCR lines from one or more images, or pasted text. */
export type ParseRequest = {images?: OcrLine[][]; text?: string};
/** Response: rows ready for the confirmation table; the reader can still edit, remove or add. */
export type ParseResponse = {rows: HoldingRow[]; unread: string[]};
