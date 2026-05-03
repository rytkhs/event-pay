import React from "react";

import { Check, CreditCard, Banknote, MoreHorizontal } from "lucide-react";

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
      <div className="px-4 pt-3 pb-4">
        {/* Event Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">夏の納涼会🍺</h3>
          </div>
          <span className="bg-success/10 text-success text-[10px] px-2 py-0.5 rounded-full font-bold">
            募集中
          </span>
        </div>

        {/* Tabs: 概要 / 参加者 */}
        <div className="flex border-b border-slate-200 mb-3">
          <div className="px-3 py-1.5 text-[11px] text-slate-400 font-medium cursor-default">
            概要
          </div>
          <div className="px-3 py-1.5 text-[11px] text-primary font-bold border-b-2 border-primary cursor-default">
            参加者
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 mb-3">
          <StatusTab label="全員" count={18} active />
          <StatusTab label="参加" count={15} />
          <StatusTab label="未定" count={2} />
          <StatusTab label="不参加" count={1} />
        </div>

        {/* Table Header: count */}
        <div className="text-[10px] font-semibold text-slate-500 mb-2">
          18名を表示中
        </div>

        {/* Participant Table */}
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          {/* Column Headers */}
          <div className="grid grid-cols-12 gap-1 px-2.5 py-2 bg-slate-50/80 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-3 pl-1">ニックネーム</div>
            <div className="col-span-2 text-center">参加状況</div>
            <div className="col-span-3 text-center">決済方法</div>
            <div className="col-span-2 text-center">決済状況</div>
            <div className="col-span-2 text-center">アクション</div>
          </div>

          {/* Row 1: オンライン決済済み */}
          <TableRow
            name="田中 太郎"
            attendance="参加"
            paymentMethod="stripe"
            paymentStatus="済"
          />

          {/* Row 2: 現金 未集金 → 要アクション */}
          <TableRow
            name="鈴木 次郎"
            attendance="参加"
            paymentMethod="cash"
            paymentStatus="未"
            actionRequired
          />

          {/* Row 3: 現金 受領済み */}
          <TableRow
            name="佐藤 花子"
            attendance="参加"
            paymentMethod="cash"
            paymentStatus="済"
          />

          {/* Row 4: 未定 → 支払いなし */}
          <TableRow
            name="山田 一郎"
            attendance="未定"
          />
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------

function StatusTab({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold cursor-default transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "bg-slate-50 text-slate-400 hover:bg-slate-100"
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[9px] tabular-nums ${active ? "text-primary/70" : "text-slate-300"}`}
      >
        {count}
      </span>
    </div>
  );
}

function TableRow({
  name,
  attendance,
  paymentMethod,
  paymentStatus,
  actionRequired = false,
}: {
  name: string;
  attendance: "参加" | "未定" | "不参加";
  paymentMethod?: "stripe" | "cash";
  paymentStatus?: "済" | "未";
  actionRequired?: boolean;
}) {
  // 参加状況バッジ
  const attendanceBadge = (() => {
    switch (attendance) {
      case "参加":
        return "text-emerald-700 border-emerald-500/20 bg-emerald-500/10";
      case "未定":
        return "text-amber-700 border-amber-500/30 bg-amber-500/10";
      case "不参加":
        return "text-rose-700 border-rose-500/20 bg-rose-500/10";
    }
  })();

  // 決済方法バッジ
  const methodBadge = (() => {
    if (!paymentMethod) return null;
    if (paymentMethod === "stripe") {
      return {
        className: "text-indigo-700 border-indigo-500/20 bg-indigo-500/10",
        icon: <CreditCard className="h-2.5 w-2.5" />,
        label: "オンライン",
      };
    }
    return {
      className: "text-amber-700 border-amber-500/30 bg-amber-500/10",
      icon: <Banknote className="h-2.5 w-2.5" />,
      label: "現金",
    };
  })();

  // 決済状況バッジ
  const statusBadge = (() => {
    if (!paymentStatus) return null;
    if (paymentStatus === "済") {
      return "text-emerald-700 border-emerald-500/20 bg-emerald-500/10";
    }
    // 未収
    return "text-rose-700 border-rose-500/20 bg-rose-500/10";
  })();

  // 行の背景: 要アクション行は赤ハイライト
  const rowClassName = actionRequired
    ? "bg-red-50/60 border-l-2 !border-l-red-500"
    : "border-l-2 border-l-transparent";

  return (
    <div
      className={`grid grid-cols-12 gap-1 px-2.5 py-2 items-center border-t border-slate-50 ${rowClassName}`}
    >
      {/* ニックネーム */}
      <div className="col-span-3 font-semibold text-slate-700 text-[11px] pl-1 truncate">
        {name}
      </div>

      {/* 参加状況 */}
      <div className="col-span-2 flex justify-center">
        <span
          className={`border px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold tracking-wide ${attendanceBadge}`}
        >
          {attendance}
        </span>
      </div>

      {/* 決済方法 */}
      <div className="col-span-3 flex justify-center">
        {methodBadge ? (
          <span
            className={`border px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold tracking-wide flex items-center gap-1 ${methodBadge.className}`}
          >
            {methodBadge.icon}
            {methodBadge.label}
          </span>
        ) : (
          <span className="text-slate-300 text-[10px]">-</span>
        )}
      </div>

      {/* 決済状況 */}
      <div className="col-span-2 flex justify-center">
        {statusBadge ? (
          <span
            className={`border px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold tracking-wide ${statusBadge}`}
          >
            {paymentStatus}
          </span>
        ) : (
          <span className="text-slate-300 text-[10px]">-</span>
        )}
      </div>

      {/* アクション */}
      <div className="col-span-2 flex justify-center">
        {actionRequired ? (
          <div className="flex items-center gap-0.5 border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-lg cursor-default">
            <Check className="h-2.5 w-2.5" />
            受領
          </div>
        ) : paymentMethod ? (
          <div className="text-slate-300 cursor-default">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </div>
        ) : (
          <div className="text-slate-200 cursor-default">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
