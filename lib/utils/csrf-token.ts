"use client";

/**
 * フロントエンド用CSRFトークン管理ユーティリティ
 */
export class CSRFTokenManager {
  private static readonly TOKEN_NAME = "csrf-token";

  /**
   * Cookieからcsrf-tokenを取得
   */
  static getToken(): string | null {
    if (typeof document === "undefined") return null;
    
    const cookies = document.cookie.split(";");
    const csrfCookie = cookies.find(cookie => 
      cookie.trim().startsWith(`${this.TOKEN_NAME}=`)
    );
    
    if (!csrfCookie) return null;
    
    return csrfCookie.split("=")[1]?.trim() || null;
  }

  /**
   * CSRF保護に必要なヘッダーを生成
   */
  static getHeaders(): HeadersInit {
    const token = this.getToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    };

    if (token) {
      headers["X-CSRF-Token"] = token;
    }

    return headers;
  }

  /**
   * CSRF保護付きfetch
   */
  static async safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...this.getHeaders(),
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    // CSRF失敗の場合は自動的にページを再読み込み
    if (response.status === 403) {
      const responseData = await response.json().catch(() => ({}));
      if (responseData.error === "CSRF validation failed") {
        // トークンを再取得するためにページを再読み込み
        window.location.reload();
        throw new Error("CSRF validation failed. Page reloaded for token refresh.");
      }
    }

    return response;
  }

  /**
   * CSRFトークンの存在確認
   */
  static hasToken(): boolean {
    return this.getToken() !== null;
  }

  /**
   * APIコール前のCSRFトークン確認
   */
  static validateBeforeCall(): boolean {
    const hasToken = this.hasToken();
    
    if (!hasToken) {
      console.warn("CSRF token not found. Refreshing page to obtain token.");
      window.location.reload();
      return false;
    }
    
    return true;
  }
}