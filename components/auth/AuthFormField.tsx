import { InputHTMLAttributes, useState } from "react";
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
 * パスワード用入力フィールド（表示切り替え機能付き）
 * セキュリティ要件に特化した設定
 */
export function AuthPasswordField(props: Omit<AuthFormFieldProps, "type">) {
  const [showPassword, setShowPassword] = useState(false);

  // パスワードタイプに応じたautoComplete設定
  const autoCompleteValue =
    props.autoComplete ||
    (props.name === "password" && !props.autoComplete ? "new-password" : "current-password");

  const fieldError = props.error || props.fieldErrors?.[0];
  const hasError = Boolean(fieldError);

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div className={`space-y-2 ${props.className || ""}`}>
      {props.label && (
        <Label
          htmlFor={props.name}
          className={props.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}
        >
          {props.label}
        </Label>
      )}
      <div className="relative">
        <Input
          name={props.name}
          id={props.name}
          required={props.required}
          placeholder={props.placeholder}
          value={props.value}
          defaultValue={props.defaultValue}
          onChange={props.onChange}
          onBlur={props.onBlur}
          onFocus={props.onFocus}
          disabled={props.disabled}
          readOnly={props.readOnly}
          type={showPassword ? "text" : "password"}
          autoComplete={autoCompleteValue}
          className={`${hasError ? "border-red-500 focus-visible:ring-red-500" : ""} ${props.inputClassName || ""} pr-10`}
          aria-invalid={hasError ? "true" : "false"}
          aria-required={props.required}
          aria-describedby={hasError ? `${props.name}-error` : `${props.name}-toggle`}
        />
        <button
          type="button"
          onClick={togglePasswordVisibility}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50"
          aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
          aria-pressed={showPassword}
          aria-controls={props.name}
          tabIndex={0}
          id={`${props.name}-toggle`}
        >
          <svg
            data-testid="password-toggle-icon"
            data-state={showPassword ? "visible" : "hidden"}
            className="w-4 h-4 transition-transform duration-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            {showPassword ? (
              // Eye Off (password hidden/crossed out)
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 11-4.243-4.243m4.242 4.242L9.88 9.88"
                />
              </>
            ) : (
              // Eye (password visible)
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </>
            )}
          </svg>
        </button>
      </div>
      {hasError && (
        <p
          id={`${props.name}-error`}
          className="text-sm text-red-600"
          role="alert"
          aria-live="polite"
          data-testid={`${props.name}-error`}
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
