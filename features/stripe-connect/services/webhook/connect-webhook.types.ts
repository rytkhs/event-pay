import type { AppResult } from "@core/errors";

import type { Json } from "@/types/database";

export type ConnectWebhookMeta = {
  terminal?: boolean;
  reason?: string;
  accountId?: string;
  userId?: string;
  payoutId?: string;
} & { [key: string]: Json | undefined };

export type ConnectWebhookResult = AppResult<void, ConnectWebhookMeta>;
