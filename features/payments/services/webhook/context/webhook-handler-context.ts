import type { EventPayLogFields } from "@core/logging/app-logger";
import type { AppSupabaseClient } from "@core/types/supabase";

export interface WebhookContextLogger {
  debug(message: string, fields?: Partial<EventPayLogFields>): void;
  info(message: string, fields?: Partial<EventPayLogFields>): void;
  warn(message: string, fields?: Partial<EventPayLogFields>): void;
  error(message: string, fields?: Partial<EventPayLogFields>): void;
}

export interface WebhookHandlerContext {
  supabase: AppSupabaseClient;
  logger: WebhookContextLogger;
}
