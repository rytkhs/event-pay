type EffectiveTimePayment = {
  status: string;
  paid_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export const calculateEffectiveTime = (
  status: string,
  paidAt: string | null,
  updatedAt: string | null,
  createdAt: string | null,
  terminalStatuses: readonly string[]
): string | null => {
  if (terminalStatuses.includes(status)) {
    return paidAt ?? updatedAt ?? createdAt;
  }

  return updatedAt ?? createdAt;
};

export const findLatestPaymentByEffectiveTime = <T extends EffectiveTimePayment>(
  payments: T[],
  terminalStatuses: readonly string[]
): T | null => {
  if (!payments?.length) return null;

  let latestPayment: T | null = null;
  let latestEffectiveTime = 0;
  let latestCreatedAt = 0;

  for (const payment of payments) {
    const effectiveTime = calculateEffectiveTime(
      payment.status,
      payment.paid_at,
      payment.updated_at,
      payment.created_at,
      terminalStatuses
    );

    if (!effectiveTime) {
      continue;
    }

    const effectiveMillis = new Date(effectiveTime).getTime();
    const createdMillis = new Date(payment.created_at || 0).getTime();

    if (
      latestPayment === null ||
      effectiveMillis > latestEffectiveTime ||
      (effectiveMillis === latestEffectiveTime && createdMillis > latestCreatedAt)
    ) {
      latestPayment = payment;
      latestEffectiveTime = effectiveMillis;
      latestCreatedAt = createdMillis;
    }
  }

  return latestPayment;
};
