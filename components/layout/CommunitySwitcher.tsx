"use client";

import { useTransition } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import { useToast } from "@core/contexts/toast-context";

import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

type CommunitySwitcherProps = {
  workspace: AppWorkspaceShellData;
};

export function CommunitySwitcher({ workspace }: CommunitySwitcherProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleSwitch = (communityId: string) => {
    if (communityId === workspace.currentCommunity?.id) return;

    startTransition(async () => {
      const result = await updateCurrentCommunityAction(communityId);
      if (!result.success) {
        toast({
          title: "通信に失敗しました",
          description: result.error.userMessage,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "コミュニティを切り替えました",
      });
      router.refresh();
    });
  };

  const name = workspace.currentCommunity?.name ?? "コミュニティを選択";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          disabled={isPending}
        >
          <Image src="/icon.svg" width={24} height={24} alt="Minshu" className="size-6" />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="font-semibold">みんなの集金</span>
            <span className="truncate text-xs text-muted-foreground">
              {workspace.hasOwnedCommunities ? name : "コミュニティ未作成"}
            </span>
          </div>
          {isPending ? (
            <Loader2 className="ml-auto size-4 animate-spin" />
          ) : (
            <ChevronsUpDown className="ml-auto size-4" />
          )}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          コミュニティを切り替え
        </DropdownMenuLabel>

        {workspace.ownedCommunities.map((community) => (
          <DropdownMenuItem
            key={community.id}
            onClick={() => handleSwitch(community.id)}
            className="gap-2 p-2 block cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="truncate flex-1">{community.name}</span>
              {community.id === workspace.currentCommunity?.id && (
                <Check className="size-4 shrink-0 opacity-50" />
              )}
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href="/communities/create"
            className="gap-2 p-2 cursor-pointer w-full flex items-center text-muted-foreground font-medium"
          >
            <Plus className="size-4 shrink-0" />
            コミュニティを作成
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
