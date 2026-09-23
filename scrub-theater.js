/**
 * Abadis Product Theater — WHIST-BRAND-V27
 * Dark mint stage (default) or light whist skin via data-theme="light".
 * Narrative beats: intro → explode → rejoin → assembled settle (no suction tube).
 * Scrub modes: data-scrub="organic" | "soft" | "snappy"
 * V27: kill end-phase clinical straw/stream into port; quiet assemble end.
 * V25: tight scrub (بدون گیر) — critical damp, no endDamp/catch-up lag.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS_URL = './abadis-scrub-parts.glb';
const HDR_URL = './env/surgery_1k.hdr';
const HDR_FALLBACK = './env/studio_small_09_1k.hdr';

/* Cinematic separation — stronger readable explode, soft settle */
const LID_UP = 0.48;
const BODY_DOWN = 0.52;
const X_SPLIT = 0.24;
const LID_TILT_X = THREE.MathUtils.degToRad(26);
const LID_TILT_Z = THREE.MathUtils.degToRad(-16);

/* Camera: soft yaw/dolly arcs — no extreme pullback */
const CAM_YAW0 = THREE.MathUtils.degToRad(48);
const CAM_YAW1 = THREE.MathUtils.degToRad(-42);
const DOLLY_IN = 0.26;
const FLOW_DOLLY = 0.22;
const FLOW_TILT = 0.14;
const DUTCH_MAX = THREE.MathUtils.degToRad(3.2);
const INTRO_FAR = 0.22;

const STREAM_TUBULAR_SEGS = 64;
const STREAM_RADIAL_SEGS = 10;

/* Lid leads body — staggered cinematic open/close */
const LID_LEAD = 0.022;
const BODY_LAG = 0.016;

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

/* Beats: intro → explode → rejoin → assembled settle (no straw) */
const CAPTION_RANGES = [
  { start: 0.0, end: 0.16 },   /* intro */
  { start: 0.12, end: 0.40 },  /* explode */
  { start: 0.34, end: 0.54 },  /* rejoin — seats with soft assemble */
  { start: 0.48, end: 0.92 },  /* assembled product — no suction tube */
];

if (!canvas || !stageEl) {
  console.error('[scrub-theater] missing canvas/stage');
} else {
  boot();
}

function boot() {
  const lightTheme = stageEl.dataset.theme === 'light';
  const scrubMode = (stageEl.dataset.scrub || 'organic').toLowerCase();
  const softScrub = scrubMode === 'soft';
  const snappyScrub = scrubMode === 'snappy';
  const organicScrub = !softScrub && !snappyScrub; /* organic default */

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lightTheme ? 1.34 : 1.28;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(lightTheme ? 0xf3fafa : 0x030a0b);
  /* No exp fog on dark theme — it crushed the bag into the background */
  if (!lightTheme) {
    scene.fog = null;
  }

  const camera = new THREE.PerspectiveCamera(lightTheme ? 28 : 30, 1, 0.01, 40);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let key;
  let fill;
  let rim;
  let rimBrand;
  let bounce;
  let spot;

  if (lightTheme) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c8cc, 0.72));
    key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(0.55, 2.05, 1.35);
    scene.add(key);
    fill = new THREE.DirectionalLight(0xc5d8de, 0.48);
    fill.position.set(-1.25, 0.65, 0.55);
    scene.add(fill);
    rim = new THREE.DirectionalLight(0x2ec4c6, 0.85);
    rim.position.set(0.25, 0.85, -1.25);
    scene.add(rim);
    rimBrand = new THREE.DirectionalLight(0x066163, 0.62);
    rimBrand.position.set(-0.65, 0.5, -0.95);
    scene.add(rimBrand);
    bounce = new THREE.DirectionalLight(0x2ec4c6, 0.22);
    bounce.position.set(0.1, -0.8, 0.6);
    scene.add(bounce);
  } else {
    scene.add(new THREE.HemisphereLight(0xc8ecec, 0x0a1820, 0.62));
    key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(0.7, 2.1, 1.4);
    scene.add(key);
    fill = new THREE.DirectionalLight(0xa8d8dc, 0.85);
    fill.position.set(-1.3, 0.5, 0.5);
    scene.add(fill);
    /* Strong front + side fill so milky bag body reads clearly */
    const frontFill = new THREE.DirectionalLight(0xf2fafa, 1.35);
    frontFill.position.set(0.05, 0.55, 2.4);
    scene.add(frontFill);
    const underFill = new THREE.DirectionalLight(0x8ec8cc, 0.55);
    underFill.position.set(0.2, -1.2, 0.8);
    scene.add(underFill);
    rim = new THREE.DirectionalLight(0x2ec4c6, 0.95);
    rim.position.set(0.2, 0.6, -1.35);
    scene.add(rim);
    rimBrand = new THREE.DirectionalLight(0x0e7475, 0.85);
    rimBrand.position.set(-0.7, 0.55, -1.0);
    scene.add(rimBrand);
    spot = new THREE.SpotLight(0xa8d5d6, 1.05, 8, Math.PI / 7, 0.45, 1.2);
    spot.position.set(0.15, 2.4, 1.6);
    scene.add(spot);
    scene.add(spot.target);
  }

  const product = new THREE.Group();
  scene.add(product);

  const _tmpSize = new THREE.Vector3();
  const clock = new THREE.Clock();

  /* Spring presets — critically damped, tracks scroll tightly (V25) */
  const SPRING = organicScrub
    ? { omega: 18.0, zeta: 1.0 } /* critical — 1:1-ish, no sticky lag */
    : softScrub
      ? { omega: 12.0, zeta: 1.0 }
      : { omega: 24.0, zeta: 0.95 }; /* snappy, lightly underdamped */

  const state = {
    ready: false,
    smoothT: 0,
    targetT: 0,
    velT: 0,
    lastDt: 1 / 60,
    scrollSpeed: 0,
    prevTargetT: 0,
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
    bodyShellMats: [], /* always-on milky PE liner mats */
    keyLight: key,
    rimLight: rim,
    /* secondary motion envelopes */
    wobbleAmp: 0,
    peakSep: 0,
    handheld: { x: 0, y: 0, z: 0 },
    keyBase: lightTheme ? 1.55 : 1.35,
    rimBase: lightTheme ? 0.85 : 1.15,
  };

  function easeInOutCubic(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutQuint(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t < 0.5
      ? 16 * t * t * t * t * t
      : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  function easeInOutCirc(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
  }

  /** Anticipatory dip then rise — soft pull-back before explode */
  function easeAnticipatory(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    if (t < 0.16) {
      const u = t / 0.16;
      return -0.045 * Math.sin(u * Math.PI);
    }
    const u = (t - 0.16) / 0.84;
    return easeInOutCirc(u);
  }

  function smoothstep(edge0, edge1, x) {
    const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function captionOpacity(t, start, end) {
    const span = Math.max(0.0001, end - start);
    const fade = Math.min(0.14, span * 0.42);
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
      /* Cinematic y-drift + soft scale; blur settles as caption arrives */
      const y = (1 - o) * (organicScrub ? 34 : 28);
      const sc = 0.88 + o * 0.12;
      el.style.transform = `translate(-50%, ${y.toFixed(2)}px) scale(${sc.toFixed(3)})`;
      el.style.filter =
        o > 0.04
          ? `blur(${((1 - o) * (organicScrub ? 7.5 : 6)).toFixed(2)}px)`
          : 'blur(9px)';
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

  function frameMul() {
    /* Enough air to see FULL liner (lid+bag), not so far the body ghosts away */
    const w = window.innerWidth || 1;
    if (w < 480) return lightTheme ? 1.65 : 1.75;
    if (w < 820) return lightTheme ? 1.5 : 1.6;
    return lightTheme ? 1.3 : 1.4;
  }

  function syncFogToDistance() {
    if (!scene.fog || !scene.fog.isFogExp2) return;
    const fd = Math.max(state.fitDist, 0.35);
    scene.fog.density = THREE.MathUtils.clamp(0.07 / fd, 0.008, 0.08);
  }

  function fitCamera(box) {
    box.getCenter(state.center);
    box.getSize(_tmpSize);
    state.radius = Math.max(_tmpSize.x, _tmpSize.y, _tmpSize.z) * 0.5 || 0.15;
    /* fov is vertical — on portrait also fit width or product eats the phone */
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.25, camera.aspect || window.innerWidth / Math.max(window.innerHeight, 1));
    const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
    const distV = state.radius / Math.sin(vFov * 0.5);
    const distH = state.radius / Math.sin(Math.max(hFov * 0.5, 0.05));
    const dist = Math.max(distV, distH);
    state.fitDist = dist * frameMul();
    camera.near = Math.max(0.01, state.fitDist / 200);
    camera.far = Math.max(state.fitDist * 6, dist * 50);
    camera.updateProjectionMatrix();
    syncFogToDistance();
  }

  function refitIfReady() {
    sizeCanvas();
    if (state.ready) {
      fitCamera(new THREE.Box3().setFromObject(product));
    }
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
        if ('envMapIntensity' in m) m.envMapIntensity = lightTheme ? 1.45 : 1.55;
        if ('transparent' in m && m.opacity < 1) {
          m.transparent = false;
          m.opacity = 1;
        }
      }
    });
  }

  /**
   * Force a clearly visible milky bag. Unlit BasicMaterial on dark theme so
   * lighting/fog/ACES cannot crush it to black (V16–V18 still looked black).
   * No atlas maps. Lid keeps baked teal texture.
   */
  function convertBodyToLinerPlastic(body) {
    const cached = [];
    body.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.name && /liquid|surface|foam|bubble/i.test(o.name)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = [];
      for (const m of mats) {
        if (!m) {
          next.push(m);
          continue;
        }
        let pm;
        if (lightTheme) {
          pm = new THREE.MeshStandardMaterial({
            color: 0xe8f3f3,
            roughness: 0.45,
            metalness: 0,
            transparent: true,
            opacity: 0.9,
            depthWrite: true,
            side: THREE.DoubleSide,
            envMapIntensity: 1.4,
            emissive: new THREE.Color(0x102828),
            emissiveIntensity: 0.08,
          });
        } else {
          /* Unlit mint — always readable against #030a0b */
          pm = new THREE.MeshBasicMaterial({
            color: 0xb8d4d6,
            transparent: true,
            opacity: 0.88,
            depthWrite: true,
            side: THREE.DoubleSide,
          });
        }
        pm.map = null;
        pm.needsUpdate = true;
        next.push(pm);
        cached.push(pm);
      }
      o.material = Array.isArray(o.material) ? next : next[0];
      o.frustumCulled = false;
      o.renderOrder = 1;
    });
    state.bodyShellMats = cached;
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
   * Critically damped 2nd-order spring toward targetT (V25).
   * Fast track — no endDamp / catch-up that caused mid-scroll hitch.
   */
  function stepSpring(dt) {
    const omega = SPRING.omega;
    const zeta = SPRING.zeta;
    const x = state.smoothT;
    const v = state.velT;
    const target = state.targetT;
    /* Semi-implicit Euler */
    const accel = -2 * zeta * omega * v - omega * omega * (x - target);
    let nv = v + accel * dt;
    let nx = x + nv * dt;
    /* Soft clamp at bounds — kill velocity only when past edge */
    if (nx < 0) {
      nx = 0;
      nv = Math.max(0, nv);
    } else if (nx > 1) {
      nx = 1;
      nv = Math.min(0, nv);
    }
    /* Tiny residual snap only when both target + smooth are at extreme */
    if (target >= 0.995 && nx > 0.992 && Math.abs(nv) < 0.8) {
      nx = 1;
      nv = 0;
    } else if (target <= 0.005 && nx < 0.008 && Math.abs(nv) < 0.8) {
      nx = 0;
      nv = 0;
    }
    state.velT = nv;
    state.smoothT = nx;
  }

  /**
   * Phase-aware camera with eased yaw/dolly arcs + handheld noise.
   */
  function placeCamera(t, sep, flowE, introE, handheldAmp) {
    /* Soft look bias from stream only */
    const lookBias = flowE * 0.48;
    /* Yaw arc through explode, ease back through rejoin/stream */
    const yawRaw =
      smoothstep(0.06, 0.40, t) * (1 - 0.28 * smoothstep(0.42, 0.62, t));
    const yawDrive = easeInOutCirc(yawRaw);
    const yaw = THREE.MathUtils.lerp(CAM_YAW0, CAM_YAW1, yawDrive);

    const introFar = INTRO_FAR * (1 - introE);
    /* Soft dolly — sep + stream, never extreme pullback */
    const dollyEase =
      easeInOutQuint(sep) * 0.42 + easeInOutCirc(lookBias) * FLOW_DOLLY;
    const dolly = state.fitDist * (1 + introFar - DOLLY_IN * dollyEase);

    const elev =
      state.radius *
      ((lightTheme ? 0.28 : 0.2) -
        0.05 * sep -
        FLOW_TILT * lookBias -
        0.03 * (1 - introE));

    const et = clock.getElapsedTime();
    const hx = state.handheld.x * handheldAmp;
    const hy = state.handheld.y * handheldAmp;
    const hz = state.handheld.z * handheldAmp * 0.55;

    const cx = state.center.x + hx;
    const cy =
      state.center.y +
      state.radius * ((lightTheme ? 0.18 : 0.07) - 0.08 * lookBias - 0.04 * sep) +
      hy;
    const cz = state.center.z + hz;

    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    const portrait = (camera.aspect || 1) < 0.9;
    const yNudge = portrait ? state.radius * 0.12 : 0;
    camera.lookAt(
      cx,
      cy + yNudge - state.radius * (0.03 + 0.1 * flowE + 0.04 * sep),
      cz
    );
    /* Gentle dutch with stream beat */
    const dutchShape = Math.sin(easeInOutQuint(flowE) * Math.PI);
    const dutchAmp = dutchShape * 0.65;
    camera.rotation.z += DUTCH_MAX * dutchAmp;
    camera.rotation.z += Math.sin(et * 0.7) * 0.0035 * handheldAmp;
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

    const tubeRadius = Math.max(0.006, r * 0.052);
    const geo = new THREE.TubeGeometry(
      curve,
      STREAM_TUBULAR_SEGS,
      tubeRadius,
      STREAM_RADIAL_SEGS,
      false
    );

    {
      const pos = geo.attributes.position;
      const radial = STREAM_RADIAL_SEGS;
      const tubular = STREAM_TUBULAR_SEGS;
      for (let i = 0; i <= tubular; i++) {
        const u = i / tubular;
        const taper = 1.2 - u * 0.7;
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
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0,
      roughness: 0.16,
      metalness: 0.04,
      transmission: 0.36,
      thickness: 0.022,
      ior: 1.33,
      clearcoat: 0.5,
      clearcoatRoughness: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    product.add(mesh);

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

  function updateStream(flowE) {
    const mesh = state.stream;
    const hi = state.streamHi;
    const ring = state.portRing;
    if (!mesh) return;

    if (flowE < 0.015) {
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
    /* Smooth grow/shrink along tube — softer than linear scrub */
    const reveal = easeInOutCirc(THREE.MathUtils.clamp(flowE * 1.05, 0, 1));
    const count = Math.max(
      STREAM_RADIAL_SEGS * 3,
      Math.floor(state.streamIndexCount * reveal)
    );
    const tri = Math.floor(count / 3) * 3;
    mesh.geometry.setDrawRange(0, tri);

    const midBoost = Math.sin(Math.PI * THREE.MathUtils.clamp(flowE, 0, 1));
    mesh.material.opacity = THREE.MathUtils.clamp(
      0.22 + flowE * 0.55 + midBoost * 0.22,
      0,
      0.88
    );
    mesh.material.emissiveIntensity = 0.22 + midBoost * 0.38;

    /* Always teal/clear clinical suction */
    mesh.material.color.setHex(0x0a8a8c);
    mesh.material.emissive.setHex(0x2ec4c6);
    if ('transmission' in mesh.material) {
      mesh.material.transmission = 0.32;
    }

    if (hi) {
      hi.visible = true;
      const hiCount = Math.max(
        18,
        Math.floor(state.streamHiIndexCount * reveal)
      );
      hi.geometry.setDrawRange(0, Math.floor(hiCount / 3) * 3);
      hi.material.opacity = THREE.MathUtils.clamp(
        0.1 + flowE * 0.4 + midBoost * 0.26,
        0,
        0.68
      );
      hi.material.color.setHex(0x5ee8ea);
    }

    if (ring) {
      /* V23: static port accent during flow — no heartbeat pulse */
      ring.visible = true;
      const pulse =
        smoothstep(0.02, 0.18, flowE) * (1 - smoothstep(0.72, 0.98, flowE));
      ring.material.opacity = THREE.MathUtils.clamp(pulse * 0.42, 0, 0.55);
      ring.material.emissiveIntensity = pulse * 0.55;
      ring.scale.set(1, 1, 1);
      ring.material.color.setHex(0x066163);
    }
  }

  function applyTheatre(t, dt) {
    /*
     * Intro   0–0.12 : locked, soft scale-in / gentle dolly
     * Explode 0.10–0.40: sep + lid tilt (anticipatory), soft yaw
     * Rejoin  0.34–0.50: shared easeOut — lid+body seat together
     * Settle  0.48–0.62: soft assemble ease (invisible lock, no pop)
     * V27: no Stream beat — straw / port ring removed
     */
    const introE = easeOutCubic(smoothstep(0.0, 0.10, t));

    const tLid = THREE.MathUtils.clamp(t + LID_LEAD, 0, 1);
    const tBody = THREE.MathUtils.clamp(t - BODY_LAG, 0, 1);

    /* Wider explode window + circ ease — less snappy */
    const openLid = organicScrub
      ? easeAnticipatory(smoothstep(0.08, 0.40, tLid))
      : easeInOutQuint(smoothstep(0.09, 0.38, tLid));
    const openBody = organicScrub
      ? easeInOutCirc(smoothstep(0.10, 0.42, tBody))
      : easeInOutQuint(smoothstep(0.10, 0.40, tBody));
    /* Shared rejoin on t — pieces meet; easeOut seats without mid-gap */
    const rejoin = easeOutCubic(smoothstep(0.34, 0.50, t));

    let sepLid = Math.max(0, openLid * (1 - rejoin));
    let sepBody = Math.max(0, openBody * (1 - rejoin));
    let sep = Math.max(sepLid, sepBody);

    /* Soft assemble ease — invisible lock; kills residual float gently */
    const assembleE = easeOutCubic(smoothstep(0.48, 0.62, t));
    sepLid *= 1 - assembleE;
    sepBody *= 1 - assembleE;
    sep = Math.max(sepLid, sepBody);

    /* V27: no end-phase suction tube — scrub ends on assembled product */
    const flowE = 0;

    /* One-shot impact wobble — never reboost every frame (V23 bug) */
    if (sep > state.peakSep) state.peakSep = sep;
    if (
      sep < state.peakSep * 0.72 &&
      state.peakSep > 0.4 &&
      state.wobbleAmp < 0.04 &&
      assembleE < 0.15
    ) {
      state.wobbleAmp = Math.min(0.18, state.peakSep * 0.22);
    }
    if (sep < 0.08 || assembleE > 0.35) {
      state.wobbleAmp *= Math.exp(-10 * dt);
      state.peakSep *= 0.92;
    } else {
      state.wobbleAmp *= Math.exp(-3.2 * dt);
    }
    if (assembleE > 0.92) {
      state.wobbleAmp = 0;
      state.peakSep = 0;
    }

    const et = clock.getElapsedTime();
    const wobble =
      state.wobbleAmp *
      (1 - assembleE) *
      Math.sin(et * 9.2) *
      Math.exp(-state.wobbleAmp * 0.9);

    /* Continuous pose — no hard copy-to-base cliff */
    if (state.lid) {
      const sL = Math.max(0, sepLid + wobble * 0.22);
      state.lid.position.set(
        state.lidBase.x - X_SPLIT * sL,
        state.lidBase.y + LID_UP * sL,
        state.lidBase.z
      );
      state.lid.rotation.copy(state.lidBaseRot);
      state.lid.rotation.x += LID_TILT_X * sL + wobble * 0.045;
      state.lid.rotation.z += LID_TILT_Z * sL + wobble * 0.03;
    }
    if (state.body) {
      const sB = Math.max(0, sepBody - wobble * 0.12);
      state.body.position.set(
        state.bodyBase.x + X_SPLIT * sB,
        state.bodyBase.y - BODY_DOWN * sB,
        state.bodyBase.z
      );
      state.body.rotation.copy(state.bodyBaseRot);
      state.body.rotation.z += wobble * -0.018;
    }

    const introScale = 0.93 + 0.07 * introE;
    product.scale.set(introScale, introScale, introScale);

    const still = 1 - THREE.MathUtils.clamp(state.scrollSpeed * 28, 0, 1);
    const breathAmp =
      (1 - sep) * (1 - flowE * 0.4) * (0.35 + 0.65 * still);
    const breath =
      breathAmp * Math.sin(et * 1.05) * (organicScrub ? 0.007 : 0.0055);
    product.position.y = (lightTheme ? 0.025 : 0) + breath;

    const handTarget = still * (organicScrub ? 1 : 0.45);
    const n1 = Math.sin(et * 0.93) * 0.004 + Math.sin(et * 1.71) * 0.002;
    const n2 = Math.cos(et * 1.17) * 0.0034 + Math.sin(et * 2.05) * 0.0014;
    const n3 = Math.sin(et * 0.61 + 1.2) * 0.0026;
    state.handheld.x += (n1 * handTarget - state.handheld.x) * Math.min(1, dt * 3.6);
    state.handheld.y += (n2 * handTarget - state.handheld.y) * Math.min(1, dt * 3.6);
    state.handheld.z += (n3 * handTarget - state.handheld.z) * Math.min(1, dt * 3.6);

    placeCamera(t, sep, flowE, introE, handTarget);
    /* V27: updateStream disabled — no straw / port ring */

    const lightBreath = 1 + 0.035 * Math.sin(et * 0.85) * still;
    if (state.keyLight) {
      const target = lightTheme
        ? 1.45 + flowE * 0.16 + sep * 0.08
        : 1.2 + flowE * 0.32 + sep * 0.18;
      state.keyLight.intensity = THREE.MathUtils.lerp(
        state.keyLight.intensity,
        target * lightBreath,
        Math.min(1, dt * 2.8)
      );
    }
    if (state.rimLight) {
      const target = lightTheme
        ? 0.75 + flowE * 0.16 + sep * 0.08
        : 0.95 + flowE * 0.42 + sep * 0.22;
      state.rimLight.intensity = THREE.MathUtils.lerp(
        state.rimLight.intensity,
        target * lightBreath,
        Math.min(1, dt * 2.8)
      );
    }
    const expoTarget = lightTheme
      ? 1.28 + flowE * 0.05 + sep * 0.03
      : 1.05 + flowE * 0.1 + sep * 0.06;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(
      renderer.toneMappingExposure,
      expoTarget,
      Math.min(1, dt * 2.4)
    );

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
      convertBodyToLinerPlastic(body);
      root.updateMatrixWorld(true);
      sizeCanvas();
      fitCamera(new THREE.Box3().setFromObject(product));
      /* V27: no clinical straw / suction tube into port */
      state.ready = true;
      if (loadingEl) loadingEl.classList.add('hide');
      applyTheatre(0, 1 / 60);
    } catch (err) {
      console.error(err);
      showError('بارگذاری مدل ناموفق بود.');
    }
  })();

  window.addEventListener('resize', refitIfReady);

  function applyFrame(dt) {
    let nextTarget = scrubProgress();
    /* Soft edge only — avoid wide 0.015/0.985 cliffs that fought spring */
    if (nextTarget >= 0.997) nextTarget = 1;
    else if (nextTarget <= 0.003) nextTarget = 0;
    /* Estimate scroll speed for handheld / breath damping */
    const dTarget = Math.abs(nextTarget - state.prevTargetT);
    state.scrollSpeed = THREE.MathUtils.lerp(
      state.scrollSpeed,
      dTarget / Math.max(dt, 0.001),
      Math.min(1, dt * 8)
    );
    state.prevTargetT = nextTarget;
    state.targetT = nextTarget;

    if (organicScrub || softScrub || snappyScrub) {
      /* Substep spring for stability on long frames */
      const steps = dt > 0.032 ? 3 : dt > 0.022 ? 2 : 1;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) stepSpring(h);
      /* No catch-up pulls — spring alone tracks tightly (V25) */
    } else {
      /* Exponential lerp fallback — high k, continuous both directions */
      const err = state.targetT - state.smoothT;
      const k = 22;
      state.smoothT += err * (1 - Math.exp(-k * dt));
      if (Math.abs(state.targetT - state.smoothT) < 0.0004) {
        state.smoothT = state.targetT;
      }
    }

    if (!state.ready) return;
    applyTheatre(state.smoothT, dt);

    /* V25: quieter idle float — ~40% prior amplitude */
    const idle = 1 - Math.min(1, state.smoothT * 1.6);
    const still = 1 - THREE.MathUtils.clamp(state.scrollSpeed * 28, 0, 1);
    const et = clock.getElapsedTime();
    const idleAmp = idle * (0.4 + 0.6 * still) * 0.4;
    product.rotation.set(
      Math.sin(et * 0.48) * 0.022 * idleAmp,
      Math.sin(et * 0.38) * 0.07 * idleAmp + Math.sin(et * 0.85) * 0.01,
      Math.sin(et * 0.29) * 0.014 * idleAmp
    );
  }

  window.addEventListener(
    'scroll',
    () => {
      /* target updated in tick; keep listener for responsiveness */
    },
    { passive: true }
  );
  window.addEventListener('touchmove', () => {}, { passive: true });

  sizeCanvas();
  let lastTs = performance.now();
  function tick(now) {
    const rawDt = (now - lastTs) / 1000;
    lastTs = now;
    const dt = THREE.MathUtils.clamp(rawDt || 1 / 60, 0.001, 0.05);
    state.lastDt = dt;
    applyFrame(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
