// Copia o app web (pasta ../ramifica) para www/, que vira o conteúdo do app Android.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'ramifica'), dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: p => !/README\.md$/.test(p) });
console.log('Copiado para www/');
