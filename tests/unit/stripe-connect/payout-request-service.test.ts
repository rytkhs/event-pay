describe("PayoutRequestService", () => {
  describe("getFreshPayoutBalance", () => {
    // Stripe残高のうち、入金実行可能額はavailableのみであることを固定する
    it.todo(
      "JPYのavailable残高とpending残高が存在する時、availableAmountとpendingAmountを分離して返すこと"
    );

    // pendingは入金可能額に含めないことを固定する
    it.todo("JPYのpending残高のみが存在する時、availableAmountは0でpendingAmountのみを返すこと");

    // 通貨違いの残高を誤ってJPYとして扱わないことを固定する
    it.todo(
      "JPY以外の残高のみが存在する時、JPYのavailableAmountとpendingAmountはいずれも0であること"
    );

    // Stripe API障害時のResult契約を固定する
    it.todo("Stripe残高取得に失敗した時、例外を外へ投げず失敗Resultを返すこと");
  });

  describe("requestPayout", () => {
    // 正常系の最小成功条件を固定する
    it.todo(
      "入金可能なpayout_profileとavailable残高が存在する時、available全額のpayout_requestを作成してStripe Payoutを作成すること"
    );

    // 入金実行可否はオンライン集金可否ではなくpayouts_enabledで判定する
    it.todo("payouts_enabledがfalseの時、Stripe Payoutを作成せず失敗Resultを返すこと");

    // アプリ内入金は現在のコミュニティの受取先に限定することを固定する
    it.todo(
      "現在のコミュニティにpayout_profileが紐付かない時、Stripe Payoutを作成せず失敗Resultを返すこと"
    );

    // available残高がない場合に空のPayoutを作らないことを固定する
    it.todo("available残高が0円の時、payout_requestもStripe Payoutも作成せず失敗Resultを返すこと");

    // pending残高だけでは入金可能にしないことを固定する
    it.todo(
      "pending残高が存在してavailable残高が0円の時、Stripe Payoutを作成せず失敗Resultを返すこと"
    );

    // 進行中リクエストの二重作成を防ぐことを固定する
    it.todo(
      "同じpayout_profileにrequestingのpayout_requestが存在する時、新しいStripe Payoutを作成せず失敗Resultを返すこと"
    );

    // 作成結果不明の二重実行を防ぐことを固定する
    it.todo(
      "同じpayout_profileにcreation_unknownのpayout_requestが存在する時、新しいStripe Payoutを作成せず失敗Resultを返すこと"
    );

    // Stripe作成済みのPayoutは履歴扱いにし、freshなavailable残高があれば次の入金を許可する
    it.todo(
      "同じpayout_profileにcreatedのpayout_requestのみが存在する時、新しいStripe Payoutを作成できること"
    );

    // 入金要求時は履歴状態に関係なくfreshな出金可否を確認する
    it.todo(
      "入金要求前に最新のpayout readinessを確認し、payouts_enabledがfalseならStripe Payoutを作成しないこと"
    );

    // 支払い済み履歴は次回要求を妨げないことを固定する
    it.todo(
      "同じpayout_profileにpaidのpayout_requestのみが存在する時、新しい入金要求を作成できること"
    );

    // Stripe metadataの追跡可能性を固定する
    it.todo(
      "Stripe Payout作成時、payout_request_idとpayout_profile_idとcommunity_idとrequested_byをmetadataに含めること"
    );

    // Connectのmanual payoutでは残高source typeを明示し、カード売上以外を誤って入金しない
    it.todo("Stripe Payout作成時、source_typeにcardを指定すること");

    // 冪等性キーの永続化を固定する
    it.todo(
      "Stripe Payout作成時、保存済みpayout_requestのidempotency_keyをStripeリクエストに使用すること"
    );

    // DB作成後にStripe作成成功した場合の状態遷移を固定する
    it.todo(
      "Stripe Payout作成に成功した時、payout_requestをcreatedに更新しstripe_payout_idを保存すること"
    );

    // active requestはrequesting / creation_unknownのみとし、同時クリックを単一に収束させる
    it.todo(
      "同じpayout_profileへの入金要求が同時実行された時、作成されるactiveなpayout_requestとStripe Payoutは1件だけであること"
    );

    // Stripe API前のDB作成失敗時に外部副作用を起こさないことを固定する
    it.todo("payout_requestの作成に失敗した時、Stripe Payoutを作成せず失敗Resultを返すこと");

    // Stripeの業務エラー時の状態を固定する
    it.todo(
      "Stripe Payout作成がinsufficient_fundsで失敗した時、payout_requestをfailedに更新して失敗Resultを返すこと"
    );

    // ネットワーク不定状態の扱いを固定する
    it.todo(
      "Stripe Payout作成結果がネットワークエラーで不明な時、payout_requestをcreation_unknownに更新して失敗Resultを返すこと"
    );

    // creation_unknownは新規作成ではなく同じidempotency_keyで復旧する。Stripeの冪等性キーは少なくとも24時間後にpruneされ得る。
    it.todo(
      "creation_unknownのpayout_requestを復旧する時、保存済みidempotency_keyと同じパラメータでStripe Payout作成を再試行すること"
    );

    // Stripeの冪等性契約に合わせ、復旧時に保存済みパラメータ以外で再試行しない
    it.todo(
      "creation_unknownのpayout_request復旧時に保存済みamountやcurrencyと異なる条件では再試行しないこと"
    );

    // 予期しないエラーでも境界契約を守ることを固定する
    it.todo("想定外のエラーが発生した時、例外を外へ投げず失敗Resultを返すこと");

    // 残高キャッシュ更新の責務を固定する
    it.todo("Stripe Payout作成に成功した時、対象stripe_account_idの残高キャッシュを無効化すること");
  });

  describe("syncPayoutFromWebhook", () => {
    // metadataは自社DB IDの紐付けに使うが、Connect webhookの外部入力なのでstripe_account_id照合は必須
    it.todo(
      "payout.metadata.payout_request_idが存在しevent.accountとpayout_request.stripe_account_idが一致する時、そのpayout_requestを更新すること"
    );

    // metadataが別アカウントのrequestを指す場合に誤更新しないことを固定する
    it.todo(
      "payout.metadata.payout_request_idが存在してもevent.accountとpayout_request.stripe_account_idが一致しない時、更新せずリトライ不要の失敗Resultを返すこと"
    );

    // metadataが正しくても、保存済みstripe_payout_idと別のPayout IDなら誤更新しない
    it.todo(
      "payout.metadata.payout_request_idが存在しても保存済みstripe_payout_idとpayout.idが矛盾する時、更新せずリトライ不要の失敗Resultを返すこと"
    );

    // metadata欠落時の復旧経路を固定する
    it.todo(
      "payout.metadata.payout_request_idが存在しない時、stripe_payout_idでpayout_requestを特定して更新すること"
    );

    // 作成イベントの状態反映を固定する
    it.todo("payout.createdを受け取った時、payout_requestをcreatedに更新すること");

    // 汎用更新イベントの状態反映を固定する
    it.todo("payout.updatedを受け取った時、Stripe Payoutのstatusに対応する状態へ更新すること");

    // 入金完了の状態反映を固定する
    it.todo("payout.paidを受け取った時、payout_requestをpaidに更新しfailure情報を残さないこと");

    // 入金失敗の状態反映を固定する
    it.todo(
      "payout.failedを受け取った時、payout_requestをfailedに更新しfailure_codeとfailure_messageを保存すること"
    );

    // キャンセルの状態反映を固定する
    it.todo("payout.canceledを受け取った時、payout_requestをcanceledに更新すること");

    // webhook冪等性を固定する
    it.todo("同じStripe Payoutイベントを複数回受け取った時、同じ最終状態に更新されること");

    // Stripeはイベント順序を保証しない。古いpending/in_transit系イベントでpaid/failedを巻き戻さない。
    it.todo(
      "paidまたはfailedのpayout_requestに古いpayout.createdやpendingのpayout.updatedが届いても、状態をcreatedへ巻き戻さないこと"
    );

    // Stripeでは失敗するPayoutが一度paidに見えてからfailedへ変わる場合があるため、この遷移だけは許可する
    it.todo(
      "paidのpayout_requestにpayout.failedが届いた時、failedへ更新しfailure情報を保存すること"
    );

    // 未知Payoutの扱いを固定する
    it.todo("対応するpayout_requestが存在しない時、リトライ不要の失敗Resultを返すこと");
  });

  describe("configureManualPayoutSchedule", () => {
    // 新規Connectアカウントはアプリ内入金管理が標準。外部API実状態ではなくStripe呼び出し引数をunitで固定する。
    it.todo(
      "新規Connectアカウント作成後、payout scheduleをmanualに更新するStripe APIを呼び出すこと"
    );

    // StripeのBalance Settings APIへ渡すmanual schedule引数を固定する
    it.todo(
      "payout scheduleのmanual設定時、payments.payouts.schedule.intervalにmanualを指定すること"
    );

    // manual化に失敗したアカウントは、アプリ内入金の前提を満たさないためready扱いしない
    it.todo(
      "payout scheduleのmanual設定に失敗した時、payout_profileを入金可能状態として扱わない失敗Resultを返すこと"
    );
  });
});
