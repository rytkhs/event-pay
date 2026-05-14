import { describe, it } from "@jest/globals";

describe("PayoutRequestService payout手数料", () => {
  describe("実Stripe資金フロー", () => {
    // 実際のStripe Test環境で、Account DebitとPayoutが同一requestに紐づき金額・追跡情報が保存されることを確認する
    it.todo(
      "connected accountにavailable残高が存在する時、Account Debitでsystem_fee_amountをplatformへ回収し、残額のPayoutを作成し、DBスナップショットとStripe object IDを保存すること"
    );

    // Payout webhook同期が既存のPayout由来フィールドを更新しつつ、Account Debit追跡情報を壊さないことを確認する
    it.todo(
      "Payout webhookを受信した時、Payout由来フィールドは更新されsystem_fee_stateとAccount Debit追跡フィールドは維持されること"
    );
  });

  describe("実DB制約", () => {
    // system_fee_stateの許容値をDB enumで固定する
    it.todo(
      "payout_requestsへ許可されていないsystem_fee_stateを保存しようとした時、DB制約で拒否されること"
    );

    // 手数料と振込額の関係をDB側でも破れないようにする
    it.todo(
      "payout_requests.amountがgross_amountからsystem_fee_amountを差し引いた金額と一致しない時、DB制約で拒否されること"
    );

    // 手数料が0円以下の不正設定をDB側で拒否する
    it.todo(
      "fee_configのpayout_request_fee_amountに0円以下を保存しようとした時、DB制約で拒否されること"
    );
  });

  describe("残高不足", () => {
    // 実Stripe操作を開始せず、DBにも中途半端なrequestを残さないことを確認する
    it.todo(
      "connected accountのavailable残高がsystem_fee_amount以下の時、Account DebitもPayoutも作成せずpayout_requestも作成しないこと"
    );
  });
});
