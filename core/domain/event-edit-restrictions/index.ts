/**
 * イベント編集制限ドメイン - 公開API
 */

export type {
  RestrictionLevel,
  RestrictableField,
  RestrictionContext,
  FormDataSnapshot,
  ActiveRestriction,
  RestrictionState,
  RestrictionChangeEvent,
  RestrictionErrorEvent,
  FieldRestrictionMap,
} from "./types";

export {
  STRIPE_PAID_FEE_RESTRICTION,
  ATTENDEE_PAYMENT_METHODS_RESTRICTION,
  ATTENDEE_COUNT_CAPACITY_RESTRICTION,
  FREE_EVENT_PAYMENT_ADVISORY,
  PAID_EVENT_PAYMENT_REQUIRED_ADVISORY,
} from "./rules";

export { RestrictionEngine, createRestrictionEngine } from "./engine";

export {
  evaluateEventEditViolations,
  type FieldViolation,
  buildRestrictionContext,
  createFormDataSnapshot,
} from "./evaluate";
