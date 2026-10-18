// Sound: ex-online sfx / bgm (audio/*.mp3) through Web Audio. Unlocked on the first tap.
window.SFX = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, sfxBus = null, bgmBus = null, bgmSrc = null, muted = false;
  const buf = {}, loading = {};
  // music and effects each 0..1 (the music's own level under that: BGM_BASE); kept in the browser
  const BGM_BASE = .32, SFX_BASE = .8;
  let vol = { bgm: .8, sfx: .9 };
  try { muted = localStorage.getItem('rb-mute') === '1'; vol = Object.assign(vol, JSON.parse(localStorage.getItem('rb-vol') || '{}')); } catch (e) {}
  const bgmLevel = () => BGM_BASE * vol.bgm;
  function init() {
    if (ctx || !AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    // a little compression so stacked explosions stay loud without clipping
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_BASE * vol.sfx; sfxBus.connect(comp);
    bgmBus = ctx.createGain(); bgmBus.gain.value = bgmLevel(); bgmBus.connect(master);
  }
  function load(name) {
    if (!ctx) return Promise.resolve(null);
    if (buf[name]) return Promise.resolve(buf[name]);
    return loading[name] || (loading[name] = fetch('audio/' + name + '.mp3').then(r => r.arrayBuffer()).then(a => new Promise((ok, ng) => ctx.decodeAudioData(a, ok, ng))).then(b => (buf[name] = b)).catch(() => null));
  }
  const PRELOAD = ['gacha_lock_a', 'gacha_lock_b', 'gacha_lock_c', 'gacha_lock_d', 'gacha_on', 'gacha_down', 'clamp_1', 'clamp_2', 'beep_1', 'beep_2',
    'techok_1', 'techgreat_1', 'techcome_1', 'techfail_1', 'techwork_1', 'catapult_1', 'ignite_1', 'thrust_1', 'jet_1', 'beam_1', 'beam_2', 'gun_1', 'gun_2',
    'sniper_1', 'rocket_1', 'charge_1', 'swing_1', 'saberhit_1', 'impact_1', 'impact_2', 'explosion_1', 'explosion_2', 'destroyed_1', 'runway_1', 'hum_1'];
  function unlock() {
    init(); if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    PRELOAD.forEach(load);
  }
  // play(name, {vol, rate, delay, pan})
  function play(name, o = {}) {
    if (!ctx) return;
    load(name).then(b => {
      if (!b) return;
      const s = ctx.createBufferSource(); s.buffer = b;
      s.playbackRate.value = (o.rate || 1) * (o.jitter === false ? 1 : 1 + (Math.random() - .5) * .06);
      const g = ctx.createGain(); g.gain.value = o.vol == null ? 1 : o.vol;
      let node = g;
      if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); node = p; }
      s.connect(g); node.connect(sfxBus);
      s.start(ctx.currentTime + (o.delay || 0));
    });
  }
  // synthesized blips for things the library has no sound for (card ticks, counters, fanfare)
  function tone(freq, dur = .08, o = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || .12, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(g); g.connect(sfxBus); osc.start(t); osc.stop(t + dur + .02);
  }
  function fanfare(big) {
    const notes = big ? [523, 659, 784, 1047, 784, 1047, 1319] : [659, 784, 1047];
    notes.forEach((f, i) => { tone(f, .16, { delay: i * .09, type: 'square', vol: .09 }); tone(f / 2, .16, { delay: i * .09, type: 'triangle', vol: .12 }); });
  }
  function bgm(on = true) {
    if (!ctx) return;
    if (!on) { if (bgmSrc) { const s = bgmSrc; bgmBus.gain.setTargetAtTime(0, ctx.currentTime, .3); setTimeout(() => { try { s.stop(); } catch (e) {} bgmBus.gain.value = bgmLevel(); }, 1500); bgmSrc = null; } return; }
    if (bgmSrc) return;
    load('bgm').then(b => { if (!b || bgmSrc) return; const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(bgmBus); s.start(); bgmSrc = s; });
  }
  // duck the music under big moments
  function duck(level = .12, time = 1.2) { if (!ctx) return; const t = ctx.currentTime; bgmBus.gain.cancelScheduledValues(t); bgmBus.gain.setTargetAtTime(Math.min(level, bgmLevel()), t, .05); bgmBus.gain.setTargetAtTime(bgmLevel(), t + time, .4); }
  function setMuted(m) { muted = m; try { localStorage.setItem('rb-mute', m ? '1' : '0'); } catch (e) {} if (master) master.gain.value = m ? 0 : 1; }
  function setVolume(kind, v) {
    vol[kind] = Math.max(0, Math.min(1, v)); try { localStorage.setItem('rb-vol', JSON.stringify(vol)); } catch (e) {}
    if (!ctx) return;
    const t = ctx.currentTime, g = kind === 'bgm' ? bgmBus.gain : sfxBus.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(kind === 'bgm' ? bgmLevel() : SFX_BASE * vol.sfx, t, .03);
  }
  return { unlock, play, tone, fanfare, bgm, duck, setMuted, setVolume, get muted() { return muted; }, get volume() { return { ...vol }; } };
})();
