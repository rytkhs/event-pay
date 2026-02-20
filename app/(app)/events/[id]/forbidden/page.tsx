import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "アクセス権限がありません",
};

interface ForbiddenPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EventForbiddenPage(_props: ForbiddenPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">アクセス権限がありません</h1>
          <p className="mt-4 text-gray-600">このページへアクセスする権限がありません。</p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              ホームへ戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
