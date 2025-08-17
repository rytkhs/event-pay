/**
 * 送金データ整合性チェック・修復サービス
 * Stripe APIとDB状態を照合し、不整合を自動修復する
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { stripe } from "@/lib/stripe/client";
import { PayoutStatus } from "./types";
import Stripe from "stripe";
import { logger } from "@/lib/logging/app-logger";

export interface ReconciliationResult {
  checkedTransfers: number;
  inconsistentPayouts: number;
  fixedPayouts: number;
  errors: Array<{
    transferId: string;
    payoutId?: string;
    error: string;
  }>;
}

export interface ReconciliationOptions {
  /** 照合対象期間（日数） */
  daysBack?: number;
  /** ドライランモード（実際の修復は行わない） */
  dryRun?: boolean;
  /** 処理対象の最大Transfer数 */
  limit?: number;
}

export class PayoutReconciliationService {
  private supabase: SupabaseClient<Database>;

  constructor(supabaseClient: SupabaseClient<Database>) {
    this.supabase = supabaseClient;
  }

  /**
   * Stripe Transfersとpayoutsテーブルの整合性をチェック・修復
   */
  async reconcilePayouts(options: ReconciliationOptions = {}): Promise<ReconciliationResult> {
    const {
      daysBack = 7,
      dryRun = false,
      limit = 100,
    } = options;

    const result: ReconciliationResult = {
      checkedTransfers: 0,
      inconsistentPayouts: 0,
      fixedPayouts: 0,
      errors: [],
    };

    try {
      // Stripe APIから最近のTransferを取得
      const createdAfter = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
      const transfers = await this.getStripeTransfers(createdAfter, limit);

      result.checkedTransfers = transfers.length;

      for (const transfer of transfers) {
        try {
          const fixed = await this.reconcileTransfer(transfer, dryRun);
          if (fixed) {
            result.inconsistentPayouts++;
            if (!dryRun) {
              result.fixedPayouts++;
            }
          }
        } catch (error) {
          result.errors.push({
            transferId: transfer.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // processing_errorステータスの送金も個別にチェック
      await this.reconcileProcessingErrorPayouts(dryRun, result);

    } catch (error) {
      result.errors.push({
        transferId: "unknown",
        error: `Reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  /**
   * Stripe APIからTransfer一覧を取得
   */
  private async getStripeTransfers(createdAfter: number, limit: number): Promise<Stripe.Transfer[]> {
    const transfers: Stripe.Transfer[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore && transfers.length < limit) {
      const params: Stripe.TransferListParams = {
        created: { gte: createdAfter },
        limit: Math.min(100, limit - transfers.length),
        ...(startingAfter && { starting_after: startingAfter }),
      };

      const response = await stripe.transfers.list(params);
      transfers.push(...response.data);

      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    return transfers;
  }

  /**
   * 個別Transferの整合性をチェック・修復
   */
  private async reconcileTransfer(transfer: Stripe.Transfer, dryRun: boolean): Promise<boolean> {
    const transferId = transfer.id;
    const metadata = transfer.metadata;
    const payoutId = metadata?.payout_id;

    // payoutIdがない場合はスキップ
    if (!payoutId) {
      return false;
    }

    // DB上のpayout情報を取得
    const { data: payout, error } = await this.supabase
      .from("payouts")
      .select("*")
      .eq("id", payoutId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch payout ${payoutId}: ${error.message}`);
    }

    if (!payout) {
      // payoutレコードが存在しない場合はログのみ
      logger.warn(`Payout record not found for transfer ${transferId}, payout ${payoutId}`, {
        tag: "payoutReconciliation",
        transfer_id: transferId,
        payout_id: payoutId
      });
      return false;
    }

    // 整合性チェック
    const needsUpdate = this.checkPayoutConsistency(payout, transfer);

    if (needsUpdate && !dryRun) {
      await this.fixPayoutStatus(payout, transfer);
    }

    return needsUpdate;
  }

  /**
   * payoutとtransferの整合性をチェック
   */
  private checkPayoutConsistency(payout: any, transfer: Stripe.Transfer): boolean {
    // Transferが成功している場合、payoutもcompletedであるべき
    if (this.isTransferSuccessful(transfer)) {
      return payout.status !== "completed";
    }

    // Transferが失敗/リバースされている場合、payoutもfailedであるべき
    if (this.isTransferFailed(transfer)) {
      return payout.status !== "failed";
    }

    // processing_errorステータスの場合は常に修復対象
    if (payout.status === "processing_error") {
      return true;
    }

    return false;
  }

  /**
   * Transferが成功状態かチェック
   */
  private isTransferSuccessful(transfer: Stripe.Transfer): boolean {
    // Stripeでは、Transferが作成された時点で基本的に成功
    // reversalsがない、または空の場合は成功とみなす
    const reversals = (transfer as any).reversals;
    return !reversals || !reversals.data || reversals.data.length === 0;
  }

  /**
   * Transferが失敗状態かチェック
   */
  private isTransferFailed(transfer: Stripe.Transfer): boolean {
    const reversals = (transfer as any).reversals;
    return reversals && reversals.data && reversals.data.length > 0;
  }

  /**
   * payout状態を修復
   */
  private async fixPayoutStatus(payout: any, transfer: Stripe.Transfer): Promise<void> {
    let newStatus: PayoutStatus;
    let notes = "";

    if (this.isTransferSuccessful(transfer)) {
      newStatus = "completed";
      notes = `Reconciliation: Transfer ${transfer.id} confirmed successful`;
    } else if (this.isTransferFailed(transfer)) {
      newStatus = "failed";
      const reversals = (transfer as any).reversals;
      const reversalReason = reversals?.data?.[0]?.reason || "unknown";
      notes = `Reconciliation: Transfer ${transfer.id} reversed (${reversalReason})`;
    } else {
      // 不明な状態の場合はprocessing_errorのまま
      return;
    }

    const { error } = await this.supabase
      .from("payouts")
      .update({
        status: newStatus,
        stripe_transfer_id: transfer.id,
        processed_at: new Date(transfer.created * 1000).toISOString(),
        notes: `${payout.notes || ""}\n${notes}`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);

    if (error) {
      throw new Error(`Failed to update payout ${payout.id}: ${error.message}`);
    }

    logger.info(`Reconciliation: Fixed payout ${payout.id} status to ${newStatus}`, {
      tag: "payoutReconciliation",
      payout_id: payout.id,
      new_status: newStatus,
      transfer_id: transfer.id
    });
  }

  /**
   * processing_errorステータスの送金を個別にチェック
   */
  private async reconcileProcessingErrorPayouts(dryRun: boolean, result: ReconciliationResult): Promise<void> {
    const { data: errorPayouts, error } = await this.supabase
      .from("payouts")
      .select("*")
      .eq("status", "processing_error")
      .not("stripe_transfer_id", "is", null)
      .limit(50);

    if (error) {
      result.errors.push({
        transferId: "processing_error_query",
        error: `Failed to fetch processing_error payouts: ${error.message}`,
      });
      return;
    }

    if (!errorPayouts || errorPayouts.length === 0) {
      return;
    }

    for (const payout of errorPayouts) {
      try {
        if (!payout.stripe_transfer_id) continue;

        // Stripe APIからTransfer情報を取得
        const transfer = await stripe.transfers.retrieve(payout.stripe_transfer_id);

        const needsUpdate = this.checkPayoutConsistency(payout, transfer);
        if (needsUpdate) {
          result.inconsistentPayouts++;
          if (!dryRun) {
            await this.fixPayoutStatus(payout, transfer);
            result.fixedPayouts++;
          }
        }
      } catch (error) {
        result.errors.push({
          transferId: payout.stripe_transfer_id || "unknown",
          payoutId: payout.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * 整合性チェックのサマリーを取得（統計情報）
   */
  async getConsistencyStats(): Promise<{
    totalPayouts: number;
    completedPayouts: number;
    processingErrorPayouts: number;
    failedPayouts: number;
    pendingPayouts: number;
    processingPayouts: number;
  }> {
    const { data, error } = await this.supabase
      .from("payouts")
      .select("status")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      throw new Error(`Failed to fetch payout stats: ${error.message}`);
    }

    const stats = {
      totalPayouts: data.length,
      completedPayouts: 0,
      processingErrorPayouts: 0,
      failedPayouts: 0,
      pendingPayouts: 0,
      processingPayouts: 0,
    };

    for (const payout of data) {
      switch (payout.status) {
        case "completed":
          stats.completedPayouts++;
          break;
        case "processing_error":
          stats.processingErrorPayouts++;
          break;
        case "failed":
          stats.failedPayouts++;
          break;
        case "pending":
          stats.pendingPayouts++;
          break;
        case "processing":
          stats.processingPayouts++;
          break;
      }
    }

    return stats;
  }
}
