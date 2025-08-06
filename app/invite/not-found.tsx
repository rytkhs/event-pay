import { InvalidInviteError } from "@/components/events/error-pages";

/**
 * 招待ページ専用の404エラーページ
 */
export default function InviteNotFoundPage() {
  return <InvalidInviteError />;
}
