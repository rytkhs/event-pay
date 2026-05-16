import type { PlatformFeeConfig } from "./service";

export interface ApplicationFeeEstimate {
  amount: number;
  applicationFeeAmount: number;
  netAmount: number;
  calculation: {
    rateFee: number;
    fixedFee: number;
    beforeClipping: number;
    afterMinimum: number;
    afterMaximum: number;
  };
}

export function calculateApplicationFeeEstimate(
  amount: number,
  config: PlatformFeeConfig
): ApplicationFeeEstimate {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Invalid amount: ${amount}. Amount must be a positive integer.`);
  }

  const rateFee = Math.round(amount * config.rate);
  const fixedFee = config.fixedFee;
  const beforeClipping = rateFee + fixedFee;
  const afterMinimum = Math.max(beforeClipping, config.minimumFee);
  const afterMaximumBeforeAmountCap =
    config.maximumFee > 0 ? Math.min(afterMinimum, config.maximumFee) : afterMinimum;
  const afterMaximum = Math.min(afterMaximumBeforeAmountCap, amount);

  return {
    amount,
    applicationFeeAmount: afterMaximum,
    netAmount: amount - afterMaximum,
    calculation: {
      rateFee,
      fixedFee,
      beforeClipping,
      afterMinimum,
      afterMaximum,
    },
  };
}
