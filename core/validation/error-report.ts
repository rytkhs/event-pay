import { z } from "zod";

export const errorReportSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    category: z.string().optional(),
    severity: z.string().optional(),
    title: z.string().optional(),
    message: z.string(),
    userMessage: z.string().optional(),
    retryable: z.boolean().optional(),
    correlationId: z.string().optional(),
    context: z.record(z.any()).optional(),
  }),
  stackTrace: z.string().optional(),
  user: z
    .object({
      id: z.string().optional(),
      email: z.string().optional(),
      userAgent: z.string().optional(),
    })
    .optional(),
  page: z
    .object({
      url: z.string().optional(),
      pathname: z.string().optional(),
      referrer: z.string().optional(),
    })
    .optional(),
  breadcrumbs: z.array(z.any()).optional(),
  environment: z.string().optional(),
});

export type ErrorReportInput = z.infer<typeof errorReportSchema>;
