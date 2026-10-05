/* Abadis Med redesign — shared behaviour.
   Theme switch (light/dark/noir, persisted), header, mobile menu,
   mosaic (square-grid) video, lightbox, scroll reveal, CSR background fade.
   Deliberately NO mousemove / hover-driven motion. */
(() => {
  const root = document.documentElement;
  const KEY = 'abadis-theme';
  const THEMES = ['light', 'dark', 'noir'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- theme ---------- */
  function setTheme(t, save) {
    if (!THEMES.includes(t)) t = 'light';
    root.dataset.theme = t;
    if (save) { try { localStorage.setItem(KEY, t); } catch (_) {} }
    document.querySelectorAll('.theme-switch button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.set === t)));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#e8f3f3' : t === 'dark' ? '#061719' : '#0a0a12';
    document.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }
  document.querySelectorAll('.theme-switch button').forEach((b) =>
    b.addEventListener('click', () => setTheme(b.dataset.set, true)));
  setTheme(root.dataset.theme || 'light', false);

  /* ---------- header ---------- */
  const header = document.getElementById('header');
  if (header && !header.classList.contains('solid')) {
    const on = () => header.classList.toggle('scrolled', scrollY > 40);
    addEventListener('scroll', on, { passive: true }); on();
  }
  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', () => {
    const open = header.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  /* ---------- scroll reveal ---------- */
  const rev = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) rev.forEach((e) => e.classList.add('in'));
  else {
    const io = new IntersectionObserver((en) => en.forEach((x) => {
      if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    rev.forEach((e) => io.observe(e));
  }

  /* ---------- mosaic video (مربع مربعی) ----------
     The <video> is decoded off-screen; every frame is sampled down to a
     grid (one pixel per tile) and redrawn as crisp square tiles with a
     thin gap. On load the tiles resolve from coarse to fine; while the
     hero scrolls away they grow coarse again. Scroll-driven only. */
  function mosaic(host) {
    const video = host.querySelector('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx || !video) { host.classList.add('no-canvas'); return; }
    host.appendChild(canvas);
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d');
    const poster = new Image();
    poster.src = video.getAttribute('poster') || '';
    const fine = Number(host.dataset.tile || 12);
    let W = 0, H = 0, dpr = 1, gap = '#062a2c', visible = true, t0 = performance.now();
    const patterns = new Map();

    function readGap() {
      gap = getComputedStyle(root).getPropertyValue('--mosaic-gap').trim() || '#062a2c';
      patterns.clear();
    }
    function size() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = Math.round(host.clientWidth * dpr); H = Math.round(host.clientHeight * dpr);
      canvas.width = W; canvas.height = H;
    }
    function pattern(t) {
      const k = t;
      if (patterns.has(k)) return patterns.get(k);
      const p = document.createElement('canvas'); p.width = p.height = t;
      const g = p.getContext('2d');
      const gw = Math.max(1, Math.round(t * 0.1));
      g.fillStyle = gap; g.fillRect(0, 0, t, t); g.clearRect(0, 0, t - gw, t - gw);
      const pat = ctx.createPattern(p, 'repeat'); patterns.set(k, pat); return pat;
    }
    function tileNow() {
      const mobile = host.clientWidth < 700;
      const base = mobile ? Math.max(7, fine - 4) : fine;
      let intro = 1;
      if (!reduce) intro = Math.min(1, (performance.now() - t0) / 1800);
      const ease = 1 - Math.pow(1 - intro, 3);
      let tile = base + (base * 5) * (1 - ease);          // coarse → fine on load
      const r = host.getBoundingClientRect();
      const out = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
      if (!reduce) tile += base * 2.5 * out;                 // coarser as hero scrolls away
      return Math.max(4, Math.round(tile * dpr));
    }
    function draw() {
      const src = video.readyState >= 2 ? video : (poster.complete && poster.naturalWidth ? poster : null);
      if (!src || !W) return;
      const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight;
      const t = tileNow();
      const cols = Math.ceil(W / t), rows = Math.ceil(H / t);
      // cover-crop source to canvas aspect
      const ca = (cols * t) / (rows * t), sa = sw / sh;
      let cx = 0, cy = 0, cw = sw, ch = sh;
      if (sa > ca) { cw = sh * ca; cx = (sw - cw) / 2; } else { ch = sw / ca; cy = (sh - ch) / 2; }
      if (small.width !== cols || small.height !== rows) { small.width = cols; small.height = rows; }
      sctx.drawImage(src, cx, cy, cw, ch, 0, 0, cols, rows);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, cols, rows, 0, 0, cols * t, rows * t);
      ctx.fillStyle = pattern(t);
      ctx.fillRect(0, 0, W, H);
    }
    function loop() {
      if (visible) draw();
      requestAnimationFrame(loop);
    }
    readGap(); size();
    poster.addEventListener('load', draw); video.addEventListener('loadeddata', draw);
    addEventListener('resize', size);
    document.addEventListener('themechange', readGap);
    new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (visible) video.play().catch(() => {}); else video.pause();
    }).observe(host);
    if (reduce) { video.removeAttribute('autoplay'); video.pause(); video.addEventListener('loadeddata', draw); poster.onload = draw; }
    else video.play().catch(() => {});
    loop();
  }
  document.querySelectorAll('.mosaic').forEach(mosaic);

  /* ---------- CSR background: fade in once the painting is decoded ---------- */
  const csr = document.querySelector('.csr-bg');
  if (csr) {
    const img = new Image();
    img.src = csr.dataset.src;
    const show = () => requestAnimationFrame(() => requestAnimationFrame(() => csr.classList.add('shown')));
    (img.decode ? img.decode() : Promise.reject()).then(show, () => { img.onload = show; if (img.complete) show(); });
  }

  /* ---------- lightbox (click / keyboard / swipe) ---------- */
  const lb = document.getElementById('lightbox');
  if (lb) {
    const img = lb.querySelector('img'), cap = lb.querySelector('figcaption'), cnt = lb.querySelector('.lb-count');
    let items = [], idx = 0, last = null;
    const fa = (n) => n.toLocaleString('fa-IR');
    const show = (i) => {
      idx = (i + items.length) % items.length;
      const a = items[idx], alt = (a.querySelector('img') || {}).alt || '';
      img.src = a.getAttribute('href'); img.alt = alt; cap.textContent = alt;
      cnt.textContent = fa(idx + 1) + ' / ' + fa(items.length);
    };
    const open = (a) => {
      items = [...document.querySelectorAll('[data-gallery="' + a.dataset.gallery + '"]')];
      last = document.activeElement; lb.hidden = false; lb.classList.add('open');
      document.body.classList.add('lb-lock'); show(items.indexOf(a)); lb.querySelector('.lb-close').focus();
    };
    const close = () => { lb.classList.remove('open'); lb.hidden = true; document.body.classList.remove('lb-lock'); if (last) last.focus(); };
    document.querySelectorAll('[data-gallery]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); open(a); }));
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', () => show(idx - 1));
    lb.querySelector('.lb-next').addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(idx - 1); else if (e.key === 'ArrowLeft') show(idx + 1);
    });
    let sx = null, sy = 0;
    lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) show(idx + (dx > 0 ? 1 : -1));
    });
  }

  /* ---------- contact form: honest mailto hand-off (no fake "sent") ---------- */
  const form = document.getElementById('leadForm');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const body = ['نام: ' + d.get('name'), 'مرکز درمانی / شرکت: ' + d.get('org'), 'تلفن: ' + d.get('phone'), 'موضوع: ' + d.get('topic'), '', d.get('msg')].join('\n');
    location.href = 'mailto:info@abadis-med.com?subject=' + encodeURIComponent('درخواست از وب‌سایت — ' + d.get('topic')) + '&body=' + encodeURIComponent(body);
    const s = document.getElementById('formStatus');
    if (s) s.textContent = 'برنامهٔ ایمیل شما باز شد؛ پیام بعد از ارسال از همان‌جا به دست ما می‌رسد.';
  });
})();
