/* futbol-analiz-reel engine
 * window.STORY (build.py üretir) -> DOM + tek bir GSAP timeline (window.__timelines.root)
 * Her sahne: arka plan + görsel (type) + altyazılar. Görselin "adımları" (steps) altyazı başlangıçlarına bağlıdır:
 * 1. altyazı başladığında step 0, 2. altyazıda step 1 ... Böylece seslendirme ile grafik kendiliğinden senkron olur.
 * Deterministik: Math.random yok, CSS animasyonu yok, her şey timeline üzerinde.
 */
(function () {
  "use strict";
  const S = window.STORY;
  const W = 1080, H = 1920;
  const stage = document.getElementById("stage");
  const tl = gsap.timeline({ paused: true });
  const NS = "http://www.w3.org/2000/svg";

  const PALETTE = { w: "#F4F2EC", y: "#FFD21F", r: "#FF4040", g: "#3DDC84", b: "#5AA0FF", o: "#FF9F1C", grey: "#8A8A8A" };
  const THEMES = {
    dark: ["#2c2c30", "#0b0b0d"], black: ["#151515", "#000000"], maroon: ["#5c1c1c", "#150808"],
    gold: ["#c08a22", "#3b2708"], blue: ["#4470d0", "#0f1e48"], green: ["#1f7048", "#061a0e"], navy: ["#1d2f66", "#060b1d"]
  };
  const teams = S.teams || {};
  function col(c, fallback) {
    if (!c) return fallback || PALETTE.w;
    if (c === "home" || c === "away") return teams[c] ? teams[c].color : PALETTE.w;
    if (c === "homeDark" || c === "awayDark") { const t = teams[c.replace("Dark", "")]; return t ? t.dark : "#111"; }
    return PALETTE[c] || c;
  }
  const up = (s) => String(s).toLocaleUpperCase("tr-TR");

  // ---------- helpers ----------
  function el(tag, cls, parent, style, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) Object.assign(e.style, style);
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function sv(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function rng(seed) { // mulberry32
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function stepT(ctx, i) { // adım zamanı: altyazı yoksa sahne içinde eşit dağıt
    if (ctx.steps.length === 0) return ctx.t0 + 0.4 + i * 1.2;
    if (i < ctx.steps.length) return ctx.steps[i];
    return Math.min(ctx.t1 - 0.4, ctx.steps[ctx.steps.length - 1] + 0.9 * (i - ctx.steps.length + 1));
  }
  // sayı sayacı: innerText tween (seek ile deterministik)
  function counter(span, to, t, dur, decimals) {
    const d = decimals || 0;
    span.textContent = (0).toFixed(d);
    // innerText tween + modifiers: geri sarma/seek'te de doğru değer (callback'e güvenmez)
    tl.fromTo(span, { innerText: 0 }, { innerText: Number(to), duration: dur, ease: "power2.out",
      modifiers: { innerText: (v) => Number(v).toFixed(d) } }, t);
  }
  function source(parent, text) { if (text) el("div", "src mono", parent, null, esc(up(text))); }

  // ---------- grain ----------
  const grainSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  el("div", "grain", stage, { backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(grainSvg)}")` });
  el("div", "vign", stage);

  // ---------- pitch geometry (field coords: x 0..68 across, y 0..105, y=0 = top goal line) ----------
  function circlePts(cx, cy, r, a0, a1, n) {
    const p = []; n = n || 40;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return p;
  }
  function pitchShapes() { // polylines in field coords
    const L = [];
    L.push([[0, 0], [68, 0], [68, 105], [0, 105], [0, 0]]);
    L.push([[0, 52.5], [68, 52.5]]);
    L.push(circlePts(34, 52.5, 9.15, 0, Math.PI * 2, 60));
    for (const top of [true, false]) {
      const s = top ? 1 : -1, g = top ? 0 : 105;
      L.push([[13.84, g], [13.84, g + s * 16.5], [54.16, g + s * 16.5], [54.16, g]]);
      L.push([[24.84, g], [24.84, g + s * 5.5], [43.16, g + s * 5.5], [43.16, g]]);
      // D arc
      const a = Math.acos(5.5 / 9.15);
      L.push(top ? circlePts(34, 11, 9.15, Math.PI / 2 - a, Math.PI / 2 + a, 16) : circlePts(34, 94, 9.15, -Math.PI / 2 - a, -Math.PI / 2 + a, 16));
      // goal
      L.push([[30.34, g], [30.34, g - s * 2.2], [37.66, g - s * 2.2], [37.66, g]]);
    }
    return L;
  }
  const SPOTS = [[34, 52.5], [34, 11], [34, 94]];

  // flat pitch (top-down), returns mapper
  function flatPitch(parent, o) {
    // o: left, top, width ; yRange [y0,y1]
    const y0 = o.y0 != null ? o.y0 : -3, y1 = o.y1 != null ? o.y1 : 108;
    const sc = o.width / 72; // 68 + margin
    const hpx = (y1 - y0) * sc;
    const svg = sv("svg", { width: o.width, height: hpx, viewBox: `-2 ${y0} 72 ${y1 - y0}` }, parent);
    svg.style.position = "absolute"; svg.style.left = o.left + "px"; svg.style.top = o.top + "px";
    if (o.clip) svg.style.overflow = "hidden";
    const g = sv("g", { class: "glowline" }, svg);
    const lines = [];
    for (const pts of pitchShapes()) {
      const pl = sv("polyline", { points: pts.map(p => p.join(",")).join(" "), class: "pl", pathLength: 1 }, g);
      if (o.stroke) pl.style.strokeWidth = o.stroke;
      lines.push(pl);
    }
    for (const s of SPOTS) sv("circle", { cx: s[0], cy: s[1], r: .35, fill: "#fff" }, g);
    const map = (x, y) => [o.left + (x + 2) * sc, o.top + (y - y0) * sc];
    return { svg, g, lines, sc, map, top: o.top, height: hpx };
  }

  // perspective camera: projects field coords to screen px; o: yNear, yFar, back, nearY, farY, nearWidth, cx
  function camera(o) {
    const b = o.back, span = o.yNear - o.yFar;
    const A = (o.nearY - o.farY) / (1 / b - 1 / (b + span));
    const hz = o.nearY - A / b;
    const F = o.nearWidth * b / 68;
    const yCam = o.yNear + b;
    const cx = o.cx || 540;
    return {
      p(x, y, h) { const z = Math.max(0.5, yCam - y); const sy = hz + A / z - (h ? F * h / z : 0); return [cx + F * (x - 34) / z, sy]; },
      scale(y) { return F / Math.max(0.5, yCam - y); },
      yCam
    };
  }
  function perspPitch(parent, cam, o) {
    o = o || {};
    const svg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent);
    svg.style.position = "absolute"; svg.style.left = "0"; svg.style.top = "0";
    const g = sv("g", { class: "glowline" }, svg);
    const lines = [];
    const yMax = cam.yCam - 3;
    for (const pts of pitchShapes()) {
      // densify + clip
      const dense = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        const n = 12;
        for (let k = 0; k <= n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
      const vis = dense.filter(p => p[1] < yMax && (o.yMin == null || p[1] >= o.yMin));
      if (vis.length < 2) continue;
      const pl = sv("polyline", { points: vis.map(p => cam.p(p[0], p[1]).map(v => v.toFixed(1)).join(",")).join(" "), pathLength: 1 }, g);
      pl.setAttribute("style", `fill:none;stroke:#fff;stroke-width:${o.stroke || 3};stroke-linecap:round;stroke-linejoin:round`);
      lines.push(pl);
    }
    // net on goals (simple)
    for (const gy of [0, 105]) {
      if (gy >= yMax) continue;
      const pts = [[30.34, gy], [37.66, gy]];
      const [a, b] = pts.map(p => cam.p(p[0], p[1]));
      const hgt = cam.p(34, gy, 2.44)[1] - cam.p(34, gy)[1];
      const net = sv("g", { opacity: .85 }, g);
      sv("rect", { x: a[0], y: a[1] + hgt, width: b[0] - a[0], height: -hgt, fill: "none", stroke: "#fff", "stroke-width": (o.stroke || 3) * 1.2 }, net);
      for (let i = 1; i < 12; i++) { const x = a[0] + (b[0] - a[0]) * i / 12; sv("line", { x1: x, x2: x, y1: a[1] + hgt, y2: a[1], stroke: "#fff", "stroke-width": .8, opacity: .6 }, net); }
      for (let i = 1; i < 4; i++) { const y = a[1] + hgt * i / 4; sv("line", { x1: a[0], x2: b[0], y1: y, y2: y, stroke: "#fff", "stroke-width": .8, opacity: .6 }, net); }
    }
    return { svg, g, lines };
  }
  function drawLines(lines, t, dur) {
    lines.forEach((l, i) => {
      tl.fromTo(l, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur || 0.9, ease: "power2.inOut" }, t + i * 0.025);
    });
  }

  // ---------- shot generation (attacking the y=0 goal) ----------
  function genShots(team, seedKey) {
    const n = team.shots || 0, onT = team.on_target || 0;
    const goals = (team.goals || []).slice();
    const r = rng(hashStr(seedKey));
    let shots = [];
    for (let i = 0; i < n; i++) {
      const q = r();
      const dist = 6 + Math.pow(q, 1.3) * 24;
      const ang = (r() - 0.5) * (1.9 - dist / 30);
      const x = clamp(34 + Math.sin(ang) * dist * 1.15, 6, 62), y = clamp(Math.cos(ang) * dist, 3.5, 34);
      const xg = clamp(0.62 * Math.exp(-dist / 7.5) + 0.02, 0.02, 0.8);
      shots.push({ x, y, xg });
    }
    if (team.shot_list) shots = team.shot_list.map(s => ({ x: s.x, y: s.y, xg: s.xg || 0.08, minute: s.minute, outcome: s.outcome }));
    else {
      shots.sort((a, b) => b.xg - a.xg);
      if (team.xg) { const sum = shots.reduce((s, a) => s + a.xg, 0) || 1; shots.forEach(s => s.xg = s.xg * team.xg / sum); }
      // goals = best chances, on target next; geri kalan sırası karışık
      shots.forEach((s, i) => { s.outcome = i < goals.length ? "goal" : (i < onT ? "on" : "off"); });
      goals.forEach((g, i) => { shots[i] && (shots[i].minute = g.minute, shots[i].player = g.player); });
      const rr = rng(hashStr(seedKey + "o"));
      shots = shots.map(s => [rr(), s]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
    }
    return shots;
  }

  // =====================================================================
  // VISUAL TYPES
  // =====================================================================
  const V = {};

  // --- score-hook: kale tel-kafes + gol topları + dev skor ---
  V["score-hook"] = function (root, p, ctx) {
    const gx = 120, gy = 640, gw = 840, gh = 290, depth = 46;
    const svg = sv("svg", { width: W, height: H }, root); svg.style.position = "absolute"; svg.style.left = 0; svg.style.top = 0;
    const g = sv("g", { class: "glowline" }, svg);
    const ls = [];
    // ground line
    ls.push(sv("line", { x1: -20, x2: W + 20, y1: gy + gh, y2: gy + gh, stroke: "#fff", "stroke-width": 3, pathLength: 1 }, g));
    // back frame (inset), net
    const net = sv("g", { opacity: .55 }, g);
    for (let x = gx + depth; x <= gx + gw - depth + 1; x += 34) sv("line", { x1: x, x2: x, y1: gy + depth * .6, y2: gy + gh, stroke: "#fff", "stroke-width": 1.4 }, net);
    for (let y = gy + depth * .6; y <= gy + gh; y += 30) sv("line", { x1: gx + depth, x2: gx + gw - depth, y1: y, y2: y, stroke: "#fff", "stroke-width": 1.4 }, net);
    for (const [x1, x2] of [[gx, gx + depth], [gx + gw, gx + gw - depth]]) {
      sv("line", { x1, x2, y1: gy, y2: gy + depth * .6, stroke: "#fff", "stroke-width": 2 }, net);
      for (let y = gy; y <= gy + gh; y += 30) sv("line", { x1, x2, y1: y, y2: y + depth * .6 * (1 - (y - gy) / gh), stroke: "#fff", "stroke-width": 1.2 }, net);
    }
    // front frame
    ls.push(sv("polyline", { points: `${gx},${gy + gh} ${gx},${gy} ${gx + gw},${gy} ${gx + gw},${gy + gh}`, fill: "none", stroke: "#fff", "stroke-width": 9, pathLength: 1 }, g));
    drawLines(ls, ctx.t0 + 0.1, 0.8);
    tl.from(net, { opacity: 0, duration: 0.6 }, ctx.t0 + 0.4);

    // goals
    const goals = p.goals || [];
    const r = rng(hashStr("hook" + (p.score || "")));
    goals.forEach((go, i) => {
      const tt = (go.step != null ? stepT(ctx, go.step) : ctx.t0 + 0.7) + i * 0.45;
      const tx = gx + depth + 40 + r() * (gw - 2 * depth - 80), ty = gy + 110 + r() * (gh - 150);
      const sx = 540 + (r() - 0.5) * 500, sy = 1980;
      const color = col(go.team === "home" ? "home" : go.team === "away" ? "away" : go.color || "r");
      const trail = sv("line", { x1: sx, y1: sy, x2: tx, y2: ty, stroke: color, "stroke-width": 10, "stroke-linecap": "round", pathLength: 1, opacity: .9 }, svg);
      trail.style.filter = `drop-shadow(0 0 10px ${color})`;
      const ball = sv("g", {}, svg);
      sv("circle", { cx: 0, cy: 0, r: 17, fill: "#fff" }, ball);
      sv("circle", { cx: 0, cy: 0, r: 6, fill: "#222" }, ball);
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; sv("circle", { cx: 12 * Math.cos(a), cy: 12 * Math.sin(a), r: 3, fill: "#222" }, ball); }
      tl.fromTo(trail, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" }, tt);
      tl.to(trail, { opacity: 0, duration: 0.6 }, tt + 0.55);
      tl.fromTo(ball, { x: sx, y: sy, scale: 3.2, opacity: 0 }, { x: tx, y: ty, scale: 1, opacity: 1, duration: 0.45, ease: "power2.out" }, tt);
      const tag = el("div", "tag", root, { left: tx + "px", top: ty - 52 + "px", background: color, color: go.team === "home" && teams.home && teams.home.textDark ? "#111" : "#fff" }, esc(up(go.label || go.minute + "'")));
      tl.from(tag, { scale: 0, opacity: 0, duration: 0.3, ease: "back.out(2.5)" }, tt + 0.4);
    });

    // giant score
    const parts = String(p.score || "0–0").split(/[-–]/);
    const bs = el("div", "bigscore", root, { top: (p.scoreTop || 1030) + "px" },
      `<span>${esc(parts[0])}</span><span style="color:${col(ctx.accent)};text-shadow:0 0 40px ${col(ctx.accent)}">–</span><span>${esc(parts[1] || "")}</span>`);
    const st = p.scoreStep != null ? stepT(ctx, p.scoreStep) : ctx.t0 + 0.25;
    tl.fromTo(bs, { scale: 1.5, opacity: 0, y: 40 }, { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: "expo.out" }, st);
    if (p.meta) {
      const m = el("div", "meta mono", root, { top: (p.scoreTop || 1030) + 560 + "px" }, esc(up(p.meta)));
      tl.from(m, { opacity: 0, y: 20, duration: 0.4 }, st + 0.35);
    }
  };

  // --- shot-map: dikey tam saha, iki takımın şut yerleri ---
  V["shot-map"] = function (root, p, ctx) {
    const P = flatPitch(root, { left: 160, top: 560, width: 760 });
    drawLines(P.lines, ctx.t0 + 0.05, 0.9);
    const order = p.order || ["home", "away"];
    order.forEach((side, si) => {
      const team = (p[side] || {}); const meta = teams[side] || {};
      const shots = genShots(team, (S.seed || "x") + side);
      const flip = si === 1; // ikinci takım alttaki kaleye
      const tt = stepT(ctx, team.step != null ? team.step : si);
      const goalPt = flip ? [34, 105] : [34, 0];
      shots.forEach((s, i) => {
        const x = flip ? 68 - s.x : s.x, y = flip ? 105 - s.y : s.y;
        const gr = sv("g", {}, P.svg);
        const ln = sv("line", { x1: x, y1: y, x2: goalPt[0] + (s.x - 34) * .08, y2: goalPt[1], stroke: meta.color || "#fff", "stroke-width": .14, "stroke-dasharray": ".5 .45", opacity: .55 }, gr);
        const rad = 0.75 + Math.sqrt(s.xg) * 2.2;
        if (s.outcome === "on" || s.outcome === "goal") sv("circle", { cx: x, cy: y, r: rad + .7, fill: "none", stroke: meta.color, "stroke-width": .18, opacity: .9 }, gr);
        sv("circle", { cx: x, cy: y, r: rad, fill: meta.dark || "#111", stroke: meta.color || "#fff", "stroke-width": .32 }, gr);
        gr.style.filter = `drop-shadow(0 0 1.2px ${meta.color || "#fff"})`;
        tl.from(gr, { opacity: 0, scale: 0, transformOrigin: `${x}px ${y}px`, svgOrigin: `${x} ${y}`, duration: 0.3, ease: "back.out(2)" }, tt + i * 0.05);
        if (s.outcome === "goal" && s.minute != null) {
          const [px, py] = P.map(x, y);
          const tg = el("div", "tag", root, { left: px + "px", top: py - 44 + "px", background: meta.color, color: meta.textDark ? "#111" : "#fff" }, esc(up((s.player ? s.player + " " : "") + s.minute + "'")));
          tl.from(tg, { scale: 0, opacity: 0, duration: 0.3, ease: "back.out(2.5)" }, tt + i * 0.05 + 0.2);
        }
      });
      // pill
      const label = team.label || `${meta.short || side} · ${team.shots} ŞUT`;
      const [, py] = P.map(0, flip ? 72 : 33);
      const pill = el("div", "pill", root, { left: flip ? "auto" : "130px", right: flip ? "130px" : "auto", top: py + "px", background: meta.color, color: meta.textDark ? "#111" : "#fff" }, esc(up(label)));
      tl.from(pill, { opacity: 0, x: flip ? 40 : -40, duration: 0.35, ease: "power3.out" }, tt + 0.1);
    });
    // compare bar (xg or shots)
    if (p.bar) {
      const b = p.bar, [, cy] = P.map(0, 52.5);
      const box = el("div", "abs", root, { left: "100px", right: "100px", top: cy - 22 + "px", height: "70px" });
      const hm = teams.home || {}, aw = teams.away || {};
      el("div", "mono abs", box, { left: 0, top: "-16px", fontSize: "26px" }, esc(up(b.leftText || `${hm.short} · ${b.label} ${b.home}`)));
      el("div", "mono abs", box, { right: 0, top: "-16px", fontSize: "26px" }, esc(up(b.rightText || `${b.label} ${b.away} · ${aw.short}`)));
      const track = el("div", "abs", box, { left: 0, right: 0, top: "30px", height: "18px", borderRadius: "9px", background: "rgba(255,255,255,.12)", overflow: "hidden" });
      const share = b.home / ((b.home + b.away) || 1) * 100;
      const l = el("i", "abs", track, { left: 0, top: 0, bottom: 0, width: share + "%", background: hm.color });
      const rr = el("i", "abs", track, { right: 0, top: 0, bottom: 0, width: (100 - share) + "%", background: aw.color });
      const tb = stepT(ctx, b.step != null ? b.step : 2);
      tl.from(box, { opacity: 0, duration: 0.3 }, tb);
      tl.from(l, { width: 0, duration: 0.8, ease: "power3.out" }, tb + 0.1);
      tl.from(rr, { width: 0, duration: 0.8, ease: "power3.out" }, tb + 0.1);
    }
    source(root, p.source || "ŞUT YERLERİ TEMSİLİ");
  };

  // --- stat-duel: satır satır karşılaştırma ---
  V["stat-duel"] = function (root, p, ctx) {
    const hm = teams.home || {}, aw = teams.away || {};
    const top = p.top || 620;
    const head = el("div", "abs", root, { left: "80px", right: "80px", top: top + "px", height: "80px" });
    el("div", "abs", head, { left: 0, fontSize: "70px", color: hm.color }, esc(up(hm.short || "")));
    el("div", "abs", head, { right: 0, fontSize: "70px", color: aw.color }, esc(up(aw.short || "")));
    tl.from(head, { opacity: 0, y: -20, duration: 0.4 }, ctx.t0 + 0.15);
    const rows = p.rows || [];
    const rowEls = [];
    rows.forEach((r, i) => {
      const row = el("div", "duel-row", root, { top: top + 130 + i * 195 + "px" });
      el("div", "lab mono", row, null, esc(up(r.label)));
      const vl = el("div", "v l", row, { color: hm.color }); const vr = el("div", "v r", row, { color: aw.color });
      const pre = r.prefix || "", suf = r.suffix || "";
      vl.innerHTML = `${esc(pre)}<span></span>${esc(suf)}`; vr.innerHTML = `${esc(pre)}<span></span>${esc(suf)}`;
      const bar = el("div", "bar", row);
      const share = r.home / ((r.home + r.away) || 1) * 100;
      const bl = el("i", "", bar, { left: 0, width: share + "%", background: hm.color });
      const br = el("i", "", bar, { right: 0, width: (100 - share) + "%", background: aw.color });
      const t = stepT(ctx, r.step != null ? r.step : 0) + (r.step != null ? 0 : i * 0.22);
      tl.from(row, { opacity: 0, y: 30, duration: 0.35, ease: "power3.out" }, t);
      counter(vl.querySelector("span"), r.home, t, 0.7, r.decimals);
      counter(vr.querySelector("span"), r.away, t, 0.7, r.decimals);
      tl.from(bl, { width: 0, duration: 0.7, ease: "power3.out" }, t + 0.05);
      tl.from(br, { width: 0, duration: 0.7, ease: "power3.out" }, t + 0.05);
      rowEls.push(row);
    });
    (p.focus || []).forEach((f) => { // {step, row}
      const t = stepT(ctx, f.step);
      rowEls.forEach((re, j) => {
        if (j === f.row) tl.to(re, { opacity: 1, scale: 1.06, duration: 0.35, ease: "power3.out" }, t);
        else tl.to(re, { opacity: 0.28, scale: 1, duration: 0.35 }, t);
      });
    });
    source(root, p.source);
  };

  // --- stamp: kart düşer (skor kartı / manşet) + alarm halkaları ---
  V["stamp"] = function (root, p, ctx) {
    if (p.pitch !== false) {
      const cam = camera({ yNear: 70, yFar: 0, back: 26, nearY: 1900, farY: 700, nearWidth: 1500 });
      const pp = perspPitch(root, cam, { stroke: 3 });
      pp.svg.style.opacity = .5; drawLines(pp.lines, ctx.t0, 0.8);
    }
    const ringC = col(p.rings || ctx.accent || "r");
    if (p.rings !== false) {
      for (let k = 0; k < 4; k++) {
        const ring = el("div", "abs", root, { left: "540px", top: (p.cardTop || 1000) + "px", width: "900px", height: "900px", marginLeft: "-450px", marginTop: "-450px", borderRadius: "50%", border: `4px solid ${ringC}`, boxShadow: `0 0 30px ${ringC}` });
        const t = stepT(ctx, 0) + k * 0.5;
        tl.fromTo(ring, { scale: 0.15, opacity: 0.9 }, { scale: 1.3, opacity: 0, duration: 2.0, ease: "power1.out", repeat: Math.max(0, Math.floor((ctx.t1 - t) / 2.0) - 1) }, t);
      }
    }
    let prev = null;
    (p.cards || []).forEach((c, i) => {
      const card = el("div", "card", root, { top: (p.cardTop || 1000) + "px" });
      if (c.kicker) el("div", "k", card, null, esc(up(c.kicker)));
      el("div", "b", card, { color: col(c.color, "#151515"), fontSize: (c.size || 250) + "px" }, esc(up(c.big)));
      if (c.sub) el("div", "s", card, null, esc(up(c.sub)));
      const t = stepT(ctx, c.step != null ? c.step : i);
      const rot = c.rot != null ? c.rot : (i % 2 ? 4 : -5);
      tl.fromTo(card, { xPercent: -50, yPercent: -50, scale: 1.9, rotation: rot * 2.5, opacity: 0 }, { xPercent: -50, yPercent: -50, scale: 1, rotation: rot, opacity: 1, duration: 0.42, ease: "power4.in" }, t);
      tl.to(root, { x: 10, duration: 0.05, yoyo: true, repeat: 3, ease: "none" }, t + 0.42);
      tl.set(root, { x: 0 }, t + 0.65);
      if (prev) tl.to(prev, { opacity: 0, y: 160, rotation: -12, duration: 0.35, ease: "power2.in" }, t);
      prev = card;
    });
    source(root, p.source);
  };

  // --- timeline: dakika ekseni, goller ve kartlar ---
  V["timeline"] = function (root, p, ctx) {
    const x0 = 100, x1 = 980, y = p.y || 1150, maxM = p.max || 96;
    const X = (m) => x0 + (x1 - x0) * clamp(m, 0, maxM) / maxM;
    const svg = sv("svg", { width: W, height: H }, root); svg.style.position = "absolute"; svg.style.left = 0; svg.style.top = 0;
    const g = sv("g", { class: "glowline" }, svg);
    const axis = sv("line", { x1: x0, x2: x1, y1: y, y2: y, stroke: "rgba(255,255,255,.35)", "stroke-width": 6, "stroke-linecap": "round", pathLength: 1 }, g);
    tl.fromTo(axis, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.7 }, ctx.t0 + 0.1);
    for (const m of [0, 15, 30, 45, 60, 75, 90]) {
      sv("line", { x1: X(m), x2: X(m), y1: y - 14, y2: y + 14, stroke: "#fff", "stroke-width": m === 45 ? 4 : 2, opacity: .7 }, g);
      const lb = el("div", "mono abs", root, { left: X(m) + "px", top: y + 30 + "px", fontSize: "22px", transform: "translateX(-50%)", opacity: .6 }, m === 45 ? "İY" : m + "'");
      tl.from(lb, { opacity: 0, duration: 0.3 }, ctx.t0 + 0.3 + m / 300);
    }
    const accent = col(ctx.accent);
    const ph = sv("line", { x1: x0, x2: x0, y1: y, y2: y, stroke: accent, "stroke-width": 8, "stroke-linecap": "round" }, g);
    ph.style.filter = `drop-shadow(0 0 12px ${accent})`;
    const evs = (p.events || []).map((e) => Object.assign({ m: String(e.minute).replace(/'/g, "").split("+").reduce((a, b) => a + Number(b), 0) }, e));
    const nSteps = Math.max(1, ...evs.map(e => (e.step || 0) + 1));
    let cur = 0;
    const stacks = {};
    for (let s = 0; s < nSteps; s++) {
      const t = stepT(ctx, s);
      const group = evs.filter(e => (e.step || 0) === s);
      const target = group.length ? Math.max(...group.map(e => e.m)) : cur;
      const dur = clamp((target - cur) / 40, 0.5, 1.8);
      tl.fromTo(ph, { attr: { x2: X(cur) } }, { attr: { x2: X(target) }, duration: dur, ease: "power1.inOut" }, t);
      group.forEach((e) => {
        const te = t + dur * clamp((e.m - cur) / Math.max(1, target - cur), 0, 1);
        const key = Math.round(e.m / 4);
        const above = e.type === "goal";
        const k = stacks[key + (above ? "a" : "b")] = (stacks[key + (above ? "a" : "b")] || 0) + 1;
        const c = e.team ? col(e.team) : accent;
        if (e.type === "goal") {
          const dot = sv("circle", { cx: X(e.m), cy: y, r: 20, fill: c, stroke: "#fff", "stroke-width": 4 }, svg);
          const stem = sv("line", { x1: X(e.m), x2: X(e.m), y1: y - 24, y2: y - 120 - (k - 1) * 70, stroke: c, "stroke-width": 3 }, svg);
          const tg = el("div", "tag", root, { left: clamp(X(e.m), 170, 910) + "px", top: y - 140 - (k - 1) * 70 + "px", background: c, color: (e.team && teams[e.team] && teams[e.team].textDark) ? "#111" : "#fff", fontSize: "28px", padding: "8px 16px" }, esc(up(e.label || `${e.minute}' ${e.player || ""}`)));
          tl.from(dot, { scale: 0, svgOrigin: `${X(e.m)} ${y}`, duration: 0.35, ease: "back.out(3)" }, te);
          tl.from(stem, { opacity: 0, duration: 0.2 }, te + 0.1);
          tl.from(tg, { scale: 0, opacity: 0, duration: 0.3, ease: "back.out(2.5)" }, te + 0.15);
        } else {
          const cc = e.type === "red" ? "#E53935" : "#FFD21F";
          const card = el("div", "abs", root, { left: X(e.m) - 12 + "px", top: y + 80 + (k - 1) * 46 + "px", width: "24px", height: "34px", borderRadius: "4px", background: cc, boxShadow: `0 0 12px ${cc}`, border: `3px solid ${e.team ? col(e.team) : "#fff"}` });
          tl.from(card, { scale: 0, opacity: 0, duration: 0.25, ease: "back.out(3)" }, te);
        }
      });
      cur = target;
    }
    if (p.note) { const n = el("div", "mono abs", root, { left: "100px", top: y + 330 + "px", fontSize: "24px", opacity: .7 }, esc(up(p.note))); tl.from(n, { opacity: 0, duration: .4 }, ctx.t0 + .8); }
    source(root, p.source);
  };

  // --- lineup: perspektif yarı saha + formasyon ---
  function formationPos(formation) {
    const rows = String(formation || "4-4-2").split("-").map(Number);
    const pos = [[34, 101]];
    const n = rows.length;
    rows.forEach((k, ri) => {
      const y = 90 - ri * (30 / Math.max(1, n - 1)) - (n === 1 ? 10 : 0);
      const span = k >= 4 ? 52 : k === 3 ? 40 : k === 2 ? 26 : 0;
      for (let i = 0; i < k; i++) pos.push([k === 1 ? 34 : 34 - span / 2 + span * i / (k - 1), y]);
    });
    return pos;
  }
  V["lineup"] = function (root, p, ctx) {
    const cam = camera({ yNear: 108, yFar: 52.5, back: 34, nearY: 1650, farY: 600, nearWidth: 1180 });
    const pp = perspPitch(root, cam, { stroke: 3, yMin: 46 });
    drawLines(pp.lines, ctx.t0, 0.8);
    const side = p.team || "home"; const meta = teams[side] || {};
    const pos = p.positions || formationPos(p.formation);
    const players = p.players || [];
    const dots = {};
    players.forEach((name, i) => {
      if (!pos[i]) return;
      const [x, y] = pos[i];
      const [sx, sy] = cam.p(x, y); const sc = cam.scale(y) / cam.scale(80);
      const d = el("div", "abs", root, { left: sx + "px", top: sy + "px", width: 0, height: 0 });
      const c = el("div", "abs", d, { left: -34 * sc + "px", top: -34 * sc + "px", width: 68 * sc + "px", height: 68 * sc + "px", borderRadius: "50%", background: meta.dark, border: `${6 * sc}px solid ${meta.color}`, boxSizing: "border-box", boxShadow: `0 0 18px ${meta.color}` });
      el("div", "mono abs", d, { left: "-150px", width: "300px", textAlign: "center", top: 38 * sc + "px", fontSize: 21 * sc + "px", fontWeight: 800 }, esc(up(name)));
      tl.from(d, { opacity: 0, scale: 0, duration: 0.3, ease: "back.out(2)" }, ctx.t0 + 0.35 + i * 0.07);
      dots[up(name)] = { d, c, sx, sy, sc };
    });
    (p.focus || []).forEach((f) => {
      const t = stepT(ctx, f.step);
      (f.names || []).forEach((nm) => {
        const o = dots[up(nm)]; if (!o) return;
        const fc = col(f.color || ctx.accent);
        for (let k = 0; k < 3; k++) {
          const ring = el("div", "abs", o.d, { left: -34 * o.sc + "px", top: -34 * o.sc + "px", width: 68 * o.sc + "px", height: 68 * o.sc + "px", borderRadius: "50%", border: `4px solid ${fc}`, boxSizing: "border-box" });
          tl.fromTo(ring, { scale: 1, opacity: 0.9 }, { scale: 2.1, opacity: 0, duration: 1.2, ease: "power1.out", repeat: 2 }, t + k * 0.4);
        }
        tl.to(o.d, { scale: 1.25, duration: 0.3, ease: "back.out(2)" }, t);
      });
      if (f.dim) Object.keys(dots).forEach((k) => { if (!(f.names || []).map(up).includes(k)) tl.to(dots[k].d, { opacity: 0.3, duration: 0.3 }, t); });
    });
    (p.ghosts || []).forEach((gh) => {
      const t = stepT(ctx, gh.step || 0);
      const [x, y] = gh.at || [34, 62];
      const [sx, sy] = cam.p(x, y); const sc = cam.scale(y) / cam.scale(80);
      const d = el("div", "abs", root, { left: sx + "px", top: sy + "px" });
      el("div", "abs", d, { left: -34 * sc + "px", top: -34 * sc + "px", width: 68 * sc + "px", height: 68 * sc + "px", borderRadius: "50%", border: `4px dashed ${col(gh.color || "w")}`, boxSizing: "border-box" });
      el("div", "mono abs", d, { left: "-160px", width: "320px", textAlign: "center", top: 40 * sc + "px", fontSize: 22 * sc + "px", fontWeight: 800, color: col(gh.color || "w") }, esc(up(gh.name)));
      if (gh.label) el("div", "tag", d, { left: 0, top: -64 * sc + "px", background: col(gh.color || "y"), color: "#111" }, esc(up(gh.label)));
      tl.from(d, { opacity: 0, scale: 0.4, duration: 0.4, ease: "back.out(2)" }, t);
    });
    const foot = el("div", "mono abs", root, { left: "80px", top: "1700px", fontSize: "22px", opacity: .65 }, esc(up(p.footer || `${meta.name || ""} İLK 11 · ${p.formation || ""}`)));
    tl.from(foot, { opacity: 0, duration: 0.4 }, ctx.t0 + 0.6);
    source(root, p.source);
  };

  // --- bars: dikey sütunlar ---
  function drawBars(root, p, ctx, dimmed) {
    const items = p.items || [];
    const base = p.baseline || 1380, maxH = p.maxHeight || 560;
    const n = items.length, cw = p.colWidth || Math.min(200, 760 / n), gap = (920 - n * cw) / Math.max(1, n - 1);
    const maxV = p.max || Math.max(...items.map(i => i.value), 0.0001);
    const accent = col(ctx.accent);
    const line = el("div", "abs", root, { left: "60px", right: "60px", top: base + "px", height: "5px", background: accent, boxShadow: `0 0 18px ${accent}` });
    tl.from(line, { scaleX: 0, transformOrigin: "0 50%", duration: 0.6, ease: "power3.out" }, ctx.t0 + 0.1);
    items.forEach((it, i) => {
      const x = 80 + i * (cw + gap);
      const h = Math.max(8, maxH * it.value / maxV);
      const c = col(it.color, accent);
      const colEl = el("div", "col", root, { left: x + "px", width: cw + "px", top: base - h + "px", height: h + "px", background: `linear-gradient(180deg, ${c}, ${c}55)`, boxShadow: `0 0 30px ${c}66` });
      const v = el("div", "colv", root, { left: x - 40 + "px", width: cw + 80 + "px", top: base - h - 100 + "px" });
      v.innerHTML = `${esc(it.prefix || "")}<span></span>${esc(it.suffix || "")}`;
      const lb = el("div", "coll mono", root, { left: x - 40 + "px", width: cw + 80 + "px", top: base + 22 + "px" }, esc(up(it.label)));
      const t = stepT(ctx, it.step != null ? it.step : 0) + (it.step != null ? 0 : i * 0.25);
      tl.from(colEl, { scaleY: 0, duration: 0.7, ease: "power3.out" }, t);
      tl.from(v, { y: h, opacity: 0, duration: 0.7, ease: "power3.out" }, t);
      counter(v.querySelector("span"), it.value, t, 0.7, it.decimals);
      tl.from(lb, { opacity: 0, duration: 0.3 }, t + 0.2);
    });
    if (dimmed) root.style.opacity = 0.18;
  }
  V["bars"] = function (root, p, ctx) { drawBars(root, p, ctx, false); source(root, p.source); };

  // --- panel-stack: üst üste paneller, her panelde dev sayı ---
  V["panel-stack"] = function (root, p, ctx) {
    const panels = p.panels || []; const n = panels.length;
    const top = p.top || 600, total = p.height || 1100, gap = 22, ph = (total - gap * (n - 1)) / n;
    panels.forEach((pn, i) => {
      const c = col(pn.color, PALETTE.g);
      const box = el("div", "panel", root, { top: top + i * (ph + gap) + "px", height: ph + "px", borderColor: c + "AA", background: `linear-gradient(180deg, ${c}55, ${c}22)` });
      const svg = sv("svg", { width: 960, height: ph, viewBox: `0 0 960 ${ph}` }, box); svg.style.position = "absolute"; svg.style.opacity = .35;
      sv("ellipse", { cx: 480, cy: ph + 60, rx: 220, ry: 120, fill: "none", stroke: "#fff", "stroke-width": 2 }, svg);
      sv("line", { x1: 0, x2: 960, y1: ph * .25, y2: ph * .18, stroke: "#fff", "stroke-width": 2 }, svg);
      el("div", "ph mono", box, null, esc(up(pn.title)));
      const v = el("div", "pv", box, { color: "#fff" }); v.innerHTML = `${esc(pn.prefix || "")}<span></span>${esc(pn.suffix || "")}`;
      if (pn.sub) el("div", "ps mono", box, null, esc(up(pn.sub)));
      tl.from(box, { opacity: 0, x: -60, duration: 0.4, ease: "power3.out" }, ctx.t0 + 0.15 + i * 0.12);
      const t = stepT(ctx, pn.step != null ? pn.step : i);
      tl.set(v, { opacity: 0 }, ctx.t0);
      tl.to(v, { opacity: 1, duration: 0.01 }, t);
      counter(v.querySelector("span"), pn.value, t, 0.6, pn.decimals);
      tl.to(box, { borderColor: c, boxShadow: `0 0 34px ${c}`, duration: 0.3 }, t);
      tl.to(box, { boxShadow: `0 0 0px ${c}`, duration: 0.6 }, t + 0.8);
    });
    source(root, p.source);
  };

  // --- pins: perspektif saha, iğne/lolipop şutlar ---
  V["pins"] = function (root, p, ctx) {
    const cam = camera({ yNear: 46, yFar: -2, back: 22, nearY: 1650, farY: 760, nearWidth: 1500 });
    const pp = perspPitch(root, cam, { stroke: 3 });
    drawLines(pp.lines, ctx.t0, 0.8);
    (p.groups || []).forEach((gp, gi) => {
      const c = col(gp.color);
      const shots = genShots({ shots: gp.count, on_target: gp.on_target || 0, goals: gp.goals || [] }, (S.seed || "p") + gp.label);
      const t = stepT(ctx, gp.step != null ? gp.step : gi);
      shots.forEach((s, i) => {
        const [bx, by] = cam.p(s.x, s.y); const [hx, hy] = cam.p(s.x, s.y, 3.2 + (s.outcome !== "off" ? 1.2 : 0));
        const sc = cam.scale(s.y) / cam.scale(20);
        const pin = el("div", "abs", root, { left: 0, top: 0 });
        el("div", "abs", pin, { left: bx - 2 + "px", top: hy + "px", width: "4px", height: by - hy + "px", background: c, opacity: .9 });
        el("div", "abs", pin, { left: bx - 16 * sc + "px", top: by - 5 * sc + "px", width: 32 * sc + "px", height: 10 * sc + "px", borderRadius: "50%", border: `2px solid ${c}`, opacity: .6 });
        el("div", "abs", pin, { left: hx - 14 * sc + "px", top: hy - 14 * sc + "px", width: 28 * sc + "px", height: 28 * sc + "px", borderRadius: "50%", background: c, boxShadow: `0 0 16px ${c}` });
        tl.from(pin, { y: -120, opacity: 0, duration: 0.35, ease: "bounce.out" }, t + i * 0.06);
      });
    });
    if ((p.groups || []).length > 1) {
      const lg = el("div", "abs mono", root, { left: "80px", top: "1720px", fontSize: "22px" });
      lg.innerHTML = p.groups.map(g => `<span style="color:${col(g.color)}">●</span> ${esc(up(g.label))}`).join("&nbsp;&nbsp;&nbsp;");
      tl.from(lg, { opacity: 0, duration: .4 }, ctx.t0 + .5);
    }
    source(root, p.source);
  };

  // --- pitch-dim: sadece loş perspektif saha (strike / ara cümleler için) ---
  V["pitch-dim"] = function (root, p, ctx) {
    const cam = camera({ yNear: 40, yFar: -2, back: 24, nearY: 1900, farY: 1180, nearWidth: 1700 });
    const pp = perspPitch(root, cam, { stroke: 3 });
    pp.svg.style.opacity = p.opacity || .35;
    drawLines(pp.lines, ctx.t0, 1.0);
    source(root, p.source);
  };

  // --- cta: soru + yorum butonu + (ops.) soluk özet ---
  V["cta"] = function (root, p, ctx) {
    if (p.recap) { const rc = el("div", "full", root); drawBars(rc, Object.assign({ baseline: 1450, maxHeight: 420 }, p.recap), ctx, true); }
    const t = stepT(ctx, p.buttonStep != null ? p.buttonStep : Math.max(0, ctx.steps.length - 1)) + 0.6;
    const btn = el("div", "btn", root, { left: "80px", top: (p.buttonTop || 960) + "px" }, esc(up(p.button || "YORUMA YAZ ↓")));
    tl.from(btn, { scale: 0.6, opacity: 0, duration: 0.4, ease: "back.out(2.5)" }, t);
    tl.to(btn, { scale: 1.06, duration: 0.35, yoyo: true, repeat: 3, ease: "sine.inOut" }, t + 0.5);
    if (p.handle) { const h = el("div", "mono abs", root, { left: "80px", top: "1700px", fontSize: "28px", opacity: .85 }, esc(up(p.handle))); tl.from(h, { opacity: 0, duration: .4 }, ctx.t0 + .4); }
  };

  V["none"] = function () {};

  // =====================================================================
  // CAPTIONS
  // =====================================================================
  function capFontSize(lines, cap) {
    const maxChars = Math.max(...lines.map(l => up(l.text).length));
    const est = 920 / (maxChars * 0.47);
    return clamp(Math.round(est), 56, cap.size || 116);
  }
  function normLines(cap, sceneAccent) {
    return (cap.lines || [cap.text || ""]).map((l, i) => {
      if (typeof l === "string") l = { text: l };
      return Object.assign({ color: i === 0 ? "w" : sceneAccent }, l);
    });
  }
  function buildCaptions(sceneEl, sc) {
    const caps = sc.caps || [];
    let group = null; // append zinciri
    caps.forEach((cap, ci) => {
      const lines = normLines(cap, sc.accent || "y");
      const next = caps[ci + 1];
      const pos = cap.pos || sc.capPos || "top";
      let box, prevWordCount = 0;
      if (cap.append && group) { box = group.box; prevWordCount = group.count; box.innerHTML = ""; }
      else {
        box = el("div", "cap glow" + (cap.align === "center" || sc.capAlign === "center" ? " center" : ""), sceneEl);
        if (pos === "top") box.style.top = (cap.top || 290) + "px";
        else if (pos === "bottom") box.style.bottom = (cap.bottom || 300) + "px";
        else { box.style.top = (cap.top || 820) + "px"; }
      }
      const fs = cap.fontSize || capFontSize(lines, cap);
      box.style.fontSize = fs + "px";
      let wi = 0; const newWords = [];
      lines.forEach((l) => {
        const ln = el("div", "ln", box, { position: "relative", color: col(l.color), textShadow: l.color !== "w" && l.glow !== false ? `0 0 26px ${col(l.color)}55` : "" });
        if (l.size) ln.style.fontSize = l.size + "px";
        up(l.text).split(/\s+/).filter(Boolean).forEach((w) => {
          const wd = el("span", "wd", ln); const inner = el("span", "wi", wd, null, esc(w));
          if (wi >= prevWordCount) newWords.push(inner);
          wi++;
        });
        if (l.strike) {
          const s = el("div", "strike-line", ln, { width: "104%" });
          tl.from(s, { scaleX: 0, duration: 0.35, ease: "power2.out" }, cap.t + (l.strikeDelay != null ? l.strikeDelay : 0.55));
        }
      });
      // eski kelimeler append'de hemen görünür
      tl.from(newWords, { yPercent: 115, duration: 0.34, ease: "power3.out", stagger: 0.055 }, cap.t);
      if (!(cap.append && group)) tl.set(box, { autoAlpha: 1 }, cap.t);
      const continues = next && next.append;
      if (!continues && next) {
        tl.to(box, { autoAlpha: 0, y: -24, duration: 0.2, ease: "power2.in" }, next.t - 0.2);
      }
      if (!(cap.append && group)) { tl.set(box, { autoAlpha: 0 }, sc.t); tl.set(box, { autoAlpha: 1 }, cap.t); }
      group = { box, count: wi };
    });
  }

  // =====================================================================
  // SCENES
  // =====================================================================
  const scenes = S.scenes || [];
  scenes.forEach((sc, si) => {
    const sEl = el("div", "scene", stage, { zIndex: 10 + si });
    const th = THEMES[sc.bg] || (Array.isArray(sc.bg) ? sc.bg : THEMES.dark);
    el("div", "bg", sEl, { background: `radial-gradient(ellipse 90% 70% at 50% 42%, ${th[0]} 0%, ${th[1]} 100%)` });
    const cam = el("div", "cam", sEl);
    const t0 = sc.t, t1 = sc.t + sc.d;
    const ctx = { t0, t1, steps: (sc.caps || []).map(c => c.t), accent: sc.accent || "y" };
    (V[sc.type] || V.none)(cam, sc.params || {}, ctx);
    buildCaptions(sEl, sc);
    // giriş/çıkış
    const tin = si === 0 ? 0 : 0.35;
    tl.set(sEl, { autoAlpha: 0 }, 0);
    tl.fromTo(sEl, { autoAlpha: si === 0 ? 1 : 0 }, { autoAlpha: 1, duration: tin || 0.001 }, Math.max(0, t0 - (si === 0 ? 0 : 0.15)));
    tl.fromTo(cam, { scale: sc.zoomFrom || 1.07 }, { scale: 1, duration: 0.8, ease: "power3.out" }, t0);
    tl.to(cam, { scale: sc.drift || 1.035, duration: Math.max(0.5, sc.d - 0.8), ease: "none" }, t0 + 0.8);
    if (sc.flash) { const f = el("div", "full", sEl, { background: "#fff", zIndex: 60 }); tl.fromTo(f, { opacity: 0.85 }, { opacity: 0, duration: 0.35 }, t0); }
    if (si < scenes.length - 1) tl.to(sEl, { autoAlpha: 0, duration: 0.3 }, t1 + 0.05);
  });
  tl.set({}, {}, S.duration); // toplam süre
  window.__timelines = window.__timelines || {};
  window.__timelines.root = tl;
  window.__STORY_OK = true;
})();
