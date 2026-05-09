describe("Stripe Connect Payout Webhook 統合テスト", () => {
  describe("payout.paid", () => {
    // Worker経由でConnect PayoutイベントがDB更新まで到達する代表ケースを固定する
    it.todo("payout.paidを受け取った時、payout_requestがpaidへ更新されfailure情報が空であること");
  });

  describe("不正・未知イベント", () => {
    // Connect account外のイベントを誤処理しないことを固定する
    it.todo(
      "event.accountが対象payout_requestのstripe_account_idと一致しない時、payout_requestを更新しないこと"
    );

    // unsupported eventを副作用なしでACKすることを固定する
    it.todo(
      "payout以外の未対応Connectイベントを受け取った時、payout_requestsを更新せずACKされること"
    );
  });
});
