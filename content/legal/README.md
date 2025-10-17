# 法的ページコンテンツ運用ルール

- 本ディレクトリ配下のMarkdownは、Next.js App Routerで配信されます。
- フロントマター（frontmatter）に `title` と `lastUpdated` を必ず記載してください。
- サイト全体のスタイルは Tailwind Typography の `prose` で整えられます。

## ファイル構成

- `terms.md` — 利用規約
- `privacy.md` — プライバシーポリシー
- `tokushoho/` — 主催者別の特定商取引法に基づく表記
  - `organizer.md` — 主催者スラッグに一致するファイル名

## ひな形（共通）

```md
---
title: タイトル
lastUpdated: 2025-01-01
---

# 見出し

本文...
```

## セキュリティ

- Markdownは `rehype-sanitize` によりサニタイズされます。
- JavaScriptは実行されません。外部スクリプトの埋め込み等は不可です。
