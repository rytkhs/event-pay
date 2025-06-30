"use client";

import { CSRFTokenManager } from "@/lib/utils/csrf-token";
import { ApiResponse } from "@/lib/types/api";

/**
 * 統一APIクライアント - CSRF保護付き
 */
export class ApiClient {
  private static baseUrl = process.env.NEXT_PUBLIC_API_URL || "";

  /**
   * 安全なAPIリクエスト実行
   */
  private static async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    // CSRF保護チェック
    if (options.method && options.method !== "GET") {
      if (!CSRFTokenManager.validateBeforeCall()) {
        throw new Error("CSRF token validation failed");
      }
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await CSRFTokenManager.safeFetch(url, options);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  }

  /**
   * GETリクエスト
   */
  static async get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  /**
   * POSTリクエスト
   */
  static async post<T = any>(
    endpoint: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUTリクエスト
   */
  static async put<T = any>(
    endpoint: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETEリクエスト
   */
  static async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  /**
   * 認証関連API
   */
  static auth = {
    /**
     * ログイン
     */
    login: async (email: string, password: string) => {
      return this.post<{ user: any }>("/api/auth/login", { email, password });
    },

    /**
     * ユーザー登録
     */
    register: async (userData: {
      name: string;
      email: string;
      password: string;
      confirmPassword: string;
    }) => {
      return this.post("/api/auth/register", userData);
    },

    /**
     * ログアウト
     */
    logout: async () => {
      return this.post("/api/auth/logout");
    },

    /**
     * パスワードリセット
     */
    resetPassword: async (email: string) => {
      return this.post("/api/auth/reset-password", { email });
    },

    /**
     * メール認証再送信
     */
    resendConfirmation: async (email: string) => {
      return this.post("/api/auth/resend-confirmation", { email });
    },
  };
}

/**
 * レガシーサポート用のヘルパー関数
 */
export const api = {
  auth: ApiClient.auth,
  get: ApiClient.get,
  post: ApiClient.post,
  put: ApiClient.put,
  delete: ApiClient.delete,
};