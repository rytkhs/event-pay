"use client";

import { useState, useEffect, Suspense } from "react";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2, AlertCircle, Mail, ArrowLeft, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";

import { otpCodeFormSchema, type OtpCodeFormInput } from "@core/validation/auth";

import { AuthCard, useAuthResendOtp } from "@features/auth";

import { Alert, AlertDescription, AlertTitle } from "@components/ui/alert";
import { Button } from "@components/ui/button";
import { CardFooter } from "@components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@components/ui/input-otp";

import { verifyOtpAction, resendOtpAction } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

function VerifyOtpContent() {
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const type = searchParams.get("type") || "signup";
  const {
    resend,
    isPending: resendLoading,
    isDisabled: resendDisabled,
    countdown,
    error: resendError,
  } = useAuthResendOtp({
    email,
    type,
    action: resendOtpAction,
  });
  const error = verifyError || (!loading ? resendError : null);

  const form = useForm<OtpCodeFormInput>({
    resolver: zodResolver(otpCodeFormSchema),
    defaultValues: {
      otp: "",
    },
  });

  // メールアドレスがない場合はリダイレクト
  useEffect(() => {
    if (!email) {
      const redirectPath = type === "recovery" ? "/reset-password" : "/register";
      router.push(redirectPath);
    }
  }, [email, router, type]);

  const onSubmit = async (data: OtpCodeFormInput) => {
    if (!email) return;

    setLoading(true);
    setVerifyError(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("otp", data.otp);
      formData.append("type", type);

      const result = await verifyOtpAction(formData);

      if (!result.success) {
        setVerifyError(result.error.userMessage);
        form.setValue("otp", ""); // エラー時にOTPをクリア
      } else if (result.redirectUrl) {
        setSuccess(true);
        router.refresh(); // クライアント側のセッション状態を更新
        const redirectUrl = result.redirectUrl;
        if (redirectUrl) {
          setTimeout(() => {
            router.push(redirectUrl);
          }, 1500);
        }
      }
    } catch {
      setVerifyError("認証に失敗しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  if (!email) return null; // リダイレクト中

  if (success) {
    return (
      <AuthCard title="認証完了" cardClassName="border-success/20" contentClassName="text-center">
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-success/10 animate-in zoom-in duration-300">
            <CheckCircle2 className="size-8 text-success" />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">メールアドレスが確認されました</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
            <Loader2 className="size-4 animate-spin" />
            <span>ホームに移動中...</span>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={type === "recovery" ? "パスワードリセット" : "確認コードを入力"}
      description={
        <>
          <span className="font-medium text-foreground">{email}</span>{" "}
          に送信された6桁のコードを入力してください
        </>
      }
      contentClassName="flex flex-col gap-6"
      footer={
        <CardFooter className="justify-center border-t bg-muted/20 py-4">
          <Button variant="link" size="sm" asChild className="text-muted-foreground">
            <Link href={type === "recovery" ? "/reset-password" : "/login"}>
              <ArrowLeft className="mr-2 h-3 w-3" />
              {type === "recovery" ? "パスワードリセットに戻る" : "ログインページに戻る"}
            </Link>
          </Button>
        </CardFooter>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">確認コード</FormLabel>
                <FormControl>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} {...field} id="otp" disabled={loading}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </FormControl>
                <FormMessage className="text-center" />
              </FormItem>
            )}
          />

          {error && (
            <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading} size="lg">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            認証する
          </Button>
        </form>
      </Form>

      <div className="flex flex-col gap-4 border-t pt-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">コードが届かない場合</p>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={resend}
            disabled={resendDisabled || resendLoading}
            className="text-primary hover:text-primary/90 hover:bg-primary/5"
          >
            {resendLoading ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                送信中...
              </>
            ) : resendDisabled ? (
              <>
                <RefreshCw className="mr-2 h-3 w-3 opacity-50" />
                再送信まで {countdown}秒
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                コードを再送信
              </>
            )}
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
          <h4 className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            メールが届かない場合
          </h4>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>迷惑メールフォルダをご確認ください</li>
            <li>ドメイン受信設定をご確認ください</li>
            {type === "recovery" ? (
              <li>
                <span className="font-medium text-foreground">登録済みメールアドレス</span>
                でない場合、コードは送信されません
              </li>
            ) : (
              <li>入力されたメールアドレスに間違いがないかご確認ください</li>
            )}
          </ul>
        </div>
      </div>
    </AuthCard>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="読み込み中" contentClassName="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </AuthCard>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
