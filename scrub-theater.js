/**
 * Abadis Product Theater — bold cinematic scroll scrub
 * Dark mint stage, Poly Haven surgery HDR lighting, vortex suction → bag fill.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS_URL = './abadis-scrub-parts.glb';
const HDR_URL = './env/surgery_1k.hdr';
const HDR_FALLBACK = './env/studio_small_09_1k.hdr';
const PARTICLE_SPRITE = './tex/particle-glow.png';

/* Dramatic separation — Apple film + OR theater */
const LID_UP = 0.16;
const BODY_DOWN = 0.2;
const X_SPLIT = 0.06;
const LID_TILT_X = THREE.MathUtils.degToRad(6);
const LID_TILT_Z = THREE.MathUtils.degToRad(-4);

/* Risky camera: wider yaw arc, stronger dolly, Dutch during flow */
const CAM_YAW0 = THREE.MathUtils.degToRad(35);
const CAM_YAW1 = THREE.MathUtils.degToRad(-25);
const DOLLY_IN = 0.22;
const FLOW_DOLLY = 0.14;
const FLOW_TILT = 0.07;
const DUTCH_MAX = THREE.MathUtils.degToRad(3);

const IS_MOBILE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(max-width: 700px)').matches ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 900));
const PARTICLE_COUNT = IS_MOBILE ? 120 : 180;

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

const CAPTION_RANGES = [
  { start: 0.0, end: 0.28 },
  { start: 0.22, end: 0.48 },
  { start: 0.42, end: 0.72 },
  { start: 0.66, end: 1.0 },
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
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  /* Dark theatrical clear — HDR lights product, does NOT wash as BG */
  scene.background = new THREE.Color(0x061416);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  /* Cool key + brand teal rim (#066163 / #2ec4c6) — HDR fills reflections */
  scene.add(new THREE.HemisphereLight(0xc8e8e8, 0x061416, 0.35));
  const key = new THREE.DirectionalLight(0xf4faff, 0.95);
  key.position.set(0.55, 1.55, 1.05);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7ab8b8, 0.22);
  fill.position.set(-1.0, 0.45, 0.35);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x2ec4c6, 0.9);
  rim.position.set(0.15, 0.55, -1.15);
  scene.add(rim);
  const rimBrand = new THREE.DirectionalLight(0x066163, 0.45);
  rimBrand.position.set(-0.55, 0.4, -0.9);
  scene.add(rimBrand);

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
    particleRadii: null,
    particleSpeeds: null,
    particleStart: null,
    particleEnd: null,
    vacuumCone: null,
    liquid: null,
    meniscus: null,
    liquidBaseY: 0,
    liquidFullH: 0.1,
    particleMap: null,
  };

  function easeInOutCubic(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function smoothstep(edge0, edge1, x) {
    const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function captionOpacity(t, start, end) {
    const span = Math.max(0.0001, end - start);
    const fade = Math.min(0.18, span * 0.55);
    const enter = smoothstep(start, start + fade, t);
    const leave = 1 - smoothstep(end - fade, end, t);
    return THREE.MathUtils.clamp(enter * leave, 0, 1);
  }

  function applyCaptions(t) {
    for (let i = 0; i < captionEls.length; i++) {
      const range = CAPTION_RANGES[i];
      if (!range) continue;
      const o = captionOpacity(t, range.start, range.end);
      const el = captionEls[i];
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate(-50%, ${(1 - o) * 16}px)`;
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
    const dist =
      state.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
    state.fitDist = dist * 1.08;
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
        if ('envMapIntensity' in m) m.envMapIntensity = 1.05;
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
    const lookBias = flowE * 0.45 + fillE * 0.7;
    const yaw = THREE.MathUtils.lerp(
      CAM_YAW0,
      CAM_YAW1,
      easeInOutCubic(e + flowE * 0.35)
    );
    const dolly = state.fitDist * (1 - DOLLY_IN * e - FLOW_DOLLY * lookBias);
    const elev =
      state.radius *
      (0.18 - 0.04 * e - FLOW_TILT * lookBias - 0.12 * fillE);
    const cx = state.center.x;
    const cy =
      state.center.y + state.radius * (0.06 - 0.1 * lookBias - 0.08 * fillE);
    const cz = state.center.z;
    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    camera.lookAt(cx, cy - state.radius * (0.04 + 0.12 * fillE), cz);
    const dutchAmp = flowE * (1 - fillE * 0.85);
    camera.rotation.z += DUTCH_MAX * dutchAmp * Math.sin(flowE * Math.PI);
  }

  async function loadEnvironment() {
    const rgbe = new RGBELoader();
    try {
      const tex = await rgbe.loadAsync(HDR_URL);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmrem.fromEquirectangular(tex).texture;
      scene.environment = envMap;
      /* Keep solid dark BG — optional very dark blurred env as faint ambient only */
      tex.dispose();
      pmrem.dispose();
      return true;
    } catch (e1) {
      console.warn('[scrub-theater] surgery HDR failed, trying fallback', e1);
      try {
        const tex = await rgbe.loadAsync(HDR_FALLBACK);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
        pmrem.dispose();
        return true;
      } catch (e2) {
        console.warn('[scrub-theater] HDR fallback failed, RoomEnvironment', e2);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        return false;
      }
    }
  }

  async function loadParticleMap() {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        PARTICLE_SPRITE,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          state.particleMap = tex;
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });
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

    const start = new THREE.Vector3(
      lidCenter.x,
      lidBox.max.y + lidSize.y * 0.55,
      lidCenter.z
    );
    const end = new THREE.Vector3(
      bodyCenter.x,
      bodyBox.min.y + (bodyBox.max.y - bodyBox.min.y) * 0.38,
      bodyCenter.z
    );

    product.worldToLocal(start);
    product.worldToLocal(end);

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const teal = new THREE.Color(0x40e0d8);
    const brand = new THREE.Color(0x066163);
    const spark = new THREE.Color(0xffffff);
    const accent = new THREE.Color(0x2ec4c6);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random();
      radii[i] = 0.55 + Math.random() * 0.9;
      speeds[i] = 0.75 + Math.random() * 0.55;
      const roll = Math.random();
      let c;
      if (roll > 0.78) c = spark.clone();
      else if (roll > 0.45) c = teal.clone().lerp(spark, 0.3);
      else if (roll > 0.2) c = accent.clone();
      else c = brand.clone().lerp(teal, 0.55);
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
      size: Math.max(0.008, state.radius * 0.07),
      map: state.particleMap || null,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    if (state.particleMap) mat.alphaMap = state.particleMap;

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    product.add(points);

    const coneH = state.radius * 0.55;
    const coneR = state.radius * 0.22;
    const coneGeo = new THREE.ConeGeometry(coneR, coneH, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x40e0d8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI;
    cone.position.set(start.x, start.y + coneH * 0.35, start.z);
    cone.visible = false;
    product.add(cone);

    state.particles = points;
    state.particleSeeds = seeds;
    state.particleRadii = radii;
    state.particleSpeeds = speeds;
    state.particleStart = start;
    state.particleEnd = end;
    state.vacuumCone = cone;
  }

  function createLiquidFill(body) {
    const box = new THREE.Box3().setFromObject(body);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const radius = Math.min(size.x, size.z) * 0.38;
    const height = size.y * 0.82;
    const geo = new THREE.CylinderGeometry(
      radius,
      radius * 0.97,
      1,
      48,
      1,
      false
    );
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x148a8c,
      transparent: true,
      opacity: 0,
      roughness: 0.12,
      metalness: 0.05,
      transmission: 0.22,
      thickness: 0.04,
      ior: 1.35,
      specularIntensity: 0.9,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;

    body.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const localBottom = new THREE.Vector3(
      center.x,
      box.min.y,
      center.z
    ).applyMatrix4(inv);
    const localTopHint = new THREE.Vector3(
      center.x,
      box.min.y + height,
      center.z
    ).applyMatrix4(inv);
    const localH = Math.abs(localTopHint.y - localBottom.y) || height;

    mesh.position.set(localBottom.x, localBottom.y, localBottom.z);
    mesh.scale.set(1, 0.02, 1);
    body.add(mesh);

    const ringGeo = new THREE.TorusGeometry(radius * 0.92, radius * 0.028, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x5ee8e0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    body.add(ring);

    state.liquid = mesh;
    state.meniscus = ring;
    state.liquidBaseY = localBottom.y;
    state.liquidFullH = localH;
  }

  function updateParticles(flowE, elapsed) {
    const pts = state.particles;
    if (!pts || !state.particleSeeds) return;
    const mat = pts.material;
    const cone = state.vacuumCone;

    if (flowE < 0.04) {
      mat.opacity = 0;
      pts.visible = false;
      if (cone) {
        cone.visible = false;
        cone.material.opacity = 0;
      }
      return;
    }
    pts.visible = true;
    mat.opacity = THREE.MathUtils.clamp(0.4 + flowE * 0.95, 0, 1);

    if (cone) {
      cone.visible = true;
      cone.material.opacity = THREE.MathUtils.clamp(flowE * 0.22, 0, 0.28);
      cone.scale.setScalar(0.85 + flowE * 0.25);
    }

    const pos = pts.geometry.attributes.position.array;
    const start = state.particleStart;
    const end = state.particleEnd;
    const maxSpread = state.radius * 0.28;
    const time = elapsed;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const seed = state.particleSeeds[i];
      const spd = state.particleSpeeds[i];
      const rMul = state.particleRadii[i];
      const u = (seed + flowE * 2.2 * spd + time * 0.28 * spd) % 1;
      const turns = 3.2 + seed * 1.8;
      const spiral = seed * Math.PI * 2 + u * Math.PI * 2 * turns;
      const flare = u < 0.7 ? 1 - u * 1.15 : 0.2 + (u - 0.7) * 0.9;
      const radial = maxSpread * Math.max(0.04, flare) * rMul;
      const x =
        THREE.MathUtils.lerp(start.x, end.x, u) + Math.cos(spiral) * radial;
      const y = THREE.MathUtils.lerp(start.y, end.y, easeInOutCubic(u));
      const z =
        THREE.MathUtils.lerp(start.z, end.z, u) + Math.sin(spiral) * radial;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }

  function updateLiquid(fillE) {
    const mesh = state.liquid;
    if (!mesh) return;
    const ring = state.meniscus;
    if (fillE < 0.02) {
      mesh.visible = false;
      mesh.material.opacity = 0;
      if (ring) {
        ring.visible = false;
        ring.material.opacity = 0;
      }
      return;
    }
    mesh.visible = true;
    const sy = 0.02 + 0.9 * easeInOutCubic(fillE);
    const h = sy * state.liquidFullH;
    mesh.scale.y = h;
    mesh.position.y = state.liquidBaseY + h * 0.5;
    mesh.material.opacity = THREE.MathUtils.clamp(0.35 + fillE * 0.45, 0, 0.78);

    if (ring) {
      ring.visible = true;
      ring.position.set(mesh.position.x, state.liquidBaseY + h, mesh.position.z);
      ring.material.opacity = THREE.MathUtils.clamp(fillE * 0.55, 0, 0.65);
      const pulse = 1 + Math.sin(clock.getElapsedTime() * 2.2) * 0.015;
      ring.scale.set(pulse, pulse, pulse);
    }
  }

  function applyTheatre(t) {
    /* 0–0.38 explode; 0.40–0.72 rejoin + vortex peak; 0.55–1 fill */
    const open = easeInOutCubic(smoothstep(0, 0.38, t));
    const rejoin = easeInOutCubic(smoothstep(0.4, 0.72, t));
    const sep = open * (1 - rejoin);
    const flowE = easeInOutCubic(smoothstep(0.38, 0.72, t));
    const fillE = easeInOutCubic(smoothstep(0.55, 1.0, t));

    if (state.lid) {
      state.lid.position.set(
        state.lidBase.x - X_SPLIT * sep,
        state.lidBase.y + LID_UP * sep,
        state.lidBase.z
      );
      state.lid.rotation.copy(state.lidBaseRot);
      state.lid.rotation.x += LID_TILT_X * sep;
      state.lid.rotation.z += LID_TILT_Z * sep;
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
      await Promise.all([loadEnvironment(), loadParticleMap()]);
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
    const k = Math.abs(state.targetT - state.smoothT) > 0.08 ? 0.1 : 0.055;
    state.smoothT += (state.targetT - state.smoothT) * k;
    if (!state.ready) return;
    applyTheatre(state.smoothT);
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
