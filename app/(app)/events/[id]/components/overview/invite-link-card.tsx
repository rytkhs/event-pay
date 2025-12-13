"use client";

import { useState, useEffect, useCallback } from "react";

import { Copy, ExternalLink, RefreshCw, Link, Share2, Check, MoreVertical } from "lucide-react";

import { generateInviteTokenAction } from "@core/actions";
import { ga4Client } from "@core/analytics/ga4-client";
import { useToast } from "@core/contexts/toast-context";
import { useClipboard } from "@core/hooks/use-clipboard";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InviteLinkCardProps {
  eventId: string;
  initialInviteToken?: string;
}

export function InviteLinkCard({ eventId, initialInviteToken }: InviteLinkCardProps) {
  const [inviteToken, setInviteToken] = useState(initialInviteToken);
  const [inviteUrl, setInviteUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (initialInviteToken && typeof window !== "undefined") {
      setInviteUrl(`${process.env.NEXT_PUBLIC_APP_URL}/invite/${initialInviteToken}`);
    }
  }, [initialInviteToken]);

  const { toast } = useToast();
  const { copyToClipboard } = useClipboard();

  const handleGenerateToken = async (forceRegenerate: boolean = false) => {
    setIsGenerating(true);
    try {
      const result = await generateInviteTokenAction(eventId, { forceRegenerate });

      if (result.success && result.token) {
        setInviteToken(result.token);
        setInviteUrl(`${process.env.NEXT_PUBLIC_APP_URL}/invite/${result.token}`);

        const message = forceRegenerate
          ? "新しい招待リンクを生成しました"
          : "招待リンクを生成しました";
        const description = forceRegenerate
          ? "旧リンクは無効になりました。新しいリンクを参加者に共有してください。"
          : "参加者に共有してイベントに招待しましょう。";

        toast({ title: message, description });
      } else {
        toast({
          title: "エラー",
          description: result.error || "招待リンクの生成に失敗しました",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "エラー",
        description: "招待リンクの生成中にエラーが発生しました",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = useCallback(async () => {
    if (inviteUrl) {
      const success = await copyToClipboard(inviteUrl);
      if (success) {
        setIsCopied(true);
        toast({
          title: "コピーしました",
          description: "招待リンクをクリップボードにコピーしました。",
        });
        setTimeout(() => setIsCopied(false), 2000);
      } else {
        toast({
          title: "コピーに失敗しました",
          description: "手動で招待リンクをコピーしてください。",
          variant: "destructive",
        });
      }
    }
  }, [inviteUrl, copyToClipboard, toast]);

  const handleShareLine = () => {
    if (inviteUrl) {
      ga4Client.sendEvent({
        name: "invite_shared",
        params: { event_id: eventId },
      });
      const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(inviteUrl)}`;
      window.open(lineShareUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleNativeShare = () => {
    if (typeof navigator !== "undefined" && navigator.share && inviteUrl) {
      ga4Client.sendEvent({
        name: "invite_shared",
        params: { event_id: eventId },
      });
      navigator
        .share({
          title: "イベント招待",
          url: inviteUrl,
        })
        .catch(() => {
          handleCopy();
        });
    } else {
      handleCopy();
    }
  };

  const handleRegenerate = () => {
    if (
      confirm(
        "招待リンクを再生成しますか？\n\n現在のリンクは無効になり、参加者に新しいリンクを共有する必要があります。"
      )
    ) {
      handleGenerateToken(true);
    }
  };

  const handlePreview = () => {
    if (inviteUrl) {
      window.open(inviteUrl, "_blank");
    }
  };

  const handleUrlClick = () => {
    handleCopy();
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopy();
    }
  };

  // トークンが存在しない場合
  if (!inviteToken) {
    return (
      <Card className="border-2 border-dashed border-blue-200 bg-blue-50/50">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100">
              <Link className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">招待リンクを作成</h3>
              <p className="text-sm text-muted-foreground mt-1">
                リンクを共有して参加者を集めましょう
              </p>
            </div>
            <Button
              onClick={() => handleGenerateToken(false)}
              disabled={isGenerating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  招待リンクを作成
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // トークンが存在する場合
  return (
    <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardContent className="p-5">
        <div className="space-y-4">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <Link className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">招待リンク</h3>
                <p className="text-xs text-muted-foreground">リンクを共有して参加者を招待</p>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-2">
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handlePreview}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    プレビュー
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                    リンクを再生成
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* URL表示（ボタンとして実装してアクセシビリティ対応） */}
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-50/50 transition-colors w-full text-left"
            onClick={handleUrlClick}
            onKeyDown={handleUrlKeyDown}
          >
            <code className="flex-1 text-xs text-muted-foreground truncate font-mono">
              {inviteUrl}
            </code>
            <span className="h-7 px-2 flex-shrink-0 inline-flex items-center">
              {isCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
          </button>

          {/* アクションボタン */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={handleCopy}
              variant="outline"
              className="h-11 bg-white hover:bg-gray-50 border-gray-200"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="ml-1.5 text-sm">コピー</span>
            </Button>

            <Button
              onClick={handleShareLine}
              className="h-11 bg-[#06C755] hover:bg-[#05b34d] text-white border-0"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              <span className="ml-1.5 text-sm">LINE</span>
            </Button>

            <Button
              onClick={handleNativeShare}
              variant="outline"
              className="h-11 bg-white hover:bg-gray-50 border-gray-200"
            >
              <Share2 className="h-4 w-4" />
              <span className="ml-1.5 text-sm">共有</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
