import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen mx-auto max-w-3xl px-4 pt-24 pb-16 sm:py-24">
      <article
        className="
        prose
        prose-neutral
        max-w-none
        dark:prose-invert
        prose-p:leading-tight
        prose-p:my-2
        prose-h2:text-base
        prose-h2:font-semibold
        prose-h2:leading-tight
        prose-h2:mt-4
        prose-h2:mb-2
        prose-li:leading-tight
        prose-li:my-1"
      >
        {children}
      </article>
    </div>
  );
}
