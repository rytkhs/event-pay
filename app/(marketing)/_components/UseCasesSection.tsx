import React from "react";

import { Users, GlassWater, Plane, GraduationCap } from "lucide-react";

import { FadeIn } from "./ui/FadeIn";
import { StaggerContainer, StaggerItem } from "./ui/StaggerContainer";

export const UseCasesSection: React.FC = () => {
  const cases = [
    {
      icon: GlassWater,
      title: "飲み会・懇親会",
      desc: "会社の飲み会や、友人との食事会に。事前の集金で当日の会計もスムーズ。",
      color: "bg-orange-100 text-orange-600",
    },
    {
      icon: Users,
      title: "サークル・同好会",
      desc: "毎月の部費や合宿費用の集金に。未払いメンバーの管理も一目で完了。",
      color: "bg-blue-100 text-blue-600",
    },
    {
      icon: Plane,
      title: "旅行・イベント",
      desc: "グループ旅行の積立や、BBQなどのイベント費用の管理に最適です。",
      color: "bg-green-100 text-green-600",
    },
    {
      icon: GraduationCap,
      title: "OB会・同窓会",
      desc: "大人数が集まる同窓会の会費徴収も、URLを共有するだけで完了します。",
      color: "bg-purple-100 text-purple-600",
    },
  ];

  return (
    <section className="py-20 bg-slate-50">
      <div className="container mx-auto px-4 md:px-6">
        <FadeIn direction="up" className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            あらゆるシーンで活躍します
          </h2>
          <p className="text-slate-500">
            小規模な飲み会から、100人規模のイベントまで対応可能です。
          </p>
        </FadeIn>

        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cases.map((c, i) => (
            <StaggerItem
              key={i}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-100"
            >
              <div
                className={`w-12 h-12 rounded-lg ${c.color} flex items-center justify-center mb-4`}
              >
                <c.icon size={24} aria-hidden="true" />
              </div>
              <h3 className="font-bold text-slate-800 mb-2">{c.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{c.desc}</p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
};
