describe("requestPayoutAction 統合テスト", () => {
  describe("Action境界", () => {
    // Server Actionから認証・current community解決・実DBの入金要求作成まで到達することを固定する
    it.todo(
      "ログイン済みユーザーが現在のコミュニティで入金要求した時、成功ActionResultと作成済みpayout_requestを返すこと"
    );

    // 未認証ではAction境界で止まり、Service/Stripe/DB副作用を起こさないことを固定する
    it.todo(
      "ログインユーザーを解決できない時、payout_requestもStripe Payoutも作成されず失敗ActionResultを返すこと"
    );
  });
});
