/**
 * EventPay セキュリティ監査システム - 監査コンテキストビルダー
 *
 * HTTPリクエストやNext.jsヘッダーから監査コンテキストを作成するヘルパー
 */

import { headers } from "next/headers";
import { generateSecureUuid } from "./crypto";
import { AuditContextBuilder, AuditContext } from "./security-auditor.interface";

/**
 * 監査コンテキスト作成ヘルパーの実装
 */
export class AuditContextBuilderImpl implements AuditContextBuilder {
  /**
   * HTTPリクエストから監査コンテキストを作成
   */
  fromRequest(request: Request, userId?: string, guestToken?: string): AuditContext {
    const url = new URL(request.url);

    return {
      sessionId: this.generateSessionId(),
      ipAddress: this.extractIpAddress(request),
      userAgent: request.headers.get("user-agent") || undefined,
      requestPath: url.pathname,
      requestMethod: request.method,
      userId,
      guestToken,
      operationStartTime: new Date(),
    };
  }

  /**
   * Next.jsのヘッダーから監査コンテキストを作成
   */
  fromNextHeaders(headersList: Headers, userId?: string, guestToken?: string): AuditContext {
    return {
      sessionId: this.generateSessionId(),
      ipAddress: this.extractIpFromNextHeaders(headersList),
      userAgent: headersList.get("user-agent") || undefined,
      requestPath: headersList.get("x-pathname") || undefined,
      requestMethod: headersList.get("x-method") || undefined,
      userId,
      guestToken,
      operationStartTime: new Date(),
    };
  }

  /**
   * 基本的な監査コンテキストを作成
   */
  create(sessionId: string, userId?: string, guestToken?: string): AuditContext {
    return {
      sessionId,
      userId,
      guestToken,
      operationStartTime: new Date(),
    };
  }

  /**
   * 現在のNext.jsリクエストから監査コンテキストを作成
   * Server ComponentsやServer Actionsで使用
   */
  fromCurrentRequest(userId?: string, guestToken?: string): AuditContext {
    try {
      const headersList = headers();
      return this.fromNextHeaders(headersList, userId, guestToken);
    } catch (error) {
      // headers()が使用できない環境（例：静的生成時）の場合
      return this.create(this.generateSessionId(), userId, guestToken);
    }
  }

  /**
   * API Routeから監査コンテキストを作成
   */
  fromApiRoute(request: Request, userId?: string, guestToken?: string): AuditContext {
    return this.fromRequest(request, userId, guestToken);
  }

  /**
   * ゲストトークンを含む監査コンテキストを作成
   */
  forGuestAccess(guestToken: string, additionalContext?: Partial<AuditContext>): AuditContext {
    const baseContext = this.fromCurrentRequest(undefined, guestToken);

    return {
      ...baseContext,
      ...additionalContext,
      guestToken, // 確実にゲストトークンを設定
    };
  }

  /**
   * 管理者操作用の監査コンテキストを作成
   */
  forAdminAccess(userId: string, additionalContext?: Partial<AuditContext>): AuditContext {
    const baseContext = this.fromCurrentRequest(userId);

    return {
      ...baseContext,
      ...additionalContext,
      userId, // 確実にユーザーIDを設定
    };
  }

  // ====================================================================
  // プライベートヘルパーメソッド
  // ====================================================================

  private generateSessionId(): string {
    return generateSecureUuid();
  }

  private extractIpAddress(request: Request): string | undefined {
    // Vercelやその他のプラットフォームでのIP取得
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      return realIp;
    }

    const cfConnectingIp = request.headers.get("cf-connecting-ip");
    if (cfConnectingIp) {
      return cfConnectingIp;
    }

    // フォールバック
    return (
      request.headers.get("x-forwarded-for") || request.headers.get("remote-addr") || undefined
    );
  }

  private extractIpFromNextHeaders(headersList: Headers): string | undefined {
    // Next.jsヘッダーからIP取得
    const forwardedFor = headersList.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }

    const realIp = headersList.get("x-real-ip");
    if (realIp) {
      return realIp;
    }

    const cfConnectingIp = headersList.get("cf-connecting-ip");
    if (cfConnectingIp) {
      return cfConnectingIp;
    }

    return undefined;
  }
}

// ====================================================================
// シングルトンインスタンス
// ====================================================================

/**
 * グローバルに使用できるAuditContextBuilderインスタンス
 */
export const auditContextBuilder = new AuditContextBuilderImpl();

// ====================================================================
// 便利な関数エクスポート
// ====================================================================

/**
 * 現在のリクエストから監査コンテキストを作成する便利関数
 */
export function createAuditContext(userId?: string, guestToken?: string): AuditContext {
  return auditContextBuilder.fromCurrentRequest(userId, guestToken);
}

/**
 * ゲストアクセス用の監査コンテキストを作成する便利関数
 */
export function createGuestAuditContext(guestToken: string): AuditContext {
  return auditContextBuilder.forGuestAccess(guestToken);
}

/**
 * 管理者アクセス用の監査コンテキストを作成する便利関数
 */
export function createAdminAuditContext(userId: string): AuditContext {
  return auditContextBuilder.forAdminAccess(userId);
}

/**
 * API Route用の監査コンテキストを作成する便利関数
 */
export function createApiAuditContext(
  request: Request,
  userId?: string,
  guestToken?: string
): AuditContext {
  return auditContextBuilder.fromApiRoute(request, userId, guestToken);
}
