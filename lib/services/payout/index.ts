/**
 * PayoutService のエクスポート
 */

export { PayoutService } from "./service";
export { PayoutErrorHandler } from "./error-handler";
export { PayoutValidator } from "./validation";
export { PayoutScheduler } from "./scheduler";

// スケジューラー関連のエクスポート
export {
  DEFAULT_SCHEDULER_CONFIG,
  loadSchedulerConfigFromEnv,
  createSchedulerConfig,
  validateSchedulerConfig,
  configToEnvString,
  getConfigDiff,
} from "./scheduler-config";

export {
  generateExecutionSummary,
  formatProcessingTime,
  calculateExecutionStats,
  exportExecutionResultsToCSV,
  exportExecutionResultsToJSON,
  filterExecutionLogs,
  groupExecutionLogsByPeriod,
  validateExecutionResult,
} from "./scheduler-utils";

// ファクトリー関数内でクラスを使用するために明示的にインポート
import { PayoutErrorHandler as _PayoutErrorHandler } from "./error-handler";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { PayoutValidator as _PayoutValidator } from "./validation";
import { PayoutService as _PayoutService } from "./service";

export type {
  IPayoutService,
  IPayoutErrorHandler,
  IPayoutValidator,
  IStripeConnectService,
  IPayoutScheduler,
} from "./interface";

export type {
  Payout,
  EligibleEvent,
  ProcessPayoutParams,
  ProcessPayoutResult,
  PayoutCalculation,
  UpdatePayoutStatusParams,
  GetPayoutHistoryParams,
  FindEligibleEventsParams,
  PayoutStatus,
  PayoutError,
  PayoutErrorType,
  ErrorHandlingResult,
  StripeFeeConfig,
  PlatformFeeConfig,
  PayoutSchedulerConfig,
  SchedulerExecutionResult,
  PayoutSchedulerLog,
  SchedulerExecutionSummary,
  EligibleEventWithAmount,
} from "./types";

export {
  ERROR_HANDLING_BY_TYPE,
  STRIPE_ERROR_CODE_MAPPING,
  DATABASE_ERROR_CODE_MAPPING,
} from "./error-mapping";

// デフォルトのサービスインスタンス作成用のファクトリー関数
export function createPayoutService(
  supabaseUrl: string,
  supabaseKey: string,
  stripeConnectService: any // IStripeConnectService
) {
  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const errorHandler = new _PayoutErrorHandler();
  const validator = new _PayoutValidator(supabase, stripeConnectService);
  const service = new _PayoutService(supabase, errorHandler, stripeConnectService, validator);

  return {
    service,
    errorHandler,
    validator,
  };
}
