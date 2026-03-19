import { z } from "zod";

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export const createCommunitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "コミュニティ名を入力してください")
    .max(255, "コミュニティ名は255文字以内で入力してください"),
  description: z.string().optional().transform(normalizeOptionalText),
});

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
