import { NextRequest, NextResponse } from "next/server";
import { SupabaseClientFactory } from "@/lib/supabase/factory";
import { getSessionCache } from "./session-cache";
import { AUTH_CONFIG } from "@/config/security";

/**
 * 効率化された認証ハンドラー
 * セッションキャッシュと並列処理で高速化
 */
export class AuthHandler {
  private static sessionCache = getSessionCache();

  /**
   * 早期リターン条件のチェック（最も効率的）
   */
  static shouldSkipAuth(pathname: string): boolean {
    return (
      pathname.startsWith("/_next/static") ||
      pathname.startsWith("/_next/image") ||
      pathname.startsWith("/api") ||
      pathname === "/favicon.ico" ||
      (pathname.includes(".") && !pathname.endsWith(".html"))
    );
  }

  /**
   * セッション取得（キャッシュ活用）
   */
  static async getSession(request: NextRequest, response: NextResponse) {
    const sessionToken = request.cookies.get(AUTH_CONFIG.cookieNames.session)?.value;

    if (!sessionToken) {
      return { session: null, user: null };
    }

    // キャッシュから確認
    const cachedSession = this.sessionCache.get(sessionToken);
    if (cachedSession) {
      return { session: cachedSession, user: cachedSession.user };
    }

    // Supabaseから取得
    const supabase = SupabaseClientFactory.createServerClient("middleware", { request, response });
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    // 成功時はキャッシュに保存
    if (session && !error) {
      this.sessionCache.set(sessionToken, session, session.user.id);
    }

    return { session, user: session?.user || null };
  }

  /**
   * 認証が必要なパスかチェック
   */
  static requiresAuth(pathname: string): boolean {
    return AUTH_CONFIG.protectedPaths.some((path) => pathname.startsWith(path));
  }

  /**
   * 認証が必要なパスかチェック（エイリアス）
   */
  static isAuthRequired(pathname: string): boolean {
    return this.requiresAuth(pathname);
  }

  /**
   * 認証済みユーザーがアクセス不可なパスかチェック
   */
  static isUnauthenticatedOnlyPath(pathname: string): boolean {
    return AUTH_CONFIG.unauthenticatedOnlyPaths.some((path) => pathname.startsWith(path));
  }

  /**
   * リダイレクト処理
   */
  static createAuthRedirect(
    request: NextRequest,
    targetPath: string,
    preserveOriginal = true
  ): NextResponse {
    const redirectUrl = new URL(targetPath, request.url);

    if (preserveOriginal && targetPath === "/auth/login") {
      redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    }

    return NextResponse.redirect(redirectUrl);
  }

  /**
   * 効率化された認証チェック処理
   */
  static async handleAuth(request: NextRequest, response: NextResponse) {
    const pathname = request.nextUrl.pathname;

    // 並列でセッション取得と条件チェックを実行
    const [sessionResult, requiresAuth, isUnauthOnly] = await Promise.all([
      this.getSession(request, response),
      Promise.resolve(this.requiresAuth(pathname)),
      Promise.resolve(this.isUnauthenticatedOnlyPath(pathname)),
    ]);

    const { session } = sessionResult;

    // 認証が必要なパスで未認証の場合
    if (requiresAuth && !session) {
      return this.createAuthRedirect(request, "/auth/login");
    }

    // 認証済みユーザーが認証不要ページにアクセスした場合
    if (session && isUnauthOnly) {
      return this.createAuthRedirect(request, "/home", false);
    }

    return null; // リダイレクト不要
  }

  /**
   * セッション無効化（ログアウト時）
   */
  static invalidateSession(userId: string): void {
    this.sessionCache.deleteByUserId(userId);
  }

  /**
   * 統計情報取得（監視用）
   */
  static getStats() {
    return this.sessionCache.getStats();
  }
}
