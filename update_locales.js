const fs = require('fs');

const EN_PATH = 'lang/en-us.json';
const JA_PATH = 'lang/ja-jp.json';
const ZH_PATH = 'lang/zh-tw.json';

const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
const ja = JSON.parse(fs.readFileSync(JA_PATH, 'utf8'));
const zh = JSON.parse(fs.readFileSync(ZH_PATH, 'utf8'));

// Delete dead key "UDP ACTIVE" from en-us
if (en['UDP ACTIVE']) {
  delete en['UDP ACTIVE'];
}

// Add 'Lite application sections'
zh['Lite application sections'] = '精簡版應用程式區塊';
ja['Lite application sections'] = 'Lite アプリケーションセクション';

// Function to sort object keys
function sortObject(obj) {
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
}

// Write back sorted
fs.writeFileSync(EN_PATH, JSON.stringify(sortObject(en), null, 2) + '\n');
fs.writeFileSync(JA_PATH, JSON.stringify(sortObject(ja), null, 2) + '\n');
fs.writeFileSync(ZH_PATH, JSON.stringify(sortObject(zh), null, 2) + '\n');

console.log('Done.');
