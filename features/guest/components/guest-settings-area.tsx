import React, { useState } from "react";

import { Settings, ChevronRight, UserCog } from "lucide-react";

interface GuestSettingsAreaProps {
  onOpenModal: () => void;
}

export const GuestSettingsArea: React.FC<GuestSettingsAreaProps> = ({ onOpenModal }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Settings Accordion */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-gray-600">
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">登録情報の変更・その他</span>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>

        {isOpen && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">
            {/* Unified Change Status Button */}
            <button
              onClick={onOpenModal}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
            >
              <div>
                <p className="text-sm font-medium text-gray-700">ステータス・支払い方法の変更</p>
                <p className="text-xs text-gray-500">参加 / 不参加 / 決済方法の選択</p>
              </div>
              <UserCog className="w-4 h-4 text-gray-400" />
            </button>

            <div className="p-4 bg-gray-50 text-xs text-gray-400 leading-relaxed">
              <p>※ 決済完了後のキャンセル（返金）については、主催者に直接お問い合わせください。</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
