/**
 * Abadis Product Theater — vivid scroll-scrub explode
 * Stage-local progress 0→1 over ~200vh sticky section.
 * ES module — load via <script type="module" src="./scrub-theater.js">
 * so it does not collide with WordPress emoji type=module scripts.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS_URL = './abadis-scrub-parts.glb';

/* Strong explode amplitudes (meters) */
const LID_UP = 0.12;
const BODY_DOWN = 0.16;
const X_SPLIT = 0.04;
const YAW_LID = 0.12;   // rad ~7°
const YAW_BODY = -0.1;

/* Camera arc: start yaw 35° → end -15°, with dolly-in */
const CAM_YAW0 = THREE.MathUtils.degToRad(35);
const CAM_YAW1 = THREE.MathUtils.degToRad(-15);
const DOLLY_IN = 0.28; // fraction closer at full explode

const canvas = document.getElementById('abadis-scrub-canvas');
const stageEl = document.getElementById('abadis-scrub');
const errEl = document.getElementById('abadisScrubErr');
const loadingEl = document.getElementById('abadisScrubLoading');
const progressFill = document.getElementById('abadisProgressFill');

if (!canvas || !stageEl) {
  console.error('[scrub-theater] missing #abadis-scrub-canvas or #abadis-scrub');
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
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  /* Soft clinical white → teal mist (set as clear color; mild gradient via CSS behind canvas) */
  scene.background = new THREE.Color(0xf7fbfb);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e8ea, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(0.55, 1.25, 0.85);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8d4da, 0.4);
  fill.position.set(-0.9, 0.45, -0.4);
  scene.add(fill);
  /* Soft teal rim */
  const rim = new THREE.DirectionalLight(0x7ec8cf, 0.55);
  rim.position.set(0.1, 0.35, -1.1);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x0d5c63, 0.18);
  rim2.position.set(-0.4, 0.2, -0.8);
  scene.add(rim2);

  const product = new THREE.Group();
  scene.add(product);

  /* Dashed connector line between lid/body centroids */
  const connPositions = new Float32Array(6);
  const connGeo = new THREE.BufferGeometry();
  connGeo.setAttribute('position', new THREE.BufferAttribute(connPositions, 3));
  const connMat = new THREE.LineDashedMaterial({
    color: 0x0d5c63,
    dashSize: 0.012,
    gapSize: 0.008,
    transparent: true,
    opacity: 0.35,
    depthTest: true,
  });
  const connector = new THREE.Line(connGeo, connMat);
  connector.visible = false;
  scene.add(connector);

  const _lidWorld = new THREE.Vector3();
  const _bodyWorld = new THREE.Vector3();
  const _tmpBox = new THREE.Box3();
  const _tmpSize = new THREE.Vector3();

  const state = {
    ready: false,
    smoothT: 0,
    targetT: 0,
    idle: 0,
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

  function smoothstep(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
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
    state.fitDist = dist * 1.45;
    camera.near = Math.max(0.005, dist / 100);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    state._lookHome = state.center.clone();
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
        if ('envMapIntensity' in m) m.envMapIntensity = 0.95;
        /* Ensure fully opaque / visible */
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
      if (found) return;
      if (o.name === name) found = o;
    });
    return found;
  }

  /** Progress only over the theater stage (~200vh), not whole page */
  function scrubProgress() {
    const el = stageEl;
    const rect = el.getBoundingClientRect();
    const total = el.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    return THREE.MathUtils.clamp((-rect.top) / total, 0, 1);
  }

  function syncFromScroll() {
    state.targetT = scrubProgress();
  }

  function updateHud(t) {
    const e = smoothstep(t);
    if (progressFill) progressFill.style.width = Math.round(e * 100) + '%';
  }

  function placeCamera(e) {
    const yaw = THREE.MathUtils.lerp(CAM_YAW0, CAM_YAW1, e);
    const dolly = state.fitDist * (1 - DOLLY_IN * e);
    const elev = state.radius * (0.18 - 0.06 * e);
    const cx = state.center.x;
    const cy = state.center.y + state.radius * 0.05;
    const cz = state.center.z;
    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    camera.lookAt(cx, cy, cz);
  }

  function updateConnector() {
    if (!state.lid || !state.body) return;
    state.lid.getWorldPosition(_lidWorld);
    /* Prefer mesh centroids if possible */
    try {
      _tmpBox.setFromObject(state.lid);
      _tmpBox.getCenter(_lidWorld);
      _tmpBox.setFromObject(state.body);
      _tmpBox.getCenter(_bodyWorld);
    } catch (_) {
      state.body.getWorldPosition(_bodyWorld);
    }
    const pos = connector.geometry.attributes.position.array;
    pos[0] = _lidWorld.x; pos[1] = _lidWorld.y; pos[2] = _lidWorld.z;
    pos[3] = _bodyWorld.x; pos[4] = _bodyWorld.y; pos[5] = _bodyWorld.z;
    connector.geometry.attributes.position.needsUpdate = true;
    connector.computeLineDistances();
    const gap = _lidWorld.distanceTo(_bodyWorld);
    const e = smoothstep(state.smoothT);
    connector.visible = e > 0.08 && gap > 0.02;
    connMat.opacity = 0.15 + 0.35 * e;
  }

  function applyExplode(t) {
    const e = smoothstep(t);
    if (state.lid) {
      state.lid.position.set(
        state.lidBase.x - X_SPLIT * e,
        state.lidBase.y + LID_UP * e,
        state.lidBase.z
      );
      state.lid.rotation.set(
        state.lidBaseRot.x,
        state.lidBaseRot.y + YAW_LID * e,
        state.lidBaseRot.z
      );
    }
    if (state.body) {
      state.body.position.set(
        state.bodyBase.x + X_SPLIT * e,
        state.bodyBase.y - BODY_DOWN * e,
        state.bodyBase.z
      );
      state.body.rotation.set(
        state.bodyBaseRot.x,
        state.bodyBaseRot.y + YAW_BODY * e,
        state.bodyBaseRot.z
      );
    }
    placeCamera(e);
    updateConnector();
    updateHud(t);
  }

  function showError(msg) {
    if (loadingEl) loadingEl.classList.add('hide');
    if (errEl) {
      errEl.style.display = 'flex';
      errEl.innerHTML = msg;
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
        console.error('[scrub-theater] missing lid/body', { lid, body });
        showError('مدل فاقد گره‌های lid/body است.');
        return;
      }
      console.info('[scrub-theater] found lid + body');
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
      syncFromScroll();
    } catch (err) {
      console.error(err);
      showError('بارگذاری مدل ناموفق بود.');
    }
  })();

  window.addEventListener('resize', () => {
    sizeCanvas();
  });

  function applyFrame() {
    syncFromScroll();
    const k = Math.abs(state.targetT - state.smoothT) > 0.08 ? 0.34 : 0.2;
    state.smoothT += (state.targetT - state.smoothT) * k;
    if (!state.ready) return;
    applyExplode(state.smoothT);
    /* Idle micro-float stronger at ends */
    state.idle += 0.012;
    const endW = 1 - Math.min(state.smoothT, 1 - state.smoothT) * 2; // 1 at ends, 0 mid
    const amp = 0.012 + 0.02 * Math.max(0, endW);
    product.position.y = Math.sin(state.idle) * amp;
    product.rotation.y = Math.sin(state.idle * 0.55) * (0.035 + 0.025 * Math.max(0, endW));
  }

  window.addEventListener('scroll', () => { syncFromScroll(); }, { passive: true });
  window.addEventListener('touchmove', () => { syncFromScroll(); }, { passive: true });

  sizeCanvas();

  function tick() {
    applyFrame();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  setInterval(() => { applyFrame(); }, 50);
  tick();
}
