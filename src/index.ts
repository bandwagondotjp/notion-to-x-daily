import 'dotenv/config';
import { Client } from '@notionhq/client';
import axios from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// ====== 環境変数 ======
const {
  NOTION_TOKEN,
  NOTION_SOURCE_PAGE_ID,
  NOTION_PUBLIC_URL,

  X_API_KEY,
  X_API_SECRET,
  X_ACCESS_TOKEN,
  X_ACCESS_SECRET
} = process.env;

if (!NOTION_TOKEN || !NOTION_SOURCE_PAGE_ID) {
  console.error('NOTION_TOKEN / NOTION_SOURCE_PAGE_ID が未設定です。');
  process.exit(1);
}
if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
  console.error('XのAPIキー類が未設定です（X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET）。');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// ====== X (OAuth1.0a) クライアント ======
const oauth = new OAuth({
  consumer: { key: X_API_KEY!, secret: X_API_SECRET! },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

const token = { key: X_ACCESS_TOKEN!, secret: X_ACCESS_SECRET! };

async function getPageBlocks(pageId: string) {
  const blocks: any[] = [];
  let cursor: string | undefined = undefined;

  while (true) {
    const res = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor
    });
    blocks.push(...res.results);
    if (!res.has_more) break;
    cursor = res.next_cursor ?? undefined;
  }
  return blocks;
}

// Notionのリッチテキスト配列 → プレーン文字列
function rtToPlain(rt: any[] = []) {
  return rt.map(r => r?.plain_text ?? '').join('');
}

// ブロックから「要点候補」を抽出（上位3件）
function extractHighlights(blocks: any[]) {
  type Item = { text: string; url?: string; priority: number };

  const items: Item[] = [];

  for (const b of blocks) {
    switch (b.type) {
      case 'heading_1':
      case 'heading_2':
      case 'heading_3': {
        const t = rtToPlain(b[b.type].rich_text);
        if (t) items.push({ text: `【${t}】`, priority: 1 });
        break;
      }
      case 'bulleted_list_item':
      case 'numbered_list_item': {
        const t = rtToPlain(b[b.type].rich_text);
        const url = b[b.type].rich_text?.find((r: any) => r?.href)?.href;
        if (t) items.push({ text: t, url, priority: 2 });
        break;
      }
      case 'paragraph': {
        const t = rtToPlain(b.paragraph.rich_text);
        const url = b.paragraph.rich_text?.find((r: any) => r?.href)?.href;
        // 短い段落だけ候補に
        if (t && t.length <= 120) items.push({ text: t, url, priority: 3 });
        break;
      }
      case 'bookmark': {
        const url = b.bookmark?.url;
        if (url) items.push({ text: 'リンク', url, priority: 2 });
        break;
      }
      default:
        break;
    }
  }

  // 見出し > 箇条書き > 段落 の優先 + 先頭から採用
  const top = items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 8); // 一旦8件まで候補
  return top;
}

// 文字数制限に合わせて短文化（和文対応のざっくりクリップ）
function clip(s: string, max = 60) {
  const arr = [...s];
  return arr.length > max ? arr.slice(0, max).join('') + '…' : s;
}

// ツイート文生成（要約+リンク最大3件／超過はスレッド化）
function buildTweets(highlights: { text: string; url?: string }[], publicUrl?: string) {
  const date = new Date();
  const jstDate = new Date(date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }))
    .toISOString().slice(0,10);

  // 1ツイート目：キャッチ + 1〜2件
  const headItems = highlights.slice(0, 2).map((h, i) => {
    const t = clip(h.text, 50);
    return h.url ? `${i+1}. ${t} ${h.url}` : `${i+1}. ${t}`;
  });

  let first = `#日次まとめ ${jstDate}\n` + headItems.join('\n');
  if (publicUrl) {
    // 末尾に詳細リンク（文字数を見て場合分け）
    if ((first + `\n詳細→ ${publicUrl}`).length <= 270) {
      first += `\n詳細→ ${publicUrl}`;
    }
  }

  const tweets: string[] = [first];

  // 残りはスレッド化
  const rest = highlights.slice(2);
  if (rest.length) {
    const chunked: string[][] = [];
    let cur: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const h = rest[i];
      const text = clip(h.text, 80);
      const line = h.url ? `・${text}\n${h.url}` : `・${text}`;
      // 1ツイート当たりざっくり 250字上限で詰める
      const joined = [...cur, line].join('\n');
      if (joined.length > 250) {
        if (cur.length) chunked.push(cur);
        cur = [line];
      } else {
        cur.push(line);
      }
    }
    if (cur.length) chunked.push(cur);
    for (const c of chunked) tweets.push(c.join('\n'));
  }

  return tweets;
}

// Xにツイート投稿（スレッド対応）
async function postTweets(tweets: string[]) {
  let replyTo: string | undefined = undefined;
  for (const bodyText of tweets) {
    const url = 'https://api.twitter.com/2/tweets';
    const body: any = { text: bodyText };
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };

    const reqData = {
      url,
      method: 'POST',
      data: JSON.stringify(body)
    };
    const headers = {
      ...oauth.toHeader(oauth.authorize(reqData, token)),
      'Content-Type': 'application/json'
    };

    const res = await axios.post(url, body, { headers });
    const id = res.data?.data?.id;
    if (!id) throw new Error('Tweet post failed (no id).');
    replyTo = id;
  }
}

async function main() {
  // Notionページ直下のブロックを取得
  const blocks = await getPageBlocks(NOTION_SOURCE_PAGE_ID!);
  if (!blocks.length) {
    console.log('Notionページにブロックが見つかりませんでした。');
    return;
  }

  // 要点抽出 → 上位3〜6件を採用
  const top = extractHighlights(blocks).slice(0, 6);
  if (!top.length) {
    console.log('要約候補が見つからず、投稿をスキップしました。');
    return;
  }

  // ツイート文生成（1 + スレッド）
  const tweets = buildTweets(top, NOTION_PUBLIC_URL);
  await postTweets(tweets);
  console.log(`Posted ${tweets.length} tweet(s).`);
}

main().catch(e => {
  console.error(e?.response?.data ?? e);
  process.exit(1);
});
