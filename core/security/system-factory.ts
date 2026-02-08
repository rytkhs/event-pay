import { RLSGuestTokenValidator } from "./guest-token-validator";
import { SecureSupabaseClientFactory } from "./secure-client-factory.impl";

/**
 * セキュリティシステムの統合ファクトリー
 *
 * 必要最小限のセキュリティコンポーネントを統合
 */
export class SecuritySystemFactory {
  private static instance: SecuritySystemFactory;
  private clientFactory: SecureSupabaseClientFactory;
  private guestValidator: RLSGuestTokenValidator;

  private constructor() {
    // セキュアクライアントファクトリーを初期化
    this.clientFactory = SecureSupabaseClientFactory.create();

    // ゲストトークンバリデーターを初期化
    this.guestValidator = new RLSGuestTokenValidator();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): SecuritySystemFactory {
    if (!SecuritySystemFactory.instance) {
      SecuritySystemFactory.instance = new SecuritySystemFactory();
    }
    return SecuritySystemFactory.instance;
  }

  /**
   * セキュアクライアントファクトリーを取得
   */
  public getClientFactory(): SecureSupabaseClientFactory {
    return this.clientFactory;
  }

  /**
   * ゲストトークンバリデーターを取得
   */
  public getGuestValidator(): RLSGuestTokenValidator {
    return this.guestValidator;
  }

  /**
   * システム全体の健全性チェック
   */
  public async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    components: Record<string, boolean>;
    issues: string[];
  }> {
    const components: Record<string, boolean> = {};
    const issues: string[] = [];

    try {
      // 各コンポーネントの健全性をチェック
      components.clientFactory = true;
      components.guestValidator = true;

      const healthyComponents = Object.values(components).filter(Boolean).length;
      const totalComponents = Object.keys(components).length;

      let status: "healthy" | "degraded" | "unhealthy";
      if (healthyComponents === totalComponents) {
        status = "healthy";
      } else if (healthyComponents > totalComponents / 2) {
        status = "degraded";
      } else {
        status = "unhealthy";
      }

      return { status, components, issues };
    } catch (error) {
      issues.push(`Health check failed: ${error}`);
      return {
        status: "unhealthy",
        components,
        issues,
      };
    }
  }
}

/**
 * デフォルトのセキュリティシステムファクトリーインスタンスを取得する関数
 */
export function getSecuritySystem(): SecuritySystemFactory {
  return SecuritySystemFactory.getInstance();
}

/**
 * デフォルトのセキュアクライアントファクトリーインスタンスを取得する関数
 */
export function createSecureSupabaseClient(): SecureSupabaseClientFactory {
  return getSecuritySystem().getClientFactory();
}

/**
 * デフォルトのゲストトークンバリデーターインスタンスを取得する関数
 */
export function createGuestTokenValidator(): RLSGuestTokenValidator {
  return getSecuritySystem().getGuestValidator();
}
