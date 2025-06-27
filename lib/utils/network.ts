import { NextRequest } from 'next/server'

export function getClientIP(request: NextRequest): string {
  // CloudflareやVercelなどのプロキシ経由の場合
  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  if (cfConnectingIP) {
    return cfConnectingIP
  }

  // X-Forwarded-For ヘッダーから取得（複数IPの場合は最初のもの）
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  // X-Real-IP ヘッダーから取得
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  // Vercel固有のヘッダー
  const vercelForwardedIP = request.headers.get('x-vercel-forwarded-for')
  if (vercelForwardedIP) {
    return vercelForwardedIP.split(',')[0].trim()
  }

  // 最後の手段としてlocalhost
  return '127.0.0.1'
}

export function isValidIP(ip: string): boolean {
  // IPv4の形式をチェック
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  
  // IPv6の基本的な形式をチェック
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

export function isPrivateIP(ip: string): boolean {
  if (!isValidIP(ip)) {
    return false
  }

  // IPv4のプライベートアドレス範囲
  const privateRanges = [
    /^127\./, // localhost
    /^10\./, // Class A private
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
    /^192\.168\./, // Class C private
    /^169\.254\./, // Link-local
  ]

  return privateRanges.some(range => range.test(ip))
}

export function getClientUserAgent(request: NextRequest): string | null {
  return request.headers.get('user-agent')
}

export function getClientAcceptLanguage(request: NextRequest): string | null {
  return request.headers.get('accept-language')
}