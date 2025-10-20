# OAuth 2.0 PKCE 移行テストガイド

このガイドでは、現在のOAuth 1.0aからOAuth 2.0 PKCEへの移行をテストする手順を説明します。

## 🎯 テストの目的

- OAuth 1.0a と OAuth 2.0 のパフォーマンス比較
- 機能・セキュリティ面での違いを確認
- 移行時の課題を事前に把握

## 📋 前提条件

### 必要なTwitter Developer設定

1. [Twitter Developer Portal](https://developer.x.com/) でアプリを確認
2. OAuth 2.0 設定を有効にする:
   - User authentication settings → OAuth 2.0 を有効化
   - App permissions: Read and Write
   - Type of App: Web App または Native App
   - Callback URI: `https://localhost:3000/callback`

### 必要な権限・スコープ

```
OAuth 2.0 スコープ:
- tweet.read    (ツイート読み取り)
- tweet.write   (ツイート投稿)
- users.read    (ユーザー情報読み取り)
- offline.access (リフレッシュトークン取得)
```

## 🚀 テスト手順

### Step 1: 環境変数の設定

```bash
# .env.example をコピー
cp .env.example .env

# 必要な値を設定（既存のOAuth 1.0a設定は保持）
```

### Step 2: OAuth 2.0認証の実行

```bash
# 1. 認証URL生成
npx tsx src/oauth2-test.ts auth

# 2. ブラウザで認証を実行（表示されたURLにアクセス）

# 3. 認証コードをアクセストークンに交換
npx tsx src/oauth2-test.ts exchange <認証コード> <code_verifier>

# 4. 取得したトークンを.envに追加
```

### Step 3: OAuth 2.0動作テスト

```bash
# 基本認証テスト
npx tsx src/oauth2-test.ts test

# トークンリフレッシュテスト
npx tsx src/oauth2-test.ts refresh
```

### Step 4: パフォーマンス比較テスト

```bash
# 完全比較テスト (パフォーマンス + 機能比較)
npx tsx src/oauth-comparison.ts

# パフォーマンスのみ
npx tsx src/oauth-comparison.ts performance

# 機能比較のみ
npx tsx src/oauth-comparison.ts features
```

## 📊 テスト内容

### パフォーマンステスト
- ユーザー情報取得のレスポンス時間
- 複数回実行での平均値・成功率
- エラー率の比較

### 機能比較
- セキュリティレベル
- 実装の複雑さ
- サポートされる機能
- レート制限の違い

## 🔍 予想されるテスト結果

### OAuth 1.0a の特徴
- ✅ メディアアップロード対応
- ✅ 安定した動作
- ⚠️ 実装が複雑（HMAC-SHA1署名）
- ⚠️ セキュリティ標準が古い

### OAuth 2.0 の特徴
- ✅ モダンなセキュリティ
- ✅ 実装がシンプル
- ✅ リフレッシュトークン
- ✅ より高いレート制限
- ❌ メディアアップロード非対応

## 📝 移行判断基準

### OAuth 2.0への移行を推奨する場合
- テキストのみのツイート投稿
- 長期間のアクセスが必要（リフレッシュトークン）
- より高いセキュリティ基準が必要
- シンプルな実装を重視

### OAuth 1.0aを継続する場合
- 画像・動画付きツイートが必要
- 既存実装が安定動作している
- メディアアップロード機能が必須

## 🛠️ トラブルシューティング

### よくある問題

1. **認証URLにアクセスできない**
   - CLIENT_IDの設定を確認
   - Twitter Developerでコールバック URLが正しく設定されているか確認

2. **トークン交換に失敗する**
   - CLIENT_SECRETの設定を確認
   - 認証コードの有効期限（10分）を確認
   - Code Verifierが正しく保存されているか確認

3. **API呼び出しエラー**
   - アクセストークンの有効期限（2時間）を確認
   - 必要なスコープが設定されているか確認
   - レート制限に引っかかっていないか確認

## 📈 テスト結果の評価

テスト完了後、以下の観点で評価してください：

1. **パフォーマンス**: どちらが高速か？
2. **安定性**: エラー率の差は？
3. **機能**: 必要な機能は満たされるか？
4. **保守性**: 実装・運用の難易度は？

## 🎯 次のステップ

テスト結果に基づいて：

1. **OAuth 2.0採用の場合**: 
   - 本番環境での段階的移行
   - メディア投稿が必要な場合の代替案検討

2. **OAuth 1.0a継続の場合**:
   - セキュリティ強化策の検討
   - 将来の移行計画策定

## 📞 サポート

- [X Developer Documentation](https://developer.x.com/en/docs)
- [OAuth 2.0 公式仕様](https://tools.ietf.org/html/rfc6749)
- [PKCE仕様](https://tools.ietf.org/html/rfc7636)