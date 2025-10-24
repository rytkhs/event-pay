// import { redirect } from "next/navigation";

import { DebugEnvVarsButton } from "./components/debug-env-vars-button";

export default function DebugPage() {
  // デバッグツールが有効でない場合はリダイレクト
  // if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEBUG_TOOLS !== "true") {
  //   redirect("/");
  // }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">デバッグツール</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">開発・デバッグ用のツールです。</p>
        </div>

        <div className="grid gap-6">
          <DebugEnvVarsButton />
        </div>
      </div>
    </div>
  );
}
