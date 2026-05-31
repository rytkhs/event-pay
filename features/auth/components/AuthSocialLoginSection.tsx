"use client";

import type { ComponentProps } from "react";

import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { LINELoginButton } from "@/components/auth/LINELoginButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";


interface AuthSocialLoginSectionProps {
  next: string;
  googleAction: ComponentProps<"form">["action"];
  oauthErrorMessage?: string | null;
  googleLabel?: string;
  lineLabel?: string;
}

export function AuthSocialLoginSection({
  next,
  googleAction,
  oauthErrorMessage,
  googleLabel,
  lineLabel,
}: AuthSocialLoginSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <LINELoginButton href={`/auth/line?next=${encodeURIComponent(next)}`} label={lineLabel} />
        <form action={googleAction}>
          <input type="hidden" name="next" value={next} />
          <GoogleLoginButton label={googleLabel} />
        </form>
      </div>

      {oauthErrorMessage && (
        <Alert variant="destructive" data-testid="oauth-error-message">
          <AlertDescription>{oauthErrorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">または</span>
        <Separator className="flex-1" />
      </div>
    </div>
  );
}
