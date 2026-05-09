describe("payout_requests RLS 統合テスト", () => {
  describe("参照権限", () => {
    // 所有者だけが履歴を読めることを固定する
    it.todo(
      "payout_profileのowner_user_idと一致するユーザーの時、自分のpayout_requestsを参照できること"
    );

    // 他ユーザーの入金履歴を読めないことを固定する
    it.todo(
      "payout_profileのowner_user_idと一致しないユーザーの時、他人のpayout_requestsを参照できないこと"
    );

    // コミュニティメンバーであるだけでは受取履歴を読めないことを固定する
    it.todo(
      "同じコミュニティに所属していてもpayout_profileのowner_user_idと一致しない時、payout_requestsを参照できないこと"
    );

    // metadata経由でIDが漏れても、DB参照はowner_user_id境界を越えない
    it.todo(
      "payout_request_idを知っていてもpayout_profileのowner_user_idと一致しない時、そのpayout_requestを参照できないこと"
    );
  });

  describe("書き込み権限", () => {
    // クライアントからの任意作成を許さないことを固定する
    it.todo(
      "authenticatedユーザーが直接payout_requestsをinsertしようとした時、RLSにより拒否されること"
    );

    // クライアントからの任意更新を許さないことを固定する
    it.todo(
      "authenticatedユーザーが直接payout_requestsをupdateしようとした時、RLSにより拒否されること"
    );

    // クライアントからの任意削除を許さないことを固定する
    it.todo(
      "authenticatedユーザーが直接payout_requestsをdeleteしようとした時、RLSにより拒否されること"
    );

    // Server ActionとWebhookのDB更新権限を固定する
    it.todo("service_roleの時、payout_requestsを作成・更新できること");
  });
});
