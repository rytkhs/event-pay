interface EditRestrictionsNoticeProps {
  hasAttendees: boolean;
  attendeeCount: number;
}

export function EditRestrictionsNotice({
  hasAttendees,
  attendeeCount,
}: EditRestrictionsNoticeProps) {
  if (!hasAttendees) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2">
        <span className="text-yellow-600">⚠️</span>
        <h4 className="font-medium text-yellow-800">編集制限について</h4>
      </div>
      <div className="mt-2 text-sm text-yellow-700">
        <p>現在{attendeeCount}名の参加者がいるため、以下の項目は編集に制限があります：</p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>タイトル（編集不可）</li>
          <li>参加費（編集不可）</li>
          <li>決済方法（編集不可）</li>
          <li>定員（現在の参加者数未満への減少は不可、増加は可能）</li>
        </ul>
        <p className="mt-2 text-xs">
          参加者に影響を与える可能性があるため、これらの項目は変更できません。
        </p>
      </div>
    </div>
  );
}
