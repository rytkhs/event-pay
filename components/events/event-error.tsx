interface EventErrorProps {
  error: Error;
  reset: () => void;
}

export function EventError({ error, reset }: EventErrorProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center py-12">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">イベントの読み込みに失敗しました</h2>
        <p className="text-gray-600 mb-6">{error.message || "予期しないエラーが発生しました"}</p>
        <div className="space-x-4">
          <button
            onClick={reset}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            再試行
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
          >
            ページを更新
          </button>
        </div>
      </div>
    </div>
  );
}
