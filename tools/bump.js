// Stamp the page's own scripts and stylesheet with a new ?v= so browsers fetch them afresh after an update
// (an old fx.js kept in a browser's cache beside a new game.js broke the game once). usage: node tools/bump.js
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'robot-battle.html'), v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const html = fs.readFileSync(file, 'utf8').replace(/((?:src|href)="(?:robot-parts|sfx|fx|robo3d|battle3d|game)\.(?:js|css))(?:\?v=\d+)?"/g, `$1?v=${v}"`);
fs.writeFileSync(file, html);
console.log('v=' + v);
