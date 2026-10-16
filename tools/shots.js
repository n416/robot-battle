// Screenshots for the README: tools/shoot.js opens the game with ?shot=<scene> in headless Chrome; this plays up to
// that scene and freezes every animation there (requestAnimationFrame stops), so the screenshot catches it.
(() => {
  const scene = new URLSearchParams(location.search).get('shot');
  if (!scene) return;
  const sl = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  const freeze = async () => { await sl(150); window.requestAnimationFrame = () => 0; document.title = 'FROZEN'; };   // (a few frames first: a fresh render's canvases are drawn on the next frame)
  const at = +(new URLSearchParams(location.search).get('at') || 0);
  const start = async () => { $('#startBtn').click(); await sl(500); $('.vsSplash') && $('.vsSplash').click(); };
  const toHangar = async () => { await start(); await sl(7500); $('#autoBtn').click(); };
  const toSortie = async () => { await toHangar(); await sl(9000); $('#designBtn').click(); await sl(4500); };
  const S = {
    title: async () => { await sl(at || 1500); },
    vs: async () => { $('#startBtn').click(); await sl(at || 1200); },
    deal: async () => { await start(); await sl(at || 5600); },
    hangar: async () => { await toHangar(); await sl(at || 3900); },
    sortie: async () => { await toSortie(); $('[data-pick="0"]').click(); await sl(at || 900); },
    battle: async () => {
      await sl(300);
      BATTLE.play({ title: '第1試合　1戦目',
        me: { models: { head: 'geo3', upper: 'geo3', lower: 'geo3' }, scheme: 'tricolor', st: { s: 4, a: 4, d: 3 }, face: 'faces/face01.webp', name: 'あなた', label: 'ROBOT 1（最強）', weapon: 'ビームライフル', line: 'いっけぇーっ！' },
        cpu: { models: { head: 'tsui2', upper: 'tsui2', lower: 'tsui2' }, scheme: 'crimson', st: { s: 2, a: 3, d: 2 }, face: 'faces/face05.webp', name: 'カイ', label: '機体A（中堅）', weapon: 'ジャイアントバズ', line: '負けないよ！' },
        flow: { r: 1, first: 'me', steps: [{ by: 'me', hit: true }] } });
      await sl(at || 9000);
    },
  };
  addEventListener('load', async () => { await sl(200); await (S[scene] || S.title)(); freeze(); });
})();
