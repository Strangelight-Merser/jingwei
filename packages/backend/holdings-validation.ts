import {z} from 'zod';
import type {Holdings, OcrLine} from '../contracts/holdings.ts';

const amount = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const coordinate = z.number().finite().min(0).max(1);
export const ocrLineSchema = z.object({text: z.string().min(1).max(2000), x: coordinate, y: coordinate, w: coordinate, h: coordinate, confidence: coordinate.optional()}).strict();
export const parseRequestSchema = z.object({images: z.array(z.array(ocrLineSchema).max(10_000)).max(30).optional(), text: z.string().max(100_000).optional()}).strict()
  .refine(value => (value.images?.length ?? 0) > 0 || Boolean(value.text?.trim()));
export const holdingsSchema = z.object({
  saved_at: z.iso.datetime({offset: true}),
  rows: z.array(z.object({
    id: z.string().min(1).max(160), input_name: z.string().min(1).max(500), amount,
    fund: z.object({code: z.string().regex(/^\d{6}$/), name: z.string().min(1).max(500), type: z.string().max(100)}).strict().nullable(),
    tracked_index: z.string().min(1).max(100).nullable(),
    exposure: z.enum(['a_broad', 'a_other_index', 'a_active', 'us_equity', 'hk_equity', 'overseas_other', 'bond', 'money', 'other']),
    covered_index: z.enum(['000300', '000905', '000016']).nullable(),
  }).strict()).max(2000),
}).strict().refine(value => new Set(value.rows.map(row => row.id)).size === value.rows.length &&
  value.rows.reduce((total, row) => total + row.amount, 0) <= Number.MAX_SAFE_INTEGER);

export function validHoldings(value: unknown): value is Holdings {return holdingsSchema.safeParse(value).success;}
export function validOcrLines(value: unknown): value is OcrLine[] {return z.array(ocrLineSchema).max(10_000).safeParse(value).success;}
