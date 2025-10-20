import 'dotenv/config';
import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// 既存のOAuth 1.0a設定（index.tsから）
const {
  X_API_KEY,
  X_API_SECRET,
  X_ACCESS_TOKEN,
  X_ACCESS_SECRET,
  X_ACCESS_TOKEN_V2  // OAuth 2.0用
} = process.env;

// OAuth 1.0a クライアント
const oauth1 = new OAuth({
  consumer: { key: X_API_KEY!, secret: X_API_SECRET! },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});
const token1 = { key: X_ACCESS_TOKEN!, secret: X_ACCESS_SECRET! };

// パフォーマンス測定
interface PerformanceResult {
  method: string;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  response?: any;
}

class AuthComparison {
  private results: PerformanceResult[] = [];

  // OAuth 1.0a でのツイート投稿
  async postTweetOAuth1(text: string): Promise<PerformanceResult> {
    const start = Date.now();
    try {
      const url = 'https://api.twitter.com/2/tweets';
      const body = { text };
      
      const reqData = {
        url,
        method: 'POST',
        data: JSON.stringify(body)
      };
      
      const headers = {
        ...oauth1.toHeader(oauth1.authorize(reqData, token1)),
        'Content-Type': 'application/json'
      };

      const response = await axios.post(url, body, { headers });
      const duration = Date.now() - start;

      return {
        method: 'OAuth 1.0a',
        operation: 'Tweet Post',
        duration,
        success: true,
        response: response.data
      };
    } catch (error: any) {
      return {
        method: 'OAuth 1.0a',
        operation: 'Tweet Post',
        duration: Date.now() - start,
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // OAuth 2.0 でのツイート投稿
  async postTweetOAuth2(text: string): Promise<PerformanceResult> {
    const start = Date.now();
    try {
      const response = await axios.post('https://api.twitter.com/2/tweets', 
        { text },
        {
          headers: {
            'Authorization': `Bearer ${X_ACCESS_TOKEN_V2}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const duration = Date.now() - start;

      return {
        method: 'OAuth 2.0',
        operation: 'Tweet Post',
        duration,
        success: true,
        response: response.data
      };
    } catch (error: any) {
      return {
        method: 'OAuth 2.0',
        operation: 'Tweet Post',
        duration: Date.now() - start,
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // OAuth 1.0a でのユーザー情報取得
  async getUserInfoOAuth1(): Promise<PerformanceResult> {
    const start = Date.now();
    try {
      const url = 'https://api.twitter.com/2/users/me?user.fields=id,name,username';
      const reqData = { url, method: 'GET' };
      
      const headers = oauth1.toHeader(oauth1.authorize(reqData, token1));
      const response = await axios.get(url, { headers });
      const duration = Date.now() - start;

      return {
        method: 'OAuth 1.0a',
        operation: 'User Info',
        duration,
        success: true,
        response: response.data
      };
    } catch (error: any) {
      return {
        method: 'OAuth 1.0a',
        operation: 'User Info',
        duration: Date.now() - start,
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // OAuth 2.0 でのユーザー情報取得
  async getUserInfoOAuth2(): Promise<PerformanceResult> {
    const start = Date.now();
    try {
      const response = await axios.get('https://api.twitter.com/2/users/me?user.fields=id,name,username', {
        headers: {
          'Authorization': `Bearer ${X_ACCESS_TOKEN_V2}`
        }
      });
      const duration = Date.now() - start;

      return {
        method: 'OAuth 2.0',
        operation: 'User Info',
        duration,
        success: true,
        response: response.data
      };
    } catch (error: any) {
      return {
        method: 'OAuth 2.0',
        operation: 'User Info',
        duration: Date.now() - start,
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // 複数回のリクエストでパフォーマンス測定
  async performanceTest(iterations: number = 3): Promise<void> {
    console.log(`🚀 認証方式パフォーマンス比較テスト (${iterations}回実行)\n`);

    // ユーザー情報取得のテスト
    console.log('📊 ユーザー情報取得テスト...');
    
    for (let i = 1; i <= iterations; i++) {
      console.log(`\n--- 実行回数: ${i}/${iterations} ---`);
      
      if (X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET) {
        const result1 = await this.getUserInfoOAuth1();
        this.results.push(result1);
        console.log(`OAuth 1.0a: ${result1.success ? '✅' : '❌'} ${result1.duration}ms`);
      }

      if (X_ACCESS_TOKEN_V2) {
        const result2 = await this.getUserInfoOAuth2();
        this.results.push(result2);
        console.log(`OAuth 2.0:  ${result2.success ? '✅' : '❌'} ${result2.duration}ms`);
      }

      // 次のリクエストまで少し待機
      if (i < iterations) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 結果の分析と表示
  analyzeResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📈 パフォーマンス分析結果');
    console.log('='.repeat(60));

    const oauth1Results = this.results.filter(r => r.method === 'OAuth 1.0a');
    const oauth2Results = this.results.filter(r => r.method === 'OAuth 2.0');

    // OAuth 1.0a の分析
    if (oauth1Results.length > 0) {
      const oauth1Success = oauth1Results.filter(r => r.success);
      const oauth1AvgDuration = oauth1Success.length > 0 
        ? oauth1Success.reduce((sum, r) => sum + r.duration, 0) / oauth1Success.length 
        : 0;
      
      console.log('\n🔒 OAuth 1.0a (HMAC-SHA1):');
      console.log(`   成功率: ${oauth1Success.length}/${oauth1Results.length} (${(oauth1Success.length/oauth1Results.length*100).toFixed(1)}%)`);
      console.log(`   平均レスポンス時間: ${oauth1AvgDuration.toFixed(1)}ms`);
      
      if (oauth1Results.some(r => !r.success)) {
        console.log('   エラー例:', oauth1Results.find(r => !r.success)?.error);
      }
    }

    // OAuth 2.0 の分析
    if (oauth2Results.length > 0) {
      const oauth2Success = oauth2Results.filter(r => r.success);
      const oauth2AvgDuration = oauth2Success.length > 0 
        ? oauth2Success.reduce((sum, r) => sum + r.duration, 0) / oauth2Success.length 
        : 0;
      
      console.log('\n🆕 OAuth 2.0 (Bearer Token):');
      console.log(`   成功率: ${oauth2Success.length}/${oauth2Results.length} (${(oauth2Success.length/oauth2Results.length*100).toFixed(1)}%)`);
      console.log(`   平均レスポンス時間: ${oauth2AvgDuration.toFixed(1)}ms`);
      
      if (oauth2Results.some(r => !r.success)) {
        console.log('   エラー例:', oauth2Results.find(r => !r.success)?.error);
      }
    }

    // 比較結果
    if (oauth1Results.length > 0 && oauth2Results.length > 0) {
      const oauth1Avg = oauth1Results.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / oauth1Results.filter(r => r.success).length;
      const oauth2Avg = oauth2Results.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) / oauth2Results.filter(r => r.success).length;
      
      console.log('\n📊 パフォーマンス比較:');
      if (oauth2Avg < oauth1Avg) {
        const improvement = ((oauth1Avg - oauth2Avg) / oauth1Avg * 100).toFixed(1);
        console.log(`   ✨ OAuth 2.0が${improvement}%高速`);
      } else if (oauth1Avg < oauth2Avg) {
        const difference = ((oauth2Avg - oauth1Avg) / oauth2Avg * 100).toFixed(1);
        console.log(`   📝 OAuth 1.0aが${difference}%高速`);
      } else {
        console.log('   ⚖️  両者のパフォーマンスは同等');
      }
    }
  }

  // セキュリティと機能比較
  showFeatureComparison(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🔐 セキュリティ・機能比較');
    console.log('='.repeat(60));

    console.log('\n🔒 OAuth 1.0a (HMAC-SHA1):');
    console.log('   ✅ 署名ベースのセキュリティ');
    console.log('   ✅ メディアアップロード対応');
    console.log('   ⚠️  実装が複雑');
    console.log('   ⚠️  HMAC-SHA1は推奨されない');

    console.log('\n🆕 OAuth 2.0 (Bearer Token + PKCE):');
    console.log('   ✅ モダンなセキュリティ標準');
    console.log('   ✅ 実装がシンプル');
    console.log('   ✅ リフレッシュトークン対応');
    console.log('   ✅ より高いレート制限');
    console.log('   ❌ メディアアップロード非対応');

    console.log('\n💡 推奨事項:');
    console.log('   📝 テキストのみの投稿: OAuth 2.0');
    console.log('   🖼️  画像/動画付き投稿: OAuth 1.0a (現在は必須)');
    console.log('   🔄 長期運用: OAuth 2.0 (リフレッシュトークン)');
  }
}

// メイン実行
async function main() {
  const command = process.argv[2] || 'full';
  const comparison = new AuthComparison();

  // 環境変数チェック
  const hasOAuth1 = X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET;
  const hasOAuth2 = X_ACCESS_TOKEN_V2;

  if (!hasOAuth1 && !hasOAuth2) {
    console.error('❌ OAuth認証情報が設定されていません');
    console.log('\n必要な環境変数:');
    console.log('OAuth 1.0a: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET');
    console.log('OAuth 2.0: X_ACCESS_TOKEN_V2');
    return;
  }

  switch (command) {
    case 'performance':
    case 'perf':
      await comparison.performanceTest(5);
      comparison.analyzeResults();
      break;

    case 'features':
      comparison.showFeatureComparison();
      break;

    case 'full':
    default:
      console.log('🔍 OAuth 1.0a vs OAuth 2.0 完全比較テスト\n');
      
      if (hasOAuth1) console.log('✅ OAuth 1.0a 認証情報: 設定済み');
      else console.log('❌ OAuth 1.0a 認証情報: 未設定');
      
      if (hasOAuth2) console.log('✅ OAuth 2.0 認証情報: 設定済み');
      else console.log('❌ OAuth 2.0 認証情報: 未設定');

      if (hasOAuth1 || hasOAuth2) {
        await comparison.performanceTest(3);
        comparison.analyzeResults();
        comparison.showFeatureComparison();
      }
      break;
  }
}

main().catch(console.error);