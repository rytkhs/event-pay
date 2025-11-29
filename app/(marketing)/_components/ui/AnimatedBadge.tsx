"use client";

import React, { useEffect, useState } from "react";

import { CheckCircle2 } from "lucide-react";

import { cn } from "@/core/utils";

interface AnimatedBadgeProps {
  className?: string;
}

/**
 * Floating animated badge showing collection completion status
 */
export const AnimatedBadge: React.FC<AnimatedBadgeProps> = ({ className }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        isVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 translate-y-4",
        className
      )}
    >
      <div
        className="bg-white p-4 rounded-xl shadow-xl border border-slate-100 animate-bounce"
        style={{ animationDuration: "3s" }}
      >
        <div className="flex items-center gap-3">
          <div className="bg-success/10 p-2 rounded-full">
            <CheckCircle2 className="text-success w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase">集金完了!</p>
            <p className="text-sm font-bold text-slate-800">¥35,000 集金済み</p>
          </div>
        </div>
      </div>
    </div>
  );
};
