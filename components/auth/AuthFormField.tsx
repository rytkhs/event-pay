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
        aria-invalid={hasError}
        aria-describedby={hasError ? `${inputProps.name}-error` : undefined}
      />
      {hasError && (
        <p id={`${inputProps.name}-error`} className="text-sm text-red-600">
          {fieldError}
        </p>
      )}
    </div>
  );
}

/**
 * パスワード用入力フィールド
 * セキュリティ要件に特化した設定
 */
export function AuthPasswordField(props: Omit<AuthFormFieldProps, "type">) {
  // パスワードタイプに応じたautoComplete設定
  const autoCompleteValue =
    props.autoComplete ||
    (props.name === "password" && !props.autoComplete ? "new-password" : "current-password");

  return <AuthFormField {...props} type="password" autoComplete={autoCompleteValue} />;
}

/**
 * メールアドレス用入力フィールド
 * メール入力に特化した設定
 */
export function AuthEmailField(props: Omit<AuthFormFieldProps, "type">) {
  return (
    <AuthFormField
      {...props}
      type="email"
      autoComplete="email"
      inputMode="email"
      // メールアドレスのバリデーション属性
      pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
    />
  );
}
