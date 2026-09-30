/**
 * Abadis — 3D product viewer (assembled suction liner).
 * - three@0.170.0 vendored locally (importmap), no CDN.
 * - lid: photo-matched teal #0f3c48 matte molded plastic; body: milky liner plastic.
 * - Free trackball rotation in every direction (no polar clamp), smoothed follow + inertia.
 *   Mouse: drag anywhere in the card. Wheel is never captured (page scrolls).
 *   Touch: a drag that starts ON the product rotates freely (that zone is touch-action:none);
 *   a swipe that starts on the empty card area keeps native page scroll (touch-action:pan-y),
 *   horizontal drags there still rotate; two fingers always scroll the page.
 * - After ~4 s idle the liner eases back upright and resumes a slow showroom spin.
 * - Camera fitted once from the bounding sphere (every orientation fits); resize debounced.
 * - Renders only while the card is on screen and the tab is visible.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL_URL = new URL('../abadis-scrub-parts.glb', import.meta.url).href;
const HDR_URL = new URL('../env/studio_small_09_1k.hdr', import.meta.url).href;

const LID_TEAL = 0x0f3c48;
const CAM_FOV = 26;
const CAM_ELEV = THREE.MathUtils.degToRad(12);
const FIT_MARGIN = 1.06;
const IDLE_SPEED = 0.32; /* rad/s */
const IDLE_RESUME_MS = 4000;
const UPRIGHT_HZ = 1.1;
const DRAG_THRESH = 6;
const HORIZ_RATIO = 0.8;
const FOLLOW_HZ = 16;
const FRICTION = 2.8;
const VEL_EPS = 0.02;
const MAX_VEL = 14;

export function initProductViewer(host) {
  const api = (window.__abadisViewer = { status: 'init', frames: 0, interacted: false, rotateGestures: 0, pageScrollGestures: 0 });
  const canvas = host.querySelector('.pv-canvas');
  const hint = host.querySelector('.pv-hint');
  const loading = host.querySelector('.pv-loading');
  const envMode = new URLSearchParams(location.search).get('env') || 'hdr';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* grab zone = screen rect of the product; only here does touch skip native scrolling */
  const grab = document.createElement('div');
  grab.className = 'pv-grab';
  grab.setAttribute('aria-hidden', 'true');
  host.appendChild(grab);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    fail('webgl', err);
    return api;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fail('context-lost');
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.01, 20);

  scene.add(new THREE.HemisphereLight(0xf3fafa, 0x0b2e32, 0.22));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(1.6, 1.5, 1.1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe6e6, 0.35);
  fill.position.set(-1.6, 0.3, 0.9);
  scene.add(fill);
  const rimA = new THREE.DirectionalLight(0xe8f3f3, 1.25);
  rimA.position.set(-1.1, 0.9, -1.4);
  scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0x9fd6d6, 0.9);
  rimB.position.set(1.2, 0.3, -1.2);
  scene.add(rimB);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const state = { ready: false, visible: false, running: false, lastW: 0, lastH: 0 };

  /* ---------- sizing ---------- */
  function applySize(force) {
    const w = Math.max(1, Math.round(host.clientWidth));
    const h = Math.max(1, Math.round(host.clientHeight));
    if (!force && Math.abs(w - state.lastW) < 2 && Math.abs(h - state.lastH) < 2) return false;
    state.lastW = w;
    state.lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fitCamera();
    return true;
  }
  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (applySize(false)) requestRender();
    }, 140);
  }).observe(host);

  let fitData = null;
  const camUp = new THREE.Vector3(0, 1, 0);
  const camRight = new THREE.Vector3(1, 0, 0);
  function fitCamera() {
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const R = fitData ? fitData.R : 0.17;
    /* bounding sphere => the product fits in every orientation */
    const dist = (R / Math.sin(Math.min(vHalf, hHalf))) * FIT_MARGIN;
    camera.position.set(0, Math.sin(CAM_ELEV) * dist, Math.cos(CAM_ELEV) * dist);
    camera.near = Math.max(0.005, dist / 50);
    camera.far = dist * 10;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  }

  /* ---------- environment ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  function roomEnv() {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  async function loadEnv() {
    if (envMode === 'room') return roomEnv();
    try {
      const tex = await new RGBELoader().loadAsync(HDR_URL);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
    } catch (e) {
      console.warn('[viewer] HDR failed, using RoomEnvironment', e);
      roomEnv();
    }
  }

  /* ---------- materials ---------- */
  function paintLid(lid) {
    lid.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshPhysicalMaterial({
        color: LID_TEAL, roughness: 0.52, metalness: 0.035, clearcoat: 0.12, clearcoatRoughness: 0.4,
        envMapIntensity: 1.1, side: THREE.DoubleSide,
      });
    });
  }
  function convertBodyToLinerPlastic(body) {
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshPhysicalMaterial({
        color: 0xd9e8e8, roughness: 0.42, metalness: 0, sheen: 0.25, sheenRoughness: 0.55,
        sheenColor: new THREE.Color(0xf3fafa), clearcoat: 0.3, clearcoatRoughness: 0.35,
        envMapIntensity: 0.42, side: THREE.DoubleSide,
      });
    });
  }
  function makeShadow(width) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(2,20,22,0.45)');
    grd.addColorStop(0.5, 'rgba(2,20,22,0.16)');
    grd.addColorStop(1, 'rgba(2,20,22,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = -1;
    return m;
  }

  /* ---------- load ---------- */
  const corners = [];
  (async () => {
    try {
      applySize(true);
      const [gltf] = await Promise.all([new GLTFLoader().loadAsync(MODEL_URL), loadEnv()]);
      pmrem.dispose();
      const root = gltf.scene;
      const lid = root.getObjectByName('lid');
      const body = root.getObjectByName('body');
      if (!lid || !body) throw new Error('model missing lid/body nodes');
      paintLid(lid);
      convertBodyToLinerPlastic(body);
      root.updateMatrixWorld(true);

      /* rotate about the centre of the assembled bounding box */
      const all = new THREE.Box3().setFromObject(root);
      const c = all.getCenter(new THREE.Vector3());
      root.position.sub(c);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      let R = 0;
      const v = new THREE.Vector3();
      root.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 2) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          R = Math.max(R, v.length());
        }
      });
      for (let i = 0; i < 8; i++) {
        corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      }
      fitData = { R, halfH: (box.max.y - box.min.y) / 2 };
      pivot.add(root);

      const shadow = makeShadow(R * 1.5);
      shadow.position.y = -fitData.halfH - 0.004;
      scene.add(shadow);

      applySize(true);
      renderer.compile(scene, camera);
      state.ready = true;
      api.status = 'ready';
      renderFrame(0);
      host.classList.add('pv-ready');
      if (loading) loading.classList.add('hide');
      requestRender();
    } catch (err) {
      fail('load', err);
    }
  })();

  function fail(reason, err) {
    api.status = 'fallback:' + reason;
    if (err) console.warn('[viewer] fallback (' + reason + ')', err);
    host.classList.remove('pv-ready');
    host.classList.add('pv-failed');
    if (loading) loading.classList.add('hide');
  }

  /* ---------- orientation state ---------- */
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
  const qTarget = q.clone();
  const omega = new THREE.Vector3(); /* world-space angular velocity (axis * rad/s) */
  let idleBlend = reduceMotion ? 0 : 1;
  let lastInteract = -1e9;
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);

  function rotateBy(target, dx, dy, s) {
    /* screen-space trackball: horizontal drag spins about the view "up", vertical about the view "right" */
    if (dx) target.premultiply(tmpQ.setFromAxisAngle(camUp, dx * s));
    if (dy) target.premultiply(tmpQ.setFromAxisAngle(camRight, dy * s));
    target.normalize();
  }
  function sens() {
    return (Math.PI * 1.5) / Math.max(240, host.clientWidth); /* one card width ≈ 3/4 turn */
  }
  function markInteract() {
    api.rotateGestures++;
    lastInteract = performance.now();
    if (!api.interacted) {
      api.interacted = true;
      if (hint) hint.classList.add('pv-hint--gone');
    }
    requestRender();
  }

  /* ---------- pointer handling ---------- */
  const pointers = new Map(); /* active touch pointers (for two-finger scroll) */
  const drag = { active: false, rotate: false, decided: false, id: null, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, touch: false, onModel: false };
  let twoFinger = null;

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse') pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      /* second finger: stop rotating, hand the gesture to page scrolling */
      endDrag(null, true);
      const pts = [...pointers.values()];
      twoFinger = { y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
      api.pageScrollGestures++;
      return;
    }
    drag.active = true;
    drag.id = e.pointerId;
    drag.touch = e.pointerType !== 'mouse';
    drag.onModel = e.target === grab;
    drag.sx = drag.lx = e.clientX;
    drag.sy = drag.ly = e.clientY;
    drag.lt = performance.now();
    omega.set(0, 0, 0);
    if (!drag.touch || drag.onModel) {
      /* mouse anywhere, or a finger on the product: free rotation right away */
      drag.rotate = drag.decided = !drag.touch;
      if (!drag.touch) {
        try { host.setPointerCapture(e.pointerId); } catch (_) {}
        host.classList.add('pv-grabbing');
        markInteract();
      }
    } else {
      drag.rotate = drag.decided = false;
    }
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (twoFinger) {
      const pts = [...pointers.values()];
      if (pts.length >= 2) {
        const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        window.scrollBy(0, twoFinger.y - y);
        twoFinger.y = y;
      }
      return;
    }
    if (!drag.active || e.pointerId !== drag.id) return;
    const x = e.clientX;
    const y = e.clientY;
    if (!drag.decided) {
      const tdx = x - drag.sx;
      const tdy = y - drag.sy;
      if (Math.hypot(tdx, tdy) < DRAG_THRESH) return;
      drag.decided = true;
      if (drag.onModel || Math.abs(tdx) > Math.abs(tdy) * HORIZ_RATIO) {
        drag.rotate = true;
        drag.lx = x;
        drag.ly = y;
        try { host.setPointerCapture(e.pointerId); } catch (_) {}
        markInteract();
      } else {
        drag.active = false; /* vertical swipe on the empty card area: the page scrolls */
        return;
      }
    }
    if (!drag.rotate) return;
    const now = performance.now();
    const dt = Math.max(0.001, (now - drag.lt) / 1000);
    drag.lt = now;
    const s = sens();
    const dx = x - drag.lx;
    const dy = y - drag.ly;
    drag.lx = x;
    drag.ly = y;
    rotateBy(qTarget, dx, dy, s);
    /* smoothed angular velocity for the release fling */
    tmpV.copy(camUp).multiplyScalar((dx * s) / dt).addScaledVector(camRight, (dy * s) / dt);
    omega.lerp(tmpV, 1 - Math.exp(-16 * dt));
    lastInteract = now;
    requestRender();
  }

  function endDrag(e, keepPointers) {
    if (e && !keepPointers) {
      pointers.delete(e.pointerId);
      if (twoFinger) {
        if (pointers.size < 2) twoFinger = null;
        drag.active = drag.rotate = drag.decided = false;
        drag.id = null;
        return;
      }
      if (drag.id != null && e.pointerId !== drag.id) return;
    }
    if (drag.rotate) {
      const gap = performance.now() - drag.lt;
      const keep = keepPointers ? 0 : THREE.MathUtils.clamp(1 - (gap - 70) / 110, 0, 1);
      omega.multiplyScalar(keep);
      if (omega.length() > MAX_VEL) omega.setLength(MAX_VEL);
      api.lastRelease = { gap: Math.round(gap), vel: +omega.length().toFixed(3) };
      lastInteract = performance.now();
    }
    drag.active = drag.rotate = drag.decided = false;
    drag.id = null;
    host.classList.remove('pv-grabbing');
  }

  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', (e) => endDrag(e));
  host.addEventListener('pointercancel', (e) => endDrag(e));
  /* touch pointers are implicitly captured by their start element; re-capturing to host fires lostpointercapture on it, so only the host's own capture loss ends a drag */
  host.addEventListener('lostpointercapture', (e) => { if (e.target === host && e.pointerId === drag.id) endDrag(e); });

  /* keyboard: arrows rotate in all four directions */
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!k) return;
    e.preventDefault();
    omega.addScaledVector(camUp, k[0] * 2.2).addScaledVector(camRight, k[1] * 2.2);
    markInteract();
  });

  /* ---------- animation ---------- */
  function step(dt, now) {
    /* all motion is applied to qTarget; the shown orientation q always eases toward it,
       so no part of a quick drag is lost on release even at low frame rates */
    if (!drag.rotate && omega.lengthSq() > VEL_EPS * VEL_EPS) {
      const w = omega.length();
      qTarget.premultiply(tmpQ.setFromAxisAngle(tmpV.copy(omega).divideScalar(w), w * dt)).normalize();
      omega.multiplyScalar(Math.exp(-FRICTION * dt));
      if (omega.lengthSq() < VEL_EPS * VEL_EPS) omega.set(0, 0, 0);
    }
    const idleWanted = !reduceMotion && !drag.rotate && omega.lengthSq() === 0 && !twoFinger && now - lastInteract > IDLE_RESUME_MS ? 1 : 0;
    idleBlend += (idleWanted - idleBlend) * (1 - Math.exp(-(idleWanted ? 0.9 : 8) * dt));
    if (idleBlend > 0.001) {
      /* ease back upright (keeps heading), then slow spin about the vertical */
      const up = tmpV.copy(Y).applyQuaternion(qTarget);
      const upright = tmpQ.setFromUnitVectors(up, Y).multiply(qTarget);
      qTarget.slerp(upright, (1 - Math.exp(-UPRIGHT_HZ * dt)) * idleBlend);
      qTarget.premultiply(tmpQ.setFromAxisAngle(Y, IDLE_SPEED * idleBlend * dt)).normalize();
    }
    q.slerp(qTarget, 1 - Math.exp(-FOLLOW_HZ * dt));
    pivot.quaternion.copy(q);
    api.up = +tmpV.copy(Y).applyQuaternion(qTarget).y.toFixed(3);
  }

  const proj = new THREE.Vector3();
  let lastRect = '';
  function updateGrab() {
    if (!corners.length) return;
    pivot.updateMatrixWorld(true);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const W = state.lastW, H = state.lastH;
    for (const c of corners) {
      proj.copy(c).applyMatrix4(pivot.matrixWorld).project(camera);
      const px = (proj.x * 0.5 + 0.5) * W;
      const py = (-proj.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    /* the oriented box is a bit larger than the silhouette: trim 6% each side */
    const tw = (x1 - x0) * 0.06, th = (y1 - y0) * 0.06;
    x0 = Math.max(0, x0 + tw); x1 = Math.min(W, x1 - tw); y0 = Math.max(0, y0 + th); y1 = Math.min(H, y1 - th);
    const r = `${Math.round(x0)},${Math.round(y0)},${Math.round(x1 - x0)},${Math.round(y1 - y0)}`;
    if (r === lastRect) return;
    lastRect = r;
    const [a, b, w, h] = r.split(',');
    grab.style.cssText = `left:${a}px;top:${b}px;width:${w}px;height:${h}px`;
    api.grabRect = { x: +a, y: +b, w: +w, h: +h };
  }

  function busy() {
    return drag.rotate || omega.lengthSq() > 0 || idleBlend > 0.002 || q.angleTo(qTarget) > 1e-4 || !reduceMotion;
  }
  function renderFrame(dt) {
    step(dt, performance.now());
    renderer.render(scene, camera);
    if (!drag.active) updateGrab(); /* never move the zone under an active finger */
    api.frames++;
  }

  let rafId = 0;
  let lastTs = 0;
  function tick(ts) {
    rafId = 0;
    if (!state.ready || !state.visible || document.hidden) {
      state.running = false;
      return;
    }
    const dt = lastTs ? Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000)) : 1 / 60;
    lastTs = ts;
    renderFrame(dt);
    if (busy()) rafId = requestAnimationFrame(tick);
    else state.running = false;
  }
  function requestRender() {
    if (!state.ready || !state.visible || document.hidden) return;
    if (!rafId) {
      if (!state.running) lastTs = 0;
      state.running = true;
      rafId = requestAnimationFrame(tick);
    }
  }
  new IntersectionObserver(
    (entries) => {
      state.visible = entries.some((en) => en.isIntersecting);
      if (state.visible) requestRender();
    },
    { rootMargin: '80px 0px' }
  ).observe(host);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestRender();
  });

  /* test / capture helpers */
  api.snapshot = (w = 800) => {
    if (!state.ready) return null;
    const pw = state.lastW, ph = state.lastH;
    renderer.setPixelRatio(1);
    renderer.setSize(w, Math.round((w * ph) / pw), false);
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/png');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(pw, ph, false);
    renderer.render(scene, camera);
    return url;
  };
  api.quat = () => qTarget.toArray().map((n) => +n.toFixed(4));
  api.freeze = () => { lastInteract = performance.now() + 1e9; idleBlend = 0; omega.set(0, 0, 0); q.copy(qTarget); };
  return api;
}
