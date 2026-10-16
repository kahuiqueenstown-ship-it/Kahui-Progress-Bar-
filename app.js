(() => {
  'use strict';

  // Fallbacks used when the data/*.json files can't be fetched (e.g. opened straight from disk).
  const DEFAULT_GOAL = {
    overline: 'The 2027 Mission',
    title: 'Schoolies × Rugby World Cup',
    subtitle: 'Gold Coast · Australia · 2027',
    goal: 20000,
    symbol: '$',
    currency: 'NZD',
    saveBy: '2027-09-30',
    events: [
      { label: 'Rugby World Cup', note: 'kicks off', date: '2027-10-01' },
      { label: 'Schoolies', note: 'starts', date: '2027-11-20' }
    ]
  };
  const DEFAULT_PROGRESS = { saved: 0, updated: null, source: 'manual' };
  const LS_KEY = 'mission2027.local';
  const REFRESH_MS = 2 * 60 * 1000;
  const FONT = 'Outfit, system-ui, -apple-system, "Segoe UI", sans-serif';

  const params = new URLSearchParams(location.search);
  const reducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STATIC = params.has('static') || reducedMotion;
  if (params.has('wallpaper')) document.body.classList.add('wallpaper');

  let goalCfg = { ...DEFAULT_GOAL };
  let shared = { ...DEFAULT_PROGRESS };
  let sharedLoaded = false;
  let local = loadLocal();

  // ---------- data ----------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch { /* storage blocked */ }
  }
  async function fetchJSON(path) {
    try {
      const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
  async function refreshShared() {
    const [g, p] = await Promise.all([fetchJSON('data/goal.json'), fetchJSON('data/progress.json')]);
    if (g) goalCfg = { ...DEFAULT_GOAL, ...g };
    if (p) { shared = { ...DEFAULT_PROGRESS, ...p }; sharedLoaded = true; }
    dirty = true;
  }

  function parseDate(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  }

  function getState() {
    const goal = num(params.get('goal')) ?? num(local.goal) ?? goalCfg.goal;
    const saveBy = parseDate(local.saveBy || goalCfg.saveBy);
    let saved, updated, source;
    if (params.has('saved')) {
      saved = num(params.get('saved')) || 0; updated = null; source = 'preview';
    } else if (local.mode === 'local') {
      saved = num(local.saved) || 0; updated = local.updated; source = 'this laptop';
    } else {
      saved = num(shared.saved) || 0; updated = shared.updated; source = shared.source;
    }
    return { ...goalCfg, goal, saveBy, saved, updated, source };
  }

  // ---------- formatting ----------
  const nf = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 0 });
  const money = (st, v) => st.symbol + nf.format(Math.round(v));
  const short = (st, v) => st.symbol + (v >= 1000 ? (Math.round(v / 100) / 10).toString().replace(/\.0$/, '') + 'k' : nf.format(v));
  const fmtDate = (d, withDay) => d.toLocaleDateString('en-NZ',
    withDay ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const DAY = 864e5;
  function daysUntil(d) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d - now) / DAY);
  }

  // ---------- drawing helpers ----------
  function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function text(ctx, str, x, y, { size, weight = 400, color = '#fff', align = 'center', spacing = 0, shadow = 0 }) {
    ctx.save();
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = shadow; ctx.shadowOffsetY = shadow / 6; }
    // letterSpacing adds trailing space; nudge centred text back.
    ctx.fillText(str, align === 'center' ? x + spacing / 2 : x, y);
    ctx.restore();
  }

  // ---------- scene ----------
  function drawSky(ctx, W, H, hz, t, S) {
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#05071a');
    sky.addColorStop(0.35, '#120f3c');
    sky.addColorStop(0.62, '#33195a');
    sky.addColorStop(0.82, '#8f3570');
    sky.addColorStop(0.94, '#ea6c6c');
    sky.addColorStop(1, '#ffb06a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hz + 1);

    const r = rng(7);
    for (let i = 0; i < 190; i++) {
      const x = r() * W, y = r() * hz * 0.62, s = (r() * 1.3 + 0.35) * Math.max(S, 0.6);
      const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + r() * 1.6) + r() * 6.28);
      ctx.globalAlpha = tw * (1 - y / (hz * 0.66)) * 0.9;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return sky;
  }

  function drawSun(ctx, W, hz, S, sky) {
    const cx = W / 2, R = 132 * S;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip();
    const disc = ctx.createLinearGradient(0, hz - R, 0, hz);
    disc.addColorStop(0, '#ffe9a6'); disc.addColorStop(0.6, '#ffa36e'); disc.addColorStop(1, '#ff6f7d');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(cx, hz, R, Math.PI, 0); ctx.fill();
    // Retro sunset stripes, cut with the sky gradient itself so they read as gaps.
    ctx.fillStyle = sky;
    for (let i = 0; i < 6; i++) {
      const h = (1.2 + i * 1.1) * S;
      const y = hz - R * 0.5 + i * (R * 0.5 / 6) + i * 1.2 * S;
      ctx.fillRect(cx - R, y, R * 2, h);
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(cx, hz, R * 0.4, cx, hz, R * 3.4);
    glow.addColorStop(0, 'rgba(255,170,110,0.42)'); glow.addColorStop(1, 'rgba(255,120,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - R * 3.4, hz - R * 3.4, R * 6.8, R * 3.4);
  }

  function drawSkyline(ctx, W, hz, S) {
    const r = rng(42);
    ctx.fillStyle = '#2a1347';
    let x = W * 0.03;
    const windows = [];
    while (x < W * 0.33) {
      const w = (10 + r() * 18) * S;
      const near = 1 - Math.abs((x - W * 0.2) / (W * 0.18));
      let h = (8 + r() * 26 + Math.max(0, near) * 42 * r()) * S;
      if (x > W * 0.19 && x < W * 0.19 + w + 1) h = 96 * S; // Q1-ish tower
      ctx.fillRect(x, hz - h, w, h);
      if (h === 96 * S) ctx.fillRect(x + w / 2 - 1 * S, hz - h - 26 * S, 2 * S, 26 * S);
      for (let wy = hz - h + 4 * S; wy < hz - 3 * S; wy += 5 * S)
        for (let wx = x + 2 * S; wx < x + w - 2 * S; wx += 4 * S)
          if (r() < 0.16) windows.push([wx, wy]);
      x += w + r() * 3 * S;
    }
    ctx.fillStyle = 'rgba(255,214,140,0.55)';
    for (const [wx, wy] of windows) ctx.fillRect(wx, wy, 1.4 * S, 1.6 * S);
  }

  function drawOcean(ctx, W, H, hz, S, t) {
    const sea = ctx.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, '#4a2160'); sea.addColorStop(0.35, '#1c1240'); sea.addColorStop(1, '#070818');
    ctx.fillStyle = sea;
    ctx.fillRect(0, hz, W, H - hz);
    const cx = W / 2, R = 132 * S;
    for (let i = 0; i < 18; i++) {
      const y = hz + 3 * S + i * 6 * S * (1 + i * 0.14);
      const w = R * 1.55 * (1 - i / 21) * (0.82 + 0.18 * Math.sin(t * 1.2 + i * 1.7));
      const off = Math.sin(t * 0.7 + i * 0.9) * 7 * S;
      ctx.fillStyle = `rgba(255,178,122,${0.5 * (1 - i / 19)})`;
      ctx.fillRect(cx - w / 2 + off, y, w, Math.max(1, 2 * S));
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = Math.max(1, S);
    for (let i = 0; i < 9; i++) {
      const y = hz + 14 * S + i * i * 3.2 * S;
      const phase = (t * 14 * S * (1 + i * 0.2)) % (160 * S);
      ctx.setLineDash([40 * S * (1 + i * 0.3), 120 * S]);
      ctx.lineDashOffset = -phase;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function frond(ctx, x0, y0, ang, len, droop, wid) {
    const tx = x0 + Math.cos(ang) * len, ty = y0 + Math.sin(ang) * len + droop;
    const mx = x0 + Math.cos(ang) * len * 0.5, my = y0 + Math.sin(ang) * len * 0.5 - len * 0.18;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx * wid, my + ny * wid, tx, ty);
    ctx.quadraticCurveTo(mx - nx * wid * 0.25, my - ny * wid * 0.25, x0, y0);
    ctx.fill();
  }

  function palm(ctx, x, base, h, lean, S, t, seed) {
    const topX = x + lean * h, topY = base - h;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineCap = 'round';
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps;
      const px = (p) => x + lean * h * p * p, py = (p) => base - h * p;
      ctx.lineWidth = (13 - 7 * a) * S;
      ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
    }
    const sway = Math.sin(t * 0.6 + seed) * 0.03;
    const angs = [-3.0, -2.6, -2.2, -1.85, -1.25, -0.9, -0.5, -0.1, 0.25, 2.85];
    angs.forEach((a, i) => {
      const len = (h * 0.42) * (0.8 + 0.25 * Math.sin(i * 2.3 + seed));
      frond(ctx, topX, topY, a + sway, len, len * 0.35, 16 * S);
    });
    ctx.beginPath(); ctx.arc(topX, topY + 4 * S, 7 * S, 0, 6.283); ctx.fill();
  }

  function drawShore(ctx, W, H, S, t) {
    const sandY = H * 0.935;
    ctx.fillStyle = '#06051a';
    ctx.beginPath();
    ctx.moveTo(0, sandY + 8 * S);
    ctx.bezierCurveTo(W * 0.3, sandY - 16 * S, W * 0.7, sandY + 20 * S, W, sandY - 8 * S);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    palm(ctx, W * 0.045, sandY + 6 * S, 340 * S, 0.24, S, t, 1);
    palm(ctx, W * 0.115, sandY + 2 * S, 245 * S, -0.12, S, t, 4);
    palm(ctx, W * 0.965, sandY - 4 * S, 210 * S, -0.2, S, t, 9);

    // Rugby posts on the beach
    const px = W * 0.885, ground = sandY + 2 * S, gap = 74 * S, hgt = 250 * S, bar = 78 * S;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 5 * S;
    ctx.strokeStyle = '#06051a';
    ctx.beginPath();
    ctx.moveTo(px - gap / 2, ground); ctx.lineTo(px - gap / 2, ground - hgt);
    ctx.moveTo(px + gap / 2, ground); ctx.lineTo(px + gap / 2, ground - hgt);
    ctx.moveTo(px - gap / 2, ground - bar); ctx.lineTo(px + gap / 2, ground - bar);
    ctx.stroke();
    ctx.fillStyle = '#06051a';
    ctx.fillRect(px - gap / 2 - 5 * S, ground - 34 * S, 10 * S, 34 * S);
    ctx.fillRect(px + gap / 2 - 5 * S, ground - 34 * S, 10 * S, 34 * S);
  }

  function rugbyBall(ctx, x, y, size, t, S) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.42 + Math.sin(t * 1.4) * 0.05);
    ctx.shadowColor = 'rgba(255,170,120,0.9)';
    ctx.shadowBlur = 22 * S;
    const g = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd9c2');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.62, 0, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ff5a7a';
    ctx.lineWidth = Math.max(1, 1.6 * S);
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.98, size * 0.22, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    ctx.strokeStyle = '#7a2a3a';
    ctx.lineWidth = Math.max(1, 1.4 * S);
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * size * 0.13, -size * 0.3); ctx.lineTo(i * size * 0.13, -size * 0.12); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-size * 0.3, -size * 0.21); ctx.lineTo(size * 0.3, -size * 0.21); ctx.stroke();
    ctx.restore();
  }

  function drawContent(ctx, W, H, S, st, t) {
    const cx = W / 2;
    const pct = st.goal > 0 ? st.shown / st.goal : 0;
    const done = st.saved >= st.goal;
    const remaining = Math.max(0, st.goal - st.saved);

    text(ctx, (done ? 'Mission funded — Australia, here we come' : st.overline).toUpperCase(), cx, H * 0.155,
      { size: 15 * S, weight: 600, color: 'rgba(255,205,160,0.9)', spacing: 6 * S });

    ctx.save();
    ctx.font = `700 ${60 * S}px ${FONT}`;
    const tw = ctx.measureText(st.title).width;
    const tg = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.55, '#ffe6cf'); tg.addColorStop(1, '#ffb59a');
    ctx.restore();
    text(ctx, st.title, cx, H * 0.215, { size: 60 * S, weight: 700, color: tg, shadow: 24 * S });
    text(ctx, st.subtitle, cx, H * 0.255, { size: 20 * S, weight: 300, color: 'rgba(255,255,255,0.7)', spacing: 1.5 * S });

    text(ctx, money(st, st.shown), cx, H * 0.375, { size: 124 * S, weight: 800, color: '#fff', shadow: 30 * S, spacing: -2 * S });
    text(ctx, `saved of our ${money(st, st.goal)} ${st.currency} goal`, cx, H * 0.415,
      { size: 21 * S, weight: 400, color: 'rgba(255,255,255,0.66)' });

    // Progress bar
    const bw = Math.min(1040 * S, W * 0.84), bh = 26 * S, bx = cx - bw / 2, by = H * 0.475;
    text(ctx, done ? 'Goal reached!' : `${money(st, remaining)} to go`, bx, by - 14 * S,
      { size: 18 * S, weight: 600, color: 'rgba(255,255,255,0.85)', align: 'left' });
    text(ctx, `${(Math.min(pct, 9.99) * 100).toFixed(pct < 0.1 ? 1 : 0)}%`, bx + bw, by - 14 * S,
      { size: 24 * S, weight: 700, color: '#ffc77a', align: 'right' });

    rr(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, S); ctx.stroke();

    const fw = bw * Math.max(0, Math.min(1, pct));
    if (fw > 0.5) {
      const fg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      fg.addColorStop(0, '#ffd56b'); fg.addColorStop(0.55, '#ff8a5b'); fg.addColorStop(1, '#ff4d8d');
      ctx.save();
      ctx.shadowColor = 'rgba(255,120,110,0.65)'; ctx.shadowBlur = 26 * S;
      rr(ctx, bx, by, Math.max(fw, bh), bh, bh / 2);
      ctx.fillStyle = fg; ctx.fill();
      ctx.restore();
      // shimmer
      ctx.save();
      rr(ctx, bx, by, Math.max(fw, bh), bh, bh / 2); ctx.clip();
      const sx = bx + ((t * 0.22) % 1.5 - 0.25) * bw;
      const sh = ctx.createLinearGradient(sx - 120 * S, 0, sx + 120 * S, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.38)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(bx, by, bw, bh);
      const hl = ctx.createLinearGradient(0, by, 0, by + bh);
      hl.addColorStop(0, 'rgba(255,255,255,0.28)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl; ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
    }

    // Quarter milestones
    [0.25, 0.5, 0.75, 1].forEach((q) => {
      const mx = bx + bw * q, hit = pct >= q - 1e-9;
      if (q < 1) {
        ctx.fillStyle = hit ? 'rgba(80,20,40,0.35)' : 'rgba(255,255,255,0.22)';
        ctx.fillRect(mx - 0.75 * S, by + 6 * S, 1.5 * S, bh - 12 * S);
      }
      text(ctx, short(st, st.goal * q), q === 1 ? bx + bw : mx, by + bh + 28 * S,
        { size: 14 * S, weight: hit ? 700 : 400, color: hit ? '#ffd56b' : 'rgba(255,255,255,0.45)', align: q === 1 ? 'right' : 'center' });
    });
    if (st.bump) {
      const a = st.bumpAge < 4.5 ? 1 : 1 - (st.bumpAge - 4.5) / 1.5;
      text(ctx, `+${money(st, st.bump)}`, bx + Math.min(bw - bh, Math.max(fw, bh)), by - 18 * S - Math.min(st.bumpAge, 1.5) * 14 * S,
        { size: 22 * S, weight: 700, color: `rgba(255,213,107,${Math.max(0, a)})`, shadow: 12 * S });
    }
    rugbyBall(ctx, bx + Math.min(bw - bh * 0.4, Math.max(fw, bh * 0.5)), by + bh / 2, bh * 0.95, t, S);

    // Stat chips
    const chips = [];
    const weeks = st.saveBy ? (st.saveBy - Date.now()) / (7 * DAY) : 0;
    if (done) chips.push({ label: 'Status', value: 'Fully funded', sub: 'Book the flights!' });
    else if (weeks > 0) chips.push({ label: 'To save each week', value: money(st, Math.ceil(remaining / weeks)), sub: `to hit it by ${fmtDate(st.saveBy)}` });
    else chips.push({ label: 'Still to save', value: money(st, remaining), sub: 'save-by date has passed' });
    (st.events || []).slice(0, 2).forEach((ev) => {
      const d = parseDate(ev.date), n = daysUntil(d);
      chips.push({
        label: ev.label,
        value: n > 1 ? `${nf.format(n)} days` : n === 1 ? 'Tomorrow' : n === 0 ? 'Today!' : "It's on!",
        sub: `${ev.note || ''} ${fmtDate(d, true)}`.trim()
      });
    });
    const cw = 282 * S, ch = 98 * S, gap = 22 * S;
    const total = chips.length * cw + (chips.length - 1) * gap;
    const cy = H * 0.6;
    chips.forEach((c, i) => {
      const x = cx - total / 2 + i * (cw + gap);
      rr(ctx, x, cy, cw, ch, 18 * S);
      ctx.fillStyle = 'rgba(12,8,36,0.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = Math.max(1, S); ctx.stroke();
      text(ctx, c.label.toUpperCase(), x + cw / 2, cy + 28 * S, { size: 12 * S, weight: 600, color: 'rgba(255,205,160,0.85)', spacing: 3 * S });
      text(ctx, c.value, x + cw / 2, cy + 63 * S, { size: 31 * S, weight: 700, color: '#fff' });
      text(ctx, c.sub, x + cw / 2, cy + 85 * S, { size: 13 * S, weight: 400, color: 'rgba(255,255,255,0.58)' });
    });

    const src = { xero: 'synced from Xero', manual: 'updated by hand', 'this laptop': 'saved on this laptop', preview: 'preview' }[st.source] || st.source;
    const when = st.updated ? `Updated ${fmtDate(new Date(st.updated))} · ` : '';
    text(ctx, when + src, cx, by + bh + 58 * S, { size: 13 * S, weight: 400, color: 'rgba(255,255,255,0.42)', spacing: 0.5 * S });
  }

  function draw(ctx, W, H, st, t) {
    const S = Math.min(W / 1600, H / 1000);
    const hz = H * 0.79;
    const sky = drawSky(ctx, W, H, hz, t, S);
    drawSun(ctx, W, hz, S, sky);
    drawSkyline(ctx, W, hz, S);
    drawOcean(ctx, W, H, hz, S, t);
    drawShore(ctx, W, H, S, t);
    drawContent(ctx, W, H, S, st, t);
  }

  // ---------- live canvas ----------
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  let dirty = true;
  const anim = { from: 0, to: null, t0: 0 };
  let bump = null;
  const ease = (x) => 1 - Math.pow(1 - x, 3);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    dirty = true;
  }

  let last = 0;
  const t0 = performance.now();
  function frame(now) {
    if (!STATIC) requestAnimationFrame(frame);
    if (!STATIC && now - last < 33 && !dirty) return; // ~30fps keeps laptops cool
    last = now;
    dirty = false;
    const st = getState();
    if (anim.to !== st.saved) {
      if (anim.to !== null && st.saved > anim.to) bump = { amount: st.saved - anim.to, t0: now };
      anim.from = anim.to === null ? 0 : anim.from + (anim.to - anim.from) * ease(Math.min(1, (now - anim.t0) / 1800));
      anim.to = st.saved; anim.t0 = now;
    }
    const p = STATIC ? 1 : ease(Math.min(1, (now - anim.t0) / 1800));
    st.shown = anim.from + (anim.to - anim.from) * p;
    if (bump && now - bump.t0 < 6000) { st.bump = bump.amount; st.bumpAge = (now - bump.t0) / 1000; }
    draw(ctx, canvas.width, canvas.height, st, STATIC ? 2 : (now - t0) / 1000);
  }
  function kick() { dirty = true; if (STATIC) requestAnimationFrame(frame); }

  // ---------- panel ----------
  const $ = (id) => document.getElementById(id);
  const panel = $('panel');
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function fillPanel() {
    const st = getState();
    const mode = local.mode === 'local' ? 'local' : 'shared';
    document.querySelectorAll('input[name=mode]').forEach((r) => { r.checked = r.value === mode; });
    $('saved').value = mode === 'local' ? (num(local.saved) ?? st.saved) : st.saved;
    $('saved').disabled = $('deposit').disabled = $('addDeposit').disabled = mode !== 'local';
    $('goal').value = st.goal;
    $('saveBy').value = local.saveBy || goalCfg.saveBy;
    $('sharedInfo').textContent = mode === 'shared'
      ? (sharedLoaded
        ? `Showing ${money(st, shared.saved)} from data/progress.json (${shared.source}). Switch to "This laptop" to type your own number.`
        : 'Couldn’t load data/progress.json (opened from disk?). Switch to "This laptop" to enter amounts here.')
      : 'Only this laptop sees these numbers.';
  }
  function openPanel() { fillPanel(); panel.classList.add('open'); }
  function closePanel() { panel.classList.remove('open'); }

  $('gear').addEventListener('click', openPanel);
  $('close').addEventListener('click', closePanel);
  document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => {
    local.mode = r.value;
    if (r.value === 'local' && local.saved === undefined) local.saved = num(shared.saved) || 0;
    saveLocal(); fillPanel(); kick();
  }));
  $('addDeposit').addEventListener('click', () => {
    const d = num($('deposit').value);
    if (!d) return;
    local.mode = 'local';
    local.saved = (num(local.saved) || 0) + d;
    local.updated = new Date().toISOString();
    saveLocal(); $('deposit').value = ''; fillPanel(); kick();
    toast(`Added ${money(getState(), d)} — nice!`);
  });
  $('save').addEventListener('click', () => {
    if (local.mode === 'local') {
      const s = num($('saved').value);
      if (s !== null && s !== num(local.saved)) { local.saved = s; local.updated = new Date().toISOString(); }
    }
    const g = num($('goal').value);
    local.goal = g && g !== goalCfg.goal ? g : undefined;
    local.saveBy = $('saveBy').value && $('saveBy').value !== goalCfg.saveBy ? $('saveBy').value : undefined;
    saveLocal(); kick(); closePanel(); toast('Saved');
  });
  $('reset').addEventListener('click', () => {
    local = {}; saveLocal(); fillPanel(); kick(); toast('Back to the shared numbers');
  });

  // Wallpaper PNG export
  const dpr = window.devicePixelRatio || 1;
  const sizes = [
    [Math.round(screen.width * dpr), Math.round(screen.height * dpr), 'This screen'],
    [1920, 1080, 'Full HD laptop'], [2560, 1440, 'QHD'], [2560, 1600, 'MacBook Air 13"'],
    [2880, 1864, 'MacBook Air 15"'], [3024, 1964, 'MacBook Pro 14"'], [3456, 2234, 'MacBook Pro 16"'], [3840, 2160, '4K']
  ];
  $('res').innerHTML = sizes.map(([w, h, n], i) => `<option value="${i}">${n} — ${w} × ${h}</option>`).join('');
  $('download').addEventListener('click', () => {
    const [w, h] = sizes[+$('res').value];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const st = getState(); st.shown = st.saved;
    draw(c.getContext('2d'), w, h, st, 2);
    c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `mission-2027-wallpaper-${w}x${h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });

  // Show the gear briefly whenever the mouse moves.
  let wakeTimer;
  addEventListener('mousemove', () => {
    document.body.classList.add('awake');
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => document.body.classList.remove('awake'), 3000);
  });
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'e' || e.key === 'E') panel.classList.contains('open') ? closePanel() : openPanel();
    if (e.key === 'Escape') closePanel();
  });
  addEventListener('resize', () => { resize(); kick(); });

  // ---------- boot ----------
  (async () => {
    resize();
    try { await Promise.race([document.fonts.load(`800 100px Outfit`), new Promise((r) => setTimeout(r, 2500))]); } catch { /* offline */ }
    await refreshShared();
    requestAnimationFrame(frame);
    const pull = () => refreshShared().then(kick);
    setInterval(pull, REFRESH_MS);
    // Laptop lid opened / wallpaper shown again / Wi-Fi back: fetch straight away.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
    addEventListener('focus', pull);
    addEventListener('online', pull);
    setInterval(kick, 60 * 1000); // keeps countdowns current in static mode
  })();
})();
