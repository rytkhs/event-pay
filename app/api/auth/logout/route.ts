import { NextRequest } from "next/server";
import { ApiResponseHelper } from "@/lib/api/response";
import { LogoutService } from "@/lib/services/registration";
import { withCSRFProtection } from "@/lib/middleware/csrf-protection";

export async function POST(request: NextRequest) {
  return withCSRFProtection(request, async (req) => {
  try {
    const result = await LogoutService.logout();
    return ApiResponseHelper.success(undefined, result.message);
  } catch (error) {
    if (error instanceof Error) {
      return ApiResponseHelper.badRequest(error.message, "LOGOUT_FAILED");
    }
    return ApiResponseHelper.internalError("Internal server error", "SERVER_ERROR");
  }
  });
}
