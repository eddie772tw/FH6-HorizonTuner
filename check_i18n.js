const fs = require('fs');

const en = JSON.parse(fs.readFileSync('lang/en-us.json', 'utf8'));
const ja = JSON.parse(fs.readFileSync('lang/ja-jp.json', 'utf8'));
const zh = JSON.parse(fs.readFileSync('lang/zh-tw.json', 'utf8'));

const enKeys = Object.keys(en);
const jaKeys = Object.keys(ja);
const zhKeys = Object.keys(zh);

const missingInJa = enKeys.filter(k => !jaKeys.includes(k));
const missingInZh = enKeys.filter(k => !zhKeys.includes(k));

console.log('Missing in JA:', missingInJa);
console.log('Missing in ZH:', missingInZh);
