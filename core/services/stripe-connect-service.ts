/**
 * Core Stripe Connect Service Abstraction
 * Payments→StripeConnect境界違反を解消するためのStripe Connect抽象化層
 * Portsパターンによる依存関係の逆転
 */

import { getStripeConnectPort, type StripeAccountStatus } from "@core/ports/stripe-connect";

// 型エイリアス（後方互換性のため）
export type StripeAccountStatusLike = StripeAccountStatus;

export interface IStripeConnectService {
  updateAccountFromWebhook(accountId: string, status: StripeAccountStatus): Promise<void>;
}

// Factory function using port
export function createStripeConnectService(): IStripeConnectService {
  return {
    async updateAccountFromWebhook(accountId: string, status: StripeAccountStatus) {
      try {
        const port = getStripeConnectPort();
        return await port.updateAccountFromWebhook(accountId, status);
      } catch (error) {
        console.error("Stripe Connect service error:", error);
        throw error;
      }
    },
  };
}
