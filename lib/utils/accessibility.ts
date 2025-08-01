/**
 * アクセシビリティユーティリティ関数
 */

/**
 * 要素にフォーカスを設定する（アクセシブルな方法で）
 */
export function focusElement(element: HTMLElement | null, options?: FocusOptions): void {
  if (!element) return;

  // フォーカス可能な要素かチェック
  if (element.tabIndex < 0 && !element.hasAttribute("tabindex")) {
    element.tabIndex = -1;
  }

  element.focus(options);
}

/**
 * スクリーンリーダー用のライブリージョンにメッセージを送信
 */
export function announceToScreenReader(
  message: string,
  priority: "polite" | "assertive" = "polite"
): void {
  const announcement = document.createElement("div");
  announcement.setAttribute("aria-live", priority);
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only";
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // メッセージを読み上げた後に要素を削除
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * キーボードイベントがEnterまたはSpaceキーかチェック
 */
export function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " ";
}

/**
 * 要素がフォーカス可能かチェック
 */
export function isFocusable(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  if (element.hasAttribute("disabled")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;

  return true;
}

/**
 * フォーカス可能な要素を取得
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(", ");

  const elements = Array.from(container.querySelectorAll(focusableSelectors)) as HTMLElement[];
  return elements.filter(isFocusable);
}

/**
 * フォーカストラップを作成（モーダルなどで使用）
 */
export function createFocusTrap(container: HTMLElement): {
  activate: () => void;
  deactivate: () => void;
} {
  let isActive = false;
  let previousActiveElement: HTMLElement | null = null;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isActive || event.key !== "Tab") return;

    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  return {
    activate: () => {
      if (isActive) return;

      isActive = true;
      previousActiveElement = document.activeElement as HTMLElement;

      document.addEventListener("keydown", handleKeyDown);

      // 最初のフォーカス可能な要素にフォーカス
      const focusableElements = getFocusableElements(container);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    },

    deactivate: () => {
      if (!isActive) return;

      isActive = false;
      document.removeEventListener("keydown", handleKeyDown);

      // 前のフォーカス位置に戻す
      if (previousActiveElement) {
        previousActiveElement.focus();
      }
    },
  };
}

/**
 * ARIA属性を安全に設定
 */
export function setAriaAttribute(
  element: HTMLElement,
  attribute: string,
  value: string | boolean | null
): void {
  if (value === null || value === undefined) {
    element.removeAttribute(attribute);
  } else {
    element.setAttribute(attribute, String(value));
  }
}

/**
 * 色のコントラスト比を計算（簡易版）
 */
export function calculateContrastRatio(color1: string, color2: string): number {
  // 簡易的な実装 - 実際のプロダクションではより正確な計算が必要
  const getLuminance = (color: string): number => {
    // RGB値を取得（簡易的な実装）
    const rgb = color.match(/\d+/g);
    if (!rgb || rgb.length < 3) return 0;

    const [r, g, b] = rgb.map(Number);
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * アクセシビリティ設定を取得
 */
export function getAccessibilityPreferences(): {
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersColorScheme: "light" | "dark" | "no-preference";
} {
  return {
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    prefersHighContrast: window.matchMedia("(prefers-contrast: high)").matches,
    prefersColorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "no-preference",
  };
}
