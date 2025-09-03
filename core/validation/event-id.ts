import { z } from "zod";

const EventIdSchema = z.string().uuid("Invalid UUID format");

export function validateEventId(eventId: unknown) {
  try {
    const validatedId = EventIdSchema.parse(eventId);
    return { success: true, data: validatedId };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: { message: error.errors[0]?.message || "Invalid UUID format" },
      };
    }
    return {
      success: false,
      error: { message: "Invalid UUID format" },
    };
  }
}
