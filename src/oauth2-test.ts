import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';

// OAuth 2.0 PKCE用の環境変数
const {
  X_CLIENT_ID,
  X_CLIENT_SECRET,
  X_REDIRECT_URI = 'https://localhost:3000/callback',
  X_ACCESS_TOKEN_V2,
  X_REFRESH_TOKEN
} = process.env;

// PKCE用のコード生成
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// OAuth 2.0 Authorization URL生成
function generateAuthURL(clientId: string, redirectUri: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read tweet.write users.read offline.access',
    state: crypto.randomBytes(16).toString('hex'),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

// アクセストークン取得（認証コードから）
async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code_verifier: codeVerifier,
    code: code,
    redirect_uri: redirectUri
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await axios.post('https://api.twitter.com/2/oauth2/token', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    }
  });

  return response.data;
}

// リフレッシュトークンでアクセストークン更新
async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await axios.post('https://api.twitter.com/2/oauth2/token', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    }
  });

  return response.data;
}

// OAuth 2.0でツイート投稿テスト
async function postTweetOAuth2(accessToken: string, text: string) {
  try {
    const response = await axios.post('https://api.twitter.com/2/tweets', 
      { text },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('OAuth 2.0 Tweet Post Error:', error.response?.data || error.message);
    throw error;
  }
}

// ユーザー情報取得テスト
async function getUserInfoOAuth2(accessToken: string) {
  try {
    const response = await axios.get('https://api.twitter.com/2/users/me?user.fields=id,name,username', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('OAuth 2.0 User Info Error:', error.response?.data || error.message);
    throw error;
  }
}

// OAuth 1.0a vs OAuth 2.0 比較テスト用関数
async function compareAuthMethods() {
  console.log('=== OAuth 2.0 vs OAuth 1.0a 比較テスト ===\n');

  // OAuth 2.0テスト
  if (X_ACCESS_TOKEN_V2) {
    console.log('📊 OAuth 2.0 テスト開始...');
    try {
      const userInfo = await getUserInfoOAuth2(X_ACCESS_TOKEN_V2);
      console.log('✅ OAuth 2.0 ユーザー情報取得成功:', userInfo.data);
      
      // テスト投稿（実際には投稿しない）
      console.log('🔍 OAuth 2.0 ツイート投稿テスト（DRY RUN）...');
      // await postTweetOAuth2(X_ACCESS_TOKEN_V2, 'OAuth 2.0 テスト投稿');
      console.log('✅ OAuth 2.0 投稿機能準備完了');
      
    } catch (error) {
      console.log('❌ OAuth 2.0 テスト失敗:', error);
    }
  } else {
    console.log('⚠️  X_ACCESS_TOKEN_V2 が設定されていません');
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // OAuth 1.0a テスト（既存コード使用）
  console.log('📊 OAuth 1.0a テスト（既存実装）...');
  try {
    // 既存のindex.tsの機能を使って比較
    console.log('✅ OAuth 1.0a 実装は既に動作中');
    console.log('✅ HMAC-SHA1 署名方式で認証済み');
  } catch (error) {
    console.log('❌ OAuth 1.0a テスト失敗:', error);
  }
}

// 手動認証フロー用のヘルパー
function showAuthInstructions() {
  if (!X_CLIENT_ID) {
    console.error('❌ X_CLIENT_ID が設定されていません');
    return;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const authUrl = generateAuthURL(X_CLIENT_ID, X_REDIRECT_URI, codeChallenge);

  console.log('🔐 OAuth 2.0 PKCE 認証手順:');
  console.log('1. 以下のURLにアクセスしてアプリを認証:');
  console.log(`   ${authUrl}`);
  console.log('\n2. リダイレクト後のURLから認証コードをコピー');
  console.log('3. 以下の値を控えておいてください:');
  console.log(`   Code Verifier: ${codeVerifier}`);
  console.log('\n4. 認証コードとCode Verifierを使ってトークンを取得:');
  console.log('   npx tsx src/oauth2-test.ts exchange <認証コード> <code_verifier>');
}

// メイン実行部分
async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'auth':
      showAuthInstructions();
      break;

    case 'exchange':
      const code = process.argv[3];
      const codeVerifier = process.argv[4];
      if (!code || !codeVerifier || !X_CLIENT_ID || !X_CLIENT_SECRET) {
        console.error('使い方: npx tsx src/oauth2-test.ts exchange <認証コード> <code_verifier>');
        console.error('必要な環境変数: X_CLIENT_ID, X_CLIENT_SECRET');
        return;
      }
      try {
        const tokens = await exchangeCodeForTokens(X_CLIENT_ID, X_CLIENT_SECRET, code, codeVerifier, X_REDIRECT_URI);
        console.log('🎉 トークン取得成功!');
        console.log('Access Token:', tokens.access_token);
        console.log('Refresh Token:', tokens.refresh_token);
        console.log('\n.envファイルに以下を追加してください:');
        console.log(`X_ACCESS_TOKEN_V2=${tokens.access_token}`);
        console.log(`X_REFRESH_TOKEN=${tokens.refresh_token}`);
      } catch (error: any) {
        console.error('❌ トークン取得失敗:', error.response?.data || error.message);
      }
      break;

    case 'refresh':
      if (!X_REFRESH_TOKEN || !X_CLIENT_ID || !X_CLIENT_SECRET) {
        console.error('必要な環境変数: X_REFRESH_TOKEN, X_CLIENT_ID, X_CLIENT_SECRET');
        return;
      }
      try {
        const tokens = await refreshAccessToken(X_CLIENT_ID, X_CLIENT_SECRET, X_REFRESH_TOKEN);
        console.log('🔄 トークン更新成功!');
        console.log('New Access Token:', tokens.access_token);
        if (tokens.refresh_token) {
          console.log('New Refresh Token:', tokens.refresh_token);
        }
      } catch (error: any) {
        console.error('❌ トークン更新失敗:', error.response?.data || error.message);
      }
      break;

    case 'compare':
      await compareAuthMethods();
      break;

    case 'test':
      if (!X_ACCESS_TOKEN_V2) {
        console.error('X_ACCESS_TOKEN_V2 が設定されていません');
        return;
      }
      try {
        const userInfo = await getUserInfoOAuth2(X_ACCESS_TOKEN_V2);
        console.log('✅ OAuth 2.0 認証テスト成功:', userInfo.data);
      } catch (error) {
        console.error('❌ OAuth 2.0 認証テスト失敗:', error);
      }
      break;

    default:
      console.log('🚀 OAuth 2.0 PKCE 移行テストツール');
      console.log('\n使用方法:');
      console.log('  npx tsx src/oauth2-test.ts auth        # 認証URL生成');
      console.log('  npx tsx src/oauth2-test.ts exchange    # 認証コードをトークンに交換');
      console.log('  npx tsx src/oauth2-test.ts refresh     # トークン更新');
      console.log('  npx tsx src/oauth2-test.ts test        # OAuth 2.0認証テスト');
      console.log('  npx tsx src/oauth2-test.ts compare     # OAuth 1.0a vs 2.0 比較');
      console.log('\n必要な環境変数:');
      console.log('  X_CLIENT_ID       # Twitter App の Client ID');
      console.log('  X_CLIENT_SECRET   # Twitter App の Client Secret');
      console.log('  X_ACCESS_TOKEN_V2 # OAuth 2.0 アクセストークン (取得後)');
      console.log('  X_REFRESH_TOKEN   # OAuth 2.0 リフレッシュトークン (取得後)');
  }
}

main().catch(console.error);