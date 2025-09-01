"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@core/contexts/toast-context";
import { generateInviteTokenAction } from "@/app/events/actions";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useClipboard } from "@core/hooks/use-clipboard";

interface InviteLinkProps {
  eventId: string;
  initialInviteToken?: string;
}

export function InviteLink({ eventId, initialInviteToken }: InviteLinkProps) {
  const [inviteToken, setInviteToken] = useState(initialInviteToken);
  const [inviteUrl, setInviteUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // window.location.originをuseEffectで安全に初期化
  useEffect(() => {
    if (initialInviteToken && typeof window !== "undefined") {
      setInviteUrl(`${window.location.origin}/invite/${initialInviteToken}`);
    }
  }, [initialInviteToken]);

  const { toast } = useToast();
  const { copyToClipboard, isCopied } = useClipboard();

  const handleGenerateToken = async (forceRegenerate: boolean = false) => {
    setIsGenerating(true);
    try {
      const result = await generateInviteTokenAction(eventId, { forceRegenerate });

      if (result.success && result.data) {
        setInviteToken(result.data.inviteToken);
        setInviteUrl(result.data.inviteUrl);

        const message = forceRegenerate
          ? "新しい招待リンクを生成しました"
          : "招待リンクを生成しました";
        const description = forceRegenerate
          ? "旧リンクは無効になりました。新しいリンクを参加者に共有してください。"
          : "参加者に共有してイベントに招待しましょう。";

        toast({
          title: message,
          description,
        });
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

  const handleCopy = async () => {
    if (inviteUrl) {
      const success = await copyToClipboard(inviteUrl);
      if (success) {
        toast({
          title: "コピーしました",
          description: "招待リンクをクリップボードにコピーしました。",
        });
      } else {
        toast({
          title: "コピーに失敗しました",
          description: "手動で招待リンクをコピーしてください。",
          variant: "destructive",
        });
      }
    }
  };

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share && inviteUrl) {
      navigator
        .share({
          title: "イベントに参加しませんか？",
          url: inviteUrl,
        })
        .catch(() => {
          // ネイティブ共有に失敗した場合はコピーにフォールバック
          handleCopy();
        });
    } else {
      handleCopy();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          招待リンク
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!inviteToken ? (
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              参加者が簡単にイベントにアクセスできる招待リンクを生成します。
            </p>
            <Button
              onClick={() => handleGenerateToken(false)}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                "招待リンクを生成"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={inviteUrl}
                readOnly
                className="font-mono text-sm"
                data-testid="invite-url-input"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!inviteUrl}
                data-testid="copy-button"
              >
                <Copy className="h-4 w-4" />
                {isCopied ? "コピー済み" : "コピー"}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleShare}
                data-testid="share-button"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                共有
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    confirm(
                      "招待リンクを再生成しますか？\n\n現在のリンクは無効になり、参加者に新しいリンクを共有する必要があります。"
                    )
                  ) {
                    handleGenerateToken(true);
                  }
                }}
                disabled={isGenerating}
                data-testid="regenerate-button"
              >
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                再生成
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>このリンクを知っている人は誰でもイベントに参加申込ができます。</p>
              <p className="text-orange-600 dark:text-orange-400">
                ⚠️ リンクが漏洩した場合は「再生成」ボタンで新しいリンクを作成してください。
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
