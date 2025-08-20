
# notion-to-x-daily

X（旧Twitter）で**自分がリポストした投稿**を収集し、**Notionデータベースに日次で保存**するスクリプト群です。  
オプションで Gemini を使った**2〜3行の日本語要約**も付けられます。GitHub Actions での自動実行に対応。

---

## 機能

- Notion データベースに「日ごとのまとめページ」を自動作成（`createDailyPage.ts`）  
- 自分の**リポスト（Retweet/ Repost）**のみを抽出し、リンク・投稿者・本文を整形して保存（`fillDailyFromX.ts`）  
- （任意）Gemini で**2〜3行の日本語要約**を生成して末尾に追記  
- **時間帯のウィンドウ**で収集範囲を分割（01:00/13:00 の2回運用など）  
- GitHub Actions で**自動実行**（Secrets対応、キーはリポジトリに含めない）

---

## ディレクトリ構成

```
notion-to-x-daily/
├── src/
│   ├── createDailyPage.ts      # Notionに「今日のページ」を作成
│   ├── fillDailyFromX.ts       # Xから自分のリポストを取り込み、Notionに保存
│   ├── resolveXUserId.ts       # @username から数値の user_id を解決（補助）
│   ├── fixAndFillOnce.ts       # ページ作成 + 保存を1回で試すユーティリティ
│   └── index.ts                # まとめて実行する場合のエントリーポイント（任意）
├── .github/
│   └── workflows/
│       └── daily.yml           # 自動実行のワークフロー例（任意）
├── package.json
├── tsconfig.json
└── .gitignore                  # .env / node_modules を除外
```

> 🔐 **セキュリティ**: `.env` は必ず `.gitignore` 済みです。**APIキーやトークンをコミットしないでください。**

---

## 事前準備（Notion 側）

1. **Notion に Internal Integration を作成**し、**「シークレットトークン」**を控える  
2. まとめを保存する **データベース** を用意（プロパティ名は *Title / Date / Content*）  
3. 作成した Integration を **そのデータベースに招待（Members → Invite）**  
   - 権限: **Read + Write**（ページ作成・更新に必要）

---

## 事前準備（X API 側）

- X Developer Portal で **Bearer Token** と **自分の数値ユーザーID** を用意  
- プランにより**月間上限**が異なります。検証時はすぐ枠切れする可能性があるので、運用前にご確認ください。

---

## インストール

```bash
npm install
```

---

## 環境変数（.env）

プロジェクト直下に `.env` を作成します。値はご自身のものに置き換えてください。

```bash
# Notion
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # ハイフン有りOK

# X / Twitter
X_BEARER=xxxxxxxxxxxxxxxxxxxxxxxx
X_USER_ID=1234567890

# Gemini（要約を使う場合のみ）
GEMINI_API_KEY=yyyyyyyyyyyyyyyy
USE_GEMINI=true
SUMMARY_LINES=3        # 2 or 3 を推奨
SUMMARY_LANG=ja        # 'ja' 推奨

# 収集ウィンドウ（任意）
# DAILY_YESTERDAY: 昨日0:00〜24:00
# HALF_AM_TODAY:   今日0:00〜13:00
# HALF_PM_YESTERDAY: 昨日13:00〜24:00
RUN_MODE=DAILY_YESTERDAY
```

> 補足: `RUN_MODE` を使わない場合はデフォルト挙動（当日分）でも動作しますが、01:00/13:00 の**半日運用**に分けると件数が減って安定しやすいです。

---

## 使い方（ローカル実行）

```bash
# 1) Notionに「今日のページ」を作る
npx tsx src/createDailyPage.ts

# 2) Xからリポストを取得して、Notionの Content に追記
npx tsx src/fillDailyFromX.ts
```

> はじめは **USE_GEMINI=false / SUMMARY_LINES=0** にして挙動確認 → 問題なければ要約ONを推奨。

---

## GitHub Actions（自動実行）

`.github/workflows/daily.yml` の例：

```yaml
name: Daily Retweets to Notion

on:
  schedule:
    - cron: "0 16 * * *"   # JST 01:00（昨日の後半 → HALF_PM_YESTERDAY）
    - cron: "0 4 * * *"    # JST 13:00（今日の前半 → HALF_AM_TODAY）
  workflow_dispatch: {}

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci

      - name: Run HALF_AM_TODAY
        if: github.event.schedule == '0 4 * * *'
        env:
          RUN_MODE: HALF_AM_TODAY
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          X_BEARER: ${{ secrets.X_BEARER }}
          X_USER_ID: ${{ secrets.X_USER_ID }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          USE_GEMINI: "true"
          SUMMARY_LINES: "3"
          SUMMARY_LANG: "ja"
        run: npx tsx src/fillDailyFromX.ts

      - name: Run HALF_PM_YESTERDAY
        if: github.event.schedule == '0 16 * * *'
        env:
          RUN_MODE: HALF_PM_YESTERDAY
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
          X_BEARER: ${{ secrets.X_BEARER }}
          X_USER_ID: ${{ secrets.X_USER_ID }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          USE_GEMINI: "true"
          SUMMARY_LINES: "3"
          SUMMARY_LANG: "ja"
        run: npx tsx src/fillDailyFromX.ts
```

### Secrets の設定（必須）
- `NOTION_TOKEN` / `NOTION_DATABASE_ID`  
- `X_BEARER` / `X_USER_ID`  
- （任意）`GEMINI_API_KEY`

> GitHub の **Settings → Secrets and variables → Actions** から登録します。  
> **Secrets を直接コードに書かない** でください。

---


---

## 🔐 GitHub Actions の環境変数管理（ベストプラクティス）

### Secrets（必ず Secrets に入れるもの）
- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `X_BEARER`
- `X_USER_ID`
- （任意）`GEMINI_API_KEY`

👉 API キーやトークンは外部に漏れると危険なので、**必ず Secrets に登録**します。  
GitHub の **Settings → Secrets and variables → Actions → New repository secret** から追加してください。

### Vars（Vars に入れると便利なもの）
- `USE_GEMINI` （true/false）
- `SUMMARY_LINES` （2 / 3 / 0=要約なし）
- `SUMMARY_LANG` （ja / en など）
- `RUN_MODE` （DAILY_YESTERDAY / HALF_AM_TODAY / HALF_PM_YESTERDAY）

👉 機密性は低いが、運用ごとに変わる設定値は Vars に入れるのがおすすめです。  
GitHub の **Settings → Secrets and variables → Actions → Variables** から追加できます。

---

## 修正版 GitHub Actions 例

```yaml
env:
  # Secrets（必須）
  NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
  NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
  X_BEARER: ${{ secrets.X_BEARER }}
  X_USER_ID: ${{ secrets.X_USER_ID }}
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

  # Vars（推奨）
  USE_GEMINI: ${{ vars.USE_GEMINI }}
  SUMMARY_LINES: ${{ vars.SUMMARY_LINES }}
  SUMMARY_LANG: ${{ vars.SUMMARY_LANG }}
  RUN_MODE: ${{ vars.RUN_MODE }}
```


## トラブルシュート

- `UsageCapExceeded / 429`  
  - X APIの**月間上限**に到達。実行頻度や取得件数を見直すか、プランを上げる。  
- `validation_error: Name is not a property that exists.`  
  - Notion DB のプロパティ名が**Title/Date/Content**と一致しているか確認。  
- `X_BEARER/X_USER_ID が未設定`  
  - `.env` の値、Actions の Secrets を再確認。
- 要約が失敗／遅い  
  - `USE_GEMINI=false` で安定化 → 後でONに戻す。`SUMMARY_LINES` を2にすると短く安定。

---

## ライセンス / 注意

- 本リポジトリには **APIキー等の秘密情報は含めません**。`.env` は各自で作成してください。  
- 各サービス（X/Notion/Gemini）の**利用規約・レート制限**に従って運用してください。

---

## クレジット

- Notion SDK: `@notionhq/client`  
- Gemini SDK: `@google/generative-ai`  
- その他: `axios`, `dotenv`, `tsx` etc.
