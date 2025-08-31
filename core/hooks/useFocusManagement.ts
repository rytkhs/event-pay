import { useCallback } from "react";
import { FocusManager, FocusableElement } from "@core/utils/focusManager";

export interface FocusManagementHook {
  focusFirstError: (errorFields: string[]) => void;
  trapFocus: (container: HTMLElement) => () => void;
  restoreFocus: (element: HTMLElement) => void;
}

export const useFocusManagement = (): FocusManagementHook => {
  const focusFirstError = useCallback((errorFields: string[]) => {
    if (!errorFields || errorFields.length === 0) return;

    try {
      // 全ての要素を取得してフィルタリング
      const allErrorElements = errorFields
        .map((fieldName) => document.querySelector(`[name="${fieldName}"]`) as HTMLElement)
        .filter((element) => FocusManager.isFocusable(element)) as FocusableElement[];

      if (allErrorElements.length === 0) return;

      // DOM順序でソート
      const sortedElements = FocusManager.sortByDOMOrder(allErrorElements);

      // 最初の要素にフォーカス
      sortedElements[0].focus();
    } catch {
      // エラーログを出力しない（アクセシビリティ機能の警告は不要）
      // console.warn("Focus first error failed:", error);
    }
  }, []);

  const trapFocus = useCallback((container: HTMLElement) => {
    if (!container) {
      return () => {};
    }
    return FocusManager.createFocusTrap(container);
  }, []);

  const restoreFocus = useCallback((element: HTMLElement) => {
    if (!element) {
      return;
    }
    FocusManager.restoreFocus(element);
  }, []);

  return {
    focusFirstError,
    trapFocus,
    restoreFocus,
  };
};
