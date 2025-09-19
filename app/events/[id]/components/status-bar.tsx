"use client";

interface StatusBarProps {
  attendingCount: number;
  capacity: number;
  totalRevenue: number;
  expectedRevenue: number;
  unpaidCount: number;
}

export function StatusBar({
  attendingCount,
  capacity,
  totalRevenue,
  expectedRevenue,
  unpaidCount,
}: StatusBarProps) {
  // 参加率計算
  const attendanceRate = capacity > 0 ? Math.round((attendingCount / capacity) * 100) : 0;

  // 集金進捗率計算
  const collectionProgress =
    expectedRevenue > 0 ? Math.round((totalRevenue / expectedRevenue) * 100) : 0;

  // プログレスバーの色を動的に設定
  const getAttendanceColor = (rate: number) => {
    if (rate >= 90) return "bg-red-500"; // 定員間近
    if (rate >= 70) return "bg-orange-500"; // 注意
    return "bg-blue-500"; // 正常
  };

  const getCollectionColor = (progress: number) => {
    if (progress >= 80) return "bg-green-500"; // 順調
    if (progress >= 50) return "bg-orange-500"; // 注意
    return "bg-red-500"; // 要注意
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 参加状況 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">参加状況</h3>
            <span className="text-sm text-gray-600">
              {attendingCount} / {capacity}人 ({attendanceRate}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-full rounded-full transition-all ${getAttendanceColor(attendanceRate)}`}
              style={{ width: `${Math.min(attendanceRate, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>0人</span>
            <span>{capacity}人 (定員)</span>
          </div>
        </div>

        {/* 集金状況 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">集金進捗</h3>
            <span className="text-sm text-gray-600">
              ¥{totalRevenue.toLocaleString()} / ¥{expectedRevenue.toLocaleString()} (
              {collectionProgress}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-full rounded-full transition-all ${getCollectionColor(collectionProgress)}`}
              style={{ width: `${Math.min(collectionProgress, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>¥0</span>
            <span>¥{expectedRevenue.toLocaleString()} (目標)</span>
          </div>
          {unpaidCount > 0 && <p className="text-xs text-red-600 mt-1">未決済: {unpaidCount}件</p>}
        </div>
      </div>
    </div>
  );
}
