"use client";

import React from "react";

import { cn } from "@/core/utils";
import { useInView } from "@/hooks/use-in-view";

type Direction = "up" | "down" | "left" | "right" | "none";

interface FadeInProps {
  children: React.ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  className?: string;
  once?: boolean;
}

export const FadeIn: React.FC<FadeInProps> = ({
  children,
  direction = "up",
  delay = 0,
  duration = 0.5,
  className = "",
  once = true,
}) => {
  const { ref, isInView } = useInView({ once, rootMargin: "0px 0px -50px 0px" });

  const getTransformClass = () => {
    switch (direction) {
      case "up":
        return "translate-y-8";
      case "down":
        return "-translate-y-8";
      case "left":
        return "translate-x-8";
      case "right":
        return "-translate-x-8";
      case "none":
      default:
        return "";
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all ease-out",
        isInView ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${getTransformClass()}`,
        className
      )}
      style={{
        transitionDuration: `${duration}s`,
        transitionDelay: `${delay}s`,
      }}
    >
      {children}
    </div>
  );
};
