import { renderHook, act } from "@testing-library/react";
import { useFocusManagement } from "@/lib/hooks/useFocusManagement";

// DOM要素のモックユーティリティ
const createMockElement = (id: string, tagName: string = "input") => {
  const element = document.createElement(tagName);
  element.id = id;
  element.setAttribute("name", id);
  element.tabIndex = 0;

  // focus/blur メソッドのモック
  element.focus = jest.fn();
  element.blur = jest.fn();

  return element;
};

// テストサポート用関数
const setupTestContainer = () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
};

const cleanupTestContainer = (container: HTMLElement) => {
  if (container.parentNode) {
    document.body.removeChild(container);
  }
};

describe("useFocusManagement Hook", () => {
  let container: HTMLElement;

  beforeEach(() => {
    // DOM環境の準備
    container = setupTestContainer();

    // focus/blur のモック
    HTMLElement.prototype.focus = jest.fn();
    HTMLElement.prototype.blur = jest.fn();
  });

  afterEach(() => {
    cleanupTestContainer(container);
    jest.clearAllMocks();
  });

  it("focusFirstErrorが呼ばれたとき、最初のエラーフィールドにフォーカスすること", () => {
    // エラーフィールドの準備
    const errorField = createMockElement("email");
    const normalField = createMockElement("password");
    container.appendChild(errorField);
    container.appendChild(normalField);

    const { result } = renderHook(() => useFocusManagement());

    act(() => {
      result.current.focusFirstError(["email"]);
    });

    expect(errorField.focus).toHaveBeenCalledTimes(1);
    expect(normalField.focus).not.toHaveBeenCalled();
  });

  it("trapFocusが有効なとき、モーダル内でフォーカストラップを管理すること", () => {
    // モーダル要素の準備
    const modal = document.createElement("div");
    const firstInput = createMockElement("first");
    const lastInput = createMockElement("last");
    const outsideInput = createMockElement("outside");

    modal.appendChild(firstInput);
    modal.appendChild(lastInput);
    container.appendChild(modal);
    container.appendChild(outsideInput);

    const { result } = renderHook(() => useFocusManagement());

    act(() => {
      result.current.trapFocus(modal);
    });

    // Tab移動のシミュレーション
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });

    Object.defineProperty(tabEvent, "target", {
      value: lastInput,
      writable: false,
    });

    act(() => {
      modal.dispatchEvent(tabEvent);
    });

    expect(firstInput.focus).toHaveBeenCalled();
  });

  it("restoreFocusが呼ばれたとき、前の要素にフォーカスを復元すること", () => {
    const previousElement = createMockElement("previous");
    container.appendChild(previousElement);

    const { result } = renderHook(() => useFocusManagement());

    act(() => {
      result.current.restoreFocus(previousElement);
    });

    expect(previousElement.focus).toHaveBeenCalledTimes(1);
  });

  it("複数のエラーフィールドを正しい優先順位で処理すること", () => {
    const firstField = createMockElement("email");
    const secondField = createMockElement("password");
    const thirdField = createMockElement("confirmPassword");

    container.appendChild(firstField);
    container.appendChild(secondField);
    container.appendChild(thirdField);

    const { result } = renderHook(() => useFocusManagement());

    act(() => {
      result.current.focusFirstError(["password", "email", "confirmPassword"]);
    });

    // DOM順序で最初に見つかる要素（email）にフォーカスされること
    expect(firstField.focus).toHaveBeenCalledTimes(1);
    expect(secondField.focus).not.toHaveBeenCalled();
    expect(thirdField.focus).not.toHaveBeenCalled();
  });

  it("フォーカストラップのクリーンアップ関数を提供すること", () => {
    const modal = document.createElement("div");
    const input = createMockElement("input");
    modal.appendChild(input);
    container.appendChild(modal);

    const { result } = renderHook(() => useFocusManagement());

    let cleanup: (() => void) | undefined;

    act(() => {
      cleanup = result.current.trapFocus(modal);
    });

    expect(typeof cleanup).toBe("function");

    // クリーンアップ実行
    act(() => {
      cleanup?.();
    });

    // クリーンアップ後はフォーカストラップが無効になることを確認
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });

    Object.defineProperty(tabEvent, "target", {
      value: input,
      writable: false,
    });

    act(() => {
      modal.dispatchEvent(tabEvent);
    });

    // フォーカストラップが無効になっているため、追加のフォーカス呼び出しはない
    expect(input.focus).not.toHaveBeenCalled();
  });
});
