import { z } from "zod";

export const generateSettlementReportInputSchema = z.object({
  eventId: z.string().uuid(),
});

export const getSettlementReportsParamsSchema = z.object({
  eventIds: z.array(z.string().uuid()).optional(),
  // UI からは YYYY-MM-DD 形式で送信されるため、日付のみの文字列を許可
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(1000).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
