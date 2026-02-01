"use client";

import { useTransition } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";

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

const profileSchema = z.object({
  name: z
    .string()
    .min(1, "表示名は必須です")
    .max(255, "表示名は255文字以内で入力してください")
    .trim(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  currentName: string;
  updateProfileAction: UpdateProfileAction;
}

type UpdateProfileAction = (formData: FormData) => Promise<ActionResult>;

export function ProfileForm({ currentName, updateProfileAction }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: currentName,
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("name", data.name);

        const result = await updateProfileAction(formData);

        if (result.success) {
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
          description: "プロフィールの更新中にエラーが発生しました",
          variant: "destructive",
        });
      }
    });
  };

  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>表示名</FormLabel>
                <FormControl>
                  <Input placeholder="表示名を入力してください" {...field} />
                </FormControl>
                <FormDescription>イベントの作成者として表示される名前です</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={isPending || !isDirty} className="w-full sm:w-auto">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "更新中..." : "プロフィールを更新"}
        </Button>
      </form>
    </Form>
  );
}
