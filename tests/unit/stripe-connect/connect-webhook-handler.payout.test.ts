describe("ConnectWebhookHandler - Payout events", () => {
  describe("handlePayoutCreated", () => {
    // payout.createdの委譲先を固定する。event.account照合はサービス側で必ず行う。
    it.todo(
      "payout.createdを受け取った時、event.account付きでpayout_requestをcreatedへ同期すること"
    );
  });

  describe("handlePayoutUpdated", () => {
    // Stripeはイベント順序を保証しないため、サービス側で巻き戻し防止または最新Payout取得を行う
    it.todo(
      "payout.updatedを受け取った時、event.account付きでpayout_requestをStripe Payoutの現在状態へ同期すること"
    );
  });

  describe("handlePayoutPaid", () => {
    // 既存のログのみ実装からDB更新へ変えることを固定する
    it.todo("payout.paidを受け取った時、ログ出力だけで終えずpayout_requestをpaidへ同期すること");
  });

  describe("handlePayoutFailed", () => {
    // 既存のログのみ実装からDB更新へ変えることを固定する。Stripeではpaid後にfailedへ変わる場合がある。
    it.todo(
      "payout.failedを受け取った時、ログ出力だけで終えずpayout_requestをfailedへ同期すること"
    );
  });

  describe("handlePayoutCanceled", () => {
    // キャンセル状態を履歴に残すことを固定する
    it.todo("payout.canceledを受け取った時、payout_requestをcanceledへ同期すること");
  });
});
