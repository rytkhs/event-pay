"use client";

import { useCallback } from "react";

import { useRouter } from "next/navigation";

interface ClosingSectionProps {
  title: string;
  ctaText: string;
}

export function ClosingSection({ title, ctaText }: ClosingSectionProps): JSX.Element {
  const router = useRouter();

  const handleSignUp = useCallback(() => {
    router.push("/register");
  }, [router]);

  return (
    <section className="closing" id="closing">
      <div className="container">
        <h2 className="closing-title">{title}</h2>
        <div className="closing-cta">
          <button className="btn btn-primary btn-large closing-main-cta" onClick={handleSignUp}>
            {ctaText}
          </button>
        </div>
      </div>
    </section>
  );
}
