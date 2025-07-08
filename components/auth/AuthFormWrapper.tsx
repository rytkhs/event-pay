import { ReactNode, useEffect, useRef } from "react";
import { AuthFormMessages } from "./AuthFormMessages";
import { ServerActionResult } from "@/lib/hooks/useAuthForm";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useFocusManagement } from "@/lib/hooks/useFocusManagement";

interface AuthFormWrapperProps {
  title: string;
  subtitle?: string;
  state: ServerActionResult;
  isPending: boolean;
  children: ReactNode;
  action?: string | ((formData: FormData) => void);
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  testId?: string;
}

/**
 * 認証フォームラッパーコンポーネント
 * 認証ページの共通レイアウトとフォーム設定を提供
 * フォーカス管理機能を統合
 */
export function AuthFormWrapper({
  title,
  subtitle,
  state,
  isPending,
  children,
  action,
  className = "",
  maxWidth = "md",
  testId,
}: AuthFormWrapperProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { focusFirstError, restoreFocus } = useFocusManagement();
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // フォーム送信前に現在のフォーカス要素を保存
  useEffect(() => {
    if (isPending) {
      previousActiveElement.current = document.activeElement as HTMLElement;
    }
  }, [isPending]);

  // エラー発生時に最初のエラーフィールドにフォーカス
  useEffect(() => {
    if (!state.success && state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      const errorFields = Object.keys(state.fieldErrors);
      focusFirstError(errorFields);
    }
  }, [state.fieldErrors, state.success, focusFirstError]);

  // フォーム送信完了後のフォーカス復元
  useEffect(() => {
    if (!isPending && previousActiveElement.current) {
      // 送信が完了し、エラーがない場合はフォーカスを復元
      if (state.success || !state.fieldErrors) {
        restoreFocus(previousActiveElement.current);
      }
      previousActiveElement.current = null;
    }
  }, [isPending, state.success, state.fieldErrors, restoreFocus]);
  // 最大幅のスタイル
  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <>
      <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className={`w-full ${maxWidthStyles[maxWidth]} space-y-8`}>
          <Card>
            <CardHeader className="text-center">
              <h1 className="text-3xl font-bold">{title}</h1>
              {subtitle && <CardDescription className="text-sm">{subtitle}</CardDescription>}
            </CardHeader>
            <CardContent>
              <form
                ref={formRef}
                action={typeof action === "string" ? action : undefined}
                onSubmit={typeof action === "function" ? (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  action(formData);
                } : undefined}
                className={`space-y-6 ${className}`}
                noValidate
                role="form"
                aria-describedby={state.error ? "form-error" : undefined}
                data-testid={testId}
              >
                <AuthFormMessages state={state} />

                <fieldset className="space-y-4">{children}</fieldset>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="text-center text-sm text-gray-600 py-4" role="contentinfo">
        <p>EventPay - 小規模コミュニティ向けイベント出欠管理・集金ツール</p>
      </footer>
    </>
  );
}
