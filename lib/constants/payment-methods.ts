export const PAYMENT_METHODS = ['stripe', 'cash', 'free'] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: 'オンライン決済',
  cash: '現金決済',
  free: '無料',
};