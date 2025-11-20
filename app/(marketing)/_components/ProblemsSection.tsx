import React from "react";

import { Coins, UserX, Calculator } from "lucide-react";

export const ProblemsSection: React.FC = () => {
  const problems = [
    {
      icon: Coins,
      title: "小銭の管理・お釣りの準備",
      desc: "「3,500円の会費なのに1万円札ばかり…」「大量の小銭をATMに入れるのが面倒」現金の管理は物理的なストレスです。",
    },
    {
      icon: UserX,
      title: "「未払い・ドタキャン」対応",
      desc: "「後で払うね」と言われて回収し忘れたり、ドタキャン分の会費を誰が負担するか揉めたり…気まずい思いをしていませんか？",
    },
    {
      icon: Calculator,
      title: "名簿と現金の照合地獄",
      desc: "「Excelの合計と手元の現金が合わない！」イベント後の疲れた体で、深夜まで計算が合わず苦しむのはもう終わりにしましょう。",
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            幹事さん、集金業務で
            <br />
            こんな
            <span className="text-destructive underline decoration-wavy decoration-destructive/20 underline-offset-4">
              消耗
            </span>
            していませんか？
          </h2>
          <p className="text-slate-500">楽しいはずのイベントも、お金の管理で台無しに。</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-50 p-8 rounded-2xl border border-slate-100 transition-shadow"
            >
              <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
                <item.icon className="text-destructive w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">{item.title}</h3>
              <p className="text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
