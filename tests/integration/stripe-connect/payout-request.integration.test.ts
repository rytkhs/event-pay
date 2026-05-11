describe("PayoutRequestService 統合テスト", () => {
  describe("入金要求の作成", () => {
    // Service境界から実DB保存とStripe Payout作成まで到達する代表ケースを固定する
    it.todo(
      "現在のコミュニティに入金可能なpayout_profileとavailable残高が存在する時、payout_requestがcreatedで保存されStripe Payout IDが保存されること"
    );

    // アプリ内入金は現在のコミュニティの受取先に限定することを固定する
    it.todo(
      "現在のコミュニティにpayout_profileが紐付かない時、payout_requestもStripe Payoutも作成されないこと"
    );

    // 入金実行可否はオンライン集金可否ではなくpayouts_enabledで判定する
    it.todo("payouts_enabledがfalseの時、payout_requestもStripe Payoutも作成されないこと");

    // available残高0円で空の入金を作らないことを固定する
    it.todo("available残高が0円の時、payout_requestもStripe Payoutも作成されないこと");

    // 追跡可能性はDB保存を統合テストで固定し、Stripe呼び出し引数の詳細はunitで固定する
    it.todo(
      "入金要求に成功した時、payout_requestに追跡用カラムと一意なidempotency_keyが保存されること"
    );
  });

  describe("DB制約", () => {
    // Stripe webhook復旧と二重登録防止のためDB制約を固定する
    it.todo("同じstripe_payout_idのpayout_requestを複数保存できないこと");

    // Stripe冪等性キーの再利用事故をDB制約で防ぐ
    it.todo("同じidempotency_keyのpayout_requestを複数保存できないこと");
  });

  describe("二重実行と再実行", () => {
    // 未完了リクエストの二重作成をサービス境界で防ぐことを固定する
    it.todo(
      "同じpayout_profileにrequestingのpayout_requestが存在する時、新しい入金要求は作成されないこと"
    );

    // 作成済みリクエストは履歴扱いにし、freshなavailable残高があれば次の入金を許可する代表ケースを固定する
    it.todo(
      "同じpayout_profileにcreatedのpayout_requestのみが存在する時、新しい入金要求を作成できること"
    );

    // active requestはrequesting / creation_unknownのみとし、同時クリックを単一に収束させる
    it.todo(
      "同じpayout_profileへの入金要求が同時実行された時、activeなpayout_requestは1件だけ作成されること"
    );
  });
});
