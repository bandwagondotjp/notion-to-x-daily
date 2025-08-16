import 'dotenv/config';
import axios from 'axios';

const { X_BEARER } = process.env;
if (!X_BEARER) throw new Error('X_BEARER が未設定');

const USERNAME = process.argv[2]; // 例: node src/resolveXUserId.ts your_username
if (!USERNAME) {
  console.log('使い方: npx tsx src/resolveXUserId.ts your_username');
  process.exit(1);
}

async function main() {
  const url = `https://api.twitter.com/2/users/by/username/${USERNAME}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${X_BEARER}` },
    params: { 'user.fields': 'id,username,name' }
  });
  console.log(res.data);
}

main().catch(e => {
  console.error(e?.response?.data ?? e);
  process.exit(1);
});
