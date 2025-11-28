"use client";

import React from "react";

import { CheckCircle2 } from "lucide-react";
import { m } from "motion/react";

interface AnimatedBadgeProps {
  className?: string;
}

/**
 * Floating animated badge showing collection completion status
 */
export const AnimatedBadge: React.FC<AnimatedBadgeProps> = ({ className }) => {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.5 }}
      className={className}
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
    </m.div>
  );
};
