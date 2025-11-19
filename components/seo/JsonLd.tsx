import type { WithContext } from "schema-dts";

/**
 * JSON-LD構造化データ出力コンポーネント
 *
 * Next.js 14のApp Routerで使用するサーバーコンポーネント。
 * XSS対策として "<" を \u003c にエスケープして出力します。
 *
 * @param data - WithContext型のスキーマオブジェクトまたはその配列
 */
export function JsonLd<T extends WithContext<any>>({
  data,
  nonce,
}: {
  data: T | T[];
  nonce?: string;
}): JSX.Element {
  // JSON-LDを文字列化し、XSS対策として "<" をエスケープ
  const jsonLd = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} nonce={nonce} />
  );
}
