/**
 * イベント編集制限ドメイン - 制限エンジン
 */

import { logger } from "@core/logging/app-logger";

import { ALL_RESTRICTION_RULES } from "./rules";
import {
  type RestrictionContext,
  type FormDataSnapshot,
  type RestrictionState,
  type ActiveRestriction,
  type RestrictionRule,
  type FieldRestrictionSummary,
  type RestrictableField,
  type RestrictionEngineConfig,
  type RestrictionChangeEvent,
  type RestrictionErrorEvent,
} from "./types";

/** 制限エンジン - 制限判定と状態管理の中核クラス */
export class RestrictionEngine {
  private rules: RestrictionRule[];
  private config: RestrictionEngineConfig;
  private cache: Map<string, ActiveRestriction>;
  private listeners: {
    onChange: ((event: RestrictionChangeEvent) => void)[];
    onError: ((event: RestrictionErrorEvent) => void)[];
  };

  constructor(config: RestrictionEngineConfig = {}) {
    this.rules = [...ALL_RESTRICTION_RULES, ...(config.customRules || [])];
    this.config = {
      debug: false,
      evaluationThrottleMs: 100,
      enableCache: true,
      ...config,
    };
    this.cache = new Map();
    this.listeners = {
      onChange: [],
      onError: [],
    };
  }

  /** 制限状態の評価 */
  async evaluateRestrictions(
    context: RestrictionContext,
    formData: FormDataSnapshot
  ): Promise<RestrictionState> {
    try {
      const startTime = performance.now();
      const activeRestrictions = await this.evaluateAllRules(context, formData);
      const restrictionState: RestrictionState = {
        structural: activeRestrictions.filter((r) => r.rule.level === "structural"),
        conditional: activeRestrictions.filter((r) => r.rule.level === "conditional"),
        advisory: activeRestrictions.filter((r) => r.rule.level === "advisory"),
        lastUpdated: Date.now(),
        hasErrors: activeRestrictions.some((r) => r.evaluation.status === "restricted"),
      };

      if (this.config.debug) {
        const duration = performance.now() - startTime;
        logger.debug(`Restriction evaluation completed in ${duration.toFixed(2)}ms`, {
          category: "event_management",
          action: "restriction_evaluation",
          actor_type: "user",
          duration_ms: duration,
          has_structural: restrictionState.structural.length > 0,
          has_conditional: restrictionState.conditional.length > 0,
          has_advisory: restrictionState.advisory.length > 0,
          outcome: "success",
        });
      }

      return restrictionState;
    } catch (error) {
      this.emitError({
        type: "evaluation_error",
        message: "Failed to evaluate restrictions",
        details: error,
      });

      return {
        structural: [],
        conditional: [],
        advisory: [],
        lastUpdated: Date.now(),
        hasErrors: true,
      };
    }
  }

  /** フィールド別制限サマリーの生成 */
  async getFieldRestrictions(
    context: RestrictionContext,
    formData: FormDataSnapshot
  ): Promise<Map<RestrictableField, FieldRestrictionSummary>> {
    const restrictionState = await this.evaluateRestrictions(context, formData);
    const fieldMap = new Map<RestrictableField, FieldRestrictionSummary>();

    const allRestrictions = [
      ...restrictionState.structural,
      ...restrictionState.conditional,
      ...restrictionState.advisory,
    ];

    const fieldGroups = new Map<RestrictableField, ActiveRestriction[]>();
    allRestrictions.forEach((restriction) => {
      const field = restriction.rule.field;
      if (!fieldGroups.has(field)) {
        fieldGroups.set(field, []);
      }
      fieldGroups.get(field)?.push(restriction);
    });

    fieldGroups.forEach((restrictions, field) => {
      const hasStructuralRestriction = restrictions.some(
        (r) => r.rule.level === "structural" && r.evaluation.isRestricted
      );
      const hasConditionalRestriction = restrictions.some(
        (r) => r.rule.level === "conditional" && r.evaluation.isRestricted
      );

      const summary: FieldRestrictionSummary = {
        field,
        isRestricted: hasStructuralRestriction || hasConditionalRestriction,
        highestRestrictionLevel: this.getHighestRestrictionLevel(restrictions),
        activeRestrictions: restrictions,
        isEditable: !hasStructuralRestriction && !hasConditionalRestriction,
      };

      fieldMap.set(field, summary);
    });

    return fieldMap;
  }

  /** 特定フィールドの制限チェック */
  async isFieldRestricted(
    field: RestrictableField,
    context: RestrictionContext,
    formData: FormDataSnapshot
  ): Promise<boolean> {
    const fieldRestrictions = await this.getFieldRestrictions(context, formData);
    return fieldRestrictions.get(field)?.isRestricted ?? false;
  }

  /** 制限変更イベントリスナーの登録 */
  onRestrictionChange(callback: (event: RestrictionChangeEvent) => void): () => void {
    this.listeners.onChange.push(callback);
    return () => {
      const index = this.listeners.onChange.indexOf(callback);
      if (index >= 0) {
        this.listeners.onChange.splice(index, 1);
      }
    };
  }

  /** エラーイベントリスナーの登録 */
  onError(callback: (event: RestrictionErrorEvent) => void): () => void {
    this.listeners.onError.push(callback);
    return () => {
      const index = this.listeners.onError.indexOf(callback);
      if (index >= 0) {
        this.listeners.onError.splice(index, 1);
      }
    };
  }

  /** 制限評価の実体 */
  private async evaluateAllRules(
    context: RestrictionContext,
    formData: FormDataSnapshot
  ): Promise<ActiveRestriction[]> {
    const activeRestrictions: ActiveRestriction[] = [];

    for (const rule of this.rules) {
      try {
        const cacheKey = this.generateCacheKey(rule, context, formData);

        if (this.config.enableCache && this.cache.has(cacheKey)) {
          const cached = this.cache.get(cacheKey);
          if (cached) {
            activeRestrictions.push(cached);
            continue;
          }
        }

        const evaluation = await rule.evaluate(context, formData);

        if (evaluation.isRestricted || evaluation.status === "warning") {
          const activeRestriction: ActiveRestriction = {
            rule,
            evaluation,
            updatedAt: Date.now(),
          };

          activeRestrictions.push(activeRestriction);

          if (this.config.enableCache) {
            this.cache.set(cacheKey, activeRestriction);
          }
        }
      } catch (error) {
        this.emitError({
          type: "rule_error",
          message: `Rule evaluation failed: ${rule.id}`,
          details: error,
          field: rule.field,
        });
      }
    }

    return activeRestrictions;
  }

  /** 最高制限レベルを取得 */
  private getHighestRestrictionLevel(restrictions: ActiveRestriction[]) {
    if (restrictions.some((r) => r.rule.level === "structural")) {
      return "structural";
    }
    if (restrictions.some((r) => r.rule.level === "conditional")) {
      return "conditional";
    }
    if (restrictions.some((r) => r.rule.level === "advisory")) {
      return "advisory";
    }
    return null;
  }

  /** キャッシュキーの生成 */
  private generateCacheKey(
    rule: RestrictionRule,
    context: RestrictionContext,
    formData: FormDataSnapshot
  ): string {
    const keyData = {
      ruleId: rule.id,
      field: rule.field,
      hasAttendees: context.hasAttendees,
      attendeeCount: context.attendeeCount,
      hasStripePaid: context.hasStripePaid,
      relevantFormData: this.extractRelevantFormData(rule.id, formData),
    };

    return JSON.stringify(keyData);
  }

  /** ルールに関連するフォームデータのみを抽出 */
  private extractRelevantFormData(ruleId: string, formData: FormDataSnapshot): unknown {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) return {};

    const relevantFields = [rule.field];

    if (ruleId === "attendee_impact_advisory") {
      relevantFields.push("title", "date", "location", "fee");
    }
    if (ruleId.includes("payment")) {
      relevantFields.push("fee", "payment_methods");
    }

    const relevant: Record<string, unknown> = {};
    relevantFields.forEach((field) => {
      relevant[field] = formData[field];
    });

    return relevant;
  }

  /** 制限変更イベントの発火 */
  private emitRestrictionChange(event: RestrictionChangeEvent): void {
    this.listeners.onChange.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        logger.error("Error in restriction change callback", {
          category: "event_management",
          action: "restriction_error",
          actor_type: "user",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          outcome: "failure",
        });
      }
    });
  }

  /** エラーイベントの発火 */
  private emitError(event: RestrictionErrorEvent): void {
    if (this.config.debug) {
      logger.error("Restriction Engine error", {
        category: "event_management",
        action: "restriction_error",
        actor_type: "user",
        error_type: event.type,
        error_message: event.message,
        field: event.field,
        outcome: "failure",
      });
    }

    this.listeners.onError.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        logger.error("Error in restriction error callback", {
          category: "event_management",
          action: "restriction_error",
          actor_type: "user",
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          outcome: "failure",
        });
      }
    });
  }

  /** キャッシュをクリア */
  clearCache(): void {
    this.cache.clear();
  }

  /** 特定フィールドのキャッシュをクリア */
  clearFieldCache(field: RestrictableField): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.includes(`"field":"${field}"`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.cache.delete(key));
  }
}

/** デフォルト制限エンジンを作成 */
export const createRestrictionEngine = (config?: RestrictionEngineConfig): RestrictionEngine => {
  return new RestrictionEngine(config);
};

/** デバッグモードの制限エンジンを作成 */
export const createDebugRestrictionEngine = (): RestrictionEngine => {
  return new RestrictionEngine({
    debug: true,
    evaluationThrottleMs: 0,
    enableCache: false,
  });
};
