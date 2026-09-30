/**
 * Abadis — assembled 3D product viewer for the product card (#product).
 * - three@0.170.0 vendored locally (importmap), no CDN.
 * - lid: photo-matched teal #0f3c48 matte molded plastic; body: milky liner plastic.
 * - Drag to rotate (mouse + touch) with smoothed follow + inertia coast.
 *   Touch: horizontal drag rotates; vertical swipe scrolls the page (touch-action: pan-y).
 * - Camera fitted once from the assembled bounding box; the card is square so a
 *   mobile URL-bar resize never changes framing. Resize is debounced.
 * - Renders only while the card is on screen and the tab is visible.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL_URL = new URL('../models/abadis-scrub-parts.glb', import.meta.url).href;
const HDR_URL = new URL('../env/studio_small_09_1k.hdr', import.meta.url).href;

const LID_TEAL = 0x0f3c48;
const CAM_FOV = 26;
const CAM_ELEV = THREE.MathUtils.degToRad(13);
const FIT_MARGIN = 1.13;
const IDLE_SPEED = 0.32; /* rad/s slow showroom spin */
const IDLE_RESUME_MS = 3500;
const PITCH_MAX = 0.32;
const DRAG_THRESH = 6;
const HORIZ_RATIO = 0.8;
const FOLLOW_HZ = 14;
const FRICTION_YAW = 2.6;
const FRICTION_PITCH = 6.5;
const VEL_EPS = 0.02;

export function initProductViewer(host) {
  const api = (window.__abadisViewer = {
    status: 'init',
    frames: 0,
    interacted: false,
    yaw: 0,
    pitch: 0,
  });
  const canvas = host.querySelector('.pv-canvas');
  const hint = host.querySelector('.pv-hint');
  const envMode = new URLSearchParams(location.search).get('env') || 'hdr';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
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

  /* Lights: soft key + cool fill + brand rims so the dark lid separates from the teal card */
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

  const pivot = new THREE.Group(); /* user yaw / pitch */
  scene.add(pivot);

  const state = {
    ready: false,
    visible: false,
    running: false,
    halfH: 0.15,
    bottomY: -0.15,
    lastW: 0,
    lastH: 0,
  };

  /* ---------- sizing (debounced; square card => framing never jumps) ---------- */
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
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (applySize(false)) requestRender();
    }, 140);
  });
  ro.observe(host);

  let fitData = null; /* measured once from the assembled pose */
  function fitCamera() {
    if (!fitData) {
      camera.position.set(0, 0.1, 1);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      return;
    }
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(camera.aspect, 0.3));
    /* bounding cylinder around the spin axis covers every yaw angle */
    const dV = (fitData.halfH * Math.cos(CAM_ELEV) + fitData.rXZ * Math.sin(CAM_ELEV)) / Math.tan(vHalf) + fitData.rXZ;
    const dH = fitData.rXZ / Math.tan(hHalf) + fitData.rXZ;
    const dist = Math.max(dV, dH) * FIT_MARGIN;
    camera.position.set(0, Math.sin(CAM_ELEV) * dist, Math.cos(CAM_ELEV) * dist);
    camera.near = Math.max(0.005, dist / 50);
    camera.far = dist * 10;
    camera.lookAt(0, -fitData.halfH * 0.11, 0);
    camera.updateProjectionMatrix();
  }

  /* ---------- environment ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  function roomEnv() {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  async function loadEnv() {
    if (envMode === 'room') {
      roomEnv();
      return;
    }
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
        color: LID_TEAL,
        roughness: 0.52,
        metalness: 0.035,
        clearcoat: 0.12,
        clearcoatRoughness: 0.4,
        envMapIntensity: 1.1,
        side: THREE.DoubleSide,
      });
    });
  }
  function convertBodyToLinerPlastic(body) {
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshPhysicalMaterial({
        color: 0xd9e8e8,
        roughness: 0.42,
        metalness: 0,
        sheen: 0.25,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(0xf3fafa),
        clearcoat: 0.3,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.42,
        side: THREE.DoubleSide,
      });
    });
  }

  /* Soft contact shadow (not rotated with the product) */
  function makeShadow(width) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(2,20,22,0.5)');
    grd.addColorStop(0.5, 'rgba(2,20,22,0.18)');
    grd.addColorStop(1, 'rgba(2,20,22,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = -1;
    return m;
  }

  /* ---------- load ---------- */
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

      /* Spin axis = liner body axis; vertical centre = assembled bbox centre */
      const all = new THREE.Box3().setFromObject(root);
      const bodyBox = new THREE.Box3().setFromObject(body);
      const axis = new THREE.Vector3();
      bodyBox.getCenter(axis);
      const cy = (all.min.y + all.max.y) / 2;
      root.position.set(-axis.x, -cy, -axis.z);
      root.updateMatrixWorld(true);

      /* radius around axis from actual vertices (exact, handles lid port) */
      let rXZ = 0;
      const v = new THREE.Vector3();
      root.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 3) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          rXZ = Math.max(rXZ, Math.hypot(v.x, v.z));
        }
      });
      const halfH = (all.max.y - all.min.y) / 2;
      fitData = { halfH, rXZ };
      pivot.add(root);

      const shadow = makeShadow(rXZ * 2.3);
      shadow.position.y = -halfH - 0.002;
      scene.add(shadow);

      applySize(true);
      renderer.compile(scene, camera);
      state.ready = true;
      api.status = 'ready';
      renderFrame(0);
      host.classList.add('pv-ready');
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
  }

  /* ---------- interaction (hybrid pointer rotate + inertia) ---------- */
  let userYaw = 0.35;
  let targetYaw = userYaw;
  let userPitch = 0;
  let targetPitch = 0;
  let velYaw = 0;
  let velPitch = 0;
  let idleBlend = reduceMotion ? 0 : 1;
  let lastInteract = -1e9;
  const drag = { active: false, rotate: false, decided: false, id: null, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, touch: false };

  function yawSens() {
    /* one card-width drag ≈ 3/4 turn */
    return (Math.PI * 1.5) / Math.max(240, host.clientWidth);
  }

  function markInteract() {
    api.rotateGestures = (api.rotateGestures || 0) + 1;
    lastInteract = performance.now();
    if (!api.interacted) {
      api.interacted = true;
      if (hint) hint.classList.add('pv-hint--gone');
    }
    requestRender();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.active = true;
    drag.id = e.pointerId;
    drag.touch = e.pointerType !== 'mouse';
    drag.sx = drag.lx = e.clientX;
    drag.sy = drag.ly = e.clientY;
    drag.lt = performance.now();
    targetYaw = userYaw;
    targetPitch = userPitch;
    velYaw = velPitch = 0;
    if (!drag.touch) {
      drag.rotate = drag.decided = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      host.classList.add('pv-grabbing');
      markInteract();
    } else {
      drag.rotate = drag.decided = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    const x = e.clientX;
    const y = e.clientY;
    if (!drag.decided) {
      const tdx = x - drag.sx;
      const tdy = y - drag.sy;
      if (Math.hypot(tdx, tdy) < DRAG_THRESH) return;
      drag.decided = true;
      if (Math.abs(tdx) > Math.abs(tdy) * HORIZ_RATIO) {
        drag.rotate = true;
        drag.lx = x;
        drag.ly = y;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        markInteract();
      } else {
        drag.active = false; /* vertical: let the page scroll */
        return;
      }
    }
    if (!drag.rotate) return;
    const now = performance.now();
    const dt = Math.max(0.001, (now - drag.lt) / 1000);
    drag.lt = now;
    const s = yawSens();
    const dYaw = (x - drag.lx) * s;
    const dPitch = drag.touch ? 0 : (y - drag.ly) * s * 0.5;
    drag.lx = x;
    drag.ly = y;
    targetYaw += dYaw;
    targetPitch = THREE.MathUtils.clamp(targetPitch + dPitch, -PITCH_MAX, PITCH_MAX);
    const b = 1 - Math.exp(-16 * dt);
    velYaw += (dYaw / dt - velYaw) * b;
    velPitch += (dPitch / dt - velPitch) * b;
    lastInteract = now;
    requestRender();
  });

  function endDrag(e) {
    if (drag.id != null && e.pointerId !== drag.id) return;
    if (drag.rotate) {
      /* stale velocity if finger rested before lifting */
      const gap = performance.now() - drag.lt;
      api.lastRelease = { gap: Math.round(gap), vel: +velYaw.toFixed(3), type: e.type };
      /* finger rested before lifting => little or no fling */
      const keep = THREE.MathUtils.clamp(1 - (gap - 70) / 110, 0, 1);
      velYaw *= keep;
      velPitch *= keep;
      velYaw = THREE.MathUtils.clamp(velYaw, -14, 14);
      targetYaw = userYaw;
      targetPitch = userPitch;
      lastInteract = performance.now();
    }
    drag.active = drag.rotate = drag.decided = false;
    drag.id = null;
    host.classList.remove('pv-grabbing');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  /* keyboard: arrow keys rotate (accessibility) */
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      velYaw += e.key === 'ArrowLeft' ? -2.2 : 2.2;
      markInteract();
    }
  });

  function step(dt, now) {
    if (drag.rotate) {
      const a = 1 - Math.exp(-FOLLOW_HZ * dt);
      userYaw += (targetYaw - userYaw) * a;
      userPitch += (targetPitch - userPitch) * a;
    } else if (Math.abs(velYaw) > VEL_EPS || Math.abs(velPitch) > VEL_EPS) {
      userYaw += velYaw * dt;
      userPitch = THREE.MathUtils.clamp(userPitch + velPitch * dt, -PITCH_MAX, PITCH_MAX);
      velYaw *= Math.exp(-FRICTION_YAW * dt);
      velPitch *= Math.exp(-FRICTION_PITCH * dt);
      if (Math.abs(velYaw) < VEL_EPS) velYaw = 0;
      if (Math.abs(velPitch) < VEL_EPS) velPitch = 0;
      targetYaw = userYaw;
      targetPitch = userPitch;
    } else {
      /* settle pitch back gently */
      userPitch += (0 - userPitch) * (1 - Math.exp(-2.2 * dt));
      if (Math.abs(userPitch) < 1e-4) userPitch = 0;
      targetPitch = userPitch;
      targetYaw = userYaw;
    }
    /* idle showroom spin: fades out on interaction, eases back after a pause */
    const idleWanted = !reduceMotion && !drag.rotate && velYaw === 0 && now - lastInteract > IDLE_RESUME_MS ? 1 : 0;
    idleBlend += (idleWanted - idleBlend) * (1 - Math.exp(-(idleWanted ? 0.9 : 8) * dt));
    userYaw += IDLE_SPEED * idleBlend * dt;
    targetYaw = drag.rotate ? targetYaw : userYaw;

    pivot.rotation.set(userPitch, userYaw, 0);
    api.yaw = userYaw;
    api.pitch = userPitch;
  }

  function busy() {
    return drag.rotate || velYaw !== 0 || velPitch !== 0 || Math.abs(userPitch) > 1e-4 || idleBlend > 0.002 || (!reduceMotion);
  }

  function renderFrame(dt) {
    step(dt, performance.now());
    renderer.render(scene, camera);
    api.frames++;
  }

  /* ---------- loop: only while on screen + tab visible ---------- */
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
    if (busy()) {
      rafId = requestAnimationFrame(tick);
    } else {
      state.running = false;
    }
  }
  function requestRender() {
    if (!state.ready || !state.visible || document.hidden) return;
    if (!rafId) {
      if (!state.running) lastTs = 0;
      state.running = true;
      rafId = requestAnimationFrame(tick);
    }
  }
  const io = new IntersectionObserver(
    (entries) => {
      state.visible = entries.some((en) => en.isIntersecting);
      if (state.visible) requestRender();
    },
    { rootMargin: '80px 0px' }
  );
  io.observe(host);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestRender();
  });

  /* test / capture helper */
  api.snapshot = (w = 800) => {
    if (!state.ready) return null;
    const pw = state.lastW;
    const ph = state.lastH;
    renderer.setPixelRatio(1);
    renderer.setSize(w, Math.round((w * ph) / pw), false);
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/png');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(pw, ph, false);
    renderer.render(scene, camera);
    return url;
  };
  api.setYaw = (y) => {
    userYaw = targetYaw = y;
    velYaw = 0;
    lastInteract = performance.now();
    idleBlend = 0;
    renderFrame(0);
  };
  return api;
}
