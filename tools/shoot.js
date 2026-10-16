// README screenshots: plays each scene in headless Chrome (real time) through tools/shots.js and saves docs/<scene>.jpg.
//   usage: node tools/shoot.js [scene[:ms]] ...   (no scenes: all of them; ms: when to freeze, see tools/shots.js)
//   needs puppeteer-core (npm i puppeteer-core; NODE_PATH may point at it), Chrome at $CHROME and a server on the
//   project at $PORT (python -m http.server 8767)
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = process.env.PORT || 8767, OUT = process.env.OUT || path.join(root, 'docs');
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['title', 'vs', 'deal', 'hangar', 'sortie', 'battle'];
const page = fs.readFileSync(path.join(root, 'robot-battle.html'), 'utf8').replace('<script src="game.js"></script>', '<script src="game.js"></script>\n<script src="tools/shots.js"></script>');
fs.writeFileSync(path.join(root, 'shots.html'), page);
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  try {
    fs.mkdirSync(OUT, { recursive: true });
    for (const s of scenes) {
      const [name, ms = 0] = s.split(':');
      const p = await browser.newPage();
      await p.setViewport({ width: +process.env.W || 1280, height: +process.env.H || 800 });
      await p.goto(`http://localhost:${PORT}/shots.html?shot=${name}&at=${ms}`, { waitUntil: 'load' });
      await p.waitForFunction(() => document.title === 'FROZEN', { timeout: 90000 });
      const file = path.join(OUT, name + '.jpg');
      await p.screenshot({ path: file, type: 'jpeg', quality: 85 });
      console.log(file);
      await p.close();
    }
  } finally { await browser.close(); fs.unlinkSync(path.join(root, 'shots.html')); }
})();
