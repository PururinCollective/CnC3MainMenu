/* ============================================================
   Pururin Initiative — main menu
   Every visual is generated as SVG into five stacked layers.
   Geometry is rebuilt in CSS pixels on resize so the whole
   composition stays sharp and correct at any window size.
   ============================================================ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var RAD = Math.PI / 180;

  var L = {
    hex:   document.getElementById('lyr-hex'),
    atlas: document.getElementById('lyr-atlas'),
    globe: document.getElementById('lyr-globe'),
    hud:   document.getElementById('lyr-hud'),
    menu:  document.getElementById('lyr-menu')
  };

  /* Everything editable lives in data/menu.json. These are only the fallbacks
     used when the page is opened straight off disk, where fetch cannot read it. */
  var CONFIG = {
    documentTitle: 'Pururin Initiative — Main Menu',
    title: 'Pururin Initiative',
    subtitle: 'GLOBAL DEFENSE NETWORK  //  ORBITAL COMMAND',
    status: 'UPLINK ACTIVE',
    items: [
      { label: 'TUTORIAL', link: '' }, { label: 'CAMPAIGN', link: '' },
      { label: 'SKIRMISH', link: '' }, { label: 'MULTIPLAYER', link: '' },
      { label: 'PROFILES', link: '' }, { label: 'OPTIONS', link: '' },
      { label: 'QUIT', link: '' }
    ]
  };

  var SFX = {
    click: 'assets/audio/buttonclickrelease.wav',
    hover: 'assets/audio/buttonrollover.wav'
  };

  var W = 0, H = 0, K = 1;          // viewport size + design scale
  var E = { cx: 0, cy: 0, r: 0 };   // earth disc
  var landNodes = [];               // globe paths, re-projected each frame
  var gratNodes = [];
  var rot = 0, lastT = 0, acc = 0;

  /* ---------- tiny svg helpers ---------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- audio ----------
     Each cue gets a small pool of elements so rapid clicks overlap instead of
     cutting each other off. Browsers block playback until the first gesture,
     so a rejected play() before then is expected and ignored. */
  function Cue(src, volume, voices) {
    this.pool = [];
    this.i = 0;
    for (var v = 0; v < voices; v++) {
      var a = new Audio(src);
      a.preload = 'auto';
      a.volume = volume;
      this.pool.push(a);
    }
  }
  Cue.prototype.play = function () {
    var a = this.pool[this.i];
    this.i = (this.i + 1) % this.pool.length;
    try {
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* nothing worth doing if audio is unavailable */ }
  };

  var sfxClick = null, sfxHover = null;
  function initAudio() {
    sfxClick = new Cue(SFX.click, 0.75, 3);
    sfxHover = new Cue(SFX.hover, 0.45, 3);
  }

  /* ============================================================
     PROJECTIONS — one dataset, two views
     ============================================================ */

  /* Catmull-Rom through a run of screen points -> smooth cubic path.
     The source outlines are deliberately low-poly; rounding them here keeps
     the coastlines from looking faceted on a planet this large. */
  function smooth(pts, close) {
    var n = pts.length / 2, i, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, j;
    if (n < 3) {
      if (n === 0) return '';
      var d2 = 'M' + pts[0].toFixed(1) + ',' + pts[1].toFixed(1);
      for (i = 1; i < n; i++) d2 += 'L' + pts[i * 2].toFixed(1) + ',' + pts[i * 2 + 1].toFixed(1);
      return d2;
    }
    var d = 'M' + pts[0].toFixed(1) + ',' + pts[1].toFixed(1);
    var last = close ? n : n - 1;
    for (i = 0; i < last; i++) {
      j = close ? (i - 1 + n) % n : Math.max(i - 1, 0);
      p0x = pts[j * 2]; p0y = pts[j * 2 + 1];
      p1x = pts[i * 2]; p1y = pts[i * 2 + 1];
      j = close ? (i + 1) % n : Math.min(i + 1, n - 1);
      p2x = pts[j * 2]; p2y = pts[j * 2 + 1];
      j = close ? (i + 2) % n : Math.min(i + 2, n - 1);
      p3x = pts[j * 2]; p3y = pts[j * 2 + 1];
      d += 'C' + (p1x + (p2x - p0x) / 6).toFixed(1) + ',' + (p1y + (p2y - p0y) / 6).toFixed(1) +
           ' ' + (p2x - (p3x - p1x) / 6).toFixed(1) + ',' + (p2y - (p3y - p1y) / 6).toFixed(1) +
           ' ' + p2x.toFixed(1) + ',' + p2y.toFixed(1);
    }
    return close ? d + 'Z' : d;
  }

  /* orthographic: the visible hemisphere of the rotating globe.
     Points behind the limb are dropped, so one outline can yield
     several separate visible runs. */
  function orthoPath(poly, spin, raw) {
    var d = '', run = [], i, lo, la, cl, x, y, z;
    for (i = 0; i < poly.length; i += 2) {
      lo = (poly[i] + spin) * RAD;
      la = poly[i + 1] * RAD;
      cl = Math.cos(la);
      x = cl * Math.sin(lo);
      y = Math.sin(la);
      z = cl * Math.cos(lo);
      if (z > 0.02) {
        run.push(E.cx + E.r * x, E.cy - E.r * y);
      } else if (run.length) {
        d += raw ? poly2line(run) : smooth(run, false);
        run = [];
      }
    }
    if (run.length) d += raw ? poly2line(run) : smooth(run, false);
    return d;
  }

  function poly2line(pts) {
    var d = '', i;
    for (i = 0; i < pts.length; i += 2) {
      d += (i ? 'L' : 'M') + pts[i].toFixed(1) + ',' + pts[i + 1].toFixed(1);
    }
    return d;
  }

  /* equirectangular: the flat atlas across the bottom half */
  var MAP = { x: 0, y: 0, w: 0, h: 0, latTop: 78, latBot: -58 };
  function mapX(lon) { return MAP.x + (lon + 180) / 360 * MAP.w; }
  function mapY(lat) { return MAP.y + (MAP.latTop - lat) / (MAP.latTop - MAP.latBot) * MAP.h; }
  function equiPath(poly) {
    var pts = [], i;
    for (i = 0; i < poly.length; i += 2) pts.push(mapX(poly[i]), mapY(poly[i + 1]));
    return smooth(pts, true);
  }

  function hexPath(cx, cy, s) {
    var p = '', i, a;
    for (i = 0; i < 6; i++) {
      a = (60 * i - 30) * RAD;
      p += (i ? 'L' : 'M') + (cx + s * Math.cos(a)).toFixed(1) + ',' + (cy + s * Math.sin(a)).toFixed(1);
    }
    return p + 'Z';
  }

  /* ============================================================
     LAYER 1 — HEXAGON FIELD (glow + travelling shine)
     ============================================================ */
  function buildHex() {
    clear(L.hex);
    L.hex.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var defs = el('defs', null, L.hex);
    var mask = el('mask', { id: 'mShine' }, defs);
    el('rect', { width: W, height: H, fill: 'url(#gShine)' }, mask);

    /* faint full-bleed lattice, lit by a sweeping shine */
    el('rect', { width: W, height: H, fill: 'url(#pHex)', opacity: 0.035 }, L.hex);
    el('rect', { width: W, height: H, fill: 'url(#pHex)', opacity: 0.14,
                 mask: 'url(#mShine)', filter: 'url(#fGlowSm)' }, L.hex);

    /* discrete clusters in the corners, each hex breathing on its own clock */
    var clusters = [
      { x: 0.20 * W, y: 0.04 * H, r: 105 * K, s: 13 * K },
      { x: 0.42 * W, y: 0.02 * H, r: 85 * K, s: 11 * K },
      { x: 0.94 * W, y: 0.04 * H, r: 120 * K, s: 14 * K },
      { x: 0.03 * W, y: 0.90 * H, r: 130 * K, s: 15 * K },
      { x: 0.66 * W, y: 0.93 * H, r: 115 * K, s: 13 * K },
      { x: 0.90 * W, y: 0.89 * H, r: 120 * K, s: 14 * K }
    ];

    var g = el('g', { filter: 'url(#fGlowSm)' }, L.hex);
    clusters.forEach(function (c) {
      var s = c.s, cw = Math.sqrt(3) * s, ch = 1.5 * s;
      var cols = Math.ceil(c.r / cw) + 1, rows = Math.ceil(c.r / ch) + 1;
      var i, j, x, y, dx, dy, o, hp;
      for (j = -rows; j <= rows; j++) {
        for (i = -cols; i <= cols; i++) {
          x = c.x + i * cw + (j & 1 ? cw / 2 : 0);
          y = c.y + j * ch;
          dx = (x - c.x) / c.r; dy = (y - c.y) / c.r;
          if (dx * dx + dy * dy > 1) continue;
          if (Math.random() < 0.62) continue;
          o = rnd(0.04, 0.17) * (1 - Math.sqrt(dx * dx + dy * dy) * 0.8);
          hp = el('path', {
            d: hexPath(x, y, s * 0.92),
            fill: Math.random() < 0.22 ? 'rgba(60,190,240,0.10)' : 'none',
            stroke: Math.random() < 0.18 ? '#8dffc8' : '#3fc4ff',
            'stroke-width': (0.9 * K).toFixed(2),
            opacity: o.toFixed(3)
          }, g);
          el('animate', {
            attributeName: 'opacity',
            values: o.toFixed(3) + ';' + Math.min(0.8, o * 3.6).toFixed(3) + ';' + o.toFixed(3),
            dur: rnd(2.6, 8).toFixed(2) + 's',
            begin: (-rnd(0, 8)).toFixed(2) + 's',
            repeatCount: 'indefinite'
          }, hp);
        }
      }
    });
  }

  /* ============================================================
     LAYER 2 — WORLD ATLAS (bottom half) + graticule
     ============================================================ */
  function buildAtlas() {
    clear(L.atlas);
    L.atlas.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    MAP.x = 0.035 * W; MAP.w = 1.12 * W;
    MAP.y = 0.515 * H; MAP.h = 0.50 * H;

    var defs = el('defs', null, L.atlas);
    var mask = el('mask', { id: 'mAtlasLocal' }, defs);
    el('rect', { x: 0, y: MAP.y, width: W, height: MAP.h, fill: 'url(#gAtlasFade)' }, mask);

    var root = el('g', { mask: 'url(#mAtlasLocal)' }, L.atlas);

    /* lat/lon graticule under the landmasses */
    var grat = el('g', { stroke: '#39a9c9', 'stroke-width': 0.6, opacity: 0.07, fill: 'none' }, root);
    var lo, la;
    for (lo = -180; lo <= 180; lo += 20) {
      el('line', { x1: mapX(lo), y1: MAP.y, x2: mapX(lo), y2: MAP.y + MAP.h }, grat);
    }
    for (la = -60; la <= 80; la += 20) {
      el('line', { x1: 0, y1: mapY(la), x2: W, y2: mapY(la),
                   opacity: la === 0 ? 0.9 : 0.45 }, grat);
    }

    /* landmasses: dim fill plus a glowing coastline that draws itself in */
    var landG = el('g', null, root);
    var strokeG = el('g', { filter: 'url(#fGlowSm)', opacity: 0.5 }, root);

    WORLD.forEach(function (poly) {
      var d = equiPath(poly);
      el('path', { d: d, fill: 'url(#gLand)', stroke: 'none' }, landG);
      var p = el('path', {
        d: d, fill: 'none',
        stroke: '#1fbf9a',
        'stroke-width': (0.8 * K).toFixed(2),
        'stroke-linejoin': 'round',
        opacity: 0.55,
        'class': 'atlas-stroke'
      }, strokeG);
      var len = 4000;
      try { len = p.getTotalLength() || 4000; } catch (e) { len = 4000; }
      p.style.setProperty('--len', Math.ceil(len));
    });

    /* city lights: dots seeded along the coasts and over population clusters */
    var dots = el('g', { 'class': 'atlas-dots', filter: 'url(#fGlowSm)', opacity: 0.8 }, root);
    var palette = ['#5dffb4', '#3ce0ff', '#7fe4ff', '#b7ff8a', '#4f8bff'];

    WORLD.forEach(function (poly) {
      for (var i = 0; i < poly.length - 2; i += 2) {
        var x1 = mapX(poly[i]), y1 = mapY(poly[i + 1]);
        var x2 = mapX(poly[i + 2]), y2 = mapY(poly[i + 3]);
        var seg = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        var n = Math.min(14, Math.floor(seg / (13 * K)));
        for (var s = 0; s < n; s++) {
          var t = (s + Math.random()) / n;
          el('circle', {
            cx: (x1 + (x2 - x1) * t + rnd(-4, 4) * K).toFixed(1),
            cy: (y1 + (y2 - y1) * t + rnd(-4, 4) * K).toFixed(1),
            r: (rnd(0.4, 1.2) * K).toFixed(2),
            fill: palette[(Math.random() * palette.length) | 0],
            opacity: rnd(0.18, 0.75).toFixed(2)
          }, dots);
        }
      }
    });

    CITY_BELTS.forEach(function (c) {
      var n = c[2] * 4, cx = mapX(c[0]), cy = mapY(c[1]), spread = 11 * K;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var d = Math.pow(Math.random(), 1.7) * spread;
        el('circle', {
          cx: (cx + Math.cos(a) * d * 1.6).toFixed(1),
          cy: (cy + Math.sin(a) * d).toFixed(1),
          r: (rnd(0.4, 1.5) * K).toFixed(2),
          fill: palette[(Math.random() * 3) | 0],
          opacity: rnd(0.3, 0.95).toFixed(2)
        }, dots);
      }
    });
  }

  /* ============================================================
     LAYER 3 — EARTH: backlit, rotating, wrapped in atmosphere
     ============================================================ */
  function buildGlobe() {
    clear(L.globe);
    L.globe.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    landNodes = []; gratNodes = [];

    E.r = 435 * K;
    E.cx = -145 * K;
    E.cy = 0.5 * H;

    var defs = el('defs', null, L.globe);
    var cp = el('clipPath', { id: 'clipEarth' }, defs);
    el('circle', { cx: E.cx, cy: E.cy, r: E.r }, cp);
    /* the mask has to be wider than the atmosphere ring it masks, otherwise the
       ring is chopped off square where it leaves the mask rectangle */
    var MR = E.r * 1.15;
    var lit = el('mask', { id: 'mLitLocal' }, defs);
    el('rect', { x: E.cx - MR, y: E.cy - MR, width: MR * 2, height: MR * 2,
                 fill: 'url(#gLitSide)' }, lit);

    var g = el('g', { id: 'glbGroup' }, L.globe);

    /* the star sits directly behind the planet: halo spilling past the limb */
    el('circle', { cx: E.cx, cy: E.cy, r: E.r * 1.30,
                   fill: 'url(#gSunHalo)', opacity: 0.85 }, g);

    /* orbital arcs sweeping out across the screen */
    var arcs = el('g', { fill: 'none', stroke: '#a9d8ee', 'stroke-width': 1 }, g);
    [1.13, 1.30, 1.55].forEach(function (m, i) {
      var c = el('circle', { cx: E.cx, cy: E.cy, r: E.r * m, opacity: 0.13 - i * 0.03 }, arcs);
      if (i === 1) {
        c.setAttribute('stroke-dasharray', (26 * K) + ' ' + (18 * K));
        c.setAttribute('opacity', 0.16);
        el('animate', { attributeName: 'stroke-dashoffset', from: 0, to: 44 * K,
                        dur: '6s', repeatCount: 'indefinite' }, c);
      }
    });

    /* the disc itself */
    el('circle', { cx: E.cx, cy: E.cy, r: E.r, fill: 'url(#gEarthBody)' }, g);

    /* surface, clipped to the disc */
    var surf = el('g', { 'clip-path': 'url(#clipEarth)' }, g);

    var grat = el('g', { fill: 'none', stroke: '#6fe0ff', 'stroke-width': 0.6,
                         opacity: 0.5 }, surf);
    var lines = [], a, j, p;
    for (a = -180; a < 180; a += 30) {
      p = []; for (j = -80; j <= 80; j += 8) { p.push(a, j); } lines.push(p);
    }
    for (a = -60; a <= 60; a += 30) {
      p = []; for (j = -180; j <= 180; j += 8) { p.push(j, a); } lines.push(p);
    }
    lines.forEach(function (poly) {
      gratNodes.push({ node: el('path', { d: '' }, grat), poly: poly });
    });

    var land = el('g', { filter: 'url(#fGlowSm)' }, surf);
    WORLD.forEach(function (poly) {
      var n = el('path', {
        d: '', fill: 'rgba(46,168,128,0.85)',
        stroke: '#c8ffe9', 'stroke-width': (1.1 * K).toFixed(2),
        'stroke-linejoin': 'round', opacity: 1
      }, land);
      landNodes.push({ node: n, poly: poly });
    });

    /* night side — lit from behind, so nearly the whole face is dark */
    el('rect', { x: E.cx - E.r, y: E.cy - E.r, width: E.r * 2, height: E.r * 2,
                 fill: 'url(#gTerminator)', 'clip-path': 'url(#clipEarth)' }, g);

    /* Atmosphere. The star is behind the planet, so the halo runs the whole way
       round: an unbroken ring first, then an additive sunward boost on top of it.
       The boost is only ever brighter than the ring underneath, so it blends in
       instead of ending in a visible edge. */
    el('circle', { cx: E.cx, cy: E.cy, r: E.r * 1.05,
                   fill: 'url(#gAtmoRing)', opacity: 0.5 }, g);
    el('circle', { cx: E.cx, cy: E.cy, r: E.r, fill: 'none', stroke: '#dff6ff',
                   'stroke-width': 1.8 * K, filter: 'url(#fLimb)', opacity: 0.5 }, g);
    el('circle', { cx: E.cx, cy: E.cy, r: E.r, fill: 'none', stroke: '#cdeeff',
                   'stroke-width': 0.9 * K, opacity: 0.4 }, g);

    var hot = el('g', { mask: 'url(#mLitLocal)' }, g);
    el('circle', { cx: E.cx, cy: E.cy, r: E.r * 1.05, fill: 'url(#gAtmoRing)' }, hot);
    el('circle', { cx: E.cx, cy: E.cy, r: E.r, fill: 'none', stroke: '#ffffff',
                   'stroke-width': 2.4 * K, filter: 'url(#fLimb)', opacity: 0.95 }, hot);
    el('circle', { cx: E.cx, cy: E.cy, r: E.r, fill: 'none', stroke: '#eaffff',
                   'stroke-width': 1.1 * K, opacity: 0.85 }, hot);

    /* A sliver of the star peeking over the limb. Built from gradients rather
       than a blur: a large-radius feGaussianBlur clips to its filter region and
       comes out square. */
    var flareY = E.cy - E.r * 0.62;
    var flareX = E.cx + Math.sqrt(Math.max(0, E.r * E.r - Math.pow(flareY - E.cy, 2)));
    var flare = el('g', { opacity: 0.9 }, g);

    var halo = el('circle', { cx: flareX, cy: flareY, r: 62 * K, fill: 'url(#gFlare)' }, flare);
    el('animate', { attributeName: 'r',
                    values: (56 * K) + ';' + (74 * K) + ';' + (56 * K),
                    dur: '5.5s', repeatCount: 'indefinite' }, halo);

    var core = el('circle', { cx: flareX, cy: flareY, r: 5 * K, fill: '#ffffff',
                              opacity: 0.9 }, flare);
    el('animate', { attributeName: 'opacity', values: '0.9;0.55;0.9',
                    dur: '5.5s', repeatCount: 'indefinite' }, core);

    /* lens streak, faded at both ends so it has no hard tips */
    el('rect', { x: flareX - 150 * K, y: flareY - 1.6 * K, width: 300 * K, height: 3.2 * K,
                 fill: 'url(#gStreak)' }, flare);
    el('rect', { x: flareX - 34 * K, y: flareY - 30 * K, width: 68 * K, height: 60 * K,
                 fill: 'url(#gStreak)', opacity: 0.22,
                 transform: 'rotate(90 ' + flareX + ' ' + flareY + ')' }, flare);

    drawGlobe();
  }

  function drawGlobe() {
    var i;
    for (i = 0; i < landNodes.length; i++) {
      landNodes[i].node.setAttribute('d', orthoPath(landNodes[i].poly, rot));
    }
    for (i = 0; i < gratNodes.length; i++) {
      gratNodes[i].node.setAttribute('d', orthoPath(gratNodes[i].poly, rot, true));
    }
  }

  /* ============================================================
     LAYER 4 — HUD: frame lines, title, bottom ruler
     ============================================================ */
  function buildHud() {
    clear(L.hud);
    L.hud.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    /* --- top technical framing --- */
    var frame = el('g', { opacity: 0.5, fill: 'none', stroke: '#6fd8ff',
                          'stroke-width': 1 }, L.hud);
    var topY = 140 * K, vx1 = 0.25 * W, vx2 = 0.62 * W;
    el('line', { x1: vx1, y1: topY, x2: W, y2: topY, opacity: 0.55 }, frame);
    el('line', { x1: vx1, y1: 0, x2: vx1, y2: topY, opacity: 0.4 }, frame);
    el('line', { x1: vx2, y1: 0, x2: vx2, y2: 0.72 * H, opacity: 0.22 }, frame);
    el('rect', { x: vx1, y: 0, width: 0.30 * W, height: topY, opacity: 0.25 }, frame);
    el('line', { x1: 0, y1: 0.71 * H, x2: W, y2: 0.71 * H, opacity: 0.16 }, frame);

    /* diagonal tick decorations along the top rail */
    var deco = el('g', { stroke: '#7dffd0', 'stroke-width': 1, opacity: 0.45 }, frame);
    for (var i = 0; i < 9; i++) {
      var x = vx1 + 30 * K + i * 46 * K;
      el('line', { x1: x, y1: topY, x2: x + 14 * K, y2: topY - 14 * K,
                   opacity: (0.2 + (i % 3) * 0.25).toFixed(2) }, deco);
    }

    /* --- top-right title --- */
    var t = el('g', { id: 'hudTitle', 'text-anchor': 'end' }, L.hud);
    var tx = W - 42 * K, ty = 62 * K;

    el('text', {
      x: tx, y: ty, fill: '#dffaff', 'font-size': 34 * K,
      'letter-spacing': 6 * K, filter: 'url(#fGlowMd)',
      style: 'font-weight:600'
    }, t).textContent = CONFIG.title;

    el('line', { x1: tx - 300 * K, y1: ty + 14 * K, x2: tx, y2: ty + 14 * K,
                 stroke: '#7fe4ff', 'stroke-width': 1.2, opacity: 0.6 }, t);
    el('path', { d: hexPath(tx - 316 * K, ty + 14 * K, 7 * K), fill: 'none',
                 stroke: '#7fe4ff', 'stroke-width': 1.2, opacity: 0.75 }, t);

    el('text', { x: tx, y: ty + 34 * K, fill: '#65c8e8', 'font-size': 13 * K,
                 'letter-spacing': 3.4 * K, opacity: 0.9 }, t)
      .textContent = CONFIG.subtitle || '';

    if (CONFIG.status) {
      var stat = el('text', { x: tx, y: ty + 56 * K, fill: '#5dff9e', 'font-size': 12 * K,
                              'letter-spacing': 2.6 * K, opacity: 0.85,
                              filter: 'url(#fGlowSm)' }, t);
      stat.textContent = CONFIG.status;
      el('animate', { attributeName: 'opacity', values: '0.85;0.25;0.85',
                      dur: '2.4s', repeatCount: 'indefinite' }, stat);
    }

    buildRuler();
  }

  /* --- bottom ruler: dark green scale, drifting left and right --- */
  function buildRuler() {
    var h = 34 * K, y0 = H - h;
    var bar = el('g', { id: 'rulerBar' }, L.hud);

    el('rect', { x: 0, y: y0 - 6 * K, width: W, height: h + 6 * K, fill: 'url(#gRuler)' }, bar);
    el('line', { x1: 0, y1: y0, x2: W, y2: y0, stroke: '#2a8355',
                 'stroke-width': 1.2, opacity: 0.7 }, bar);
    el('line', { x1: 0, y1: y0 + 1.6 * K, x2: W, y2: y0 + 1.6 * K, stroke: '#7dffb4',
                 'stroke-width': 0.8, opacity: 0.18 }, bar);

    /* the tick band drifts, so it is drawn wider than the screen */
    var band = el('g', null, bar);
    var pad = 90 * K, step = 11 * K;
    var n = Math.ceil((W + pad * 2) / step);

    var ticks = el('g', { stroke: '#2aa869', 'stroke-width': 1, opacity: 0.75 }, band);
    var labels = el('g', { fill: '#63c992', 'font-size': 10 * K, 'text-anchor': 'middle',
                           'letter-spacing': 1.5 * K, opacity: 0.6 }, band);
    var major = el('g', { fill: '#b6e8f5', 'font-size': 12 * K, 'text-anchor': 'start',
                          'letter-spacing': 2 * K, opacity: 0.8 }, band);

    for (var i = 0; i <= n; i++) {
      var x = -pad + i * step;
      var isBig = i % 5 === 0, isHuge = i % 15 === 0;
      el('line', {
        x1: x, y1: y0 + 4 * K,
        x2: x, y2: y0 + (isHuge ? 22 : isBig ? 16 : 10) * K,
        opacity: isHuge ? 0.8 : isBig ? 0.42 : 0.2
      }, ticks);

      if (isHuge) {
        var idx = i / 15;
        el('text', { x: x + 5 * K, y: y0 + 21 * K }, major).textContent = String(9 + idx);
      } else if (i % 15 === 7) {
        var seg = Math.floor(i / 15);
        el('text', { x: x, y: y0 + 12 * K }, labels).textContent =
          (seg % 2 ? '-' : '') + (10 * (seg % 3)) + '|00';
      }
    }

    /* dark-green range blocks with pointer heads, as in the mockup */
    var marks = el('g', null, band);
    [[0.14, 0.055], [0.42, 0.03], [0.61, 0.07], [0.79, 0.04]].forEach(function (m, i) {
      var mx = m[0] * W, mw = m[1] * W;
      el('rect', { x: mx, y: y0 + 5 * K, width: mw, height: 7 * K,
                   fill: i % 2 ? '#14522c' : '#0a3a1d', opacity: 0.9 }, marks);
      el('rect', { x: mx, y: y0 + 5 * K, width: mw, height: 7 * K, fill: 'none',
                   stroke: '#4fbf85', 'stroke-width': 0.8, opacity: 0.35 }, marks);
      var tri = el('path', {
        d: 'M' + mx + ',' + (y0 + 26 * K) +
           'l' + (7 * K) + ',' + (-9 * K) + 'l' + (-14 * K) + ',0Z',
        fill: '#3fbfe0', opacity: 0.75, filter: 'url(#fGlowSm)'
      }, marks);
      el('animateTransform', {
        attributeName: 'transform', type: 'translate',
        values: '0 0; ' + (18 * K) + ' 0; 0 0',
        dur: (9 + i * 3) + 's', repeatCount: 'indefinite'
      }, tri);
    });

    /* slow left/right drift of the whole scale */
    el('animateTransform', {
      attributeName: 'transform', type: 'translate',
      values: '0 0; ' + (28 * K).toFixed(1) + ' 0; 0 0; ' + (-28 * K).toFixed(1) + ' 0; 0 0',
      dur: '26s', calcMode: 'spline',
      keyTimes: '0;0.25;0.5;0.75;1',
      keySplines: '.4 0 .6 1;.4 0 .6 1;.4 0 .6 1;.4 0 .6 1',
      repeatCount: 'indefinite'
    }, band);

    /* a scanning highlight sweeping the bar */
    var sweep = el('rect', { x: -0.25 * W, y: y0 - 4 * K, width: 0.25 * W, height: h,
                             fill: 'url(#gSweep)', opacity: 0.28 }, bar);
    el('animate', { attributeName: 'x', from: -0.25 * W, to: W,
                    dur: '11s', repeatCount: 'indefinite' }, sweep);
  }

  /* ============================================================
     LAYER 5 — MENU (opens from the middle outwards)
     ============================================================ */
  function buildMenu() {
    clear(L.menu);
    L.menu.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var items = CONFIG.items || [];
    var n = items.length;
    if (!n) return;

    var gap = 72 * K, bh = 46 * K;
    var midY = 0.492 * H;
    /* clear of the planet: start outside the atmosphere ring (1.05r) plus a
       margin, so no button ever sits over the rotating globe */
    var leftMid = E.cx + E.r * 1.10 + 26 * K;
    var rightMid = leftMid + 163 * K;
    var R = 900 * K;                        // menu arc, flatter than the globe
    var cut = 13 * K;

    var root = el('g', null, L.menu);

    items.forEach(function (item, i) {
      var label = item.label;
      var k = i - (n - 1) / 2;
      var cy = midY + k * gap;
      var dy = cy - midY;
      var bulge = (dy * dy) / (2 * R);
      var x0 = leftMid - bulge;
      var x1 = rightMid - bulge * 2.2;
      var top = cy - bh / 2;

      var g = el('g', {
        'class': 'mi',
        role: 'button',
        tabindex: 0,
        'aria-label': label,
        'data-action': label.toLowerCase()
      }, root);
      /* stagger outwards from the centre item, sliding in from mid-screen */
      g.style.setProperty('--d', (Math.abs(k) * 85 + 260) + 'ms');
      g.style.setProperty('--dy', (-dy * 0.85).toFixed(1) + 'px');

      var d = 'M' + x0 + ',' + top +
              'L' + x1 + ',' + top +
              'L' + x1 + ',' + (top + bh - cut) +
              'L' + (x1 - cut) + ',' + (top + bh) +
              'L' + x0 + ',' + (top + bh) + 'Z';

      el('path', { 'class': 'btn-body', d: d, fill: 'url(#gBtn)',
                   stroke: '#7fe4ff', 'stroke-width': 1.4, opacity: 0.98 }, g);
      el('path', { d: d, fill: 'url(#gBtnSheen)', 'pointer-events': 'none' }, g);

      /* bright inner rail on the leading edge */
      el('rect', { x: x0, y: top, width: 3.2 * K, height: bh, fill: '#bff3ff',
                   opacity: 0.75, 'pointer-events': 'none' }, g);
      el('rect', { 'class': 'btn-edge', x: x0, y: top, width: 3.2 * K, height: bh,
                   fill: '#ffffff', opacity: 0, filter: 'url(#fGlowMd)',
                   'pointer-events': 'none' }, g);

      /* hover chevron sitting off the trailing edge */
      el('path', {
        'class': 'btn-wing',
        d: 'M' + (x1 + 12 * K) + ',' + (cy - 8 * K) +
           'L' + (x1 + 24 * K) + ',' + cy +
           'L' + (x1 + 12 * K) + ',' + (cy + 8 * K) + 'Z',
        fill: '#7fe4ff', filter: 'url(#fGlowSm)', 'pointer-events': 'none'
      }, g);

      el('text', {
        'class': 'btn-label',
        x: (x0 + x1) / 2, y: cy + 7 * K,
        'text-anchor': 'middle', fill: '#e6feff',
        'font-size': 21 * K, 'letter-spacing': 3.2 * K,
        filter: 'url(#fGlowSm)', 'pointer-events': 'none',
        style: 'font-weight:600'
      }, g).textContent = label;

      g.addEventListener('click', function () { select(g, item); });
      g.addEventListener('mouseenter', function () { if (sfxHover) sfxHover.play(); });
      g.addEventListener('focus', function () { if (sfxHover) sfxHover.play(); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(g, item); }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          var nodes = root.querySelectorAll('.mi');
          nodes[(i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
        }
      });
    });
  }

  function select(g, item) {
    if (sfxClick) sfxClick.play();

    var body = g.querySelector('.btn-body');
    body.style.fill = '#dffaff';
    setTimeout(function () { body.style.fill = ''; }, 130);

    document.dispatchEvent(new CustomEvent('menu:select', { detail: { item: item.label, link: item.link || '' } }));

    if (item.link) {
      /* let the click sound start before the page goes away */
      setTimeout(function () {
        if (item.external) window.open(item.link, '_blank', 'noopener');
        else window.location.href = item.link;
      }, 140);
    }
  }

  /* ============================================================
     BUILD / RESIZE / LOOP
     ============================================================ */
  function buildAll() {
    W = window.innerWidth;
    H = window.innerHeight;
    K = Math.max(0.55, Math.min(H / 768, W / 900));
    buildHex();
    buildAtlas();
    buildGlobe();
    buildHud();
    buildMenu();
  }

  function tick(t) {
    if (!lastT) lastT = t;
    var dt = t - lastT;
    lastT = t;
    rot += dt * 0.0026;               // one revolution every ~140s
    if (rot > 360) rot -= 360;
    acc += dt;
    if (acc >= 33) { acc = 0; drawGlobe(); }   // globe repaints at ~30fps
    requestAnimationFrame(tick);
  }

  function reveal() {
    document.body.classList.remove('boot');
    document.body.classList.add('ready');
  }

  function start() {
    if (CONFIG.documentTitle) document.title = CONFIG.documentTitle;
    initAudio();
    buildAll();
    requestAnimationFrame(tick);

    if (document.readyState === 'complete') setTimeout(reveal, 120);
    else window.addEventListener('load', function () { setTimeout(reveal, 260); });
    /* never wait on a slow video decode */
    setTimeout(function () {
      if (!document.body.classList.contains('ready')) reveal();
    }, 2600);
  }

  /* config first: the menu arc and its timings are derived from the item list */
  if (window.fetch) {
    fetch('data/menu.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        for (var k in json) if (json[k] !== undefined) CONFIG[k] = json[k];
      })
      .catch(function (err) {
        console.warn('[menu] data/menu.json not loaded (' + err.message +
                     '); using built-in defaults. Serve the folder over HTTP to edit it.');
      })
      .then(start);
  } else {
    start();
  }

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () {
      var was = document.body.classList.contains('ready');
      if (was) L.menu.classList.add('noanim');
      buildAll();
      if (was) {
        void L.menu.getBoundingClientRect();
        setTimeout(function () { L.menu.classList.remove('noanim'); }, 60);
      }
    }, 160);
  });
})();
