'use server'

import { z } from 'zod'

import { createClient } from '@core/supabase/server'
import { extractEventCreateFormData } from '@core/utils/form-data-extractors'
import { generateInviteToken } from '@core/utils/invite-token'
import { convertDatetimeLocalToUtc } from '@core/utils/timezone'
import { createEventSchema, type CreateEventInput } from '@core/validation/event'

import type { Database } from '@/types/database'

type EventRow = Database['public']['Tables']['events']['Row']

type CreateEventResult =
  | {
      success: true
      data: EventRow
    }
  | {
      success: false
      error: string
    }

type FormDataFields = {
  title: string
  date: string
  fee: string
  payment_methods: string
  location?: string
  description?: string
  capacity?: string
  registration_deadline?: string
  payment_deadline?: string
}

export async function createEventAction(formData: FormData): Promise<CreateEventResult> {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return {
        success: false,
        error: '認証が必要です',
      }
    }

    if (!user) {
      return {
        success: false,
        error: '認証が必要です',
      }
    }

    const rawData = extractFormData(formData)
    const validatedData = createEventSchema.parse(rawData)
    const inviteToken = generateInviteToken()

    const eventData = buildEventData(validatedData, user.id, inviteToken)

    const { data: createdEvent, error: dbError } = await supabase
      .from('events')
      .insert(eventData)
      .select()
      .single()

    if (dbError) {
      return {
        success: false,
        error: 'イベントの作成に失敗しました',
      }
    }

    if (!createdEvent) {
      return {
        success: false,
        error: 'イベントの作成に失敗しました',
      }
    }

    return {
      success: true,
      data: createdEvent,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message,
      }
    }

    return {
      success: false,
      error: '予期しないエラーが発生しました',
    }
  }
}

function extractFormData(formData: FormData): FormDataFields {
  // 共通ユーティリティを使用して型安全なFormData抽出
  return extractEventCreateFormData(formData)
}

/**
 * 定員の値を適切に処理する（型が異なる場合対応）
 * 空文字列または未定義の場合は無制限（null）
 * "0"の場合も無制限として扱う（参加不可能を避けるため）
 */
function parseCapacityLocal(capacity: string | number | null | undefined): number | null {
  if (!capacity || capacity === null) {
    return null
  }

  if (typeof capacity === 'string') {
    if (capacity.trim() === '') {
      return null
    }
    const parsed = Number(capacity)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return parsed
  }

  if (typeof capacity === 'number') {
    if (capacity <= 0) {
      return null
    }
    return capacity
  }

  return null
}

/**
 * datetime-local形式の文字列をUTCに変換してISO文字列として返す
 * date-fns-tzを使用した統一的なタイムゾーン処理
 */
function convertDatetimeLocalToIso(dateString: string): string {
  const utcDate = convertDatetimeLocalToUtc(dateString)
  return utcDate.toISOString()
}

function buildEventData(validatedData: CreateEventInput, userId: string, inviteToken: string) {
  const fee = Number(validatedData.fee)

  return {
    title: validatedData.title,
    date: convertDatetimeLocalToIso(validatedData.date),
    fee,
    // 無料イベント（fee=0）の場合は空配列を明示的に設定
    payment_methods:
      fee === 0
        ? []
        : (validatedData.payment_methods as Database['public']['Enums']['payment_method_enum'][]),
    location: validatedData.location || null,
    description: validatedData.description || null,
    capacity: parseCapacityLocal(validatedData.capacity),
    registration_deadline: validatedData.registration_deadline
      ? convertDatetimeLocalToIso(validatedData.registration_deadline)
      : null,
    payment_deadline: validatedData.payment_deadline
      ? convertDatetimeLocalToIso(validatedData.payment_deadline)
      : null,
    created_by: userId,
    invite_token: inviteToken,
  }
}
