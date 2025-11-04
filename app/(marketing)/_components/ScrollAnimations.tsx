"use client";

import { useEffect } from "react";

interface ScrollAnimationsProps {
  selectors: string[];
}

export function ScrollAnimations({ selectors }: ScrollAnimationsProps): null {
  useEffect(() => {
    const animateTargets = document.querySelectorAll<HTMLElement>(selectors.join(", "));
    animateTargets.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(30px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    });
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    animateTargets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [selectors]);

  return null;
}
