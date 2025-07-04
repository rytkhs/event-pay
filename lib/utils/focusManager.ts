export interface FocusableElement extends HTMLElement {
  focus(): void;
  blur(): void;
}

export class FocusManager {
  private static readonly FOCUSABLE_SELECTORS = [
    'input:not([disabled]):not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    'a[href]:not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])',
  ] as const;

  /**
   * コンテナ内のフォーカス可能要素を取得
   */
  static getFocusableElements(container: HTMLElement): FocusableElement[] {
    if (!container || !container.nodeType) {
      return [];
    }

    const elements = Array.from(
      container.querySelectorAll(this.FOCUSABLE_SELECTORS.join(","))
    ) as FocusableElement[];

    // disabled要素を除外
    const enabledElements = elements.filter((element) => {
      return !element.hasAttribute("disabled") && element.tabIndex !== -1;
    });

    // タブオーダーでソート
    return this.sortByTabOrder(enabledElements);
  }

  /**
   * 要素をタブオーダーでソート
   */
  private static sortByTabOrder(elements: FocusableElement[]): FocusableElement[] {
    return elements.sort((a, b) => {
      const aIndex = a.tabIndex;
      const bIndex = b.tabIndex;

      if (aIndex === 0 && bIndex === 0) {
        // 両方とも0の場合はDOM順序
        return 0;
      }
      if (aIndex === 0) {
        // aが0の場合、bが正の値なら後ろ
        return bIndex > 0 ? 1 : -1;
      }
      if (bIndex === 0) {
        // bが0の場合、aが正の値なら前
        return aIndex > 0 ? -1 : 1;
      }

      // 両方とも正の値の場合は数値順
      return aIndex - bIndex;
    });
  }

  /**
   * DOM順序で要素をソート
   */
  static sortByDOMOrder(elements: FocusableElement[]): FocusableElement[] {
    return elements.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1; // aがbより前
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1; // aがbより後
      }
      return 0;
    });
  }

  /**
   * フォーカストラップを作成
   */
  static createFocusTrap(container: HTMLElement): () => void {
    if (!container || !container.nodeType) {
      return () => {};
    }

    const focusableElements = this.getFocusableElements(container);

    if (focusableElements.length === 0) {
      return () => {};
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const target = event.target as HTMLElement;

      try {
        if (event.shiftKey) {
          // Shift+Tab: 逆方向
          if (target === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: 順方向
          if (target === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      } catch (error) {
        // フォーカス処理でエラーが発生した場合は無視
        console.warn("Focus trap error:", error);
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
    };
  }

  /**
   * フォーカスを復元
   */
  static restoreFocus(element: HTMLElement): void {
    if (!element || !element.nodeType) {
      return;
    }

    try {
      if (typeof element.focus === "function") {
        element.focus();
      }
    } catch (error) {
      console.warn("Focus restore error:", error);
    }
  }

  /**
   * 最初のエラーフィールドにフォーカス
   */
  static focusFirstError(container: HTMLElement): void {
    if (!container || !container.nodeType) {
      return;
    }

    try {
      const errorElement = container.querySelector('[aria-invalid="true"]') as HTMLElement;
      if (errorElement && typeof errorElement.focus === "function") {
        errorElement.focus();
      }
    } catch (error) {
      console.warn("Focus first error failed:", error);
    }
  }

  /**
   * 要素が有効なフォーカス可能要素かチェック
   */
  static isFocusable(element: HTMLElement): element is FocusableElement {
    return (
      element &&
      element.nodeType === Node.ELEMENT_NODE &&
      !element.hasAttribute("disabled") &&
      element.tabIndex !== -1 &&
      typeof element.focus === "function"
    );
  }
}
