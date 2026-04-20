import { z } from "zod";

const COMMUNITY_DESCRIPTION_MAX_LENGTH = 1000;
const COMMUNITY_DESCRIPTION_MAX_LENGTH_MESSAGE = `コミュニティ説明は${COMMUNITY_DESCRIPTION_MAX_LENGTH}文字以内で入力してください`;

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

const communityNameSchema = z
  .string()
  .trim()
  .min(1, "コミュニティ名を入力してください")
  .max(255, "コミュニティ名は255文字以内で入力してください");

export const createCommunitySchema = z.object({
  name: communityNameSchema,
  description: z.string().optional().transform(normalizeOptionalText),
});

export const updateCommunitySchema = z.object({
  name: communityNameSchema,
  description: z
    .string()
    .trim()
    .max(COMMUNITY_DESCRIPTION_MAX_LENGTH, COMMUNITY_DESCRIPTION_MAX_LENGTH_MESSAGE)
    .optional()
    .transform(normalizeOptionalText),
});

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
