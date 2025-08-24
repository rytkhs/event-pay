/**
 * SettlementErrorHandlerの実装
 */

import { logger } from "@/lib/logging/app-logger";

export class SettlementErrorLogger {
  static async log(error: Error, context?: Record<string, unknown>) {
    logger.error("SettlementError", { message: error.message, stack: error.stack, context });
  }
}
