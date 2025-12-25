# ADR-0004: Stripe ConnectはExpress（Express Dashboard + Stripeホストのオンボーディング）を採用

- Status: Accepted
- Date: 2025-12-21

## Context and Problem Statement
本サービスでは、イベント主催者（大学サークル運営者など）が“受取人”となり、参加者決済を主催者へ分配・振込しつつ、主催者が自分の入金状況を確認できる導線が必要である。
Connectの連結アカウント設計では、オンボーディング/KYC、入金設定、ダッシュボード提供、紛争（disputes）や返金の責任分界をどこに置くかが選定の中心課題になる。

## Decision Drivers
- **オンボーディングの完了率**: フォーム作成や法対応の追従を最小化し、Stripe側に本人確認・要件変更対応を寄せたい。
- **運営者体験（セルフサーブ）**: 主催者が自分の残高・入金予定・収益等を確認できるダッシュボードを提供したい。
- **実装・運用負担**: 低い統合コストで開始し、将来の拡張余地も確保したい（完全ホワイトラベルは当面不要）。
- **責任分界**: MVPではプラットフォーム側が返金/紛争を運用で扱える範囲に留め、接続アカウント側に運用負担を寄せすぎない。
- **ブランディング最小要件**: “完全ホワイトラベル”は不要だが、少なくとも主催者が見る画面にサービス名/アイコンを出したい。

## Considered Options
- Option A: **Express connected accounts（Express）**
  Stripeがオンボーディングと本人確認（identity verification）を担い、主催者向けに軽量なExpress Dashboardを提供する。
- Option B: Standard connected accounts（Standard）
  主催者が通常のStripeアカウントとしてフルDashboardにログインし、自分で運用できる形に寄せる。
- Option C: Custom connected accounts（Custom）
  主催者から見てStripeをほぼ不可視にし、プラットフォームが情報収集・サポート・画面提供までを担う。

## Decision Outcome
採用したオプション: **Option A（Express）**。
理由: ExpressはStripeがオンボーディング/本人確認を担い、主催者はExpress Dashboardで入金確認できるため、MVP要件（主催者の入金可視化＋低運用負担）に最も合致する。
またExpress Dashboardはプラットフォームのブランド名・アイコン表示や機能の出し分けが可能で、“最低限のブランディング”要件も満たせる。

## Consequences
- Positive: Stripeがオンボーディングと本人確認を担うため、法対応や要件変更時の情報収集をStripeがプロアクティブに行う運用に寄せられる。
- Positive: 主催者はExpress Dashboardで残高・入金予定・収益などを確認でき、会計担当の問い合わせ対応を減らせる。
- Positive: Expressは統合コストが低めで、Customより実装工数を抑えて開始できる。
- Negative: Express/Customには追加コストがあるため、主催者数が増えるとConnectコストが増加する。
- Negative: 返金・紛争対応の責任はプラットフォーム側に寄るため、運用手順（問い合わせ、返金フロー、証跡管理）を整備する必要がある。

## Pros and Cons of the Options

### Option A: Express
- Pros: Stripeがオンボーディングと本人確認を実施する。
- Pros: 主催者向けにExpress Dashboard（軽量版Dashboard）が提供され、個人情報管理や入金確認が可能。
- Pros: Express Dashboardはプラットフォーム名・アイコン表示、テーマや表示機能の設定が可能。
- Cons: 返金・紛争対応はプラットフォーム責任となる。
- Cons: Expressには追加コストが発生する。

### Option B: Standard
- Pros: 接続アカウントはフルのStripe Dashboardにアクセスでき、主催者がStripeと直接関係を持てる。
- Pros: 統合コストが最も低い分類である。
- Cons: 主催者がStripe運用に慣れていない場合、オンボーディング/運用のハードルが上がりやすい（想定ユーザーが大学サークル等の場合に不利）。
- Cons: 資金フローや体験の統制がExpressより弱くなりやすい（「主催者が自分で処理できる」前提が強まる）。

### Option C: Custom
- Pros: 主催者からStripeをほぼ不可視にでき、完全ホワイトラベル体験を構築できる。
- Pros: 主催者にDashboardを持たせず、設定変更（例: 振込先）をAPIでプラットフォームが管理できる。
- Cons: 接続アカウント情報の収集、独自ダッシュボード、サポート等のインフラが必要で統合コストが大きい。
- Cons: 新しいコンプライアンス要件への自動追従がExpress/Standardに比べ弱い。

## Links
- Stripe Docs: Connect account types（Standard/Express/Custom）: https://docs.stripe.com/connect/accounts
- Stripe Docs: Customize the Express Dashboard: https://docs.stripe.com/connect/customize-express-dashboard
