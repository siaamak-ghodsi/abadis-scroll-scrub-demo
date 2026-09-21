/**
 * Abadis Product Theater — clinical stream + sealed capacity
 * Dark mint stage, Poly Haven surgery HDR; continuous suction tube → bag fill.
 * No particles / sparks / helix vortex.
 * Narrative beats: intro → explode → rejoin → stream → fill.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS_URL = './abadis-scrub-parts.glb';
const HDR_URL = './env/surgery_1k.hdr';
const HDR_FALLBACK = './env/studio_small_09_1k.hdr';

/* Dramatic separation — Apple film + OR theater */
const LID_UP = 0.2;
const BODY_DOWN = 0.24;
const X_SPLIT = 0.085;
const LID_TILT_X = THREE.MathUtils.degToRad(10);
const LID_TILT_Z = THREE.MathUtils.degToRad(-6);

/* Camera: wider yaw during explode; port-drop on stream; push-in on fill */
const CAM_YAW0 = THREE.MathUtils.degToRad(38);
const CAM_YAW1 = THREE.MathUtils.degToRad(-32);
const DOLLY_IN = 0.18;
const FLOW_DOLLY = 0.16;
const FLOW_TILT = 0.11;
const FILL_PUSH = 0.1;
const DUTCH_MAX = THREE.MathUtils.degToRad(1.6);
const INTRO_FAR = 0.14; /* start farther for subtle dolly-in */

const STREAM_TUBULAR_SEGS = 64;
const STREAM_RADIAL_SEGS = 10;

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

/* Longer exclusive bands — less frantic caption swapping */
const CAPTION_RANGES = [
  { start: 0.0, end: 0.24 },
  { start: 0.22, end: 0.5 },
  { start: 0.48, end: 0.74 },
  { start: 0.72, end: 1.0 },
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
  scene.background = new THREE.Color(0x061416);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  scene.add(new THREE.HemisphereLight(0xc8e8e8, 0x061416, 0.35));
  const key = new THREE.DirectionalLight(0xf4faff, 0.85);
  key.position.set(0.55, 1.55, 1.05);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7ab8b8, 0.22);
  fill.position.set(-1.0, 0.45, 0.35);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x2ec4c6, 0.85);
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
    stream: null,
    streamHi: null,
    streamCurve: null,
    streamIndexCount: 0,
    streamHiIndexCount: 0,
    portRing: null,
    liquid: null,
    liquidBaseY: 0,
    liquidFullH: 0.1,
    keyLight: key,
    rimLight: rim,
  };

  function easeInOutCubic(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function smoothstep(edge0, edge1, x) {
    const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function captionOpacity(t, start, end) {
    const span = Math.max(0.0001, end - start);
    const fade = Math.min(0.12, span * 0.4);
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
      el.style.transform = `translate(-50%, ${(1 - o) * 14}px)`;
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

  /**
   * Phase-aware camera:
   * intro — almost locked, dolly from farther
   * explode — stronger yaw swing
   * stream — drop elevation toward port
   * fill — slight push-in
   */
  function placeCamera(t, sep, flowE, fillE, introE) {
    const lookBias = flowE * 0.55 + fillE * 0.75;
    /* Explode owns most of the yaw arc; hold through rejoin */
    const yawDrive = easeInOutCubic(
      smoothstep(0.12, 0.38, t) * (1 - 0.35 * smoothstep(0.38, 0.55, t))
    );
    const yaw = THREE.MathUtils.lerp(CAM_YAW0, CAM_YAW1, yawDrive);

    const introFar = INTRO_FAR * (1 - introE);
    const dolly =
      state.fitDist *
      (1 +
        introFar -
        DOLLY_IN * sep * 0.35 -
        FLOW_DOLLY * lookBias -
        FILL_PUSH * fillE);

    const elev =
      state.radius *
      (0.2 -
        0.03 * sep -
        FLOW_TILT * lookBias -
        0.14 * fillE -
        0.04 * (1 - introE));

    const cx = state.center.x;
    const cy =
      state.center.y +
      state.radius * (0.07 - 0.12 * lookBias - 0.1 * fillE);
    const cz = state.center.z;

    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    /* Stream/fill: look down into the port / liquid */
    camera.lookAt(
      cx,
      cy - state.radius * (0.03 + 0.16 * flowE + 0.14 * fillE),
      cz
    );
    const dutchAmp = flowE * (1 - fillE * 0.9) * 0.7;
    camera.rotation.z += DUTCH_MAX * dutchAmp * Math.sin(flowE * Math.PI);
  }

  async function loadEnvironment() {
    const rgbe = new RGBELoader();
    try {
      const tex = await rgbe.loadAsync(HDR_URL);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmrem.fromEquirectangular(tex).texture;
      scene.environment = envMap;
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

  /**
   * Continuous clinical suction stream: tapered TubeGeometry along a
   * CatmullRom path from above the lid port into the bag interior.
   * Revealed via drawRange; optional thinner highlight tube.
   */
  function createClinicalStream(lid, body) {
    const lidBox = new THREE.Box3().setFromObject(lid);
    const bodyBox = new THREE.Box3().setFromObject(body);
    const lidSize = new THREE.Vector3();
    const lidCenter = new THREE.Vector3();
    const bodyCenter = new THREE.Vector3();
    lidBox.getSize(lidSize);
    lidBox.getCenter(lidCenter);
    bodyBox.getCenter(bodyCenter);

    const r = state.radius;
    const p0 = new THREE.Vector3(
      lidCenter.x,
      lidBox.max.y + lidSize.y * 0.72,
      lidCenter.z
    );
    const p1 = new THREE.Vector3(
      lidCenter.x,
      lidBox.max.y + lidSize.y * 0.12,
      lidCenter.z
    );
    const p2 = new THREE.Vector3(
      lidCenter.x * 0.4 + bodyCenter.x * 0.6,
      (lidBox.min.y + bodyBox.max.y) * 0.5,
      lidCenter.z
    );
    const p3 = new THREE.Vector3(
      bodyCenter.x,
      bodyBox.min.y + (bodyBox.max.y - bodyBox.min.y) * 0.42,
      bodyCenter.z
    );

    product.worldToLocal(p0);
    product.worldToLocal(p1);
    product.worldToLocal(p2);
    product.worldToLocal(p3);

    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    curve.curveType = 'catmullrom';
    curve.tension = 0.35;

    /* Thicker tube for more dramatic stream silhouette */
    const tubeRadius = Math.max(0.006, r * 0.052);
    const geo = new THREE.TubeGeometry(
      curve,
      STREAM_TUBULAR_SEGS,
      tubeRadius,
      STREAM_RADIAL_SEGS,
      false
    );

    /* Taper: shrink radius toward the tip (end of path) */
    {
      const pos = geo.attributes.position;
      const radial = STREAM_RADIAL_SEGS;
      const tubular = STREAM_TUBULAR_SEGS;
      for (let i = 0; i <= tubular; i++) {
        const u = i / tubular;
        const taper = 1.2 - u * 0.7; /* wide at port → thin inside bag */
        for (let j = 0; j <= radial; j++) {
          const idx = i * (radial + 1) + j;
          const px = pos.getX(idx);
          const py = pos.getY(idx);
          const pz = pos.getZ(idx);
          const center = curve.getPointAt(u);
          pos.setXYZ(
            idx,
            center.x + (px - center.x) * taper,
            center.y + (py - center.y) * taper,
            center.z + (pz - center.z) * taper
          );
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0a8a8c,
      emissive: 0x2ec4c6,
      emissiveIntensity: 0.32,
      transparent: true,
      opacity: 0,
      roughness: 0.18,
      metalness: 0.06,
      transmission: 0.28,
      thickness: 0.025,
      ior: 1.33,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    product.add(mesh);

    /* Thinner highlight core — brighter teal */
    const hiGeo = new THREE.TubeGeometry(
      curve,
      STREAM_TUBULAR_SEGS,
      tubeRadius * 0.42,
      6,
      false
    );
    const hiMat = new THREE.MeshBasicMaterial({
      color: 0x5ee8ea,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hi = new THREE.Mesh(hiGeo, hiMat);
    hi.frustumCulled = false;
    hi.visible = false;
    product.add(hi);

    const indexCount = geo.index
      ? geo.index.count
      : geo.getAttribute('position').count;
    const hiIndexCount = hiGeo.index
      ? hiGeo.index.count
      : hiGeo.getAttribute('position').count;
    geo.setDrawRange(0, 0);
    hiGeo.setDrawRange(0, 0);

    state.stream = mesh;
    state.streamHi = hi;
    state.streamCurve = curve;
    state.streamIndexCount = indexCount;
    state.streamHiIndexCount = hiIndexCount;

    /* Port ring on lid — softer brief emissive pulse when flow starts */
    const portR = Math.max(0.008, r * 0.055);
    const ringGeo = new THREE.TorusGeometry(portR, portR * 0.18, 10, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x066163,
      emissive: 0x2ec4c6,
      emissiveIntensity: 0,
      roughness: 0.35,
      metalness: 0.25,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    lid.updateWorldMatrix(true, false);
    const invLid = new THREE.Matrix4().copy(lid.matrixWorld).invert();
    const portWorld = new THREE.Vector3(
      lidCenter.x,
      lidBox.max.y - lidSize.y * 0.02,
      lidCenter.z
    );
    const portLocal = portWorld.clone().applyMatrix4(invLid);
    ring.position.copy(portLocal);
    ring.visible = false;
    lid.add(ring);
    state.portRing = ring;
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
      roughness: 0.18,
      metalness: 0.04,
      transmission: 0.28,
      thickness: 0.05,
      ior: 1.35,
      specularIntensity: 0.85,
      clearcoat: 0.28,
      clearcoatRoughness: 0.22,
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

    state.liquid = mesh;
    state.liquidBaseY = localBottom.y;
    state.liquidFullH = localH;
  }

  function updateStream(flowE) {
    const mesh = state.stream;
    const hi = state.streamHi;
    const ring = state.portRing;
    if (!mesh) return;

    if (flowE < 0.02) {
      mesh.visible = false;
      mesh.material.opacity = 0;
      mesh.geometry.setDrawRange(0, 0);
      if (hi) {
        hi.visible = false;
        hi.material.opacity = 0;
        hi.geometry.setDrawRange(0, 0);
      }
      if (ring) {
        ring.visible = false;
        ring.material.opacity = 0;
        ring.material.emissiveIntensity = 0;
      }
      return;
    }

    mesh.visible = true;
    /* Marching reveal — more dramatic curve via easeOut */
    const reveal = easeOutCubic(THREE.MathUtils.clamp(flowE * 1.2, 0, 1));
    const count = Math.max(
      STREAM_RADIAL_SEGS * 3,
      Math.floor(state.streamIndexCount * reveal)
    );
    const tri = Math.floor(count / 3) * 3;
    mesh.geometry.setDrawRange(0, tri);

    const midBoost = Math.sin(Math.PI * THREE.MathUtils.clamp(flowE, 0, 1));
    mesh.material.opacity = THREE.MathUtils.clamp(
      0.28 + flowE * 0.58 + midBoost * 0.2,
      0,
      0.92
    );
    mesh.material.emissiveIntensity = 0.22 + midBoost * 0.38;

    if (hi) {
      hi.visible = true;
      const hiCount = Math.max(
        18,
        Math.floor(state.streamHiIndexCount * reveal)
      );
      hi.geometry.setDrawRange(0, Math.floor(hiCount / 3) * 3);
      hi.material.opacity = THREE.MathUtils.clamp(
        0.12 + flowE * 0.42 + midBoost * 0.28,
        0,
        0.7
      );
    }

    /* Softer port-ring pulse near flow start */
    if (ring) {
      ring.visible = true;
      const pulse =
        smoothstep(0.02, 0.2, flowE) * (1 - smoothstep(0.5, 0.88, flowE));
      const beat = 0.7 + 0.3 * Math.sin(clock.getElapsedTime() * 3.2);
      ring.material.opacity = THREE.MathUtils.clamp(pulse * 0.55, 0, 0.7);
      ring.material.emissiveIntensity = pulse * beat * 0.95;
      const s = 1 + pulse * 0.05 * beat;
      ring.scale.set(s, s, s);
    }
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
    /* Assertive rise */
    const sy = 0.02 + 0.96 * easeOutCubic(fillE);
    const h = sy * state.liquidFullH;
    mesh.scale.y = h;
    mesh.position.y = state.liquidBaseY + h * 0.5;
    mesh.material.opacity = THREE.MathUtils.clamp(0.38 + fillE * 0.5, 0, 0.88);
  }

  function applyTheatre(t) {
    /*
     * Intro  0–0.12  : almost locked, scale-in / dolly from farther
     * Explode 0.12–0.38: stronger sep + lid tilt, yaw swing
     * Rejoin 0.38–0.55: sep→0, brief hold
     * Stream 0.48–0.72: look into port; dramatic drawRange
     * Fill   0.62–1.0 : assertive liquid; push-in; product +~8%
     */
    const introE = easeOutCubic(smoothstep(0.0, 0.12, t));
    const open = easeInOutCubic(smoothstep(0.12, 0.38, t));
    const rejoin = easeInOutCubic(smoothstep(0.38, 0.55, t));
    const sep = open * (1 - rejoin);
    const flowE = easeInOutCubic(smoothstep(0.48, 0.72, t));
    const fillE = easeInOutCubic(smoothstep(0.62, 1.0, t));

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

    /* Intro scale-in (~0.94→1) then fill push (~+8%) */
    const introScale = 0.94 + 0.06 * introE;
    const fillScale = 1 + 0.08 * fillE;
    const s = introScale * fillScale;
    product.scale.set(s, s, s);

    placeCamera(t, sep, flowE, fillE, introE);
    updateStream(flowE);
    updateLiquid(fillE);

    /* Light drama: key + rim ramp with flow/fill */
    if (state.keyLight) {
      state.keyLight.intensity = 0.85 + flowE * 0.35 + fillE * 0.45;
    }
    if (state.rimLight) {
      state.rimLight.intensity = 0.85 + flowE * 0.4 + fillE * 0.25;
    }
    renderer.toneMappingExposure = 0.9 + flowE * 0.06 + fillE * 0.08;

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
      await loadEnvironment();
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
      createClinicalStream(lid, body);
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
    /* Heavy scrub lerp — keep smooth, avoid jitter */
    const k = Math.abs(state.targetT - state.smoothT) > 0.08 ? 0.1 : 0.05;
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
