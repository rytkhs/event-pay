import React from "react";

import { RotateCcw } from "lucide-react";

/**
 * ダッシュボード風のモックUI
 * ヒーローセクションの右側ビジュアルとして使用
 */
export const DashboardMock: React.FC = () => {
  return (
    <div
      className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
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

      {/* Dashboard Content */}
      <div className="p-5">
        {/* Event Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400 font-medium">イベント管理</p>
            <h3 className="text-base font-bold text-slate-800">夏の納涼会🍺</h3>
          </div>
          <span className="bg-success/10 text-success text-xs px-2.5 py-1 rounded-full font-bold">
            募集中
          </span>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">参加者</p>
            <p className="text-lg font-bold text-slate-800">
              18<span className="text-xs text-slate-400">/25</span>
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">集金済み</p>
            <p className="text-lg font-bold text-success">¥52,500</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">未集金</p>
            <p className="text-lg font-bold text-orange-500">¥10,500</p>
          </div>
        </div>

        {/* Participant Table */}
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 gap-1 p-2.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-3 pl-1">名前</div>
            <div className="col-span-2 text-center">出欠</div>
            <div className="col-span-3 text-center">決済方法</div>
            <div className="col-span-2 text-center">状況</div>
            <div className="col-span-2 text-center">操作</div>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-12 gap-1 p-2.5 items-center border-t border-slate-50">
            <div className="col-span-3 font-bold text-slate-700 text-xs pl-1">田中 太郎</div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                参加
              </span>
            </div>
            <div className="col-span-3 flex justify-center">
              <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                オンライン
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                済
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <div className="w-5 h-5 rounded bg-slate-100 text-slate-300 flex items-center justify-center text-[10px]">
                -
              </div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-12 gap-1 p-2.5 items-center border-t border-slate-50 bg-orange-50/30">
            <div className="col-span-3 font-bold text-slate-700 text-xs pl-1">鈴木 次郎</div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                参加
              </span>
            </div>
            <div className="col-span-3 flex justify-center">
              <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                現金
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
                未
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <div className="bg-green-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                受領
              </div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="grid grid-cols-12 gap-1 p-2.5 items-center border-t border-slate-50">
            <div className="col-span-3 font-bold text-slate-700 text-xs pl-1">佐藤 花子</div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                参加
              </span>
            </div>
            <div className="col-span-3 flex justify-center">
              <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                現金
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                済
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <div className="bg-slate-400 text-white p-0.5 rounded">
                <RotateCcw size={10} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
