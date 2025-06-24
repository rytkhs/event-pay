// Jest セットアップファイル
// テスト実行前に必要な設定を行います

// 環境変数の設定（テスト環境用）
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'SUPABASE_ANON_KEY_REDACTED'

// テストタイムアウトの設定
jest.setTimeout(30000)

// Supabase接続のテストヘルパー
global.testSupabaseConnection = async () => {
  const { createClient } = require('@supabase/supabase-js')
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  
  try {
    const { data, error } = await supabase.from('pg_type').select('typname').limit(1)
    if (error) {
      console.warn('Supabase接続テスト失敗:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('Supabase接続エラー:', err)
    return false
  }
}

// テスト前のクリーンアップ
beforeAll(async () => {
  console.log('テスト環境の初期化を開始...')
  
  // Supabase接続確認
  const isConnected = await global.testSupabaseConnection()
  if (!isConnected) {
    console.warn('⚠️ Supabase接続が確立できません。ローカルSupabaseが起動していることを確認してください。')
    console.warn('次のコマンドを実行してください: npx supabase start')
  }
})

afterAll(async () => {
  console.log('テスト環境のクリーンアップを完了しました')
})