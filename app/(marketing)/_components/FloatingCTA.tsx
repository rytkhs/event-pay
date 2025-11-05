"use client";

import { useCallback, useEffect, useState } from "react";

interface FloatingCTAProps {
  text: string;
  targetSectionId: string;
  heroSectionId: string;
  closingSectionId: string;
}

export function FloatingCTA({
  text,
  targetSectionId,
  heroSectionId,
  closingSectionId,
}: FloatingCTAProps): JSX.Element {
  const [visible, setVisible] = useState(false);

  const scrollToSection = useCallback((id: string) => {
    const target = document.querySelector<HTMLElement>(`#${id}`);
    if (target) {
      const targetTop = target.getBoundingClientRect().top + window.scrollY;
      const top = targetTop - 80 - 20; // header height + padding
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const hero = document.querySelector<HTMLElement>(`#${heroSectionId}`);
      const closing = document.querySelector<HTMLElement>(`#${closingSectionId}`);
      if (hero && closing) {
        const heroBottom = hero.offsetTop + hero.offsetHeight;
        const closingTop = closing.offsetTop;
        const y = window.scrollY;
        setVisible(y > heroBottom && y < closingTop - window.innerHeight);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [heroSectionId, closingSectionId]);

  return (
    <div className={`floating-cta${visible ? " visible" : ""}`} id="floatingCta">
      <button
        className="btn btn-primary floating-cta-btn"
        onClick={() => scrollToSection(targetSectionId)}
      >
        {text}
      </button>
    </div>
  );
}
