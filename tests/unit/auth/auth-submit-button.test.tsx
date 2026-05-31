/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import { render, screen } from "@testing-library/react";

import { AuthSubmitButton } from "@features/auth";

describe("AuthSubmitButton", () => {
  it("disables itself and renders loading text while pending", () => {
    render(
      <AuthSubmitButton isPending loadingText="送信中...">
        送信
      </AuthSubmitButton>
    );

    expect(screen.getByRole("button", { name: "送信中..." })).toBeDisabled();
  });
});
