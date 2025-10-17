/**
 * Stripe 入金設定オンボーディング事前入力のバリデーションスキーマ
 */

import { z } from "zod";

// MCCプリセット定義（初期版、後で調整）
export const MCC_PRESETS = {
  // Stripe側で選択してもらうためのデフォルト値
  other: "other",
  // 参考選択肢（任意）
  business_services: "7392", // Management, Consulting, and Public Relations Services
  membership_org: "8699", // Membership Organizations
  recreation_services: "7997", // Membership Clubs (Sports, Recreation, Athletic)
  educational_services: "8299", // Schools and Educational Services
  software_services: "5734", // Computer Software Stores
} as const;

export type MCCPreset = keyof typeof MCC_PRESETS;

// 商品説明テンプレート
export const PRODUCT_DESCRIPTION_TEMPLATES = [
  "コミュニティイベントの参加登録と会費徴収（不定期開催、オンライン/現地開催）。参加者同士の交流促進を目的とした勉強会、セミナー、懇親会等を運営。",
  "サークル活動の出欠管理と参加費決済（毎月開催、都度請求）。スポーツ、趣味、学習等の定期的な活動における参加費や教材費の管理。",
  "勉強会・セミナーの参加登録とオンライン決済（単発または継続開催）。専門知識の共有とネットワーキング機会の提供を目的とした教育イベント。",
] as const;

// 事前入力フォームのスキーマ
export const OnboardingPrefillSchema = z
  .object({
    // ウェブサイト有無の分岐
    hasWebsite: z.boolean(),

    // ウェブサイトURL（hasWebsite=trueの場合必須）
    websiteUrl: z
      .string()
      .optional()
      .transform((val) => (val === "" ? undefined : val)),

    // 商品説明（hasWebsite=falseの場合必須）
    productDescription: z
      .string()
      .optional()
      .transform((val) => (val === "" ? undefined : val)),

    // MCCプリセット
    mccPreset: z.enum(Object.keys(MCC_PRESETS) as [MCCPreset, ...MCCPreset[]]),

    // customMcc は廃止（Onboarding側で選択）

    // リダイレクトURL（既存の仕組み）
    refreshUrl: z.string().url("有効なリフレッシュURLを指定してください"),
    returnUrl: z.string().url("有効なリターンURLを指定してください"),
  })
  .refine(
    (data) => {
      // hasWebsite=trueの場合、websiteUrlが必須
      if (data.hasWebsite && !data.websiteUrl) {
        return false;
      }
      // hasWebsite=falseの場合、productDescriptionが必須
      if (!data.hasWebsite && !data.productDescription) {
        return false;
      }
      return true;
    },
    {
      message: "ウェブサイトまたは商品説明のいずれかを入力してください",
      path: ["websiteUrl", "productDescription"],
    }
  )
  .refine(
    (data) => {
      // websiteUrlのHTTPS検証（本番のみ）
      if (data.websiteUrl && process.env.NODE_ENV === "production") {
        return data.websiteUrl.startsWith("https://");
      }
      return true;
    },
    {
      message: "本番環境ではHTTPSのURLのみ許可されています",
      path: ["websiteUrl"],
    }
  )
  .refine(
    (data) => {
      // productDescriptionの文字数制限
      if (data.productDescription) {
        const length = data.productDescription.length;
        return length >= 30 && length <= 280;
      }
      return true;
    },
    {
      message: "商品説明は30文字以上280文字以下で入力してください",
      path: ["productDescription"],
    }
  );

export type OnboardingPrefillInput = z.input<typeof OnboardingPrefillSchema>;
export type OnboardingPrefillData = z.output<typeof OnboardingPrefillSchema>;

/**
 * 事前入力データからビジネスプロファイルを構築
 */
export const buildBusinessProfile = (data: OnboardingPrefillData) => {
  const profile: {
    url?: string;
    product_description?: string;
    mcc?: string;
  } = {};

  // URLまたは商品説明を設定
  if (data.hasWebsite && data.websiteUrl) {
    profile.url = data.websiteUrl;
  } else if (!data.hasWebsite && data.productDescription) {
    profile.product_description = data.productDescription;
  }

  // MCC設定（"other"の場合はStripeに送らず、Onboardingで収集）
  if (data.mccPreset !== "other") {
    profile.mcc = MCC_PRESETS[data.mccPreset];
  }

  return profile;
};

/**
 * フォームの初期値
 */
export const getDefaultPrefillValues = (): Partial<OnboardingPrefillInput> => {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    hasWebsite: false,
    mccPreset: "other",
    refreshUrl: `${baseUrl}/dashboard/connect/refresh`,
    returnUrl: `${baseUrl}/dashboard/connect/return`,
  };
};
