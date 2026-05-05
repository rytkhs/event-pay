"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { updateEmailInputSchema, type UpdateEmailInput } from "@core/validation/settings";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

interface EmailChangeFormProps {
  currentEmail: string;
  updateEmailAction: UpdateEmailAction;
}

type UpdateEmailAction = (formData: FormData) => Promise<ActionResult>;

export function EmailChangeForm({ currentEmail, updateEmailAction }: EmailChangeFormProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<UpdateEmailInput>({
    resolver: zodResolver(updateEmailInputSchema),
    defaultValues: {
      newEmail: "",
      currentPassword: "",
    },
  });

  const onSubmit = (data: UpdateEmailInput) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("newEmail", data.newEmail);
        formData.append("currentPassword", data.currentPassword);

        const result = await updateEmailAction(formData);

        if (result.success) {
          form.reset();
          toast("確認メール送信完了", {
            description: result.message,
          });
        } else {
          toast.error("エラー", {
            description: result.error?.userMessage,
          });
        }
      } catch (_error) {
        toast.error("エラー", {
          description: "メールアドレスの変更中にエラーが発生しました",
        });
      }
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background">
      <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6">
        <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3.5 py-3 sm:px-4">
          <Mail className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">現在のメールアドレス</p>
            <p className="truncate text-sm font-medium text-foreground">{currentEmail}</p>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 sm:gap-5"
            noValidate
          >
            <FormField
              control={form.control}
              name="newEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">新しいメールアドレス</FormLabel>
                  <FormControl>
                    <Input
                      className="h-10"
                      type="email"
                      placeholder="new-email@example.com"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    確認メールが新しいメールアドレスに送信されます
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">現在のパスワード</FormLabel>
                  <FormControl>
                    <PasswordInput
                      className="h-10"
                      placeholder="現在のパスワードを入力"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    セキュリティのため、現在のパスワードの入力が必要です
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end border-t border-border/60 pt-4 sm:pt-5">
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto sm:min-w-32">
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    変更中...
                  </>
                ) : (
                  "メールアドレスを変更"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
