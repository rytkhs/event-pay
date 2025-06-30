import { ApiResponseHelper } from "@/lib/api/response";
import { LogoutService } from "@/lib/services/registration";

export async function POST() {
  try {
    const result = await LogoutService.logout();
    return ApiResponseHelper.success(undefined, result.message);
  } catch (error) {
    if (error instanceof Error) {
      return ApiResponseHelper.badRequest(error.message, "LOGOUT_FAILED");
    }
    return ApiResponseHelper.internalError("Internal server error", "SERVER_ERROR");
  }
}
