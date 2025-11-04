import type { ReactNode } from "react";

import { HeaderWrapper } from "@components/layout/HeaderWrapper";
import { FooterWrapper } from "@components/layout/FooterWrapper";

/**
 * アプリケーションレイアウト
 *
 * 認証済みユーザー向けアプリケーション領域のレイアウト。
 * HeaderWrapperとFooterWrapperを配置し、認証状態の取得を許可します（動的レンダリング）。
 *
 * 使用コンポーネント:
 * - HeaderWrapper: 認証状態を取得してヘッダーを出し分けるサーバーコンポーネント
 * - FooterWrapper: 認証状態を取得してフッターを出し分けるサーバーコンポーネント
 *
 * このレイアウトは動的レンダリングされ、ダッシュボード、イベント管理、設定ページなどで使用されます。
 */
export default function AppLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <HeaderWrapper />
      <main>{children}</main>
      <FooterWrapper />
    </>
  );
}
