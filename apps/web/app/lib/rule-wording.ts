// Wording that depends on the index: how long its history is, how often it is read, and whether the
// buffer is holding the band. One place, so every page says the same thing.
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import type {Judgment} from '../components/RuleJudgment.tsx';
import {date} from './format.ts';

/** "近十年" with a full window, otherwise "2020.07.27以来". */
export const historySpan = (j: Judgment) => j.full_window ? '近十年' : `${date(j.window_start)}以来`;
/** "每周" or "每个交易日": how often the index is read. */
export const eachReading = (j: Judgment) => j.rule.frequency === 'weekly' ? '每周' : '每个交易日';
export const sourcePhrase = (j: Judgment) => j.rule.source === 'csi' ? '中证指数官网每天公布的' : '蛋卷基金（第三方）每周整理的';

/** Band texts say "近十年"; for a shorter history say what the window actually is. */
export const withSpan = (j: Judgment, text: string) => j.full_window ? text : text.replaceAll('近十年', historySpan(j));

/**
 * When the buffer keeps the confirmed band although today's percentile has crossed back, the band's
 * opening sentence ("估值已高于近十年七成时间") would contradict the number on screen. Returns the
 * explanation to show instead, or null when the percentile is inside the band.
 */
export function bufferNote(j: Judgment): string | null {
  if (j.raw_band === j.band) return null;
  const {low, high, extreme} = j.boundaries.percentiles;
  const order = ['low', 'mid', 'high', 'extreme'] as const;
  const up = order.indexOf(j.raw_band) > order.indexOf(j.band);
  // The edge that would actually move the judgment, in the direction the percentile went.
  const edge = j.band === 'low' ? low : j.band === 'mid' ? (up ? high : low) : j.band === 'high' ? (up ? extreme : high) : extreme;
  return `现在第 ${j.percentile} 百分位，已落到${BAND_JUDGMENTS[j.raw_band].label}的范围；v2 缓冲要${up ? '升到' : '降到'}第 ${edge} 百分位${up ? '以上' : '以下'}并连续确认才改判，所以仍按${j.judgment.label}。`;
}

/** The new-money text opens with where the percentile sits; drop that sentence when the buffer holds the band. */
export function actionText(j: Judgment, text: string, newMoney: boolean) {
  const plain = withSpan(j, text);
  return newMoney && j.raw_band !== j.band ? plain.slice(plain.indexOf('。') + 1) : plain;
}
