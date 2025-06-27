import { NextResponse } from 'next/server'
import { z } from 'zod'

export interface ApiSuccessResponse<T = unknown> {
  success: true
  message?: string
  data?: T
}

export interface ApiErrorResponse {
  success: false
  error: string | {
    code: string
    message: string
  }
  details?: Record<string, string>
  retryAfter?: number
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

export class ApiResponseHelper {
  static success<T>(data?: T, message?: string): NextResponse {
    const response: ApiSuccessResponse<T> = { success: true }
    
    if (message) response.message = message
    if (data) response.data = data
    
    return NextResponse.json(response)
  }

  static error(error: string, code?: string, status = 500): NextResponse {
    const response: ApiErrorResponse = {
      success: false,
      error: code ? { code, message: error } : error
    }
    
    return NextResponse.json(response, { status })
  }

  static validation(
    error: string | z.ZodError, 
    status = 400
  ): NextResponse {
    const response: ApiErrorResponse = { success: false, error: '' }

    if (error instanceof z.ZodError) {
      const details: Record<string, string> = {}
      error.errors.forEach(err => {
        if (err.path.length > 0) {
          details[err.path[0].toString()] = err.message
        }
      })
      
      response.error = 'バリデーションエラーが発生しました'
      response.details = details
    } else {
      response.error = error
    }
    
    return NextResponse.json(response, { status })
  }

  static rateLimit(
    error: string, 
    retryAfter?: number, 
    status = 429
  ): NextResponse {
    const response: ApiErrorResponse = {
      success: false,
      error,
      ...(retryAfter && { retryAfter })
    }
    
    return NextResponse.json(response, { status })
  }

  static unauthorized(
    error = 'Unauthorized', 
    code = 'UNAUTHORIZED'
  ): NextResponse {
    return this.error(error, code, 401)
  }

  static badRequest(
    error = 'Bad Request', 
    code = 'BAD_REQUEST'
  ): NextResponse {
    return this.error(error, code, 400)
  }

  static internalError(
    error = 'Internal Server Error', 
    code = 'INTERNAL_ERROR'
  ): NextResponse {
    return this.error(error, code, 500)
  }
}