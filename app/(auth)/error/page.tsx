import Link from "next/link";

import type { Metadata } from "next";

import { AuthCard } from "@features/auth";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "認証エラー",
  description: "認証処理のエラー内容を表示します",
};

interface ErrorPageProps {
  searchParams: Promise<{
    message?: string;
  }>;
}

export default async function AuthErrorPage(props: ErrorPageProps) {
  const searchParams = await props.searchParams;
  const { message } = searchParams;

  return (
    <AuthCard title="認証エラー">
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>
            {message ? decodeURIComponent(message) : "認証に失敗しました。"}
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm text-muted-foreground">以下の方法をお試しください：</p>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            <li>再度ログインを試す</li>
            <li>新しい確認メールを送信する</li>
            <li>時間をおいてから再度お試しください</li>
          </ul>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <Button asChild className="w-full">
            <Link href="/login">ログインページに戻る</Link>
          </Button>
          <Button variant="link" asChild>
            <Link href="/register">アカウント登録</Link>
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
