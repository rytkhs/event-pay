"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

import { LoadingSpinner } from "./LoadingSpinner";
import { GoogleIcon } from "./SocialLoginIcons";

interface GoogleLoginButtonProps {
  label?: string;
}

export function GoogleLoginButton({ label = "Googleでログイン" }: GoogleLoginButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full mb-1 sm:mb-3 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 border-gray-300 font-medium transition-colors"
      disabled={pending}
      aria-label={pending ? `${label}中` : label}
    >
      {pending ? (
        <>
          <LoadingSpinner />
          <span>{label}中...</span>
        </>
      ) : (
        <>
          <GoogleIcon />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
