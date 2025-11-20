import React from "react";

import { Beer, Users, BookOpen, GraduationCap } from "lucide-react";

export const UseCasesSection: React.FC = () => {
  const cases = [
    {
      icon: Beer,
      title: "大学サークルの合宿・飲み会",
      desc: "大人数の集金、バス代や宿泊費の事前回収に。ドタキャン防止にも効果的です。",
      color: "bg-orange-100 text-orange-600",
    },
    {
      icon: Users,
      title: "社会人サークル・交流会",
      desc: "初対面の人が多いイベントでも、事前決済なら当日の受付がスムーズになります。",
      color: "bg-green-100 text-green-600",
    },
    {
      icon: BookOpen,
      title: "読書会・勉強会",
      desc: "数百円の会場費や資料代。小銭のやり取りをなくしてスマートに運営できます。",
      color: "bg-blue-100 text-blue-600",
    },
    {
      icon: GraduationCap,
      title: "OB/OG会・同窓会",
      desc: "久しぶりの再会でも、お金の話で水を差さないように。事前の集金がおすすめです。",
      color: "bg-purple-100 text-purple-600",
    },
  ];

  return (
    <section className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">こんなシーンで選ばれています</h2>
          <p className="text-slate-500">あらゆるクローズドコミュニティの運営をサポート</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cases.map((c, i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <div
                className={`w-12 h-12 rounded-lg ${c.color} flex items-center justify-center mb-4`}
              >
                <c.icon size={24} />
              </div>
              <h3 className="font-bold text-lg text-slate-800 mb-2">{c.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
