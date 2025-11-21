"use client";

import React from "react";

import { ArrowRight } from "lucide-react";
import { m } from "motion/react";

import { FadeIn } from "./ui/FadeIn";

export const CTASection: React.FC = () => {
  return (
    <section className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        {/* CTA Section */}
        <FadeIn direction="up">
          <div className="bg-primary rounded-3xl p-10 md:p-16 text-center text-white shadow-xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              面倒な集金管理は、
              <br className="md:hidden" />
              もうツールに任せましょう。
            </h2>
            <p className="text-primary-foreground/100 mb-8 text-lg">
              まずは次回のイベントで、使い心地を試してみてください。
            </p>
            <m.a
              href="/register"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-2 bg-white text-primary font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-colors shadow-lg"
            >
              無料でアカウントを作成する
              <ArrowRight size={20} />
            </m.a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};
