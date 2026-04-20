"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { updateProfileInputSchema, type UpdateProfileInput } from "@core/validation/settings";

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

interface ProfileFormProps {
  currentName: string;
  updateProfileAction: UpdateProfileAction;
}

type UpdateProfileAction = (formData: FormData) => Promise<ActionResult>;

export function ProfileForm({ currentName, updateProfileAction }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileInputSchema),
    defaultValues: {
      name: currentName,
    },
  });

  const onSubmit = (data: UpdateProfileInput) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("name", data.name);

        const result = await updateProfileAction(formData);

        if (result.success) {
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
          description: "プロフィールの更新中にエラーが発生しました",
        });
      }
    });
  };

  const isDirty = form.formState.isDirty;

  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">ユーザーネーム</FormLabel>
                  <FormControl>
                    <Input
                      className="h-10"
                      placeholder="ユーザーネームを入力してください"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end border-t border-border/60 pt-5">
              <Button type="submit" disabled={isPending || !isDirty} className="min-w-32">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    更新中...
                  </>
                ) : (
                  "プロフィールを更新"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
