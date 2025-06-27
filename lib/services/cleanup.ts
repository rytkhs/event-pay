import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export interface OrphanedUser {
  user_id: string
  email: string
  created_at: string
}

export interface CleanupStats {
  total_auth_users: number
  total_profile_users: number
  orphaned_users_count: number
  last_cleanup_check: string
}

export class UserCleanupService {
  /**
   * 孤立ユーザーを検出
   */
  static async detectOrphanedUsers(): Promise<OrphanedUser[]> {
    const adminClient = createSupabaseAdminClient()
    
    const { data, error } = await adminClient.rpc('detect_orphaned_users')
    
    if (error) {
      throw new Error(`Failed to detect orphaned users: ${error.message}`)
    }
    
    return data || []
  }

  /**
   * 指定ユーザーを安全にクリーンアップ
   */
  static async cleanupOrphanedUser(userId: string): Promise<boolean> {
    const adminClient = createSupabaseAdminClient()
    
    const { data, error } = await adminClient.rpc('cleanup_orphaned_user', {
      target_user_id: userId
    })
    
    if (error) {
      throw new Error(`Failed to cleanup user ${userId}: ${error.message}`)
    }
    
    return data === true
  }

  /**
   * 全ての孤立ユーザーを一括クリーンアップ
   */
  static async cleanupAllOrphanedUsers(): Promise<{
    detected: number
    cleaned: number
    failed: string[]
  }> {
    const orphanedUsers = await this.detectOrphanedUsers()
    const result = {
      detected: orphanedUsers.length,
      cleaned: 0,
      failed: [] as string[]
    }

    for (const user of orphanedUsers) {
      try {
        const cleaned = await this.cleanupOrphanedUser(user.user_id)
        if (cleaned) {
          result.cleaned++
        }
      } catch (error) {
        result.failed.push(user.user_id)
        // eslint-disable-next-line no-console
        console.error(`Failed to cleanup user ${user.user_id}:`, error)
      }
    }

    return result
  }

  /**
   * クリーンアップ統計情報を取得
   */
  static async getCleanupStats(): Promise<CleanupStats> {
    const adminClient = createSupabaseAdminClient()
    
    const { data, error } = await adminClient.rpc('get_orphaned_users_stats')
    
    if (error) {
      throw new Error(`Failed to get cleanup stats: ${error.message}`)
    }
    
    return data as CleanupStats
  }

  /**
   * ヘルスチェック（定期実行向け）
   */
  static async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical'
    stats: CleanupStats
    orphanedUsers: OrphanedUser[]
  }> {
    try {
      const stats = await this.getCleanupStats()
      const orphanedUsers = await this.detectOrphanedUsers()
      
      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      
      if (orphanedUsers.length > 0) {
        status = orphanedUsers.length > 10 ? 'critical' : 'warning'
      }
      
      return { status, stats, orphanedUsers }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Cleanup health check failed:', error)
      throw error
    }
  }
}