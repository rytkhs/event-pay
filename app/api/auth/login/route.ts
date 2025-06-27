import { NextRequest } from 'next/server'
import { ApiResponseHelper } from '@/lib/api/response'
import { LoginService } from '@/lib/services/registration'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  try {
    // 入力値検証
    const validatedData = await LoginService.validateInput(request)

    // ログイン処理
    const result = await LoginService.login(validatedData.email, validatedData.password)

    return ApiResponseHelper.success(
      { user: result.user },
      'ログインに成功しました'
    )

  } catch (error) {
    if (error instanceof z.ZodError) {
      return ApiResponseHelper.validation(error)
    }

    if (error instanceof Error) {
      return ApiResponseHelper.unauthorized(error.message, 'LOGIN_FAILED')
    }

    return ApiResponseHelper.badRequest('Invalid input data', 'VALIDATION_ERROR')
  }
}
