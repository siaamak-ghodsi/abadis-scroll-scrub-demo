/**
 * Abadis Product Theater — site-green scroll scrub
 * Clean stage, subtle camera, elegant part separation → suction flow → bag fill.
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
/* Extra dolly / tilt during flow+fill (calm, Apple-like) */
const FLOW_DOLLY = 0.08;
const FLOW_TILT = 0.04;

const PARTICLE_COUNT = 96;

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

/* Caption bands remapped to explode → volume → suction/gel → fill/filters */
const CAPTION_RANGES = [
  { start: 0.00, end: 0.28 },
  { start: 0.22, end: 0.48 },
  { start: 0.42, end: 0.72 },
  { start: 0.66, end: 1.00 },
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
  const clock = new THREE.Clock();

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
    particles: null,
    particleSeeds: null,
    particleStart: null,
    particleEnd: null,
    liquid: null,
    liquidBaseY: 0,
    liquidFullH: 0.1,
    bodyLocalBox: null,
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

  function placeCamera(e, flowE, fillE) {
    const lookBias = flowE * 0.55 + fillE * 0.45;
    const yaw = THREE.MathUtils.lerp(CAM_YAW0, CAM_YAW1, e);
    const dolly =
      state.fitDist * (1 - DOLLY_IN * e - FLOW_DOLLY * lookBias);
    const elev = state.radius * (0.16 - 0.02 * e - FLOW_TILT * lookBias);
    const cx = state.center.x;
    const cy = state.center.y + state.radius * (0.08 - 0.06 * lookBias);
    const cz = state.center.z;
    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    camera.lookAt(cx, cy - state.radius * 0.05 * lookBias, cz);
  }

  function createSuctionParticles(lid, body) {
    const lidBox = new THREE.Box3().setFromObject(lid);
    const bodyBox = new THREE.Box3().setFromObject(body);
    const lidSize = new THREE.Vector3();
    const lidCenter = new THREE.Vector3();
    const bodyCenter = new THREE.Vector3();
    lidBox.getSize(lidSize);
    lidBox.getCenter(lidCenter);
    bodyBox.getCenter(bodyCenter);

    /* Port above lid top-center; stream into bag interior */
    const start = new THREE.Vector3(
      lidCenter.x,
      lidBox.max.y + lidSize.y * 0.35,
      lidCenter.z
    );
    const end = new THREE.Vector3(
      bodyCenter.x,
      bodyBox.min.y + (bodyBox.max.y - bodyBox.min.y) * 0.42,
      bodyCenter.z
    );

    /* Convert world → product-local for parenting */
    product.worldToLocal(start);
    product.worldToLocal(end);

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const teal = new THREE.Color(0x2a9a9c);
    const milk = new THREE.Color(0xe8f4f4);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random();
      const mix = 0.35 + Math.random() * 0.65;
      const c = teal.clone().lerp(milk, 1 - mix);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      positions[i * 3] = start.x;
      positions[i * 3 + 1] = start.y;
      positions[i * 3 + 2] = start.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: Math.max(0.004, state.radius * 0.045),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    product.add(points);

    state.particles = points;
    state.particleSeeds = seeds;
    state.particleStart = start;
    state.particleEnd = end;
  }

  function createLiquidFill(body) {
    /* Body local AABB for sizing the fill cylinder */
    const box = new THREE.Box3().setFromObject(body);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const radius = Math.min(size.x, size.z) * 0.36;
    const height = size.y * 0.78;
    const geo = new THREE.CylinderGeometry(radius, radius * 0.98, 1, 32, 1, false);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x3db5b0,
      transparent: true,
      opacity: 0,
      roughness: 0.15,
      metalness: 0,
      transmission: 0.35,
      thickness: 0.02,
      ior: 1.33,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;

    /* Parent to body so it rides explode; position in body-local space */
    body.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const localBottom = new THREE.Vector3(center.x, box.min.y, center.z).applyMatrix4(inv);
    const localTopHint = new THREE.Vector3(center.x, box.min.y + height, center.z).applyMatrix4(inv);
    const localH = Math.abs(localTopHint.y - localBottom.y) || height;

    mesh.position.set(localBottom.x, localBottom.y, localBottom.z);
    mesh.scale.set(1, 0.02, 1);
    body.add(mesh);

    state.liquid = mesh;
    state.liquidBaseY = localBottom.y;
    state.liquidFullH = localH;
    state.bodyLocalBox = { size, center };
  }

  function updateParticles(flowE, elapsed) {
    const pts = state.particles;
    if (!pts || !state.particleSeeds) return;
    const mat = pts.material;
    if (flowE < 0.05) {
      mat.opacity = 0;
      pts.visible = false;
      return;
    }
    pts.visible = true;
    mat.opacity = THREE.MathUtils.clamp(flowE * 0.85, 0, 0.9);

    const pos = pts.geometry.attributes.position.array;
    const start = state.particleStart;
    const end = state.particleEnd;
    const spread = state.radius * 0.12;
    const time = elapsed;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const seed = state.particleSeeds[i];
      const u = (seed + flowE * 1.8 + time * 0.15) % 1;
      /* Ease into bag: start wide above port, tighten toward center */
      const spiral = seed * Math.PI * 2;
      const radial = spread * (1 - u * 0.85) * (0.4 + seed * 0.6);
      const x =
        THREE.MathUtils.lerp(start.x, end.x, u) +
        Math.cos(spiral + u * 4) * radial;
      const y = THREE.MathUtils.lerp(start.y, end.y, easeInOutCubic(u));
      const z =
        THREE.MathUtils.lerp(start.z, end.z, u) +
        Math.sin(spiral + u * 4) * radial;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }

  function updateLiquid(fillE) {
    const mesh = state.liquid;
    if (!mesh) return;
    if (fillE < 0.02) {
      mesh.visible = false;
      mesh.material.opacity = 0;
      return;
    }
    mesh.visible = true;
    const sy = 0.02 + 0.85 * fillE;
    mesh.scale.y = sy * state.liquidFullH;
    /* Grow upward from bag bottom */
    mesh.position.y = state.liquidBaseY + (sy * state.liquidFullH) * 0.5;
    mesh.material.opacity = THREE.MathUtils.clamp(0.15 + fillE * 0.5, 0, 0.62);
  }

  function applyTheatre(t) {
    /* Phased easing: explode early, hold mildly, soft rejoin as fill starts */
    const sep =
      easeInOutCubic(smoothstep(0, 0.4, t)) *
      (1 - 0.55 * smoothstep(0.55, 0.85, t));
    const flowE = easeInOutCubic(smoothstep(0.38, 0.72, t));
    const fillE = easeInOutCubic(smoothstep(0.55, 1.0, t));

    if (state.lid) {
      state.lid.position.set(
        state.lidBase.x - X_SPLIT * sep,
        state.lidBase.y + LID_UP * sep,
        state.lidBase.z
      );
      state.lid.rotation.copy(state.lidBaseRot);
    }
    if (state.body) {
      state.body.position.set(
        state.bodyBase.x + X_SPLIT * sep,
        state.bodyBase.y - BODY_DOWN * sep,
        state.bodyBase.z
      );
      state.body.rotation.copy(state.bodyBaseRot);
    }

    placeCamera(sep, flowE, fillE);
    updateParticles(flowE, clock.getElapsedTime());
    updateLiquid(fillE);

    if (progressFill) progressFill.style.width = Math.round(t * 100) + '%';
    applyCaptions(t);
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
      createSuctionParticles(lid, body);
      createLiquidFill(body);
      state.ready = true;
      if (loadingEl) loadingEl.classList.add('hide');
      applyTheatre(0);
    } catch (err) {
      console.error(err);
      showError('بارگذاری مدل ناموفق بود.');
    }
  })();

  window.addEventListener('resize', sizeCanvas);

  function applyFrame() {
    state.targetT = scrubProgress();
    /* Heavier smoothing = more Apple "inertia" feel */
    const k = Math.abs(state.targetT - state.smoothT) > 0.08 ? 0.10 : 0.055;
    state.smoothT += (state.targetT - state.smoothT) * k;
    if (!state.ready) return;
    applyTheatre(state.smoothT);
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
