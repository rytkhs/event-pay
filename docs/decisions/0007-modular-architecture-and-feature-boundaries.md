# ADR-0007: Feature間の相互依存禁止とindex.ts公開API制約

- Status: Superseded
- Date: 2025-12-21
- Superseded by: ADR-0011
- Note: 本ADRのうち **entry-point制約（index.tsのみ許可）** の方針は ADR-0011 により置き換え。Feature間相互依存禁止／レイヤ境界／ESLint強制の方針は引き続き有効。

## Context and Problem Statement

event-payアプリケーションは、イベント管理、招待、ゲスト管理、決済処理、Stripe Connect連携など、複数の機能ドメインを持つシステムです。これらの機能モジュール（features/配下）が相互に依存し合うと、以下の問題が発生する：

- **循環依存の発生**: Feature AがFeature Bを参照し、Feature BがFeature Aを参照する循環が生まれやすい
- **変更影響範囲の拡大**: 一つのFeatureの変更が他のFeatureに連鎖的に影響し、修正コストが増大
- **テスト困難性**: 相互依存により、各Featureを独立してテストすることが困難
- **コードの理解困難性**: どのモジュールがどこに依存しているか追跡が難しく、新規参入者の学習コストが高い
- **内部実装の漏洩**: Feature内部の実装詳細が他Featureから直接参照され、カプセル化が破壊される

## Decision Drivers

1. **保守性**: コードの変更が局所的に収まり、影響範囲を最小化できること
2. **テスタビリティ**: 各モジュールを独立してテスト可能であること
3. **理解容易性**: 新規開発者がアーキテクチャの制約をすぐに理解できること
4. **強制力**: ルール違反を自動検出し、コードレビュー前に防げること
5. **段階的移行**: 既存コードを段階的にリファクタリング可能であること
6. **ビルド時間**: アーキテクチャ制約がビルド時間に悪影響を与えないこと

## Considered Options

### Option A: Feature間の完全な相互参照許可
各Featureが自由に他のFeatureをimportできる状態。

### Option B: 手動レビューによる依存管理
コードレビュー時に人間が依存関係をチェックし、不適切な依存を指摘する。

### Option C: 厳格なレイヤードアーキテクチャ + ESLint強制 + index.ts公開API（採用）
ESLint（eslint-plugin-boundaries）を使用して、以下を強制する：
- Feature間の相互依存を完全禁止
- Featureはcoreとcomponents/uiのみ参照可能
- 各Featureのindex.tsを通じた公開APIのみアクセス許可

## Decision Outcome

**採用オプション**: Option C（厳格なレイヤードアーキテクチャ + ESLint強制 + index.ts公開API）

### アーキテクチャ階層

以下の4層構造を採用し、上位層のみが下位層を参照できる：

```
app/ (最上位)
  ↓ 全層にアクセス可能
features/ (機能層)
  ↓ core/とcomponents/uiのみ
core/ (共通ロジック層)
  ↓ 自身とtypesのみ
components/ui/ (UI部品層・最下位)
  ↓ typesのみ
```

### Feature間依存禁止とentry-point制約

- **Feature間の相互参照を完全禁止**: features/events/がfeatures/payments/を直接importできない
- **index.tsのみをentry-pointとして許可**: 各Featureはindex.{js,ts,tsx}を通じてのみ外部公開

### 公開API設計

各Featureはindex.tsで明示的に公開するものを制御する。

### 選定理由

1. **保守性**: Feature間の依存がcoreを経由する形に限定され、変更影響が予測可能
2. **テスタビリティ**: 各Featureがcoreとcomponentsのモックで独立テスト可能
3. **理解容易性**: ESLintエラーメッセージで即座に違反を把握でき、学習曲線が緩やか
4. **強制力**: CI/CDパイプラインでLintが失敗するため、ルール違反がマージされない
5. **段階的移行**: overrides設定で個別Featureごとに段階的に制約を導入可能
6. **ビルド時間**: 静的解析のみで実行時オーバーヘッドなし

## Consequences

### Positive

1. **循環依存の排除**: Feature間の循環依存が構造的に不可能になる
2. **変更影響の局所化**: Featureの内部実装変更が他Featureに影響しない（公開APIが変わらない限り）
3. **カプセル化の強化**: index.ts以外の内部実装ファイルが外部から参照できない
4. **ドキュメント性の向上**: index.tsを見れば各Featureの公開APIが一目瞭然
5. **テストの独立性**: 各Featureを他Featureのモック化なしでテスト可能
6. **リファクタリングの安全性**: Feature内部の構造変更が外部に影響しない
7. **新規参入者の学習支援**: ESLintエラーがアーキテクチャルールを教えてくれる
8. **coreへの共通ロジック集約**: 複数Featureで必要な機能がcoreに自然に集約される

### Negative

1. **初期学習コスト**: 新規開発者がレイヤードアーキテクチャを理解する必要がある
2. **共通ロジックの抽出作業**: Feature間で共有したい機能をcoreに移動する追加作業が発生
3. **迂回的な実装**: Feature AからFeature Bの機能を使いたい場合、app層やcoreを経由する必要がある
4. **index.tsメンテナンス**: 新規export追加時にindex.tsの更新が必要
5. **過度な抽象化リスク**: coreに不必要な抽象化が入り込む可能性（ただし、READMEやレビューで対処可能）

## Pros and Cons of the Options

### Option A: Feature間の完全な相互参照許可

**Pros:**
- 実装が最も簡単で自由度が高い
- 既存コードの変更不要

**Cons:**
- 循環依存が容易に発生
- 変更影響範囲が予測不可能
- テストが困難（モックの連鎖が必要）
- 長期的に技術的負債が増大

### Option B: 手動レビューによる依存管理

**Pros:**
- ツール導入が不要
- 柔軟な判断が可能

**Cons:**
- レビュアーの負担が大きい
- レビューのムラで違反が見逃される
- 新規参入者がルールを把握しづらい
- ルールが暗黙知化する

### Option C: 厳格なレイヤードアーキテクチャ + ESLint強制（採用）

**Pros:**
- 自動チェックで人的ミスを排除
- ルール違反が即座に検出される
- アーキテクチャが形式知化される
- 長期的な保守性が向上

**Cons:**
- ESLint設定の初期コスト
- 開発者の学習コスト
- 一部の実装で迂回が必要

## Links

- ESLint設定: `.eslintrc.json` - boundaries/element-typesとboundaries/entry-pointルール
- 参考: eslint-plugin-boundaries公式ドキュメント
- ADR-0011: Featureのserver-only公開エントリ（server.ts）の導入
