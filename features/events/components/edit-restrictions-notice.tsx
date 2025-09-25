interface EditRestrictionsNoticeProps {
  hasAttendees: boolean;
  attendeeCount: number;
  hasStripePaid?: boolean;
}

export function EditRestrictionsNotice({
  hasAttendees,
  attendeeCount,
  hasStripePaid = false,
}: EditRestrictionsNoticeProps) {
  if (!hasAttendees) {
    return null;
  }

  // 制限項目を動的に生成
  const restrictedItems = [];

  if (hasStripePaid) {
    restrictedItems.push("参加費（決済済み参加者がいるため編集不可）");
    restrictedItems.push("決済方法（決済済み参加者がいるため編集不可）");
  }

  restrictedItems.push("定員（現在の参加者数未満への減少は不可、増加は可能）");

  // 制限項目がない場合は表示しない
  if (restrictedItems.length === 0) {
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
          {restrictedItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs">
          {hasStripePaid
            ? "決済済み参加者への影響や返金処理の複雑さを避けるため、一部項目の変更が制限されています。"
            : "参加者への影響を最小限にするため、定員の減少のみ制限されています。"}
        </p>
      </div>
    </div>
  );
}
