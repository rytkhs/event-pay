"use client";

import * as React from "react";

import { Eye, EyeOff } from "lucide-react";

import { cn } from "./_lib/cn";
import { Button } from "./button";
import { Input } from "./input";

export interface PasswordInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  /**
   * 表示切り替えボタンを非表示にする
   * @default false
   */
  hideToggle?: boolean;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, hideToggle = false, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    const togglePasswordVisibility = () => {
      setShowPassword((prev) => !prev);
    };

    return (
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          className={cn(hideToggle ? "" : "pr-10", className)}
          ref={ref}
          {...props}
        />
        {!hideToggle && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={togglePasswordVisibility}
            aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
