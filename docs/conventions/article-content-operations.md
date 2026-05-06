# 記事コンテンツ運用ルール

`/articles` 配下の集客記事は、Markdown + frontmatter で管理する。記事は `content/articles/*.md` に1記事1ファイルで追加し、公開記事だけが一覧・詳細・sitemap・静的生成対象に含まれる。

公式告知は `/announcements` に分け、`docs/conventions/announcement-content-operations.md` の運用ルールに従う。記事側のSEO項目やタグ運用を、お知らせの frontmatter に持ち込まない。

## ファイル配置

記事ファイルは次の場所に置く。

```txt
content/articles/{slug}.md
```

例:

```txt
content/articles/event-fee-collection-methods.md
```

`slug` はファイル名と frontmatter の `slug` を必ず一致させる。一致しない場合はビルド時にエラーにする。

## Frontmatter

必須項目:

```yaml
---
title: "イベント集金をラクにする方法"
description: "検索結果やSNS共有で表示される記事説明文。120〜160字程度を目安にする。"
slug: "event-fee-collection-methods"
publishedAt: "2026-04-26"
status: "published"
---
```

任意項目:

```yaml
updatedAt: "2026-04-26"
category: "集金ノウハウ"
tags:
  - "イベント集金"
  - "サークル運営"
author: "みんなの集金編集部"
heroImage: "/images/articles/event-fee-collection-methods.webp"
```

ルール:

- `slug` は英小文字・数字・ハイフンのみを使う。
- `publishedAt` と `updatedAt` は `YYYY-MM-DD` 形式にする。
- `description` は検索流入向けに、記事の結論や対象読者が分かる文にする。
- `status` は `draft` または `published` のみ。
- `tags` は多くても3〜5個程度に抑える。

## 公開条件

記事が公開される条件:

- `status: "published"` である。
- `publishedAt` が今日以前の日付である。
- frontmatter が schema に通る。
- ファイル名の slug と frontmatter の `slug` が一致している。

次の記事は本番の一覧・詳細・sitemap・静的生成対象に含めない。

- `status: "draft"` の記事。
- `publishedAt` が未来日の記事。
- frontmatter が不正な記事。

公開予約UIはまだない。未来日公開をしたい場合も、現時点では公開日に Pull Request を反映する運用にする。

## 本文ルール

本文は通常の Markdown で書く。GFM に対応しているため、表・リスト・リンクは使える。

見出しは次の順序を守る。

- 記事タイトルはページ側の `<h1>` で出すため、本文内では `#` を使わない。
- 本文の大見出しは `##` から始める。
- 小見出しは `###` を使う。

本文で避けるもの:

- 生HTMLの埋め込み。
- 外部スクリプトやiframe。
- 画像だけに依存した説明。
- 古い料金、規約、外部サービス仕様の断定。

Markdown は HTML 変換時に sanitize される。意図した装飾が消える場合は、記事本文ではなく記事ページ側のコンポーネントとして実装する。

## 画像

画像を使う場合は `public/images/articles/` に置き、frontmatter の `heroImage` に絶対パスで指定する。

```yaml
heroImage: "/images/articles/event-fee-collection-methods.webp"
```

画像ルール:

- 推奨サイズは `1200x630`。
- 形式は `webp` を優先する。
- ファイル名は記事 slug と揃える。
- OGP画像としても使える内容にする。

`heroImage` が未指定の場合は、既存のサイト共通OGP画像を使う。

## SEOルール

記事ごとに自動生成されるもの:

- canonical URL。
- Open Graph metadata。
- Twitter card metadata。
- `BlogPosting` JSON-LD。
- sitemap URL。

記事作成時に確認すること:

- 検索意図に対してタイトルが具体的か。
- `description` が記事の要約として自然か。
- 最初の段落で対象読者と課題が分かるか。
- 最後に「みんなの集金」への自然な導線があるか。

## 追加・更新手順

1. `content/articles/{slug}.md` を追加または編集する。
2. frontmatter の `slug`, `publishedAt`, `status` を確認する。
3. 本文内の見出しが `##` から始まっていることを確認する。
4. 必要なら `heroImage` を `public/images/articles/` に追加する。
5. 検証コマンドを実行する。

```bash
npm run typecheck
npm run lint
npm run test:unit tests/unit/core/articles
```

大きな変更やSEO出力の確認が必要な場合は、追加でビルドする。

```bash
npm run build
```

ローカル確認URL:

```txt
http://localhost:3000/articles
http://localhost:3000/articles/{slug}
```

## 変更してはいけないこと

- 記事本文のためだけに `core/articles` の公開条件を緩めない。
- `draft` や未来日記事を sitemap に含めない。
- frontmatter 不正時にフォールバック表示しない。
- 記事URLをカテゴリ階層に変えない。
- CMSや管理画面を追加しない。必要になったら別途設計する。
