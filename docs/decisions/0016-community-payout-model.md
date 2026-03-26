# ADR-0016: G案（Community + PayoutProfile + スナップショット）を採用し、受取先と権限の土台を再設計する

- Status: Accepted
- Date: 2026-02-20


## Context and Problem Statement
- 現状のデータモデルでは `stripe_connect_accounts` が `users` と 1:1（`user_id PK`）で固定されており、以下の要件/運用に弱い。
  - 1ユーザーが複数コミュニティを運営する場合に、コミュニティ単位の「運営主体」「問い合わせ先」「公開ページ（Stripe提出URL）」を表現しづらい。
  - Connect account（受取先）が「ユーザーに固定」され、将来の受取先切替や運営主体の分離（共同主催、団体名義など）に拡張しにくい。
- Stripe Connect Express のオンボーディングで business URL が実務上必須であり、外部サイト/SNSを持たないコミュニティでも通せるように「サービス内の公開ページ」を恒久的に持つ必要がある。
- 受取先の変更・コミュニティの設定変更が将来起きても、過去イベント/過去決済の受取先がブレないように、イベント作成時点・決済時点での受取先を固定（スナップショット）する必要がある。


## Decision Drivers
- 運用事故耐性：受取先変更や権限変更があっても、過去データ（イベント/決済/清算）が破綻しないこと
- 拡張性：将来「1ユーザー=複数受取先（複数Connect）」や「共同管理」「団体名義」へ拡張できる余地があること
- Stripe要件適合：ConnectオンボーディングのURL要件を満たす公開ページを持てること
- データ整合性：DB制約で最低限の整合（主キー、外部キー、ユニーク、必要なCHECK）を担保できること


## Considered Options
- Option A: Community導入 + Connect accountをUserから独立（共有可能） + 代表コミュニティ固定 + スナップショット
- Option D: Community + Payout Profile（受取人抽象） + User↔PayoutProfile中間 + スナップショット（最も拡張的）
- Option G: Community + community_members + payout_profiles（当面 owner_user_id UNIQUE で 1ユーザー=1受取先） + communities.current_payout_profile_id（デフォルト） + events/paymentsの受取先スナップショット


## Decision Outcome
- 採用したオプション: Option G
- 選んだ理由（Decision Driversとの対応）
  - 運用事故耐性：コミュニティのデフォルト受取先（`communities.current_payout_profile_id`）と、イベント/決済のスナップショット（`events.payout_profile_id`, `payments.payout_profile_id`）で、受取先変更による過去データ破綻を防ぐ。
  - Stripe要件適合：コミュニティ公開ページ（slug等）を恒久的に持ち、Connect提出URLとして利用できる土台を作れる。
  - 実装/移行コスト：Dより中間テーブル等が少なく、段階移行しやすい。既存データが少ない現状で安全に移行できる。
  - 拡張性：当面は `payout_profiles.owner_user_id UNIQUE` により 1ユーザー=1受取先を保証しつつ、将来必要になれば UNIQUE を外して複数受取先へ拡張する余地を残す（D方向へ拡張可能）。


## Consequences
- Positive:
  - コミュニティという「運営単位」を導入でき、公開ページ・問い合わせ先・返金導線などをコミュニティ単位で持てる。
  - 受取先（payout_profile）を明示し、イベント作成時/決済時に固定できるため、後から設定変更しても過去データが安定する。
  - 共同運営（community_members）により、会計担当/閲覧者などの権限拡張が可能になる。
- Negative:
  - 当面 `owner_user_id UNIQUE` により 1ユーザー=1受取先を固定するため、複数Connectが必要になった場合は制約変更と機能拡張が必要。
  - 公開ページ運用（問い合わせ先、返金要約、特商法リンク等）の最低限要件を整備しないと、Stripe審査やチャージバック対応で不利になる可能性がある。


## Pros and Cons of the Options
### Option A
- Pros:
  - Connect accountをUserから独立でき、複数Communityで共有可能。
  - representative_community_idで提出URLをDBで固定でき、運用事故を減らせる。
- Cons:
  - Connectアカウントを直接扱う設計で、将来「受取人」という抽象（非Stripe含む）を入れたくなった場合に再整理が必要になる可能性。
  - User↔受取先の権限モデルが薄く、共同管理を強める場合に追加設計が必要。

### Option D
- Pros:
  - 受取人（PayoutProfile）を中心に最も拡張しやすい（複数受取先、共同管理、将来の要件追加に強い）。
- Cons:
  - MVPとしてはテーブル/権限が重くなり、実装・移行・運用コストが上がる。

### Option G
- Pros:
  - Dの思想（受取先の明示、スナップショット）を保ちつつ、MVPの実装量を抑えられる。
  - コミュニティのデフォルト受取先が明示され、運用が分かりやすい。
- Cons:
  - 複数受取先（複数Connect）を“今すぐ”要件化する場合は不足。将来拡張（UNIQUE解除＋UI/権限追加）が必要。
