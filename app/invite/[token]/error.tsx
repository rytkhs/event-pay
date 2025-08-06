"use client";

import { InviteError } from "@/components/events/invite-error";

export default function InvitePageError({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <InviteError
      errorMessage={error.message || "招待リンクの処理中にエラーが発生しました"}
      showRetry={true}
    />
  );
}
