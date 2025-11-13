/**
 * UIStatusMapper
 * Database StatusとStripe Account ObjectからUI Statusを派生するクラス
 *
 * 要件:
 * - 2.1: UI Statusとして no_account、unverified、requirements_due、ready、restricted の5つの値を返す
 * - 2.2: Connect Account が存在しないとき、UI Status として no_account を返す
 * - 2.3: Database Status が unverified であるとき、UI Status として unverified を返す
 * - 2.4: Account Object の currently_due、past_due、または eventually_due が非空であるとき、UI Status として requirements_due を返す
 * - 2.5: Database Status が restricted であるとき、UI Status として restricted を返し、requirements_due に統合しない
 * - 2.6: Database Status が verified かつ Account Object の due配列が空かつ disabled_reason が null であるとき、UI Status として ready を返す
 */

import type Stripe from "stripe";
import type { DatabaseStatus, UIStatus } from "../types/status-classification";

export class UIStatusMapper {
  /**
   * Database StatusとAccount ObjectからUI Statusを計算
   *
   * @param dbStatus Database Status (null の場合はアカウント未作成)
   * @param account Stripe Account Object (optional)
   * @returns UI Status
   */
  mapToUIStatus(dbStatus: DatabaseStatus | null, account?: Stripe.Account): UIStatus {
    // 要件 2.2: no_account - アカウント未作成
    if (!dbStatus) {
      return "no_account";
    }

    // 要件 2.5: restricted - ハード制限は独立表示
    if (dbStatus === "restricted") {
      return "restricted";
    }

    // 要件 2.3: unverified - 未提出
    if (dbStatus === "unverified") {
      return "unverified";
    }

    // 要件 2.4: requirements_due - due配列が非空または disabled_reason あり
    if (account && this.hasPendingRequirements(account)) {
      return "requirements_due";
    }

    // 要件 2.6: ready - verified かつ追加行動不要
    if (dbStatus === "verified") {
      return "ready";
    }

    // onboarding: デフォルト（審査中など）
    return "requirements_due";
  }

  /**
   * Account Objectに未完了の要件があるかチェック
   *
   * 要件 2.4: currently_due、past_due、eventually_due が非空、または disabled_reason が存在する場合
   *
   * @param account Stripe Account Object
   * @returns 未完了の要件が存在する場合 true
   */
  private hasPendingRequirements(account: Stripe.Account): boolean {
    const reqs = account.requirements;
    if (!reqs) {
      return false;
    }

    return (
      (reqs.currently_due?.length ?? 0) > 0 ||
      (reqs.past_due?.length ?? 0) > 0 ||
      (reqs.eventually_due?.length ?? 0) > 0 ||
      !!reqs.disabled_reason
    );
  }
}
