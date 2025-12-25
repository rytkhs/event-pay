# ADR-0002: Cloudflare Workers (OpenNext経由)にホスティングする

- Status: Accepted
- Date: 2025-12-21

## Context and Problem Statement
- 本プロジェクトは Next.js（App Router）ベースのフルスタックWebアプリケーションであり、個人開発プロジェクトとして低コストでの継続運用が重要である。
- 想定規模ではしばらくアクセスは小さいが、将来的にユーザー数・トラフィックが増えても運用コストの伸びを抑えたい。
- ホスティング候補として Vercel, Cloud Run, Cloudflare Workers が挙がったが、「無料〜低コストでの運用」と「Next.jsとの相性」を両立する必要があった。

## Decision Drivers
- 現状の規模で無料〜極小コストで運用できること（個人開発で維持し続けられる）。
- 将来的にスケールした場合でも、同等トラフィックを他サービスより安価に処理できる可能性が高いこと。
- Next.js をなるべく素直に動かせること（SSR/ルート構成/キャッシュなど）と、Node 互換のランタイムが提供されること。
- インフラ構成が複雑になりすぎず、個人で運用・トラブルシュートしやすいこと。

## Considered Options
- **Option A: Vercel**
  - 長所: Next.js との親和性が最も高く、デプロイも容易。
  - 短所: 無料枠の制約が厳しく、一定規模以上になるとランタイム・帯域に対するコストが気になりやすい。

- **Option B: Cloud Run**
  - 長所: コンテナベースで柔軟、トラフィックベース課金で小規模時は比較的安価に運用できる。
  - 短所: コンテナイメージのビルド・デプロイフローを自前で構築する必要があり、Next.js専用ではないため周辺の設定コストが高くなりやすい。

- **Option C: Cloudflare Workers + OpenNext（@opennextjs/cloudflare）**
  - 長所: 無料〜低コストでのエッジ実行が可能であり、トラフィック増加時も比較的コスト効率が良いと期待できる。
  - 長所: OpenNext の公式Cloudflareアダプタにより、Next.jsをWorkers上でNode互換に近い形で動作させられる。
  - 短所: Workers 固有の制約や OpenNext の互換性に注意が必要。

## Decision Outcome
Chosen option: **Option C: Cloudflare Workers + OpenNext（@opennextjs/cloudflare）**

理由:
- **コスト**: 現状の規模では Cloudflare の無料枠で十分に賄える見込みがあり、今後規模が大きくなっても Cloudflare のエッジ実行モデルは他選択肢よりもコスト効率が高いと判断した。
- **Next.jsとの相性**: OpenNext の Cloudflareアダプタは Next.js 用に設計されており、Node互換のランタイムを提供することで「ほぼそのまま」Next.jsアプリをWorkers上で動かせる。
- **運用のシンプルさ**: Vercelのようなマネージド体験とまではいかないものの、OpenNextのドキュメントに沿うことで、Cloud Run でコンテナを自前運用するよりもシンプルな構成でデプロイ・更新が可能と判断した。

## Consequences

### Good
- 個人開発として、低コストで長期運用しやすいインフラを選択できた。
- Cloudflare Workers + R2 などを活用した構成により、Next.jsのキャッシュやエッジ実行を活かした高パフォーマンスな運用が期待できる。
- OpenNext の公式アダプタを利用することで、Next.js のバージョンアップやWorkers側の更新にも追従しやすい土台ができた。

### Bad / Trade-offs
- OpenNext と Cloudflare Workers の双方のアップデートに追従する必要があり、Vercelに比べるとエコシステムの変化への追従コストは高い可能性がある。
- Workers ランタイムの制約（例: 一部Node API/モジュールの制限）があるため、ライブラリ選定や実装時に意識する必要がある。
- Cloud Run のような「フルLinuxコンテナ」に比べると柔軟性は低く、特殊なネイティブ依存などは扱いにくい。

## Implementation Notes
- OpenNext Cloudflare “Get Started” に沿って `@opennextjs/cloudflare` を導入し、`open-next.config.ts` や `wrangler.jsonc` を設定する。
- R2 incremental cache を利用する場合、`open-next.config.ts` 側で R2 設定を有効化し、Cloudflare 側に `cache` バケットを作成する。
- 本番ドメインとの接続は Cloudflare 側の設定で行う。

## Follow-ups
- アクセスが増えてきた際に、Workers のリソース制限・パフォーマンス・コストを定期的にレビューし、必要であれば別ADRでリホストを検討する。
- OpenNext のメジャーバージョンアップ時には、検証用環境で挙動を確認し、問題があれば回避策やアップグレード方針を別ADRに記録する。

## More Information
- OpenNext Cloudflare adapter: https://opennext.js.org/cloudflare
- Cloudflare Workers Next.js guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
