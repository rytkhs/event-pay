"use client";

import { useState, useEffect, useCallback } from "react";

import { Copy, ExternalLink, RefreshCw, Link, Share2, Check, MoreVertical } from "lucide-react";

import { ga4Client } from "@core/analytics/ga4-client";
import { useToast } from "@core/contexts/toast-context";
import { useClipboard } from "@core/hooks/use-clipboard";

import { generateInviteTokenAction } from "@features/events";

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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Link className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground leading-tight">招待リンク</h3>
                <p className="text-[11px] text-muted-foreground">参加者をイベントに招待</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                    onClick={handlePreview}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    プレビュー
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs h-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-2 ${isGenerating ? "animate-spin" : ""}`}
                    />
                    リンクを再生成
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* URL表示 & アクション */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex-1 flex items-center justify-between gap-2 pl-3 pr-2 py-2 bg-white rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-white transition-all group overflow-hidden shadow-sm"
              onClick={handleCopy}
              onKeyDown={handleUrlKeyDown}
            >
              <code className="flex-1 text-[11px] text-muted-foreground truncate font-mono text-left">
                {inviteUrl}
              </code>
              <div className="shrink-0 flex items-center gap-1 py-1 px-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                {isCopied ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span className="text-[9px] font-bold">COPIED</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span className="text-[9px] font-bold uppercase">Copy</span>
                  </>
                )}
              </div>
            </button>

            <Button
              onClick={handleNativeShare}
              variant="outline"
              size="icon"
              className="shrink-0 h-10 w-10 bg-white border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 rounded-xl shadow-sm transition-all"
              title="リンクを共有"
            >
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
