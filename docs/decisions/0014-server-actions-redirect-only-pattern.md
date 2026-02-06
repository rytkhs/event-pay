# ADR-0014: Server Actions の redirect-only パターン方針

* Status: **Accepted**
* Date: **2026-02-03**

## Context and Problem Statement

Issue #281 で Server Actions の戻り値を `ActionResult` に統一中だが、以下のような「`ActionResult` に寄せづらい」Server Actions が存在し、例外の扱いを設計として確定する必要があった。

1. **redirect-only 系**: 結果を返さず `redirect()` で遷移するもの
   - `startGoogleOAuth` (Google OAuth開始)
   - `startDemoSession` (デモセッション開始)

2. **独自レスポンス型**: `{ success: boolean; error?: string }` など ActionResult とは異なる型を返すもの

本 ADR では **redirect-only パターン** の扱いを定める。

## Decision Drivers

* **一貫性**: Server Actions の戻り値型を統一し、呼び出し側のエラーハンドリングを予測可能にしたい
* **可観測性**: エラー時に `correlationId` 等を付与し、トラブルシュートを容易にしたい
* **開発者体験**: パターンを明文化し、新規実装時の迷いをなくしたい
* **技術的制約**: OAuth 等「外部URLへのリダイレクトが本質」な操作の自然さを損なわない

## Considered Options

### Option A: redirect-only を全て許容しない（全て ActionResult 化）

* 全ての Server Actions が `ActionResult` を返す
* 成功時も `ok({ redirectUrl: "..." })` を返し、クライアント側でリダイレクト

### Option B: redirect-only を限定的に許容（採用）

* 「外部URLへのリダイレクトが本質」な操作のみ redirect-only を許容
* それ以外は `ActionResult` を返す

### Option C: redirect-only を全て許容（現状維持）

* ドキュメント化のみ行い、実装変更なし

## Decision Outcome

**採用: Option B — redirect-only を限定的に許容**

### 具体的なルール

#### 1. 原則: Server Actions は `ActionResult<T>` を返す

```typescript
export async function someAction(): Promise<ActionResult<SomeData>> {
  // ...
  if (error) {
    return fail("SOME_ERROR", { userMessage: "..." });
  }
  return ok(data);
}
```

#### 2. 例外: redirect-only パターンを許容する条件

以下の **すべて** を満たす場合のみ、`redirect()` で終端する Server Action を許容する:

1. **外部URLへのリダイレクトが本質である**（例: OAuth開始、外部サービス連携）
2. **成功時も失敗時もリダイレクトで完結する**
3. **呼び出し側でエラー情報（userMessage, correlationId等）を表示する必要がない**

#### 3. 許容される例

| 関数名 | 用途 | 理由 |
|--------|------|------|
| `startGoogleOAuth` | Google OAuth開始 | 成功時は Google の URL へ、失敗時はエラーページへ redirect |

#### 4. 許容されない例（ActionResult に変更）

| 関数名 | 用途 | 変更理由 |
|--------|------|----------|
| `startDemoSession` | デモセッション開始 | 内部処理の結果であり、エラー情報を UI に表示すべき |

#### 5. 命名・型規約

* redirect-only の Server Action は `start` プレフィックスを推奨
* 戻り値型は `Promise<never>` (redirect は never を返す)
* JSDoc で「redirect-only」であることを明記

```typescript
/**
 * Google OAuth 認証を開始する (redirect-only)
 *
 * @remarks
 * 成功時: Google の OAuth 画面へ redirect
 * 失敗時: /auth/auth-code-error へ redirect
 */
export async function startGoogleOAuth(formData: FormData): Promise<never> {
  // ...
}
```

## Consequences

### Positive

* `startDemoSession` のエラーが `ActionError` で統一され、`correlationId` 等が付与される
* `NEXT_REDIRECT` 例外をキャッチするハックが不要になる
* 呼び出し側のエラーハンドリングが予測可能になる

### Negative

* OAuth 以外の「redirect 終端」を追加する際、この ADR を参照して判断する手間が発生
* `startGoogleOAuth` にはエラー時の詳細情報（correlationId）がない（許容）

## Migration

1. ✅ `startDemoSession` を `ActionResult<{ redirectUrl: string }>` 型に変更
2. ✅ `DemoEntryPage` を `ActionResult` を扱うように更新
3. `startGoogleOAuth` は redirect-only のまま維持（エラーログ追加は別途検討）

## Links

* Issue: #289
* 親 Issue: #281 (エラーハンドリング統一)
* 関連 ADR: ADR-0012 (Server Actions の app 配下への集約)
