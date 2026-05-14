import { describe, it } from "@jest/globals";

describe("PayoutRequestService payout手数料", () => {
  describe("payout可否判定", () => {
    // 手数料を差し引いても1円以上payoutできる場合のみ、リクエスト可能にする意図を固定する
    it.todo(
      "available残高がsystem_fee_amountを超える時、system_fee_amountを差し引いた金額でpayout可能であること"
    );

    // system_fee_amountを不可条件にする
    it.todo(
      "available残高がsystem_fee_amount以下の時、payoutリクエスト不可でありStripe操作を開始しないこと"
    );

    // fee_configの現在値を画面表示・リクエスト作成の単一の入力値にする
    it.todo(
      "fee_configのpayout_request_fee_amountが変更されている時、その値をsystem_fee_amountとしてpayout可否判定に使用すること"
    );
  });

  describe("payoutリクエスト作成", () => {
    // 監査・二重実行防止・振込額の正当性を担保する初期値を保存する
    it.todo(
      "payoutリクエスト作成時に、fee_configからのsystem_fee_amount、gross_amountから差し引いたamount、分離された各idempotency keyをDBへ保存すること"
    );

    // Account Debitが成功するまでpayoutを作らない資金フローと、監査・手動復旧用のStripe object保存を固定する
    it.todo(
      "Account Debitが成功した時、fee stateをsucceededにし、Transfer IDとPayment IDを保存して差引後金額のPayoutを作成し、返却payloadのamountも差引後の金額であること"
    );
  });

  describe("Account Debit失敗時の扱い", () => {
    // 手数料を回収できていない状態でpayoutを作らないことを固定する
    it.todo(
      "Account Debitが確定失敗した時、Payoutを作成せずsystem_fee_stateをfailedにしてpayout_requestをfailedにすること"
    );

    // Stripe接続/APIエラーでAccount Debitの成否が不明な場合に二重徴収を避ける
    it.todo(
      "Account Debitの作成成否が不明な時、Payoutを作成せずsystem_fee_stateをcreation_unknownにしてpayout_requestをcreation_unknownにすること"
    );
  });

  describe("Account Debit作成成否不明からの復旧", () => {
    // 期限内の復旧では二重徴収を避けるため、初回と同じAccount Debit idempotency keyを使う
    it.todo(
      "Account Debitのcreation_unknownが期限内に再実行された時、同じAccount Debit idempotency keyで復旧し成功確認後にPayoutを作成すること"
    );

    // 期限内の復旧でAccount Debit未作成が確定した場合は、payoutを作らず失敗確定にする
    it.todo(
      "Account Debitのcreation_unknownが期限内に再実行され確定失敗した時、Payoutを作成せずsystem_fee_stateをfailedにしてpayout_requestをfailedにすること"
    );

    // 不明状態の自動復旧期限を超えた場合は人間の確認に切り替える
    it.todo(
      "Account Debitのcreation_unknownが復旧期限を超えた時、system_fee_stateをmanual_review_requiredにしてAccount DebitもPayoutも再実行しないこと"
    );
  });

  describe("Account Debit成功後のPayout失敗時の扱い", () => {
    // 260円回収済みのため二重徴収を避け、手動確認対象を運用上特定できるよう状態を明示する
    it.todo(
      "Account Debit成功後にPayout作成が確定失敗した時、system_fee_state=succeeded、status=manual_review_required、failure_code=payout_creation_failed_after_fee_collectedとして保存すること"
    );

    // Payout作成の成否が不明な場合は、fee回収済み状態を維持したままPayout復旧対象にする
    it.todo(
      "Account Debitが成功した後にPayout作成の成否が不明な時、system_fee_stateはsucceededのままpayout_requestをcreation_unknownにすること"
    );

    // Payout復旧ではAccount Debitを再実行せず、Payout用idempotency keyだけを再利用する
    it.todo(
      "Account Debit成功後のPayout creation_unknownでユーザーが再試行した時、Account Debitを再実行せず同じPayout idempotency keyでPayout作成を復旧すること"
    );

    // Payoutの作成成否不明が期限切れになっても、回収済みfeeの状態は巻き戻さない
    it.todo(
      "Account Debit成功後のPayout creation_unknownが復旧期限を超えた時、system_fee_stateはsucceededのままpayout_requestをmanual_review_requiredにすること"
    );

    // 手動確認のみとし、ユーザー操作による自動再試行を許可しない
    it.todo(
      "manual_review_requiredのpayout_requestが存在する時、再度requestPayoutを呼んでもAccount DebitもPayoutも作成しないこと"
    );
  });

  describe("画面表示用状態", () => {
    // 手数料以下の残高で既存のno_available_balanceと区別できるようにする
    it.todo(
      "available残高がsystem_fee_amount以下の時、PayoutPanelStateのdisabledReasonはbelow_payout_feeであること"
    );

    // 既に手数料回収済みで手動確認が必要な状態をUIで復旧ボタンにしない
    it.todo(
      "Account Debit成功後のmanual_review_requiredが最新requestの時、PayoutPanelStateはrequest_in_progressとしてpayout再実行不可であること"
    );
  });
});
