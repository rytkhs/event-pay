/**
 * 期限切れスケジューラーロック削除 Edge Function
 *
 * Supabase Cron または外部スケジューラーから定期実行される
 * 直接 RPC を呼び出してロック削除を行う
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  deleted_count: number;
  expired_locks: Array<{
    lock_name: string;
    acquired_at: string;
    expires_at: string;
    process_id: string;
  }>;
}

serve(async (req) => {
  // CORS プリフライト対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 認証チェック（Supabase Service Role Key または指定トークン）
    const authHeader = req.headers.get('authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const internalToken = Deno.env.get('INTERNAL_API_TOKEN');

    let authenticated = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      authenticated = token === serviceRoleKey || token === internalToken;
    }

    if (!authenticated) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Supabase クライアント初期化（Service Role）
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 期限切れロック削除 RPC を実行
    const { data, error } = await supabase
      .rpc('cleanup_expired_scheduler_locks')
      .single();

    if (error) {
      // エラーログ
      const errorLog = {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        tag: "cleanupSchedulerLocks",
        message: "Failed to cleanup expired scheduler locks",
        error_name: error.name,
        error_message: error.message
      };
      console.error(JSON.stringify(errorLog));

      return new Response(
        JSON.stringify({
          error: 'Cleanup failed',
          details: error.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const result = data as CleanupResult;

    // 完了ログ
    const completionLog = {
      timestamp: new Date().toISOString(),
      level: "INFO",
      tag: "cleanupSchedulerLocks",
      message: "Scheduler lock cleanup completed",
      deletedCount: result.deleted_count,
      expiredLocks: result.expired_locks,
    };
    console.log(JSON.stringify(completionLog));

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount: result.deleted_count,
        expiredLocks: result.expired_locks,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    // 予期しないエラーログ
    const unexpectedErrorLog = {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      tag: "cleanupSchedulerLocks",
      message: "Unexpected error in scheduler lock cleanup",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error)
    };
    console.error(JSON.stringify(unexpectedErrorLog));

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
