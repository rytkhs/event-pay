"use client";

import { useState } from "react";

import { CheckCircle, XCircle, Loader2, Bug } from "lucide-react";

import { Alert, AlertDescription } from "@components/ui/alert";
import { Button } from "@components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@components/ui/card";

import { debugValidateAllEnvVars } from "../actions";

interface DebugResult {
  success: boolean;
  message: string;
  envVars?: Record<string, string>;
  missingVars?: string[];
}

export function DebugEnvVarsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DebugResult | null>(null);

  const handleDebug = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const debugResult = await debugValidateAllEnvVars();
      setResult(debugResult);
    } catch (error) {
      setResult({
        success: false,
        message: `エラーが発生しました: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          環境変数デバッグツール
        </CardTitle>
        <CardDescription>
          validateRequiredEnvVarsを使用してすべての環境変数をチェックします
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleDebug} disabled={isLoading} className="w-full" variant="outline">
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              環境変数をチェック中...
            </>
          ) : (
            <>
              <Bug className="mr-2 h-4 w-4" />
              環境変数をチェック
            </>
          )}
        </Button>

        {result && (
          <Alert
            className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={result.success ? "text-green-800" : "text-red-800"}>
                {result.message}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {result?.success && result.envVars && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-gray-700">検証された環境変数:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(result.envVars).map(([key, value]) => (
                <div key={key} className="p-2 bg-gray-50 rounded text-xs">
                  <div className="font-mono font-medium text-gray-600">{key}</div>
                  <div className="font-mono text-gray-500 truncate" title={value}>
                    {value.length > 20 ? `${value.substring(0, 20)}...` : value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result?.missingVars && result.missingVars.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-red-700">不足している環境変数:</h4>
            <div className="flex flex-wrap gap-2">
              {result.missingVars.map((varName) => (
                <span
                  key={varName}
                  className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded font-mono"
                >
                  {varName}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
