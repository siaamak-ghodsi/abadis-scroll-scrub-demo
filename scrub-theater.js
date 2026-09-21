/**
 * Abadis Product Theater — site-green scroll scrub
 * Clean stage, subtle camera, elegant part separation.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS_URL = './abadis-scrub-parts.glb';

/* Elegant separation — clear but not exaggerated */
const LID_UP = 0.085;
const BODY_DOWN = 0.11;
const X_SPLIT = 0.018;

/* Subtle camera: almost frontal → slight orbit, gentle dolly */
const CAM_YAW0 = THREE.MathUtils.degToRad(18);
const CAM_YAW1 = THREE.MathUtils.degToRad(-8);
const DOLLY_IN = 0.12;

const canvas = document.getElementById('abadis-scrub-canvas');
const stageEl = document.getElementById('abadis-scrub');
const errEl = document.getElementById('abadisScrubErr');
const loadingEl = document.getElementById('abadisScrubLoading');
const progressFill = document.getElementById('abadisProgressFill');
const captionEls = Array.from(
  document.querySelectorAll('.abadis-theater-caption[data-caption]')
).sort(
  (a, b) =>
    Number(a.getAttribute('data-caption')) -
    Number(b.getAttribute('data-caption'))
);

/* Caption progress bands (site copy only); soft overlapping fades */
/* Soft centers with long crossfades — one dominant caption at a time */
const CAPTION_RANGES = [
  { start: 0.00, end: 0.34 },
  { start: 0.28, end: 0.58 },
  { start: 0.52, end: 0.80 },
  { start: 0.74, end: 1.00 },
];

if (!canvas || !stageEl) {
  console.error('[scrub-theater] missing canvas/stage');
} else {
  boot();
}

function boot() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  /* Abadis mint stage */
  scene.background = new THREE.Color(0xe8f3f3);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe3e3, 0.88));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(0.4, 1.4, 0.9);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-0.8, 0.5, 0.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.28);
  rim.position.set(0.2, 0.4, -1.0);
  scene.add(rim);

  const product = new THREE.Group();
  scene.add(product);

  const _tmpSize = new THREE.Vector3();

  const state = {
    ready: false,
    smoothT: 0,
    targetT: 0,
    lid: null,
    body: null,
    lidBase: new THREE.Vector3(),
    bodyBase: new THREE.Vector3(),
    lidBaseRot: new THREE.Euler(),
    bodyBaseRot: new THREE.Euler(),
    center: new THREE.Vector3(),
    radius: 0.2,
    fitDist: 0.5,
  };

  function easeInOutCubic(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function smoothstep(edge0, edge1, x) {
    const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** Opacity for a caption band; overlapping fades OK */
  function captionOpacity(t, start, end) {
    /* Longer soft edges for readable crossfade */
    const span = Math.max(0.0001, end - start);
    const fade = Math.min(0.18, span * 0.55); /* slower caption crossfade */
    const enter = smoothstep(start, start + fade, t);
    const leave = 1 - smoothstep(end - fade, end, t);
    return THREE.MathUtils.clamp(enter * leave, 0, 1);
  }

  function applyCaptions(t) {
    /* Use raw scrub t (already smoothed upstream) for captions */
    for (let i = 0; i < captionEls.length; i++) {
      const range = CAPTION_RANGES[i];
      if (!range) continue;
      const o = captionOpacity(t, range.start, range.end);
      const el = captionEls[i];
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate(-50%, ${(1 - o) * 20}px)`;
      el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
    }
  }

  function sizeCanvas() {
    const rect = stageEl.querySelector('.abadis-theater-sticky') || stageEl;
    const w = Math.max(1, Math.floor(rect.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.floor(window.innerHeight));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function fitCamera(box) {
    box.getCenter(state.center);
    box.getSize(_tmpSize);
    state.radius = Math.max(_tmpSize.x, _tmpSize.y, _tmpSize.z) * 0.5 || 0.15;
    const dist = state.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
    /* Closer / larger in frame like Apple hero */
    state.fitDist = dist * 1.32; /* leave room for bottom captions */
    camera.near = Math.max(0.005, dist / 100);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
  }

  function prepareMaterials(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.DoubleSide;
        if ('envMapIntensity' in m) m.envMapIntensity = 0.75;
        if ('transparent' in m && m.opacity < 1) {
          m.transparent = false;
          m.opacity = 1;
        }
      }
    });
  }

  function findNamed(root, name) {
    let found = null;
    root.traverse((o) => {
      if (!found && o.name === name) found = o;
    });
    return found;
  }

  function scrubProgress() {
    const total = stageEl.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const rect = stageEl.getBoundingClientRect();
    return THREE.MathUtils.clamp(-rect.top / total, 0, 1);
  }

  function placeCamera(e) {
    const yaw = THREE.MathUtils.lerp(CAM_YAW0, CAM_YAW1, e);
    const dolly = state.fitDist * (1 - DOLLY_IN * e);
    const elev = state.radius * (0.16 - 0.02 * e);
    const cx = state.center.x;
    const cy = state.center.y + state.radius * 0.08;
    const cz = state.center.z;
    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    camera.lookAt(cx, cy, cz);
  }

  function applyExplode(t) {
    const e = easeInOutCubic(t);
    if (state.lid) {
      state.lid.position.set(
        state.lidBase.x - X_SPLIT * e,
        state.lidBase.y + LID_UP * e,
        state.lidBase.z
      );
      state.lid.rotation.copy(state.lidBaseRot);
    }
    if (state.body) {
      state.body.position.set(
        state.bodyBase.x + X_SPLIT * e,
        state.bodyBase.y - BODY_DOWN * e,
        state.bodyBase.z
      );
      state.body.rotation.copy(state.bodyBaseRot);
    }
    placeCamera(e);
    if (progressFill) progressFill.style.width = Math.round(e * 100) + '%';
    applyCaptions(t); /* match scroll feel, not double-eased */
  }

  function showError(msg) {
    if (loadingEl) loadingEl.classList.add('hide');
    if (errEl) {
      errEl.style.display = 'flex';
      errEl.textContent = msg;
    }
  }

  const loader = new GLTFLoader();
  (async () => {
    try {
      const gltf = await loader.loadAsync(PARTS_URL);
      const root = gltf.scene;
      prepareMaterials(root);
      const lid = findNamed(root, 'lid');
      const body = findNamed(root, 'body');
      if (!lid || !body) {
        showError('مدل فاقد گره‌های lid/body است.');
        return;
      }
      product.add(root);
      state.lid = lid;
      state.body = body;
      state.lidBase.copy(lid.position);
      state.bodyBase.copy(body.position);
      state.lidBaseRot.copy(lid.rotation);
      state.bodyBaseRot.copy(body.rotation);
      root.updateMatrixWorld(true);
      sizeCanvas();
      fitCamera(new THREE.Box3().setFromObject(product));
      state.ready = true;
      if (loadingEl) loadingEl.classList.add('hide');
      applyExplode(0);
    } catch (err) {
      console.error(err);
      showError('بارگذاری مدل ناموفق بود.');
    }
  })();

  window.addEventListener('resize', sizeCanvas);

  function applyFrame() {
    state.targetT = scrubProgress();
    /* Heavier smoothing = more Apple "inertia" feel */
    const k = Math.abs(state.targetT - state.smoothT) > 0.08 ? 0.10 : 0.055; /* slower text/scrub follow */
    state.smoothT += (state.targetT - state.smoothT) * k;
    if (!state.ready) return;
    applyExplode(state.smoothT);
    /* No idle bobbing — Apple products sit still */
    product.position.set(0, 0, 0);
    product.rotation.set(0, 0, 0);
  }

  window.addEventListener('scroll', applyFrame, { passive: true });
  window.addEventListener('touchmove', applyFrame, { passive: true });

  sizeCanvas();
  function tick() {
    applyFrame();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}
