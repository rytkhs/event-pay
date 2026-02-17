import { z } from "zod";

export const guestStripeSessionInputSchema = z.object({
  guestToken: z.string().min(36, "ゲストトークンが無効です"),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  gaClientId: z.string().optional(), // GA4 Client ID（アナリティクス追跡用）
});
