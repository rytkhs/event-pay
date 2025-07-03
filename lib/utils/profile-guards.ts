import { Tables } from "@/types/database";

/**
 * public_profilesビューの型ガード関数とヘルパー
 * null可能フィールドの安全な取り扱いを提供
 */

export type PublicProfile = Tables<"public_profiles">;

/**
 * PublicProfileの完全性チェック
 */
export function isCompleteProfile(
  profile: PublicProfile | null
): profile is NonNullable<PublicProfile> & {
  id: string;
  name: string;
} {
  return !!(profile?.id && profile?.name);
}

/**
 * プロフィール名の安全な取得
 */
export function getProfileName(profile: PublicProfile | null): string {
  return profile?.name || "名前未設定";
}

/**
 * プロフィールIDの安全な取得
 */
export function getProfileId(profile: PublicProfile | null): string | null {
  return profile?.id || null;
}

/**
 * プロフィール表示用データの生成
 */
export function getProfileDisplayData(profile: PublicProfile | null) {
  return {
    id: getProfileId(profile),
    name: getProfileName(profile),
    isComplete: isCompleteProfile(profile),
    hasValidId: !!profile?.id,
    hasValidName: !!profile?.name,
  };
}

/**
 * プロフィール配列のフィルタリング
 */
export function filterCompleteProfiles(profiles: (PublicProfile | null)[]): Array<
  NonNullable<PublicProfile> & {
    id: string;
    name: string;
  }
> {
  return profiles.filter(isCompleteProfile);
}

/**
 * プロフィール作成日時の安全な取得
 */
export function getProfileCreatedAt(profile: PublicProfile | null): Date | null {
  if (!profile?.created_at) return null;
  try {
    return new Date(profile.created_at);
  } catch {
    return null;
  }
}
