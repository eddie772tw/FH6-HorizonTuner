const fs = require('fs');
const zhPath = 'lang/zh-tw.json';
const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

// Check what strings are not translated in JA
const enPath = 'lang/en-us.json';
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const jaPath = 'lang/ja-jp.json';
const ja = JSON.parse(fs.readFileSync(jaPath, 'utf8'));

const enKeys = Object.keys(en);
const jaKeys = Object.keys(ja);
const zhKeys = Object.keys(zh);

const missingInJa = enKeys.filter(k => !jaKeys.includes(k));
const missingInZh = enKeys.filter(k => !zhKeys.includes(k));

console.log('Missing in ZH:', missingInZh);

// Check if these missing string in ja / zh are translated in another file?
