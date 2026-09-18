const fs = require('fs');

const en = JSON.parse(fs.readFileSync('lang/en-us.json', 'utf8'));

console.log('Testing more un-translated keys:');
const checkKeys = ['Data Out:', 'Data Out: '];

for (let k of checkKeys) {
    console.log(k, k in en);
}
