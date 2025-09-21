"use client";

import { useState, useEffect } from "react";

import { Copy, ExternalLink, RefreshCw, Link, MoreHorizontal } from "lucide-react";

import { generateInviteTokenAction } from "@core/actions";
import { useToast } from "@core/contexts/toast-context";
import { useClipboard } from "@core/hooks/use-clipboard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface InviteLinkPopoverProps {
  eventId: string;
  initialInviteToken?: string;
}

export function InviteLinkPopover({ eventId, initialInviteToken }: InviteLinkPopoverProps) {
  const [inviteToken, setInviteToken] = useState(initialInviteToken);
  const [inviteUrl, setInviteUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // window.location.originをuseEffectで安全に初期化
  useEffect(() => {
    if (initialInviteToken && typeof window !== "undefined") {
      setInviteUrl(`${window.location.origin}/invite/${initialInviteToken}`);
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
        setInviteUrl(`${window.location.origin}/invite/${result.token}`);

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
        setIsPopoverOpen(false);
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
        .then(() => {
          setIsPopoverOpen(false);
        })
        .catch(() => {
          // ネイティブ共有に失敗した場合はコピーにフォールバック
          handleCopy();
        });
    } else {
      handleCopy();
    }
  };

  // トークンが存在しない場合の生成ボタン
  if (!inviteToken) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleGenerateToken(false)}
        disabled={isGenerating}
        className="shrink-0"
      >
        <Link className="mr-2 h-4 w-4" />
        {isGenerating ? "生成中..." : "招待リンク"}
      </Button>
    );
  }

  // トークンが存在する場合のポップオーバー
  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0">
          <Link className="mr-2 h-4 w-4" />
          招待リンク
          <MoreHorizontal className="ml-1 h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">招待リンク</h4>
            <p className="text-sm text-muted-foreground">
              このリンクを共有してイベントに参加者を招待できます
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={inviteUrl}
              readOnly
              className="font-mono text-xs"
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
            </Button>
          </div>

          <div className="flex items-center gap-2">
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
            </Button>
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="text-orange-600 dark:text-orange-400">
              ⚠️ リンクが漏洩した場合は「再生成」で新しいリンクを作成してください
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
