import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'アクセス拒否 - EventPay',
  description: 'このイベントにアクセスする権限がありません。',
};

export default function ForbiddenPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto text-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-lg font-medium text-red-800 mb-2">アクセスが拒否されました</h1>
          <p className="text-sm text-red-600 mb-4">
            このイベントにアクセスする権限がありません。<br />
            イベントの作成者または管理者にお問い合わせください。
          </p>
          <a 
            href="/events"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            イベント一覧に戻る
          </a>
        </div>
      </div>
    </div>
  );
}