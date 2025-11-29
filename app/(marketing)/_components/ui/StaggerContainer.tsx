"use client";

import React, { Children, cloneElement, isValidElement } from "react";

import { cn } from "@/core/utils";
import { useInView } from "@/hooks/use-in-view";

interface StaggerContainerProps {
  children: React.ReactNode;
  delay?: number;
  staggerDelay?: number;
  className?: string;
  once?: boolean;
}

export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  delay = 0,
  staggerDelay = 0.1,
  className = "",
  once = true,
}) => {
  const { ref, isInView } = useInView({ once, rootMargin: "0px 0px -100px 0px" });

  return (
    <div ref={ref} className={className}>
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;

        // Pass props to StaggerItem children
        // We check if the child type is StaggerItem to be safe, or just pass props to any component
        // that accepts them. Here we assume children are StaggerItem or compatible.
        return cloneElement(child as React.ReactElement<any>, {
          isInView,
          delay: delay + index * staggerDelay,
        });
      })}
    </div>
  );
};

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  isInView?: boolean; // Injected by StaggerContainer
  delay?: number; // Injected by StaggerContainer
}

export const StaggerItem: React.FC<StaggerItemProps> = ({
  children,
  className = "",
  isInView = false,
  delay = 0,
}) => {
  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8",
        className
      )}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
};
