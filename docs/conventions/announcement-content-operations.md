# お知らせコンテンツ運用ルール

`/announcements` 配下の公式告知は、Markdown + frontmatter で管理する。料金改定、規約変更、メンテナンス、障害、機能追加など、ユーザーの利用判断に関わる情報を掲載する。

集客記事は `/articles`、公式告知は `/announcements` に分ける。記事本文のSEO都合で、お知らせの公開条件や分類を変更しない。

## ファイル配置

告知ファイルは次の場所に置く。

```txt
content/announcements/{slug}.md
```

`slug` はファイル名と frontmatter の `slug` を必ず一致させる。一致しない場合はビルド時にエラーにする。

## Frontmatter

必須項目:

```yaml
---
title: "料金体系改定のお知らせ"
description: "2026年6月1日からの料金体系改定について、対象となるユーザーと適用開始日をお知らせします。"
slug: "pricing-revision-2026-06"
publishedAt: "2026-05-01"
status: "published"
---
```

任意項目:

```yaml
updatedAt: "2026-05-10"
effectiveAt: "2026-06-01"
```

## 値のルール

- `slug` は英小文字・数字・ハイフンのみを使う。
- `publishedAt`, `updatedAt`, `effectiveAt` は `YYYY-MM-DD` 形式にする。
- `status` は `draft` または `published`。

## 公開条件

告知が公開される条件:

- `status: "published"` である。
- `publishedAt` が今日以前の日付である。
- frontmatter が schema に通る。
- ファイル名の slug と frontmatter の `slug` が一致している。

未来日公開をしたい場合も、現時点では公開日に Pull Request を反映する運用にする。アプリ内バナー、メール配信、管理画面、CMS はこの基盤には含めない。

## 本文ルール

本文は通常の Markdown で書く。GFM に対応しているため、表・リスト・リンクは使える。

- 本文内では `#` を使わず、ページタイトルは `<h1>` に任せる。
- 本文の大見出しは `##` から始める。
- 料金改定や規約変更では、適用開始日、対象、既存イベントへの影響を本文内で明記する。
- 生HTML、外部スクリプト、iframe は使わない。

## 追加・更新手順

1. `content/announcements/{slug}.md` を追加または編集する。
2. frontmatter の `slug`, `publishedAt`, `status` を確認する。
3. 本文内の見出しが `##` から始まっていることを確認する。
4. 検証コマンドを実行する。

```bash
npm run typecheck
npm run lint
npm run test:unit tests/unit/core/announcements
```

ローカル確認URL:

```txt
http://localhost:3000/announcements
http://localhost:3000/announcements/{slug}
```
