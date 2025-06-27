import { SupabaseClientFactory } from './factory'

export function createSupabaseServerClient() {
  return SupabaseClientFactory.createServerClient('server')
}