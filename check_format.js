const fs = require('fs');

const EN_PATH = 'lang/en-us.json';

const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
console.log('En keys:', Object.keys(en).length);
