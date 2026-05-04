import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type GuideBottomCTAProps = {
  eyebrow: string;
  title: string;
  body: string;
  secondaryHref: string;
  secondaryLabel: string;
};

export function GuideBottomCTA({
  eyebrow,
  title,
  body,
  secondaryHref,
  secondaryLabel,
}: GuideBottomCTAProps) {
  return (
    <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-primary">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-300">{body}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-full px-6">
            <Link href="/register">
              無料ではじめる
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-full border-white/20 bg-transparent px-6 text-white hover:bg-white hover:text-slate-950"
          >
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
