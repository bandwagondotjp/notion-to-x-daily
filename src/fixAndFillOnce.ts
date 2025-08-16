import 'dotenv/config';
import { Client } from '@notionhq/client';

const { NOTION_TOKEN, NOTION_DATABASE_ID } = process.env;
if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
  console.error('NOTION_TOKEN / NOTION_DATABASE_ID が未設定');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

function todayJST() {
  const j = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  return j.toISOString().slice(0, 10);
}

async function main() {
  console.log('ENV CHECK:', {
    NOTION_DATABASE_ID,
    NOTION_TOKEN: NOTION_TOKEN ? '(set)' : '(missing)',
  });

  // DBメタとプロパティ
  const db = await notion.databases.retrieve({ database_id: NOTION_DATABASE_ID! });
  console.log('DB ID:', db.id);
  console.log('DB Title:', db.title?.[0]?.plain_text ?? '(no title)');
  console.log('Props:');
  for (const [k, v] of Object.entries(db.properties)) {
    // @ts-ignore
    console.log(`- ${k}: ${v.type}`);
  }
  const titleProp = Object.entries(db.properties).find(([,v]: any)=>v?.type==='title')?.[0] ?? 'Title';
  const dateProp  = Object.entries(db.properties).find(([,v]: any)=>v?.type==='date')?.[0] ?? 'Date';
  const richProp  = Object.entries(db.properties).find(([,v]: any)=>v?.type==='rich_text')?.[0]; // 例: Content

  // 既存行の確認（最大5件）
  const list = await notion.databases.query({
    database_id: NOTION_DATABASE_ID!,
    page_size: 5,
  });
  console.log(`Rows found: ${list.results.length}`);

  let pageId: string | undefined;

  if (list.results.length === 0) {
    console.log('→ 行が0なので、今日の行を新規作成します。');
    const today = todayJST();
    const page = await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID! },
      properties: {
        [titleProp]: { title: [{ type: 'text', text: { content: `Daily Summary ${today}` } }] },
        [dateProp]:  { date: { start: today } }
      }
    });
    pageId = page.id;
    console.log('Created page:', pageId);
  } else {
    pageId = list.results[0].id;
    console.log('Use first page:', pageId);
  }

  // Content を強制更新（テスト文字列）
  if (!richProp) {
    console.warn('⚠️ rich_text プロパティが見つかりません（Notion側で「テキスト」列を1つ作ってください。例: Content）');
    return;
  }
  await notion.pages.update({
    page_id: pageId!,
    properties: {
      [richProp]: {
        rich_text: [{ type: 'text', text: { content: `テスト書き込み: ${new Date().toLocaleString('ja-JP')}` } }]
      }
    }
  });
  console.log(`✅ Content(${richProp}) を更新しました。Notionで確認してください。`);
}

main().catch(e => {
  console.error('ERROR:', e?.response?.data ?? e);
  process.exit(1);
});
