import React from "react";

import { ArrowRight } from "lucide-react";

export const CTASection: React.FC = () => {
  return (
    <section className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        {/* CTA Section */}
        <div className="bg-primary rounded-3xl p-10 md:p-16 text-center text-white shadow-xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            面倒な集金管理は、
            <br className="md:hidden" />
            もうツールに任せましょう。
          </h2>
          <p className="text-primary-foreground/100 mb-8 text-lg">
            まずは次回のイベントで、使い心地を試してみてください。
          </p>
          <a
            href="/register"
            className="inline-flex items-center gap-2 bg-white text-primary font-bold px-8 py-4 rounded-full hover:bg-gray-100 transition-colors shadow-lg"
          >
            無料でアカウントを作成する
            <ArrowRight size={20} />
          </a>
        </div>
      </div>
    </section>
  );
};
