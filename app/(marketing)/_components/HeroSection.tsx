"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";

interface HeroSectionProps {
  title: ReactNode;
  description: ReactNode;
  chips: string[];
  ctaText: string;
  microCopy: string;
  imageSrc: string;
  imageAlt: string;
}

export function HeroSection({
  title,
  description,
  chips,
  ctaText,
  microCopy,
  imageSrc,
  imageAlt,
}: HeroSectionProps): JSX.Element {
  const router = useRouter();
  const heroRef = useRef<HTMLElement | null>(null);

  const handleSignUp = useCallback(() => {
    router.push("/register");
  }, [router]);

  useEffect(() => {
    // initial hero animations
    const hero = heroRef.current;
    if (!hero) return;
    const selectors = [".hero-title", ".hero-description", ".hero-chips", ".hero-cta"];
    const elements: HTMLElement[] = selectors
      .map((s) => Array.from(hero.querySelectorAll<HTMLElement>(s)))
      .flat();
    elements.forEach((el) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(30px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    });
    elements.forEach((el, index) => {
      setTimeout(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, index * 200);
    });
  }, []);

  return (
    <section className="hero" ref={heroRef} id="hero">
      <div className="container">
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">{title}</h1>
            <p className="hero-description">{description}</p>
            <div className="hero-chips">
              {chips.map((chip) => (
                <span key={chip} className="chip">
                  {chip}
                </span>
              ))}
            </div>
            <div className="hero-cta">
              <button className="btn btn-primary btn-large hero-main-cta" onClick={handleSignUp}>
                {ctaText}
              </button>
              <p className="micro-copy">{microCopy}</p>
            </div>
          </div>
          <div className="hero-image">
            <Image
              src={imageSrc}
              alt={imageAlt}
              className="hero-img"
              width={1200}
              height={800}
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
