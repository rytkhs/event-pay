"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { LoadingSpinner } from "./LoadingSpinner";
import { LINEIcon } from "./SocialLoginIcons";

interface LINELoginButtonProps {
  href: string;
  label?: string;
}

export function LINELoginButton({ href, label = "LINEでログイン" }: LINELoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = () => {
    setIsLoading(true);
    window.location.href = href;
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#06C755] hover:shadow-[inset_0_0_0_999px_rgba(0,0,0,0.1)] active:shadow-[inset_0_0_0_999px_rgba(0,0,0,0.3)] text-white font-bold transition-all disabled:opacity-60"
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="h-5 w-5" color="white" />
          <span>ログイン中...</span>
        </>
      ) : (
        <>
          <LINEIcon />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
