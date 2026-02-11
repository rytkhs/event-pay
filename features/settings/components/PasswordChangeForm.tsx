"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";

import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { updatePasswordFormSchema, type UpdatePasswordFormInput } from "@core/validation/settings";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";

type UpdatePasswordAction = (formData: FormData) => Promise<ActionResult>;

interface PasswordChangeFormProps {
  updatePasswordAction: UpdatePasswordAction;
}

export function PasswordChangeForm({ updatePasswordAction }: PasswordChangeFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<UpdatePasswordFormInput>({
    resolver: zodResolver(updatePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: UpdatePasswordFormInput) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("currentPassword", data.currentPassword);
        formData.append("newPassword", data.newPassword);

        const result = await updatePasswordAction(formData);

        if (result.success) {
          form.reset();
          toast({
            title: "更新完了",
            description: result.message,
          });
        } else {
          toast({
            title: "エラー",
            description: result.error?.userMessage,
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "エラー",
          description: "パスワードの更新中にエラーが発生しました",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>現在のパスワード</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="現在のパスワードを入力" {...field} />
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
                <FormLabel>新しいパスワード</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="新しいパスワードを入力" {...field} />
                </FormControl>
                <FormDescription>8文字以上で入力してください</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>確認用パスワード</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="新しいパスワードを再入力" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "更新中..." : "パスワードを変更"}
        </Button>
      </form>
    </Form>
  );
}
