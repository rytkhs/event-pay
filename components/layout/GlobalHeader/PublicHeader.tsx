"use client";

import Link from "next/link";

import { cn } from "@core/utils";

import { GuestHeaderProps } from "./types";

export function PublicHeader({ className }: GuestHeaderProps) {
  return (
    <header
      className={cn(
        "bg-background/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50",
        className
      )}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-xl sm:text-2xl font-bold text-primary hover:opacity-80 transition-opacity"
            >
              みんなの集金
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
