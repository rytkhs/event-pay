"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { changePasswordFormSchema, type ChangePasswordFormInput } from "@core/validation/settings";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";

type ChangePasswordAction = (formData: FormData) => Promise<ActionResult>;

interface PasswordChangeFormProps {
  changePasswordAction: ChangePasswordAction;
}

export function PasswordChangeForm({ changePasswordAction }: PasswordChangeFormProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<ChangePasswordFormInput>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: ChangePasswordFormInput) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("currentPassword", data.currentPassword);
        formData.append("newPassword", data.newPassword);

        const result = await changePasswordAction(formData);

        if (result.success) {
          form.reset();
          toast("更新完了", {
            description: result.message,
          });
        } else {
          toast.error("エラー", {
            description: result.error?.userMessage,
          });
        }
      } catch (_error) {
        toast.error("エラー", {
          description: "パスワードの更新中にエラーが発生しました",
        });
      }
    });
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">新しいパスワード</FormLabel>
                  <FormControl>
                    <PasswordInput
                      className="h-10"
                      placeholder="新しいパスワードを入力"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">8文字以上で入力してください</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">確認用パスワード</FormLabel>
                  <FormControl>
                    <PasswordInput
                      className="h-10"
                      placeholder="新しいパスワードを再入力"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end border-t border-border/60 pt-5">
              <Button type="submit" disabled={isPending} className="min-w-32">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    更新中...
                  </>
                ) : (
                  "パスワードを変更"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
