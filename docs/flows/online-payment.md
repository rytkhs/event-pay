# オンライン決済フロー（Online Payment / Stripe）

## 概要
本ドキュメントは、ゲストがStripeでオンライン決済を行い、Webhookを起点に非同期処理でDBの支払い状態を確定するまでのフローを説明する。
スコープ: Checkout Session 作成 → Stripe決済 → Webhook受付 → QStash経由のWorker処理 → `payments` の更新。

## Non-goals
- 返金のUI提供は扱わない（返金はStripe側操作を前提）。
- Stripe Connect のオンボーディング詳細は扱わない。
- 料金計算（platform fee 等）の仕様詳細は、DB/ドメインの正を参照し、本ドキュメントでは“どこで使うか”に留める。

## 登場人物・コンポーネント
- Guest: RSVP後、オンライン決済を選択して支払う参加者。
- App（Next.js on Cloudflare Workers / OpenNext）: Checkout Session作成とWebhook受付を担当する。
- Stripe: Checkoutで決済をホストし、イベントをWebhookで通知します。
- QStash: Webhook処理をキューイングし、再試行や重複排除を担います。
- Worker（`/api/workers/stripe-webhook`）: 非同期でDB更新を実施します。
- Supabase（PostgreSQL + RLS）: `payments` 等の永続化と整合性を担います。

## 正常系フロー
1. Guestが「オンライン決済（Stripe）」を選択して支払い開始する（前段のRSVP/Attendance作成は `guest-rsvp.md` を参照）。
2. Appは `createGuestStripeSessionAction`でStripe Checkout Sessionを作成し、Guestを `session.url` にリダイレクトする。
3. GuestがStripe上で決済を完了すると、StripeはWebhookイベント（例: `payment_intent.succeeded`）を送信する。
4. Webhook Handlerは署名検証・IP等のチェックを行い、重いDB更新は行わず、QStashへイベント処理をPublishして即時ACKする。
5. QStashがWorker（`/api/workers/stripe-webhook`）を呼び出し、WorkerがDBの `payments.status` を `paid` に更新する。

### シーケンス図（概略）
```
sequenceDiagram
  participant G as Guest
  participant App as EventPay (Next.js)
  participant Stripe as Stripe Checkout
  participant WH as Webhook Handler
  participant Q as QStash
  participant W as Worker
  participant DB as Supabase

  G->>App: 決済開始
  App->>Stripe: Checkout Session作成（idempotency key）
  Stripe-->>App: session.url
  App-->>G: Stripeへリダイレクト

  G->>Stripe: 決済
  Stripe->>WH: payment_intent.succeeded（Webhook）
  WH->>WH: 署名検証 / IPチェック
  WH->>Q: Publish（deduplication）
  WH-->>Stripe: 200 OK（ACK）

  Q->>W: POST /api/workers/stripe-webhook
  W->>DB: payments.status = paid 更新
  W-->>Q: 200 OK
```

## 冪等性・重複排除（要点）
- Checkout Session作成はStripe APIの再試行を安全にするため、idempotency key を利用する。
- Webhook処理は「Webhook → QStash publish → WorkerでDB更新」に分離し、同一イベントの重複処理を避けるため deduplication id を用いる。
- DB側でも一意制約（例: Stripeの識別子やWebhook event id、Checkoutのキー等）を利用し、二重反映を防ぐ。

## 失敗時の扱い（要点）
- Webhook Handlerは“受け取った”ことを優先してACKし、後続はキューで再試行させる（Stripeの再送・タイムアウトと切り離すため）。
- キュー/Workerの失敗は再試行し、それでも失敗する場合はDLQ等に送って観測可能にする。
- 最終的な支払い状態は `payments.status` を正として扱い、UIは「pending → paid」の非同期確定を許容する。

## セキュリティ・観測（このフローで重要なもの）
- Stripe Webhookは署名シークレット（primary/secondary）を用いて検証し、許容タイムスタンプ範囲を設ける。
- QStashからの呼び出しは署名キーで検証する。
- 重要イベント（webhook/決済/セキュリティ）は構造化ログとして出力し、相関IDで追跡できるようにする。

## 関連ドキュメント
- データモデル: `docs/data-model.md`（`payments`/冪等性キー/enum）
- ADR: `docs/decisions/0005-payment-confirmation-and-idempotency.md`、`docs/decisions/0010-qstash-webhook-processing-and-observability.md`
