import { z } from "zod";

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

const communityEditableFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "コミュニティ名を入力してください")
    .max(255, "コミュニティ名は255文字以内で入力してください"),
  description: z.string().optional().transform(normalizeOptionalText),
});

export const createCommunitySchema = communityEditableFieldsSchema;
export const updateCommunitySchema = communityEditableFieldsSchema;

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
