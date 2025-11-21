"use client";

import React, { useRef } from "react";

import { m, useInView } from "motion/react";

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
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "0px 0px -50px 0px" });

  const getInitialProps = () => {
    switch (direction) {
      case "up":
        return { opacity: 0, y: 20 };
      case "down":
        return { opacity: 0, y: -20 };
      case "left":
        return { opacity: 0, x: 20 };
      case "right":
        return { opacity: 0, x: -20 };
      case "none":
      default:
        return { opacity: 0 };
    }
  };

  const getAnimateProps = () => {
    switch (direction) {
      case "up":
      case "down":
        return { opacity: 1, y: 0 };
      case "left":
      case "right":
        return { opacity: 1, x: 0 };
      case "none":
      default:
        return { opacity: 1 };
    }
  };

  return (
    <m.div
      ref={ref}
      initial={getInitialProps()}
      animate={isInView ? getAnimateProps() : getInitialProps()}
      transition={{
        duration,
        delay,
        ease: "easeOut",
      }}
      className={className}
    >
      {children}
    </m.div>
  );
};
