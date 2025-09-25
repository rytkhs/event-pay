"use client";

/**
 * 統一制限フック - React と制限エンジンの統合
 */

import { useCallback, useMemo, useState, useEffect, useDeferredValue, useRef } from "react";

import {
  RestrictionContext,
  FormDataSnapshot,
  RestrictionState,
  RestrictableField,
  RestrictionChangeEvent,
  RestrictionErrorEvent,
  RestrictionEngine,
  createRestrictionEngine,
  FieldRestrictionMap,
} from "../core/restrictions";

// =============================================================================
// Hook Types - フック専用型定義
// =============================================================================

/** フック設定オプション */
interface UseUnifiedRestrictionsOptions {
  /** 制限評価の遅延時間（ミリ秒）*/
  evaluationDelayMs?: number;
  /** デバッグモード */
  debug?: boolean;
  /** 自動更新を無効にする */
  disableAutoUpdate?: boolean;
  /** エラー時のフォールバック動作 */
  fallbackOnError?: boolean;
}

/** フック戻り値 */
interface UseUnifiedRestrictionsResult {
  // === 制限状態 ===
  /** 現在の制限状態 */
  restrictionState: RestrictionState;
  /** フィールド別制限サマリー */
  fieldRestrictions: FieldRestrictionMap;

  // === 制限チェック関数 ===
  /** フィールドが制限されているかチェック */
  isFieldRestricted: (field: RestrictableField) => boolean;
  /** フィールドが編集可能かチェック */
  isFieldEditable: (field: RestrictableField) => boolean;
  /** フィールドの制限メッセージを取得 */
  getFieldMessage: (field: RestrictableField) => string | null;
  /** フィールドの制限レベルを取得 */
  getFieldRestrictionLevel: (
    field: RestrictableField
  ) => "structural" | "conditional" | "advisory" | null;

  // === 状態管理 ===
  /** 制限評価中かどうか */
  isLoading: boolean;
  /** エラー状態 */
  error: string | null;
  /** 最終更新時刻 */
  lastUpdated: number | null;

  // === 制御関数 ===
  /** 制限を手動で再評価 */
  refreshRestrictions: () => Promise<void>;
  /** キャッシュをクリア */
  clearCache: () => void;
  /** エラーをクリア */
  clearError: () => void;
}

/** 内部状態管理 */
interface RestrictionHookState {
  restrictionState: RestrictionState;
  fieldRestrictions: FieldRestrictionMap;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

// =============================================================================
// Hook Implementation - フックの実装
// =============================================================================

/**
 * 統一制限フック - 制限エンジンとReactの統合
 */
export function useUnifiedRestrictions(
  context: RestrictionContext,
  formData: FormDataSnapshot,
  options: UseUnifiedRestrictionsOptions = {}
): UseUnifiedRestrictionsResult {
  // ---------------------------------------------------------------------------
  // Configuration & Initialization
  // ---------------------------------------------------------------------------

  const {
    evaluationDelayMs = 100,
    debug = false,
    disableAutoUpdate = false,
    fallbackOnError = true,
  } = options;

  // 制限エンジンのシングルトンインスタンス
  const engineRef = useRef<RestrictionEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = createRestrictionEngine({
      debug,
      evaluationThrottleMs: evaluationDelayMs,
      enableCache: true,
    });
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  const [state, setState] = useState<RestrictionHookState>({
    restrictionState: {
      structural: [],
      conditional: [],
      advisory: [],
      lastUpdated: 0,
      hasErrors: false,
    },
    fieldRestrictions: new Map(),
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  // フォームデータの遅延値（パフォーマンス最適化）
  const deferredFormData = useDeferredValue(formData);

  // 依存配列の安定化
  const stableContext = useMemo(
    () => context,
    [
      context.hasAttendees,
      context.attendeeCount,
      context.hasStripePaid,
      context.eventStatus,
      JSON.stringify(context.originalEvent), // Deep comparison for nested object
    ]
  );

  const stableFormData = useMemo(() => deferredFormData, [JSON.stringify(deferredFormData)]);

  // ---------------------------------------------------------------------------
  // Restriction Evaluation
  // ---------------------------------------------------------------------------

  const evaluateRestrictions = useCallback(async (): Promise<void> => {
    if (!engineRef.current || disableAutoUpdate) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const [restrictionState, fieldRestrictions] = await Promise.all([
        engineRef.current.evaluateRestrictions(stableContext, stableFormData),
        engineRef.current.getFieldRestrictions(stableContext, stableFormData),
      ]);

      setState((prev) => ({
        ...prev,
        restrictionState,
        fieldRestrictions,
        isLoading: false,
        lastUpdated: Date.now(),
      }));

      if (debug) {
        console.log("[useUnifiedRestrictions] Evaluation completed", {
          restrictionState,
          fieldRestrictions: Object.fromEntries(fieldRestrictions),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        // フォールバック: エラー時は安全側に倒す
        restrictionState: fallbackOnError
          ? {
              structural: [],
              conditional: [],
              advisory: [],
              lastUpdated: Date.now(),
              hasErrors: true,
            }
          : prev.restrictionState,
      }));

      if (debug) {
        console.error("[useUnifiedRestrictions] Evaluation failed", error);
      }
    }
  }, [stableContext, stableFormData, disableAutoUpdate, debug, fallbackOnError]);

  // ---------------------------------------------------------------------------
  // Auto Update Effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (disableAutoUpdate) return;

    // 初回評価
    evaluateRestrictions();

    // イベントリスナー設定
    const unsubscribeChange = engineRef.current?.onRestrictionChange(
      (event: RestrictionChangeEvent) => {
        if (debug) {
          console.log("[useUnifiedRestrictions] Restriction changed", event);
        }
      }
    );

    const unsubscribeError = engineRef.current?.onError((event: RestrictionErrorEvent) => {
      setState((prev) => ({
        ...prev,
        error: event.message,
      }));
    });

    // クリーンアップ
    return () => {
      unsubscribeChange?.();
      unsubscribeError?.();
    };
  }, [evaluateRestrictions, debug, disableAutoUpdate]);

  // ---------------------------------------------------------------------------
  // Helper Functions (Memoized)
  // ---------------------------------------------------------------------------

  const isFieldRestricted = useCallback(
    (field: RestrictableField): boolean => {
      const summary = state.fieldRestrictions.get(field);
      return summary?.isRestricted ?? false;
    },
    [state.fieldRestrictions]
  );

  const isFieldEditable = useCallback(
    (field: RestrictableField): boolean => {
      const summary = state.fieldRestrictions.get(field);
      return summary?.isEditable ?? true;
    },
    [state.fieldRestrictions]
  );

  const getFieldMessage = useCallback(
    (field: RestrictableField): string | null => {
      const summary = state.fieldRestrictions.get(field);
      if (!summary || summary.activeRestrictions.length === 0) {
        return null;
      }

      // 最も重要な制限のメッセージを返す
      const structuralRestriction = summary.activeRestrictions.find(
        (r) => r.rule.level === "structural"
      );
      if (structuralRestriction) {
        return structuralRestriction.evaluation.message;
      }

      const conditionalRestriction = summary.activeRestrictions.find(
        (r) => r.rule.level === "conditional"
      );
      if (conditionalRestriction) {
        return conditionalRestriction.evaluation.message;
      }

      const advisoryRestriction = summary.activeRestrictions.find(
        (r) => r.rule.level === "advisory"
      );
      return advisoryRestriction?.evaluation.message ?? null;
    },
    [state.fieldRestrictions]
  );

  const getFieldRestrictionLevel = useCallback(
    (field: RestrictableField) => {
      const summary = state.fieldRestrictions.get(field);
      return summary?.highestRestrictionLevel ?? null;
    },
    [state.fieldRestrictions]
  );

  // ---------------------------------------------------------------------------
  // Control Functions
  // ---------------------------------------------------------------------------

  const refreshRestrictions = useCallback(async (): Promise<void> => {
    engineRef.current?.clearCache();
    await evaluateRestrictions();
  }, [evaluateRestrictions]);

  const clearCache = useCallback((): void => {
    engineRef.current?.clearCache();
  }, []);

  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // ---------------------------------------------------------------------------
  // Return Value
  // ---------------------------------------------------------------------------

  return {
    // 制限状態
    restrictionState: state.restrictionState,
    fieldRestrictions: state.fieldRestrictions,

    // 制限チェック関数
    isFieldRestricted,
    isFieldEditable,
    getFieldMessage,
    getFieldRestrictionLevel,

    // 状態管理
    isLoading: state.isLoading,
    error: state.error,
    lastUpdated: state.lastUpdated,

    // 制御関数
    refreshRestrictions,
    clearCache,
    clearError,
  };
}

// =============================================================================
// Specialized Hooks - 特化型フック
// =============================================================================

/**
 * フィールド制限専用フック - 特定フィールドの制限状態のみを管理
 */
export function useFieldRestriction(
  field: RestrictableField,
  context: RestrictionContext,
  formData: FormDataSnapshot,
  options?: UseUnifiedRestrictionsOptions
) {
  const {
    isFieldRestricted,
    isFieldEditable,
    getFieldMessage,
    getFieldRestrictionLevel,
    isLoading,
    error,
  } = useUnifiedRestrictions(context, formData, options);

  return useMemo(
    () => ({
      isRestricted: isFieldRestricted(field),
      isEditable: isFieldEditable(field),
      message: getFieldMessage(field),
      restrictionLevel: getFieldRestrictionLevel(field),
      isLoading,
      error,
    }),
    [
      field,
      isFieldRestricted,
      isFieldEditable,
      getFieldMessage,
      getFieldRestrictionLevel,
      isLoading,
      error,
    ]
  );
}

/**
 * 制限状態監視フック - 制限状態の変化を監視
 */
export function useRestrictionStateMonitor(
  context: RestrictionContext,
  formData: FormDataSnapshot,
  onRestrictionChange?: (restrictionState: RestrictionState) => void
) {
  const { restrictionState, isLoading } = useUnifiedRestrictions(context, formData);

  useEffect(() => {
    if (!isLoading && onRestrictionChange) {
      onRestrictionChange(restrictionState);
    }
  }, [restrictionState, isLoading, onRestrictionChange]);

  return restrictionState;
}

// =============================================================================
// Hook Utilities - フックユーティリティ
// =============================================================================

/**
 * 制限コンテキストビルダー - RestrictionContext の構築ヘルパー（フック版）
 */
export function useRestrictionContext(
  event: {
    fee?: number | null;
    capacity?: number | null;
    payment_methods?: string[];
    title?: string;
    description?: string;
    location?: string;
    date?: string;
    registration_deadline?: string;
    payment_deadline?: string;
    allow_payment_after_deadline?: boolean;
    grace_period_days?: number;
  },
  attendanceInfo: {
    hasAttendees: boolean;
    attendeeCount: number;
    hasStripePaid: boolean;
  },
  eventStatus: "upcoming" | "ongoing" | "past" | "canceled" = "upcoming"
): RestrictionContext {
  return useMemo(
    () => ({
      ...attendanceInfo,
      eventStatus,
      originalEvent: {
        fee: event.fee ?? null,
        capacity: event.capacity ?? null,
        payment_methods: event.payment_methods ?? [],
        title: event.title,
        description: event.description,
        location: event.location,
        date: event.date,
        registration_deadline: event.registration_deadline,
        payment_deadline: event.payment_deadline,
        allow_payment_after_deadline: event.allow_payment_after_deadline,
        grace_period_days: event.grace_period_days,
      },
    }),
    [
      attendanceInfo.hasAttendees,
      attendanceInfo.attendeeCount,
      attendanceInfo.hasStripePaid,
      eventStatus,
      JSON.stringify(event), // Deep comparison
    ]
  );
}

/**
 * フォームデータスナップショット - FormDataSnapshot の構築ヘルパー（フック版）
 */
export function useFormDataSnapshot(formValues: Record<string, unknown>): FormDataSnapshot {
  return useMemo(
    () => ({
      fee: formValues.fee as string | number | undefined,
      capacity: formValues.capacity as string | number | undefined,
      payment_methods: formValues.payment_methods as string[] | undefined,
      title: formValues.title as string | undefined,
      description: formValues.description as string | undefined,
      location: formValues.location as string | undefined,
      date: formValues.date as string | undefined,
      registration_deadline: formValues.registration_deadline as string | undefined,
      payment_deadline: formValues.payment_deadline as string | undefined,
      allow_payment_after_deadline: formValues.allow_payment_after_deadline as boolean | undefined,
      grace_period_days: formValues.grace_period_days as string | number | undefined,
      ...formValues,
    }),
    [JSON.stringify(formValues)]
  );
}
