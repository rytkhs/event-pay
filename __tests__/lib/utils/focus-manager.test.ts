import { FocusManager } from "@/lib/utils/focusManager";

// DOM要素のモックユーティリティ
const createMockElement = (
  id: string,
  tagName: string = "input",
  options: { disabled?: boolean; tabIndex?: number } = {}
) => {
  const element = document.createElement(tagName);
  element.id = id;
  element.setAttribute("name", id);
  element.tabIndex = options.tabIndex ?? 0;

  if (options.disabled) {
    element.setAttribute("disabled", "true");
  }

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

describe("FocusManager Utility", () => {
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

  it("コンテナ内の最初のフォーカス可能要素を見つけること", () => {
    const hiddenInput = createMockElement("hidden", "input", { tabIndex: -1 });
    const visibleInput = createMockElement("visible", "input");
    const button = createMockElement("button", "button");

    container.appendChild(hiddenInput);
    container.appendChild(visibleInput);
    container.appendChild(button);

    const focusableElements = FocusManager.getFocusableElements(container);

    expect(focusableElements).toHaveLength(2);
    expect(focusableElements[0]).toBe(visibleInput);
    expect(focusableElements[1]).toBe(button);
  });

  it("フォーカス可能要素が存在しない場合、空配列を返すこと", () => {
    const div = document.createElement("div");
    const span = document.createElement("span");

    container.appendChild(div);
    container.appendChild(span);

    const focusableElements = FocusManager.getFocusableElements(container);

    expect(focusableElements).toHaveLength(0);
  });

  it("タブオーダーを正しく処理すること", () => {
    const input1 = createMockElement("input1", "input", { tabIndex: 3 });
    const input2 = createMockElement("input2", "input", { tabIndex: 1 });
    const input3 = createMockElement("input3", "input", { tabIndex: 2 });
    const input4 = createMockElement("input4", "input", { tabIndex: 0 });

    container.appendChild(input1);
    container.appendChild(input2);
    container.appendChild(input3);
    container.appendChild(input4);

    const focusableElements = FocusManager.getFocusableElements(container);

    // タブオーダー: 1, 2, 3, 0（自然順序）
    expect(focusableElements[0]).toBe(input2); // tabIndex: 1
    expect(focusableElements[1]).toBe(input3); // tabIndex: 2
    expect(focusableElements[2]).toBe(input1); // tabIndex: 3
    expect(focusableElements[3]).toBe(input4); // tabIndex: 0
  });

  it("フォーカストラップを作成・削除すること", () => {
    const firstInput = createMockElement("first");
    const lastInput = createMockElement("last");

    container.appendChild(firstInput);
    container.appendChild(lastInput);

    const cleanup = FocusManager.createFocusTrap(container);

    expect(typeof cleanup).toBe("function");

    // Tab移動のシミュレーション（最後の要素から）
    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: false,
      bubbles: true,
    });

    // 最後の要素にフォーカスを設定してからイベントを発行
    Object.defineProperty(tabEvent, "target", {
      value: lastInput,
      writable: false,
    });

    container.dispatchEvent(tabEvent);

    expect(firstInput.focus).toHaveBeenCalled();

    // クリーンアップ実行
    cleanup();

    // クリーンアップ後はイベントリスナーが削除されているため、
    // 追加のフォーカス呼び出しはない
    jest.clearAllMocks();
    container.dispatchEvent(tabEvent);
    expect(firstInput.focus).not.toHaveBeenCalled();
  });

  it("前の要素にフォーカスを復元すること", () => {
    const previousElement = createMockElement("previous");
    container.appendChild(previousElement);

    FocusManager.restoreFocus(previousElement);

    expect(previousElement.focus).toHaveBeenCalledTimes(1);
  });

  it("セレクターで最初のエラーフィールドにフォーカスすること", () => {
    const emailField = createMockElement("email");
    const passwordField = createMockElement("password");

    emailField.setAttribute("aria-invalid", "true");
    passwordField.setAttribute("aria-invalid", "true");

    container.appendChild(emailField);
    container.appendChild(passwordField);

    FocusManager.focusFirstError(container);

    expect(emailField.focus).toHaveBeenCalledTimes(1);
    expect(passwordField.focus).not.toHaveBeenCalled();
  });

  it("無効な要素はフォーカス対象から除外すること", () => {
    const enabledInput = createMockElement("enabled");
    const disabledInput = createMockElement("disabled", "input", { disabled: true });
    const hiddenInput = createMockElement("hidden", "input", { tabIndex: -1 });

    container.appendChild(enabledInput);
    container.appendChild(disabledInput);
    container.appendChild(hiddenInput);

    const focusableElements = FocusManager.getFocusableElements(container);

    expect(focusableElements).toHaveLength(1);
    expect(focusableElements[0]).toBe(enabledInput);
  });

  it("Shift+Tabでの逆方向フォーカストラップが動作すること", () => {
    const firstInput = createMockElement("first");
    const lastInput = createMockElement("last");

    container.appendChild(firstInput);
    container.appendChild(lastInput);

    const cleanup = FocusManager.createFocusTrap(container);

    // Shift+Tab移動のシミュレーション（最初の要素から）
    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
    });

    // 最初の要素にフォーカスを設定してからイベントを発行
    Object.defineProperty(shiftTabEvent, "target", {
      value: firstInput,
      writable: false,
    });

    container.dispatchEvent(shiftTabEvent);

    expect(lastInput.focus).toHaveBeenCalled();

    cleanup();
  });
});
