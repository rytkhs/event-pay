export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  message?: string;
  redirectUrl?: string;
  needsVerification?: boolean;
};
