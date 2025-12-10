import React from "react";

import { UserCog } from "lucide-react";

interface GuestSettingsAreaProps {
  onOpenModal: () => void;
}

export const GuestSettingsArea: React.FC<GuestSettingsAreaProps> = ({ onOpenModal }) => {
  return (
    <div className="space-y-4">
      {/* Settings Accordion */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {/* Unified Change Status Button */}
          <button
            onClick={onOpenModal}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
          >
            <div>
              <p className="text-sm font-medium text-gray-700">ステータス・支払い方法の変更</p>
              {/* <p className="text-xs text-gray-500">参加 / 不参加 / 決済方法の選択</p> */}
            </div>
            <UserCog className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
