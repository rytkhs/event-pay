-- E2Eテスト用ユーザーの作成
-- パスワード: testpassword123 のハッシュ値

-- テストユーザー1: test@eventpay.test
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, 
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated', 
  'test@eventpay.test',
  '$2a$10$X9VzP6lVP5Q4.F7zX8CYfOnBFPNjT8YwfLnvQtKlWVxfEiLQn/8u6',
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{}'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO public.users (id, email, name) 
VALUES ('00000000-0000-0000-0000-000000000001', 'test@eventpay.test', 'テストユーザー')
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  name = EXCLUDED.name;

-- テストユーザー2: creator@eventpay.test  
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, 
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated', 
  'creator@eventpay.test',
  '$2a$10$X9VzP6lVP5Q4.F7zX8CYfOnBFPNjT8YwfLnvQtKlWVxfEiLQn/8u6',
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{}'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO public.users (id, email, name) 
VALUES ('00000000-0000-0000-0000-000000000002', 'creator@eventpay.test', 'イベント作成者')
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  name = EXCLUDED.name;

-- テストユーザー3: participant@eventpay.test
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, 
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated', 
  'participant@eventpay.test',
  '$2a$10$X9VzP6lVP5Q4.F7zX8CYfOnBFPNjT8YwfLnvQtKlWVxfEiLQn/8u6',
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{}'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO public.users (id, email, name) 
VALUES ('00000000-0000-0000-0000-000000000003', 'participant@eventpay.test', 'テスト参加者')
ON CONFLICT (id) DO UPDATE SET 
  email = EXCLUDED.email,
  name = EXCLUDED.name;