"use client";

import React, { useState } from "react";

import { RotateCcw } from "lucide-react";

interface Participant {
  id: number;
  name: string;
  paymentMethod: "online" | "cash";
  status: "paid" | "pending";
}

export const ParticipantTableMock: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: 1,
      name: "田中 太郎",
      paymentMethod: "online",
      status: "paid",
    },
    {
      id: 2,
      name: "鈴木 次郎",
      paymentMethod: "cash",
      status: "pending",
    },
    {
      id: 3,
      name: "佐藤 花子",
      paymentMethod: "cash",
      status: "paid",
    },
  ]);

  const handleReceive = (id: number) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "paid" as const } : p))
    );
  };

  const handleCancel = (id: number) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "pending" as const } : p))
    );
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl text-slate-800 overflow-hidden shadow-2xl text-sm">
      {/* Header */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex items-center">
        <div className="flex gap-1.5">
          <div
            className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"
            aria-hidden="true"
          ></div>
          <div
            className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"
            aria-hidden="true"
          ></div>
          <div
            className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"
            aria-hidden="true"
          ></div>
        </div>
        <div className="flex-1 text-center font-bold text-slate-600 text-xs">参加者一覧</div>
        <div className="w-10"></div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 p-2 bg-slate-50/50 border-b border-slate-100 text-xs font-medium text-slate-500">
        <div className="col-span-3 pl-2">ニックネーム</div>
        <div className="col-span-2 text-center">参加</div>
        <div className="col-span-3 text-center">決済方法</div>
        <div className="col-span-2 text-center">状況</div>
        <div className="col-span-2 text-center">アクション</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-100">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className={`grid grid-cols-12 gap-2 p-3 items-center hover:bg-slate-50 transition-all duration-300 ${
              participant.paymentMethod === "cash" && participant.status === "pending"
                ? "bg-orange-50/30"
                : ""
            }`}
          >
            <div className="col-span-3 font-bold text-slate-700 truncate pl-2">
              {participant.name}
            </div>
            <div className="col-span-2 flex justify-center">
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                参加
              </span>
            </div>
            <div className="col-span-3 flex justify-center">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  participant.paymentMethod === "online"
                    ? "bg-purple-100 text-purple-700 border-purple-200"
                    : "bg-orange-100 text-orange-700 border-orange-200"
                }`}
              >
                {participant.paymentMethod === "online" ? "オンライン" : "現金"}
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all duration-300 ${
                  participant.status === "paid"
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {participant.status === "paid" ? "済" : "未"}
              </span>
            </div>
            <div className="col-span-2 flex justify-center">
              {participant.paymentMethod === "cash" ? (
                participant.status === "pending" ? (
                  <button
                    onClick={() => handleReceive(participant.id)}
                    className="bg-green-500 hover:bg-green-600 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm transition-all transform hover:scale-105 active:scale-95 flex items-center gap-1"
                  >
                    {/* <Check size={12} /> */}
                    受領
                  </button>
                ) : (
                  <button
                    onClick={() => handleCancel(participant.id)}
                    className="bg-slate-400 hover:bg-slate-500 text-white text-[10px] px-2 py-1 rounded font-bold shadow-sm transition-all transform hover:scale-105 active:scale-95 flex items-center gap-1"
                    title="受領を取り消す"
                  >
                    <RotateCcw size={12} aria-hidden="true" />
                  </button>
                )
              ) : (
                <div className="w-6 h-6 rounded bg-slate-100 text-slate-300 flex items-center justify-center">
                  -
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
