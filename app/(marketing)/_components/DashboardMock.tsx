import React from "react";

import Image from "next/image";

/**
 * ダッシュボード風のビジュアル
 * ヒーローセクションの右側ビジュアルとして使用
 */
export const DashboardMock: React.FC = () => {
  return (
    <div
      className="w-full max-w-none bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      aria-hidden="true"
    >
      {/* Browser Chrome */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"></div>
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
          <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"></div>
        </div>
        <div className="flex-1 text-center">
          <div className="bg-white rounded-md px-3 py-1 text-xs text-slate-400 mx-auto max-w-[240px] border border-slate-200">
            minnano-shukin.com
          </div>
        </div>
        <div className="w-12"></div>
      </div>

      {/* Dashboard Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-50">
        <Image
          src="/images/image.png"
          alt="Dashboard Preview"
          fill
          className="object-cover object-top"
          priority
        />
      </div>
    </div>
  );
};
