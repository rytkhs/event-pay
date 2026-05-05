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
    <div className="rounded-lg border border-border/60 bg-background">
      <div className="p-4 sm:p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 sm:gap-5"
            noValidate
          >
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

            <div className="flex justify-end border-t border-border/60 pt-4 sm:pt-5">
              <Button
                type="submit"
                disabled={isPending || !isDirty}
                className="w-full sm:w-auto sm:min-w-32"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
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
