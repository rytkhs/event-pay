import { ReactNode } from "react";
import { AuthFormMessages } from "./AuthFormMessages";
import { ServerActionResult } from "@/lib/hooks/useAuthForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthFormWrapperProps {
  title: string;
  subtitle?: string;
  state: ServerActionResult;
  isPending: boolean;
  children: ReactNode;
  formAction: (formData: FormData) => void;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

/**
 * 認証フォームラッパーコンポーネント
 * 認証ページの共通レイアウトとフォーム設定を提供
 */
export function AuthFormWrapper({
  title,
  subtitle,
  state,
  isPending,
  children,
  formAction,
  className = "",
  maxWidth = "md",
}: AuthFormWrapperProps) {
  // 最大幅のスタイル
  const maxWidthStyles = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className={`w-full ${maxWidthStyles[maxWidth]} space-y-8`}>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold">{title}</CardTitle>
            {subtitle && <CardDescription className="text-sm">{subtitle}</CardDescription>}
          </CardHeader>
          <CardContent>
            <form action={formAction} className={`space-y-6 ${className}`} noValidate>
              <AuthFormMessages state={state} />

              <fieldset disabled={isPending} className="space-y-4">
                {children}
              </fieldset>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-600">
          <p>EventPay - 小規模コミュニティ向けイベント出欠管理・集金ツール</p>
        </div>
      </div>
    </div>
  );
}
