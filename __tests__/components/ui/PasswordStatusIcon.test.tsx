/**
 * PasswordStatusIcon Component Tests
 * パスワード状態アイコンコンポーネントのテスト
 */

import { render, screen } from "@testing-library/react";
import { PasswordStatusIcon } from "@/components/ui/PasswordStatusIcon";

describe("PasswordStatusIcon", () => {
  describe("Rendering", () => {
    it('should render nothing when type is "none"', () => {
      const { container } = render(<PasswordStatusIcon type="none" />);
      expect(container.firstChild).toBeNull();
    });

    it('should render success icon when type is "success"', () => {
      render(<PasswordStatusIcon type="success" />);

      const icon = screen.getByTestId("password-match-success");
      expect(icon).toBeInTheDocument();

      // The color class is on the parent div, not the icon itself
      const container = icon.closest("div");
      expect(container).toHaveClass("text-green-600");
    });

    it('should render error icon when type is "error"', () => {
      render(<PasswordStatusIcon type="error" />);

      const icon = screen.getByTestId("password-match-error");
      expect(icon).toBeInTheDocument();

      // The color class is on the parent div, not the icon itself
      const container = icon.closest("div");
      expect(container).toHaveClass("text-red-600");
    });
  });

  describe("Message Display", () => {
    it("should display message when provided for success", () => {
      const message = "Passwords match!";
      render(<PasswordStatusIcon type="success" message={message} />);

      expect(screen.getByText(message)).toBeInTheDocument();
    });

    it("should display message when provided for error", () => {
      const message = "Passwords do not match";
      render(<PasswordStatusIcon type="error" message={message} />);

      expect(screen.getByText(message)).toBeInTheDocument();
    });

    it("should not display message when not provided", () => {
      render(<PasswordStatusIcon type="success" />);

      // Should only have the icon, no text content
      const container = screen.getByTestId("password-match-success").closest("div");
      const textContent = container?.textContent;
      expect(textContent).toBe("");
    });
  });

  describe("Custom Test ID", () => {
    it("should use custom testId when provided", () => {
      const customTestId = "custom-password-icon";
      render(<PasswordStatusIcon type="success" testId={customTestId} />);

      expect(screen.getByTestId(customTestId)).toBeInTheDocument();
      expect(screen.queryByTestId("password-match-success")).not.toBeInTheDocument();
    });

    it("should use default testId when not provided", () => {
      render(<PasswordStatusIcon type="error" />);

      expect(screen.getByTestId("password-match-error")).toBeInTheDocument();
    });
  });

  describe("CSS Classes", () => {
    it("should apply correct CSS classes for success state", () => {
      render(<PasswordStatusIcon type="success" message="Test message" />);

      const container = screen.getByTestId("password-match-success").closest("div");
      expect(container).toHaveClass("flex", "items-center", "text-green-600", "text-sm");
    });

    it("should apply correct CSS classes for error state", () => {
      render(<PasswordStatusIcon type="error" message="Test message" />);

      const container = screen.getByTestId("password-match-error").closest("div");
      expect(container).toHaveClass("flex", "items-center", "text-red-600", "text-sm");
    });

    it("should apply correct icon classes", () => {
      render(<PasswordStatusIcon type="success" />);

      const icon = screen.getByTestId("password-match-success");
      expect(icon).toHaveClass("w-4", "h-4", "mr-1");
      expect(icon).toHaveAttribute("fill", "currentColor");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("SVG Icon Content", () => {
    it("should render checkmark path for success", () => {
      render(<PasswordStatusIcon type="success" />);

      const icon = screen.getByTestId("password-match-success");
      const path = icon.querySelector("path");
      expect(path).toHaveAttribute("fill-rule", "evenodd");
      expect(path).toHaveAttribute("clip-rule", "evenodd");
      // Check that it contains the checkmark path data
      expect(path?.getAttribute("d")).toContain("16.707 5.293");
    });

    it("should render X mark path for error", () => {
      render(<PasswordStatusIcon type="error" />);

      const icon = screen.getByTestId("password-match-error");
      const path = icon.querySelector("path");
      expect(path).toHaveAttribute("fill-rule", "evenodd");
      expect(path).toHaveAttribute("clip-rule", "evenodd");
      // Check that it contains the X mark path data
      expect(path?.getAttribute("d")).toContain("4.293 4.293");
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(<PasswordStatusIcon type="success" />);

      const icon = screen.getByTestId("password-match-success");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("viewBox", "0 0 20 20");
    });

    it("should be properly associated with message text", () => {
      const message = "Status message";
      render(<PasswordStatusIcon type="success" message={message} />);

      // Icon and message should be in the same container
      const container = screen.getByTestId("password-match-success").closest("div");
      expect(container).toHaveTextContent(message);
    });
  });
});
