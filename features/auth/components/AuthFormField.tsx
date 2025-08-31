"use client";

import { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthFormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  fieldErrors?: string[];
  error?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * 認証フォーム用入力フィールドコンポーネント
 * 既存のFormFieldコンポーネントを認証用途向けに拡張
 */
export function AuthFormField({
  label,
  fieldErrors,
  error,
  className = "",
  inputClassName = "",
  ...inputProps
}: AuthFormFieldProps) {
  const fieldError = error || fieldErrors?.[0];
  const hasError = Boolean(fieldError);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <Label
          htmlFor={inputProps.name}
          className={
            inputProps.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""
          }
        >
          {label}
        </Label>
      )}
      <Input
        {...inputProps}
        id={inputProps.name}
        className={`${hasError ? "border-red-500 focus-visible:ring-red-500" : ""} ${inputClassName}`}
        aria-invalid={hasError ? "true" : "false"}
        aria-required={inputProps.required}
        aria-describedby={hasError ? `${inputProps.name}-error` : `${inputProps.name}-description`}
      />
      {/* 常に説明文を提供 */}
      <div
        id={`${inputProps.name}-description`}
        className="text-xs text-gray-500"
        aria-live="polite"
      >
        {inputProps.placeholder || `${label}を入力してください`}
      </div>
      {hasError && (
        <p
          id={`${inputProps.name}-error`}
          className="text-sm text-red-600"
          role="alert"
          aria-live="polite"
          data-testid={`${inputProps.name}-error`}
        >
          {fieldError}
        </p>
      )}
    </div>
  );
}

/**
 * メールアドレス用入力フィールド
 * メール入力に特化した設定
 */
export function AuthEmailField(props: Omit<AuthFormFieldProps, "type">) {
  return <AuthFormField {...props} type="email" autoComplete="email" inputMode="email" />;
}
