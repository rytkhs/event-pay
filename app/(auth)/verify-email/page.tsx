"use client";

import { useEffect, Suspense, useRef } from "react";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import { ExternalLink, Loader2, Mail } from "lucide-react";

import { AuthCard, useAuthResendOtp } from "@features/auth";

import { resendOtpAction } from "@/app/(auth)/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
  const errorRef = useRef<HTMLDivElement | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const {
    resend,
    isPending: resendLoading,
    isDisabled: resendDisabled,
    countdown,
    message,
    error,
  } = useAuthResendOtp({
    email,
    action: resendOtpAction,
  });

  // メールアドレスがない場合はリダイレクト
  useEffect(() => {
    if (!email) {
      router.push("/login");
    }
  }, [email, router]);

  // エラー発生時にスクロール＆フォーカス
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus({ preventScroll: true });
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  const getEmailProvider = (email: string) => {
    const domain = email.split("@")[1]?.toLowerCase();

    const providers = {
      "gmail.com": { name: "Gmail", url: "https://mail.google.com" },
      "yahoo.co.jp": { name: "Yahoo!メール", url: "https://mail.yahoo.co.jp" },
      "hotmail.com": { name: "Outlook", url: "https://outlook.live.com" },
      "outlook.com": { name: "Outlook", url: "https://outlook.live.com" },
      "icloud.com": { name: "iCloud Mail", url: "https://www.icloud.com/mail" },
      "docomo.ne.jp": { name: "ドコモメール", url: "https://mail.docomo.ne.jp" },
      "ezweb.ne.jp": { name: "au メール", url: "https://webmail.ezweb.ne.jp" },
      "softbank.ne.jp": { name: "SoftBank メール", url: "https://mail.softbank.jp" },
    };

    return providers[domain as keyof typeof providers];
  };

  if (!email) {
    return null; // リダイレクト中
  }

  const emailProvider = getEmailProvider(email);

  return (
    <AuthCard
      title="メールをご確認ください"
      description={
        <span>
          <span className="font-mono text-foreground">{email}</span> に確認メールを送信しました
        </span>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Mail className="size-8 text-primary" />
        </div>

        <Alert variant="info">
          <AlertTitle>次の手順</AlertTitle>
          <AlertDescription>
            <ol className="list-inside list-decimal text-sm">
              <li>メールボックスを確認してください</li>
              <li>みんなの集金からの確認メールを開いてください</li>
              <li>メール内の6桁の確認コードをコピーしてください</li>
              <li>
                <Link
                  href={`/verify-otp?email=${encodeURIComponent(email)}`}
                  className="text-primary underline hover:text-primary/80"
                >
                  確認コード入力ページ
                </Link>
                でコードを入力してください
              </li>
            </ol>
          </AlertDescription>
        </Alert>

        {emailProvider && (
          <Button asChild variant="secondary" className="w-full">
            <a href={emailProvider.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              {emailProvider.name}を開く
            </a>
          </Button>
        )}

        {message && (
          <Alert variant="success">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" aria-live="assertive" ref={errorRef} tabIndex={-1}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="border-t pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">メールが届かない場合は？</p>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p>迷惑メールフォルダをご確認ください</p>
              <p>メールアドレスに誤りがないかご確認ください</p>
              <p>数分経ってから再度お試しください</p>
            </div>

            <Button type="button" onClick={resend} disabled={resendDisabled || resendLoading}>
              {resendLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {resendLoading
                ? "送信中..."
                : resendDisabled
                  ? `再送信まで ${countdown}秒`
                  : "確認メールを再送信"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-6 text-center text-xs text-muted-foreground">
          <Link
            href={`/verify-otp?email=${encodeURIComponent(email)}`}
            className="text-primary underline hover:text-primary/80"
          >
            確認コードをお持ちの場合はこちら
          </Link>
          <Link href="/login" className="underline hover:text-foreground">
            ログインページに戻る
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="読み込み中" contentClassName="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </AuthCard>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
