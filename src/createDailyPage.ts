import 'dotenv/config';
import { Client } from '@notionhq/client';

const { NOTION_TOKEN, NOTION_DATABASE_ID } = process.env;
if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('NOTION_TOKEN / NOTION_DATABASE_ID を .env に設定してください');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// JST の YYYY-MM-DD を返す
function todayJST(): string {
  const d = new Date();
  // ロケールでJSTに変換 → ISO日付だけ抜く
  const jst = new Date(d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  return jst.toISOString().slice(0, 10);
}

async function findTodayPage(databaseId: string, datePropName = 'Date') {
  const today = todayJST();
  // Date プロパティがある場合の検索（ない場合はタイトル一致などに変えてOK）
  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: datePropName,
      date: { equals: today }
    },
    page_size: 1
  });
  return res.results[0];
}

async function createTodayPage(opts: {
  databaseId: string;
}) {
  const date = todayJST();
  const titleText = `Daily Summary ${date}`;

  const page = await notion.pages.create({
    parent: { database_id: opts.databaseId },
    properties: {
      Title: {
        title: [{ type: 'text', text: { content: titleText } }]
      },
      Date: {
        date: { start: date }
      },
      Content: {
        rich_text: [{ type: 'text', text: { content: '（ここに本文を書いてください）' } }]
      }
    }
  });

  return page;
}

async function main() {
  const databaseId = NOTION_DATABASE_ID!;
  const existing = await findTodayPage(databaseId).catch(() => undefined);

  if (existing) {
    console.log('✅ すでに本日のページがあります：', existing.id);
    return;
  }

  const page = await createTodayPage({ databaseId }).catch((e) => {
    console.error('作成に失敗:', e?.response?.data ?? e);
    process.exit(1);
  });

  console.log('🎉 本日のページを作成：', page.id);
}

main();
