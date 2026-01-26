"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useToast } from "@core/contexts/toast-context";

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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import type { ActionResult } from "@/types/action-result";

const emailChangeSchema = z.object({
  newEmail: z
    .string()
    .min(1, "新しいメールアドレスを入力してください")
    .email("有効なメールアドレスを入力してください"),
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
});

type EmailChangeFormData = z.infer<typeof emailChangeSchema>;

interface EmailChangeFormProps {
  currentEmail: string;
  updateEmailAction: UpdateEmailAction;
}

type UpdateEmailAction = (formData: FormData) => Promise<ActionResult>;

export function EmailChangeForm({ currentEmail, updateEmailAction }: EmailChangeFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<EmailChangeFormData>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: {
      newEmail: "",
      currentPassword: "",
    },
  });

  const onSubmit = (data: EmailChangeFormData) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("newEmail", data.newEmail);
        formData.append("currentPassword", data.currentPassword);

        const result = await updateEmailAction(formData);

        if (result.success) {
          form.reset();
          toast({
            title: "確認メール送信完了",
            description: result.message,
          });
        } else {
          toast({
            title: "エラー",
            description: result.error,
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "エラー",
          description: "メールアドレスの変更中にエラーが発生しました",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start space-x-4 p-4 border rounded-lg bg-blue-50 border-blue-200">
        <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-blue-900">現在のメールアドレス</h4>
          <p className="text-sm text-blue-800 mt-1">{currentEmail}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="newEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>新しいメールアドレス</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="new-email@example.com" {...field} />
                </FormControl>
                <FormDescription>確認メールが新しいメールアドレスに送信されます</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>現在のパスワード</FormLabel>
                <FormControl>
                  <PasswordInput placeholder="現在のパスワードを入力" {...field} />
                </FormControl>
                <FormDescription>
                  セキュリティのため、現在のパスワードの入力が必要です
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? "変更中..." : "メールアドレスを変更"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
