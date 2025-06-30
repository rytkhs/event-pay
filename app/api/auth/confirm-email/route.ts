import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  // パラメータ検証
  if (!token || !email) {
    return NextResponse.json(
      { success: false, error: "確認トークンまたはメールアドレスが不足しています" },
      { status: 400 }
    );
  }

  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: Record<string, unknown>) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      }
    );

    // OTP検証
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      let errorMessage = "無効な確認トークンです";

      if (error.message.includes("expired")) {
        errorMessage = "確認リンクの有効期限が切れています";
      }

      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }

    if (!data.user) {
      return NextResponse.json(
        { success: false, error: "無効な確認トークンです" },
        { status: 400 }
      );
    }

    // 認証成功 - ダッシュボードにリダイレクト
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.error("Email confirmation error:", error);
    }
    return NextResponse.json(
      { success: false, error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
