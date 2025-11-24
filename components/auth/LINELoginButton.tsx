import { Button } from "@/components/ui/button";

import { LINEIcon } from "./SocialLoginIcons";

interface LINELoginButtonProps {
  href: string;
  label?: string;
}

export function LINELoginButton({ href, label = "LINEでログイン" }: LINELoginButtonProps) {
  return (
    <a href={href} className="block w-full">
      <Button
        type="button"
        className="w-full flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#06C755] hover:shadow-[inset_0_0_0_999px_rgba(0,0,0,0.1)] active:shadow-[inset_0_0_0_999px_rgba(0,0,0,0.3)] text-white font-bold transition-all"
      >
        <LINEIcon />
        <span>{label}</span>
      </Button>
    </a>
  );
}
