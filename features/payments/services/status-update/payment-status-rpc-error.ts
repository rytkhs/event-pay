export const PAYMENT_STATUS_CONCURRENT_UPDATE_SQLSTATE = "PT409";

type RpcErrorLike = {
  code?: string;
};

export function isConcurrentPaymentStatusUpdateError(error: RpcErrorLike): boolean {
  return error.code === PAYMENT_STATUS_CONCURRENT_UPDATE_SQLSTATE;
}
