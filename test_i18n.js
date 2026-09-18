const fs = require('fs');

const en = JSON.parse(fs.readFileSync('lang/en-us.json', 'utf8'));

console.log('Data Out:' in en || 'Data Out: ' in en);
console.log('Ready' in en);
console.log('Check' in en);
