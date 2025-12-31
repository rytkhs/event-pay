"use client";

import { useState, useEffect, Suspense } from "react";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2, AlertCircle, Mail, ArrowLeft, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { verifyOtpAction, resendOtpAction } from "@core/actions/auth";

import { Alert, AlertDescription, AlertTitle } from "@components/ui/alert";
import { Button } from "@components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@components/ui/input-otp";

export const dynamic = "force-dynamic";

const FormSchema = z.object({
  otp: z.string().min(6, {
    message: "6桁の確認コードを入力してください。",
  }),
});

function VerifyOtpContent() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [success, setSuccess] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const type = searchParams.get("type") || "signup";

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      otp: "",
    },
  });

  // カウントダウンタイマー
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resendDisabled && countdown === 0) {
      setResendDisabled(false);
    }
  }, [countdown, resendDisabled]);

  // メールアドレスがない場合はリダイレクト
  useEffect(() => {
    if (!email) {
      const redirectPath = type === "recovery" ? "/reset-password" : "/register";
      router.push(redirectPath);
    }
  }, [email, router, type]);

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("otp", data.otp);
      formData.append("type", type);

      const result = await verifyOtpAction(formData);

      if (result?.error) {
        setError(result.error);
        form.setValue("otp", ""); // エラー時にOTPをクリア
      } else if (result?.success && result?.redirectUrl) {
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
      setError("認証に失敗しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email || resendDisabled) return;

    setResendLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("type", type);

      const result = await resendOtpAction(formData);

      if (result.error) {
        setError(result.error);
      } else {
        setResendDisabled(true);
        setCountdown(60);
        setError(null);
      }
    } catch {
      setError("再送信に失敗しました。");
    } finally {
      setResendLoading(false);
    }
  };

  if (!email) return null; // リダイレクト中

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4 py-12">
        <Card className="w-full max-w-md shadow-lg border-green-100">
          <CardContent className="pt-10 pb-10 text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">認証完了</h2>
              <p className="text-gray-500">メールアドレスが確認されました</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>ダッシュボードに移動中...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center pb-2">
          <CardTitle className="text-2xl font-bold">
            {type === "recovery" ? "パスワードリセット" : "確認コードを入力"}
          </CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{email}</span>{" "}
            に送信された6桁のコードを入力してください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

          {/* 再送信セクション */}
          <div className="space-y-4 pt-4 border-t">
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-500">コードが届かない場合</p>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={handleResend}
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

            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground border">
              <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                メールが届かない場合
              </h4>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>迷惑メールフォルダをご確認ください</li>
                <li>ドメイン受信設定をご確認ください</li>
                <li>
                  <span className="font-medium text-foreground">登録済みメールアドレス</span>
                  でない場合、コードは送信されません
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-center border-t py-4 bg-muted/20">
          <Button variant="link" size="sm" asChild className="text-muted-foreground">
            <Link href={type === "recovery" ? "/reset-password" : "/login"}>
              <ArrowLeft className="mr-2 h-3 w-3" />
              {type === "recovery" ? "パスワードリセットに戻る" : "ログインページに戻る"}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] px-4 py-12">
          <Card className="w-full max-w-md shadow-lg">
            <CardContent className="pt-10 pb-10 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-gray-500">読み込み中...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
