import { z } from "zod";

export const errorReportSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(100).optional(),
    category: z.string().min(1).max(50).optional(),
    severity: z.string().min(1).max(32).optional(),
    title: z.string().min(1).max(200).optional(),
    message: z.string().min(1).max(4000),
    userMessage: z.string().min(1).max(1000).optional(),
    retryable: z.boolean().optional(),
    correlationId: z.string().min(1).max(128).optional(),
    context: z.record(z.unknown()).optional(),
  }),
  stackTrace: z.string().max(20000).optional(),
  user: z
    .object({
      id: z.string().uuid().optional(),
      email: z.string().email().max(320).optional(),
      userAgent: z.string().max(1000).optional(),
    })
    .optional(),
  page: z
    .object({
      url: z.string().url().max(2000).optional(),
      pathname: z.string().max(2048).optional(),
      referrer: z.string().url().max(2000).optional(),
    })
    .optional(),
  breadcrumbs: z.array(z.unknown()).max(100).optional(),
  environment: z.string().max(64).optional(),
});

export type ErrorReportInput = z.infer<typeof errorReportSchema>;
