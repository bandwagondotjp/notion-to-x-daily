import 'dotenv/config';
import axios from 'axios';
import { Client } from '@notionhq/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const {
  NOTION_TOKEN, NOTION_DATABASE_ID,
  X_BEARER, X_USER_ID,
  GEMINI_API_KEY
} = process.env;

if (!NOTION_TOKEN || !NOTION_DATABASE_ID) throw new Error('NOTION_TOKEN/NOTION_DATABASE_ID が未設定');
if (!X_BEARER || !X_USER_ID) throw new Error('X_BEARER/X_USER_ID が未設定');

const notion = new Client({ auth: NOTION_TOKEN });
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// ---- Env Flags ----
const USE_GEMINI   = String(process.env.USE_GEMINI || 'false') === 'true';
const DRY_RUN      = String(process.env.DRY_RUN || 'false') === 'true';
const SUMMARY_LINES = Number(process.env.SUMMARY_LINES || '0');
const SUMMARY_LANG = (process.env.SUMMARY_LANG || 'ja').toLowerCase();

const GEMINI_MAX_RPM = Number(process.env.GEMINI_MAX_RPM || '24');
const GEMINI_BATCH_SIZE = Number(process.env.GEMINI_BATCH_SIZE || '8');
const GEMINI_MIN_DELAY_MS = Math.ceil(60000 / Math.max(GEMINI_MAX_RPM, 1));

async function sleep(ms:number){ return new Promise(r=>setTimeout(r, ms)); }

// ---- Retry wrapper with exponential backoff ----
async function withRetry<T>(fn:()=>Promise<T>, label='gemini', maxAttempts=5) {
  let attempt = 0;
  let lastErr:any;
  while (attempt < maxAttempts) {
    try {
      if (attempt > 0) {
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
        const jitter = Math.random() * 400;
        await sleep(backoff + jitter);
      }
      const t0 = Date.now();
      const v = await fn();
      const spent = Date.now() - t0;
      if (spent < GEMINI_MIN_DELAY_MS) await sleep(GEMINI_MIN_DELAY_MS - spent);
      return v;
    } catch (e:any) {
      lastErr = e;
      const status = e?.response?.status || e?.status;
      if (status !== 429 && status < 500) break;
      attempt++;
    }
  }
  throw lastErr;
}

// ---- Utils ----
function todayJST() {
  const j = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  return j.toISOString().slice(0, 10);
}
function isSameJSTDate(iso: string, target: string) {
  const d = new Date(iso);
  const j = new Date(d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  return j.toISOString().slice(0,10) === target;
}

// ---- Notion: DBプロパティ ----
async function getDbProps(dbId: string) {
  const db = await notion.databases.retrieve({ database_id: dbId });
  const title = Object.entries(db.properties).find(([,v]: any)=>v?.type==='title')?.[0] ?? 'Title';
  const date  = Object.entries(db.properties).find(([,v]: any)=>v?.type==='date')?.[0] ?? 'Date';
  const rich  = Object.entries(db.properties).find(([,v]: any)=>v?.type==='rich_text')?.[0] ?? 'Content';
  return { titleProp: title, dateProp: date, richProp: rich };
}

async function updateContentProp(pageId: string, text: string) {
  const { richProp } = await getDbProps(process.env.NOTION_DATABASE_ID!);
  if (!richProp) return;
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [richProp]: { rich_text: [{ type: 'text', text: { content: text } }] }
    }
  });
}

// ---- 今日のページ取得/作成 ----
async function getOrCreateTodayPage(dbId: string) {
  const { titleProp, dateProp } = await getDbProps(dbId);
  const today = todayJST();

  const q = await notion.databases.query({
    database_id: dbId,
    filter: { property: dateProp, date: { equals: today } },
    page_size: 1
  });
  if (q.results[0]) return { pageId: q.results[0].id };

  const page = await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      [titleProp]: { title: [{ type: 'text', text: { content: `Daily Summary ${today}` } }] },
      [dateProp]:  { date: { start: today } }
    }
  });

  await notion.blocks.children.append({
    block_id: page.id,
    children: [
      { object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: `${today} のまとめ` } }] } }
    ]
  });

  await updateContentProp(page.id, '（本日のまとめを生成中…）');
  return { pageId: page.id };
}

// ---- X API ----
type RetweetItem = {
  url: string;
  authorName: string;
  authorUsername: string;
  text: string;
  myRtCreatedAt: string;
};

async function fetchTodaysRetweets(): Promise<RetweetItem[]> {
  const url = `https://api.twitter.com/2/users/${X_USER_ID}/tweets`;
  const params = {
    'max_results': 100,
    'tweet.fields': 'created_at,referenced_tweets,text,author_id',
    'expansions': 'referenced_tweets.id,referenced_tweets.id.author_id,author_id',
    'user.fields': 'name,username'
  };
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${X_BEARER}` },
    params
  });

  const data = res.data || {};
  const myTweets = (data.data || []) as any[];
  const includes = data.includes || {};
  const includeTweets = (includes.tweets || []) as any[];
  const includeUsers  = (includes.users  || []) as any[];

  const tmap = new Map(includeTweets.map((t:any)=>[t.id, t]));
  const umap = new Map(includeUsers.map((u:any)=>[u.id, u]));

  const today = todayJST();
  const results: RetweetItem[] = [];

  for (const t of myTweets) {
    const ref = (t.referenced_tweets || []).find((r:any)=>r.type === 'retweeted');
    if (!ref) continue;
    if (!isSameJSTDate(t.created_at, today)) continue;

    const orig = tmap.get(ref.id) || {};
    const author = umap.get(orig.author_id) || {};

    const username = author.username ? String(author.username) : '';
    const twUrl = username ? `https://x.com/${username}/status/${orig.id ?? ref.id}` :
                             `https://x.com/i/web/status/${orig.id ?? ref.id}`;

    const text = (orig.text ?? '').replace(/\s+/g, ' ').trim();

    results.push({
      url: twUrl,
      authorName: author.name ?? '',
      authorUsername: username,
      text,
      myRtCreatedAt: t.created_at
    });
  }

  results.sort((a,b)=> new Date(a.myRtCreatedAt).getTime() - new Date(b.myRtCreatedAt).getTime());
  return results;
}

// ---- Gemini: バッチ要約 ----
async function batchSummarize(items: RetweetItem[]): Promise<string[]> {
  if (!USE_GEMINI || SUMMARY_LINES <= 0 || !genAI) return items.map(()=> '（要約なし）');
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const lines = Math.min(Math.max(SUMMARY_LINES, 1), 3);

  const out: string[] = [];
  for (let i=0; i<items.length; i += GEMINI_BATCH_SIZE) {
    const chunk = items.slice(i, i + GEMINI_BATCH_SIZE);
    const numbered = chunk.map((it, idx) => `${idx+1}. ${it.text}`).join('\n');

    const prompt =
      `次の${chunk.length}件のテキストを、それぞれ${lines}文で要約してください。` +
      `言語は必ず${SUMMARY_LANG}（日本語）で出力してください。\n` +
      `出力は ${chunk.length} 行、各行は「n) 要約文」で返してください。\n` +
      `テキスト:\n${numbered}`;

    const respText = await withRetry(async () => {
      const r = await model.generateContent(prompt);
      return (await r.response.text())?.trim() || '';
    }, 'gemini-batch');

    const parsed: string[] = [];
    const re = /^\s*(\d+)\)\s*(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(respText)) !== null) {
      parsed[Number(m[1])-1] = m[2].trim();
    }
    if (parsed.length !== chunk.length) {
      const linesRaw = respText.split('\n').filter(s=>s.trim());
      for (let j=0; j<chunk.length; j++) {
        parsed[j] = linesRaw[j]?.trim() || '（要約なし）';
      }
    }
    out.push(...parsed);
  }
  return out;
}

async function summarizePage(items: RetweetItem[]): Promise<string> {
  const fallback = `RT: ${items.length}件（${todayJST()}）`;
  if (!USE_GEMINI || SUMMARY_LINES <= 0 || !genAI) return fallback;

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const joined = items.slice(0, 8).map(it => `・${it.text}`).join('\n');
  const lines = Math.min(Math.max(SUMMARY_LINES, 2), 3);
  const prompt =
    `次の内容を${lines}文で要約してください。必ず${SUMMARY_LANG}（日本語）で出力してください。\n${joined}`;

  try {
    const t = await withRetry(async () => {
      const r = await model.generateContent(prompt);
      return (await r.response.text())?.trim() || '';
    }, 'gemini-page');
    return t || fallback;
  } catch {
    return fallback;
  }
}

// ---- Notion: 箇条書き書き込み ----
async function appendItems(pageId: string, items: RetweetItem[]) {
  const summaries = await batchSummarize(items);

  if (DRY_RUN) {
    console.log('--- DRY_RUN 出力 ---');
    items.forEach((it, idx) => {
      console.log([
        it.url,
        `投稿者: ${it.authorName}${it.authorUsername ? ` (@${it.authorUsername})` : ''}`,
        `本文: ${it.text}`,
        `要約: ${summaries[idx]}`
      ].join('\n'));
      console.log('--------------------------------');
    });
    return;
  }

  const children: any[] = [];
  for (let i=0; i<items.length; i++) {
    const it = items[i];
    const summary = (summaries[i] || '（要約なし）').replace(/\n/g, '\n        ');
    const lines = [
      `${it.url}`,
      `投稿者: ${it.authorName}${it.authorUsername ? ` (@${it.authorUsername})` : ''}`,
      `本文: ${it.text}`,
      `要約: ${summary}`
    ].join('\n');

    children.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ type: 'text', text: { content: lines } }] }
    });

    if (children.length === 90) {
      await notion.blocks.children.append({ block_id: pageId, children });
      children.length = 0;
      await sleep(400);
    }
  }
  if (children.length) {
    await notion.blocks.children.append({ block_id: pageId, children });
  }
}

// ---- main ----
async function main() {
  const dbId = NOTION_DATABASE_ID!;
  const { pageId } = await getOrCreateTodayPage(dbId);

  const rts = await fetchTodaysRetweets();
  if (!rts.length) {
    await updateContentProp(pageId, `RT: 0件（${todayJST()}）`);
    console.log('本日JSTのリポストは0件でした。');
    return;
  }

  await appendItems(pageId, rts);

  const fallback = `RT: ${rts.length}件（${todayJST()}）`;
  const pageSummary = (USE_GEMINI && SUMMARY_LINES > 0)
    ? await summarizePage(rts)
    : fallback;

  await updateContentProp(pageId, pageSummary);
  console.log(`✅ 完了: ${rts.length}件を追加、Content更新=${pageSummary}`);
}

main().catch(e => {
  console.error(e?.response?.data ?? e);
  process.exit(1);
});
