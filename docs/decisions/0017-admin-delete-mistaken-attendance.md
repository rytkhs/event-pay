# ADR-0017: 誤登録参加の削除は決済痕跡なしに限定し、DB RPCで最終判定する

- Status: Accepted
- Date: 2026-04-12

## Context and Problem Statement

参加者本人または管理者の入力ミスにより、誤った参加レコードが作成されることがある。

特に、以下のケースでは参加レコードの削除による救済が必要となる。

- 参加者本人が誤ったメールアドレスで登録してしまい、ゲストページURLもコピーしていない場合、通知メールも届かずURLも不明なためゲストページにアクセスできなくなる。
- この場合、現実的には再度正しいメールアドレスで登録し直すことになるが、システム側に削除機能がないと不要なゴミデータが残り続けてしまう。
- 管理者側が手動で参加者を追加する際に、誤った情報を入力してしまった場合も同様に不要なデータが残る。
- 削除機能を提供することで、これらの誤登録に対する実質的な救済フロー（間違えたら主催者に連絡して削除してもらい、正しく再登録する）が実現できる。

※なお、メールアドレスを間違えて登録したがゲストページにはアクセスできるケースもある（リマインドや決済完了メールは届かない）。これについては一旦レアケースとして許容し、将来的にはゲストページでメールアドレスを編集できる機能の追加を検討する。

一方で、本プロダクトは Stripe 決済と現金管理を扱うため、参加レコードを単純に削除すると以下の事故につながり得る。

- Stripe Checkout / PaymentIntent / Charge / Transfer / Fee / Refund など外部決済の証跡と内部DBの対応が失われる。
- Webhook の遅延・重複・順不同処理に対して、内部状態が巻き戻ったように見える。
- 入金済み・返金済み・会計処理済みの参加者を削除して、監査・問い合わせ・返金対応の根拠を失う。
- UIの表示条件やクライアント状態だけに依存すると、競合や権限漏れで本来削除できない参加が削除される。

そのため、「本当に誤登録として物理削除してよい参加」と「会計・決済の証跡として残すべき参加」を明確に分ける必要がある。

## Decision Drivers

- **主催者の自由度**: 誤登録を主催者が自力で解消でき、不要な参加データを残さず再登録できること。
- **決済整合性**: Stripe 側で一度でも処理が始まった可能性のある支払いは、内部DBから消さない。
- **監査性**: 物理削除を許す場合でも、誰が・どの参加を・なぜ削除したかを `system_logs` に残す。
- **権限境界**: UI表示やServer Actionの事前チェックだけでなく、DB側でイベント所有者とJWT主体を検証する。
- **競合耐性**: 削除直前に支払い状態が進行する可能性を考慮し、対象 attendance / payments をロックして判定する。
- **運用性**: 誤登録の削除 → 参加者が再登録できるようにし、管理者の手動修正コストを下げる。
- **既存ADRとの整合**: ADR-0005 の「Stripe Webhookを決済確定点として扱い、順不同・遅延を前提にする」方針を壊さない。

## Considered Options

- **Option A: 主催者権限があればすべての参加を削除可能にする**
  - 主催者の自由度は最大になる。
  - ただし、Stripe決済・返金・会計処理・問い合わせ対応の証跡と内部DBの対応を失う可能性がある。

- **Option B: `payments.status` が `pending` / `canceled` の参加は削除可能にする**
  - 決済完了済みや返金済みなど、明らかに会計処理が進んだ参加は守れる。
  - ただし、`pending` には「Stripe Checkoutを開始したが戻った」「Webhook待ち」「外部決済IDや冪等性キーだけ残っている」なども含まれ得る。

- **Option C: 決済・会計痕跡のない参加だけを削除可能にする（採用）**
  - `payments.status` だけでなく、Stripe / webhook / checkout idempotency / paid / refund / fee refund 等の痕跡も見る。
  - 誤登録救済の自由度を確保しつつ、決済や会計処理が始まった可能性のある参加は削除対象から外す。

- **Option D: 参加レコードは物理削除せず、取り消し状態に更新する**
  - 監査性は最大になる。
  - ただし、再登録・集計・一覧・一意制約で「取り消し済みを除外する」分岐が広がり、誤登録をきれいに消したい今回の運用要件に対して重い。

- **Option E: Stripe側のキャンセル・返金まで試みたうえで削除する**
  - Checkout Session / PaymentIntent / Charge など外部状態をAPIで巻き戻してから内部レコードを削除する。

## Decision Outcome

**Chosen option: Option C — 決済痕跡のない参加に限り、Security Definer RPCで最終判定して物理削除する。**

この決定は、誤登録削除を「主催者が自由に過去データを消す機能」ではなく、「決済・会計の証跡がまだ発生していない参加だけを、誤登録として取り除く救済機能」と位置づける。
主催者の自由度だけを最大化するなら Option A も成立するが、本プロダクトは Stripe 決済と現金管理を扱うため、削除後に外部決済・Webhook・返金・会計ログとの対応を復元できなくなるリスクを受け入れない。

一方で、Option D のようにすべてを取り消し状態として残す設計は監査性が高いが、誤登録の救済としては分岐と運用負荷が大きい。
そのため、今回は Option C を採用し、「決済・会計痕跡がない」という狭い条件の中でだけ物理削除を許可する。

具体的には、誤登録削除は次の条件をすべて満たす場合だけ許可する。

- 呼び出しユーザーが対象イベントのコミュニティ所有者である。
- DB RPC内で `request.jwt.claims.sub` とServer Actionから渡された `p_user_id` が一致する。
- 対象 attendance が対象 event に属している。
- 関連 payments が存在する場合でも、状態が `pending` または `canceled` に留まり、Stripe / webhook / checkout idempotency / paid / refund / fee refund などの決済・会計痕跡を持たない。

この条件を満たす場合、RPCは attendance を物理削除し、関連 payments はFK cascadeで削除される前提とする。
削除前に `system_logs` へ監査ログを記録し、UI境界では `app/**/actions.ts` の Server Action wrapper が `ActionResult` として成功・失敗を返す。

削除可否はUIにも返すが、最終判定はSecurity Definer RPCで行う。
RPC内で attendance / payments をロックし、権限確認・削除条件判定・監査ログ記録・物理削除を一括実行する。

Option B は、`pending` が必ずしも「決済に触れていない」を意味しないため採用しない。
Option E は、Stripe側に痕跡がある時点で誤登録削除ではなくキャンセル・返金の別フローとして扱うべきであり、この機能の責務を超えるため採用しない。

## Consequences

### Positive

- 誤登録だけを削除でき、同じメールアドレスで正しく再登録しやすくなる。
- 決済が進行した可能性のある参加は削除できないため、Stripe / webhook / 会計ログとの整合性を守れる。
- 権限確認・競合対策・削除可否の最終判定がDB側に集約され、UIの表示条件に依存しない。
- 物理削除後も `system_logs` に監査用の最小情報が残る。

### Negative

- 物理削除された attendance / payment の詳細レコードは通常のテーブルから消えるため、監査ログに残す情報の選定を誤ると後から調査しづらくなる。
- 「削除をブロックする決済痕跡」の条件は payment スキーマの変更に追従する必要がある。
- 参加者一覧で削除可否を表示するため、関連 payments を全件確認する必要があり、参加者数・支払い履歴が増えた場合はクエリ性能を再評価する必要がある。
- `SECURITY DEFINER` RPCのため、権限・`search_path`・GRANTの最小化を維持しないと権限境界が弱くなる。

## Links

- Migration: `supabase/migrations/20260411090000_admin_delete_mistaken_attendance.sql`
- Server Action wrapper: `app/(app)/events/[id]/participants/actions.ts`
- Action implementation: `features/events/actions/delete-mistaken-attendance.ts`
- Participant query: `features/events/actions/get-event-participants.ts`
