import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";
  const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://minnano-shukin.com";

  if (!isDemo) return null;

  return (
    <div className="bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-2 shadow-md relative">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 shrink-0" />
        <span>デモ環境で動作中です。データは保存されず、実際の決済は行われません。</span>
      </div>
      <a
        href={`${productionUrl}/register`}
        className="bg-white text-indigo-600 px-4 py-1 rounded-full text-xs font-bold hover:bg-indigo-50 transition-colors whitespace-nowrap"
      >
        無料で本登録する
      </a>
    </div>
  );
}
