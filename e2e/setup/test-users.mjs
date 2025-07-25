/**
 * E2Eテスト用のユーザーセットアップスクリプト
 * ユーザー登録APIを使ってテスト用ユーザーを作成します
 */

async function createTestUser(email, password, name) {
  try {
    const response = await fetch('http://localhost:3000/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        passwordConfirm: password,
        name,
        terms: true
      })
    });

    if (response.ok) {
      console.log(`✓ ユーザー ${email} を作成しました`);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`! ユーザー ${email} は既に存在している可能性があります: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ ユーザー ${email} の作成に失敗:`, error.message);
    return false;
  }
}

async function createTestUsers() {
  console.log('🚀 E2Eテスト用ユーザーの作成を開始します...');

  const testUsers = [
    {
      email: 'test@eventpay.test',
      password: 'testpassword123',
      name: 'テストユーザー'
    },
    {
      email: 'creator@eventpay.test',
      password: 'testpassword123',
      name: 'イベント作成者'
    },
    {
      email: 'participant@eventpay.test',
      password: 'testpassword123',
      name: 'テスト参加者'
    }
  ];

  for (const user of testUsers) {
    await createTestUser(user.email, user.password, user.name);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
  }

  console.log('🎉 E2Eテスト用ユーザーのセットアップが完了しました');
}

// スクリプトとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestUsers().catch(console.error);
}

export { createTestUsers };
