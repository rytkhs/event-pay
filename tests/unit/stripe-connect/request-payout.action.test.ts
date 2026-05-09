describe("requestPayoutAction", () => {
  // UI境界の成功レスポンス契約を固定する
  it.todo(
    "現在のコミュニティで入金要求に成功した時、payoutRequestIdとamountとstatusを含む成功ActionResultを返すこと"
  );

  // 認証なしでは実行できないことを固定する
  it.todo("ログインユーザーを解決できない時、入金要求を実行せず失敗ActionResultを返すこと");

  // コミュニティ未選択時の境界契約を固定する
  it.todo("現在のコミュニティを解決できない時、入金要求を実行せず失敗ActionResultを返すこと");

  // 内部AppResultをUI向けActionResultへ投影することを固定する
  it.todo(
    "PayoutRequestServiceが失敗Resultを返した時、userMessageを含む失敗ActionResultを返すこと"
  );

  // Action境界で例外を握りつぶさず契約に変換することを固定する
  it.todo("想定外のエラーが発生した時、INTERNAL_ERRORの失敗ActionResultを返すこと");
});
