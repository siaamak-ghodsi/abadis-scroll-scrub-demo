/**
 * Abadis Product Theater — WHIST-BRAND-V12 organic scrub
 * Dark mint stage (default) or light whist skin via data-theme="light"; continuous suction tube → bag fill.
 * Narrative beats: intro → explode → rejoin → stream → fill.
 * Scrub modes: data-scrub="organic" | "soft" | "snappy"
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS_URL = './abadis-scrub-parts.glb';
const HDR_URL = './env/surgery_1k.hdr';
const HDR_FALLBACK = './env/studio_small_09_1k.hdr';

/* Cinematic separation — OR film */
const LID_UP = 0.42;
const BODY_DOWN = 0.48;
const X_SPLIT = 0.18;
const LID_TILT_X = THREE.MathUtils.degToRad(22);
const LID_TILT_Z = THREE.MathUtils.degToRad(-14);

/* Camera: wide yaw, soft dutch, deep dolly */
const CAM_YAW0 = THREE.MathUtils.degToRad(58);
const CAM_YAW1 = THREE.MathUtils.degToRad(-52);
const DOLLY_IN = 0.34;
const FLOW_DOLLY = 0.28;
const FLOW_TILT = 0.2;
const FILL_PUSH = 0.2;
const DUTCH_MAX = THREE.MathUtils.degToRad(4.2);
const INTRO_FAR = 0.32;

const STREAM_TUBULAR_SEGS = 64;
const STREAM_RADIAL_SEGS = 10;

/* Lid leads body by ~60ms of progress at typical scrub speed */
const LID_LEAD = 0.018;
const BODY_LAG = 0.012;

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

/* Longer exclusive bands — cinematic, less frantic */
const CAPTION_RANGES = [
  { start: 0.0, end: 0.17 },
  { start: 0.13, end: 0.42 },
  { start: 0.38, end: 0.62 },
  { start: 0.58, end: 1.0 },
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
  renderer.toneMappingExposure = lightTheme ? 1.34 : 1.08;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(lightTheme ? 0xf3fafa : 0x030a0b);
  if (!lightTheme) {
    scene.fog = new THREE.FogExp2(0x030a0b, 0.22);
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
    bounce = new THREE.DirectionalLight(0xdce395, 0.28);
    bounce.position.set(0.1, -0.8, 0.6);
    scene.add(bounce);
  } else {
    scene.add(new THREE.HemisphereLight(0x9fd8d8, 0x020608, 0.28));
    key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(0.7, 2.1, 1.4);
    scene.add(key);
    fill = new THREE.DirectionalLight(0x2ec4c6, 0.35);
    fill.position.set(-1.3, 0.5, 0.5);
    scene.add(fill);
    rim = new THREE.DirectionalLight(0xdce395, 1.15);
    rim.position.set(0.2, 0.6, -1.35);
    scene.add(rim);
    rimBrand = new THREE.DirectionalLight(0x05686b, 0.9);
    rimBrand.position.set(-0.7, 0.55, -1.0);
    scene.add(rimBrand);
    spot = new THREE.SpotLight(0xdce395, 1.4, 8, Math.PI / 7, 0.45, 1.2);
    spot.position.set(0.15, 2.4, 1.6);
    scene.add(spot);
    scene.add(spot.target);
  }

  const product = new THREE.Group();
  scene.add(product);

  const _tmpSize = new THREE.Vector3();
  const clock = new THREE.Clock();

  /* Spring presets — heavy object following the finger */
  const SPRING = organicScrub
    ? { omega: 9.5, zeta: 0.88 } /* slight overshoot then soft settle */
    : softScrub
      ? { omega: 5.2, zeta: 1.05 }
      : { omega: 16.0, zeta: 1.0 }; /* snappy critically damped */

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
    liquid: null,
    liquidMeniscus: null,
    liquidBaseY: 0,
    liquidFullH: 0.1,
    bloodLevel: 0,
    bloodVel: 0,
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

  /** Anticipatory dip then rise — slight pull-back before explode */
  function easeAnticipatory(t) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    if (t < 0.12) {
      const u = t / 0.12;
      return -0.06 * Math.sin(u * Math.PI); /* tiny reverse dip */
    }
    const u = (t - 0.12) / 0.88;
    return easeInOutQuint(u);
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

  function fitCamera(box) {
    box.getCenter(state.center);
    box.getSize(_tmpSize);
    state.radius = Math.max(_tmpSize.x, _tmpSize.y, _tmpSize.z) * 0.5 || 0.15;
    const dist =
      state.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
    state.fitDist = dist * (lightTheme ? 0.82 : 0.8); /* dark: framed mid-canvas */
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
        if ('envMapIntensity' in m) m.envMapIntensity = lightTheme ? 1.45 : 1.55;
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
   * Critically-/under-damped 2nd-order spring toward targetT.
   * Feels like a heavy object following the finger with soft settle.
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
    /* Soft clamp with bounce-in rather than hard clip */
    if (nx < 0) {
      nx = 0;
      nv *= -0.15;
    } else if (nx > 1) {
      nx = 1;
      nv *= -0.15;
    }
    state.velT = nv;
    state.smoothT = nx;
  }

  /**
   * Phase-aware camera with eased yaw/dolly arcs + handheld noise.
   */
  function placeCamera(t, sep, flowE, fillE, introE, handheldAmp) {
    const lookBias = flowE * 0.55 + fillE * 0.75;
    /* Smoother yaw: circ ease through explode, hold through rejoin */
    const yawRaw =
      smoothstep(0.08, 0.36, t) * (1 - 0.32 * smoothstep(0.36, 0.5, t));
    const yawDrive = easeInOutCirc(yawRaw);
    const yaw = THREE.MathUtils.lerp(CAM_YAW0, CAM_YAW1, yawDrive);

    const introFar = INTRO_FAR * (1 - introE);
    /* Soft dolly arc — less linear */
    const dollyEase = easeInOutQuint(sep) * 0.35 + easeInOutCirc(lookBias) * FLOW_DOLLY + easeOutCubic(fillE) * FILL_PUSH;
    const dolly =
      state.fitDist * (1 + introFar - DOLLY_IN * dollyEase);

    const elev =
      state.radius *
      ((lightTheme ? 0.28 : 0.2) -
        0.03 * sep -
        FLOW_TILT * lookBias -
        0.14 * fillE -
        0.04 * (1 - introE));

    const et = clock.getElapsedTime();
    const hx = state.handheld.x * handheldAmp;
    const hy = state.handheld.y * handheldAmp;
    const hz = state.handheld.z * handheldAmp * 0.6;

    const cx = state.center.x + hx;
    const cy =
      state.center.y +
      state.radius *
        ((lightTheme ? 0.18 : 0.07) - 0.12 * lookBias - 0.1 * fillE) +
      hy;
    const cz = state.center.z + hz;

    camera.position.set(
      cx + Math.sin(yaw) * dolly,
      cy + elev,
      cz + Math.cos(yaw) * dolly
    );
    camera.lookAt(
      cx,
      cy - state.radius * (0.03 + 0.16 * flowE + 0.14 * fillE),
      cz
    );
    /* Gentle dutch that eases in/out with flow */
    const dutchShape = Math.sin(easeInOutQuint(flowE) * Math.PI);
    const dutchAmp = dutchShape * (1 - fillE * 0.9) * 0.7;
    camera.rotation.z += DUTCH_MAX * dutchAmp;
    /* Micro handheld roll when nearly still */
    camera.rotation.z += Math.sin(et * 0.7) * 0.004 * handheldAmp;
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

  function createLiquidFill(body) {
    const box = new THREE.Box3().setFromObject(body);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const radius = Math.min(size.x, size.z) * 0.38;
    const height = size.y * 0.82;
    /* Extra height segs so top ring can wave / meniscus */
    const radialSegs = 48;
    const heightSegs = 10;
    const geo = new THREE.CylinderGeometry(
      radius,
      radius * 0.97,
      1,
      radialSegs,
      heightSegs,
      false
    );
    /* Clinical venous blood — deep crimson, viscous, not cartoon */
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x5c0a12,
      emissive: 0x1a0406,
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0,
      roughness: 0.48,
      metalness: 0.02,
      transmission: 0.06,
      thickness: 0.1,
      ior: 1.4,
      specularIntensity: 0.45,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;

    /* Cache base positions for surface deformation */
    const pos = geo.attributes.position;
    const base = new Float32Array(pos.array.length);
    base.set(pos.array);
    mesh.userData.basePos = base;
    mesh.userData.radialSegs = radialSegs;
    mesh.userData.heightSegs = heightSegs;
    mesh.userData.radius = radius;

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

    /* Thin meniscus / surface disk — rides on top of blood column */
    const menGeo = new THREE.CircleGeometry(radius * 0.98, 48);
    const menMat = new THREE.MeshPhysicalMaterial({
      color: 0x6e1018,
      emissive: 0x2a080c,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0,
      roughness: 0.28,
      metalness: 0.05,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const meniscus = new THREE.Mesh(menGeo, menMat);
    meniscus.rotation.x = -Math.PI / 2;
    meniscus.visible = false;
    meniscus.frustumCulled = false;
    mesh.add(meniscus);

    state.liquid = mesh;
    state.liquidMeniscus = meniscus;
    state.liquidBaseY = localBottom.y;
    state.liquidFullH = localH;
    state.bloodLevel = 0;
    state.bloodVel = 0;
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
    /* Smoother marching reveal — quint ease */
    const reveal = easeInOutQuint(THREE.MathUtils.clamp(flowE * 1.15, 0, 1));
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

    if (ring) {
      ring.visible = true;
      const pulse =
        smoothstep(0.02, 0.2, flowE) * (1 - smoothstep(0.5, 0.88, flowE));
      const beat = 0.72 + 0.28 * Math.sin(clock.getElapsedTime() * 2.6);
      ring.material.opacity = THREE.MathUtils.clamp(pulse * 0.55, 0, 0.7);
      ring.material.emissiveIntensity = pulse * beat * 0.95;
      const s = 1 + pulse * 0.05 * beat;
      ring.scale.set(s, s, s);
    }
  }

  /**
   * bloodLevel 0..1 — viscous fill AND drain of clinical blood inside the liner.
   * draining=true softens surface (outflow), filling adds slightly livelier waves.
   */
  function updateLiquid(bloodLevel, draining) {
    const mesh = state.liquid;
    const men = state.liquidMeniscus;
    if (!mesh) return;
    const level = THREE.MathUtils.clamp(bloodLevel, 0, 1);
    if (level < 0.015) {
      mesh.visible = false;
      mesh.material.opacity = 0;
      if (men) {
        men.visible = false;
        men.material.opacity = 0;
      }
      return;
    }
    mesh.visible = true;
    const et = clock.getElapsedTime();
    /* Viscosity: slower, heavier waves when draining */
    const wAmp = draining ? 0.008 : 0.014;
    const wave =
      Math.sin(et * (draining ? 1.05 : 1.45)) * wAmp +
      Math.sin(et * 2.25 + 0.7) * wAmp * 0.45;
    const sy = 0.02 + 0.96 * easeInOutCirc(level);
    const h = sy * state.liquidFullH;
    mesh.scale.set(1 + wave * 0.06, h * (1 + wave * 0.35), 1 - wave * 0.04);
    mesh.position.y = state.liquidBaseY + h * 0.5;

    /* Deform top verts for meniscus bowl + azimuthal ripple */
    const base = mesh.userData.basePos;
    const pos = mesh.geometry.attributes.position;
    if (base && pos) {
      const yMax = 0.5; /* cylinder unit height top */
      for (let i = 0; i < pos.count; i++) {
        const ix = i * 3;
        const bx = base[ix];
        const by = base[ix + 1];
        const bz = base[ix + 2];
        let y = by;
        if (by > yMax - 0.04) {
          const ang = Math.atan2(bz, bx);
          const r = Math.sqrt(bx * bx + bz * bz) || 0.0001;
          const rN = THREE.MathUtils.clamp(r / (mesh.userData.radius || r), 0, 1);
          /* Concave meniscus: edges climb wall slightly */
          const meniscus = (rN * rN) * 0.018 - 0.006;
          const ripple =
            Math.sin(ang * 3 + et * 1.8) * 0.01 * (draining ? 0.55 : 1) +
            Math.sin(ang * 5 - et * 2.4) * 0.005;
          y = by + meniscus + ripple;
        }
        pos.array[ix] = bx;
        pos.array[ix + 1] = y;
        pos.array[ix + 2] = bz;
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }

    /* Deep venous opacity — denser in bulk, slight shimmer */
    const op = 0.62 + level * 0.32 + Math.sin(et * 0.85) * 0.025;
    mesh.material.opacity = THREE.MathUtils.clamp(op, 0, 0.95);
    mesh.material.emissiveIntensity = 0.07 + level * 0.09;
    const mix = 0.45 + 0.55 * Math.sin(et * 0.5);
    mesh.material.color.setRGB(
      (0x5c + (0x8b - 0x5c) * mix) / 255,
      (0x0a + (0x15 - 0x0a) * mix) / 255,
      (0x12 + (0x20 - 0x12) * mix) / 255
    );

    if (men) {
      men.visible = true;
      /* Sit just above column top in local mesh space (unit cylinder) */
      men.position.set(0, 0.5 + wave * 0.8, 0);
      const mWave = Math.sin(et * 1.6) * 0.012;
      men.scale.set(1 + mWave, 1 + mWave, 1);
      men.material.opacity = THREE.MathUtils.clamp(0.35 + level * 0.4, 0, 0.78);
      men.material.color.setRGB(
        (0x6e + (0x9a - 0x6e) * mix) / 255,
        (0x10 + (0x1a - 0x10) * mix) / 255,
        (0x18 + (0x28 - 0x18) * mix) / 255
      );
    }
  }

  function applyTheatre(t, dt) {
    /*
     * Intro  0–0.12  : locked, scale-in / dolly from farther
     * Explode 0.12–0.38: sep + lid tilt (anticipatory), yaw swing
     * Rejoin 0.38–0.55: sep→0 with soft settle + micro-wobble
     * Stream 0.48–0.72: look into port; smooth drawRange
     * Fill   0.54–0.76: blood rises; 0.78–0.97 drains empty
     */
    const introE = easeOutCubic(smoothstep(0.0, 0.09, t));

    /* Stagger: lid leads body by LID_LEAD of progress */
    const tLid = THREE.MathUtils.clamp(t + LID_LEAD, 0, 1);
    const tBody = THREE.MathUtils.clamp(t - BODY_LAG, 0, 1);

    const openLid = organicScrub
      ? easeAnticipatory(smoothstep(0.07, 0.34, tLid))
      : easeInOutQuint(smoothstep(0.08, 0.34, tLid));
    const openBody = organicScrub
      ? easeInOutQuint(smoothstep(0.09, 0.36, tBody))
      : easeInOutQuint(smoothstep(0.09, 0.35, tBody));
    const rejoinLid = easeInOutCirc(smoothstep(0.34, 0.5, tLid));
    const rejoinBody = easeInOutCirc(smoothstep(0.35, 0.52, tBody));

    const sepLid = Math.max(0, openLid * (1 - rejoinLid));
    const sepBody = Math.max(0, openBody * (1 - rejoinBody));
    const sep = Math.max(sepLid, sepBody);

    const flowE = easeInOutQuint(smoothstep(0.43, 0.68, t)) * (1 - 0.55 * smoothstep(0.78, 0.95, t));
    /*
     * Blood inside liner: fill → brief hold → visible drain (empty).
     * fillE drives camera/light presence; bloodLevel is actual column height.
     */
    const fillUp = easeInOutCirc(smoothstep(0.54, 0.74, t));
    const drain = easeInOutQuint(smoothstep(0.78, 0.97, t));
    const bloodLevel = Math.max(0, fillUp * (1 - drain));
    const draining = drain > 0.02 && bloodLevel < fillUp - 0.01;
    const fillE = bloodLevel; /* camera/light follow living blood column */

    /* Track peak separation → fuel decaying micro-wobble after explode */
    if (sep > state.peakSep) state.peakSep = sep;
    if (sep < state.peakSep * 0.85 && state.peakSep > 0.35) {
      state.wobbleAmp = Math.max(state.wobbleAmp, state.peakSep * 0.55);
    }
    if (sep < 0.05) state.peakSep *= 0.992;
    state.wobbleAmp *= Math.exp(-2.8 * dt); /* decay ~0.35s half-life */

    const et = clock.getElapsedTime();
    const wobble =
      state.wobbleAmp *
      Math.sin(et * 11.5) *
      Math.exp(-state.wobbleAmp * 0.8);

    if (state.lid) {
      const sL = sepLid + wobble * 0.35;
      state.lid.position.set(
        state.lidBase.x - X_SPLIT * sL,
        state.lidBase.y + LID_UP * sL,
        state.lidBase.z
      );
      state.lid.rotation.copy(state.lidBaseRot);
      state.lid.rotation.x += LID_TILT_X * sL + wobble * 0.08;
      state.lid.rotation.z += LID_TILT_Z * sL + wobble * 0.05;
    }
    if (state.body) {
      const sB = sepBody - wobble * 0.2;
      state.body.position.set(
        state.bodyBase.x + X_SPLIT * Math.max(0, sB),
        state.bodyBase.y - BODY_DOWN * Math.max(0, sB),
        state.bodyBase.z
      );
      state.body.rotation.copy(state.bodyBaseRot);
      state.body.rotation.z += wobble * -0.03;
    }

    const introScale = 0.92 + 0.08 * introE;
    const fillScale = 1 + 0.05 * fillE;
    const s = introScale * fillScale;
    product.scale.set(s, s, s);

    /* Soft breathing idle when scroll nearly still + assembled */
    const still = 1 - THREE.MathUtils.clamp(state.scrollSpeed * 28, 0, 1);
    const breathAmp =
      (1 - sep) * (1 - flowE * 0.45) * (0.35 + 0.65 * still);
    const breath =
      breathAmp * Math.sin(et * 1.05) * (organicScrub ? 0.0075 : 0.006);
    product.position.y = (lightTheme ? 0.025 : 0) + breath;

    /* Handheld noise — damps when scrolling fast */
    const handTarget = still * (organicScrub ? 1 : 0.45);
    const n1 = Math.sin(et * 0.93) * 0.0045 + Math.sin(et * 1.71) * 0.0022;
    const n2 = Math.cos(et * 1.17) * 0.0038 + Math.sin(et * 2.05) * 0.0016;
    const n3 = Math.sin(et * 0.61 + 1.2) * 0.003;
    state.handheld.x += (n1 * handTarget - state.handheld.x) * Math.min(1, dt * 4);
    state.handheld.y += (n2 * handTarget - state.handheld.y) * Math.min(1, dt * 4);
    state.handheld.z += (n3 * handTarget - state.handheld.z) * Math.min(1, dt * 4);

    placeCamera(t, sep, flowE, fillE, introE, handTarget);
    updateStream(flowE);
    updateLiquid(bloodLevel, draining);

    /* Soft light breathe tied to phase — not disco */
    const lightBreath = 1 + 0.04 * Math.sin(et * 0.85) * still;
    if (state.keyLight) {
      const target = lightTheme
        ? 1.45 + flowE * 0.18 + fillE * 0.22
        : 1.15 + flowE * 0.4 + fillE * 0.5;
      state.keyLight.intensity =
        THREE.MathUtils.lerp(state.keyLight.intensity, target * lightBreath, Math.min(1, dt * 3));
    }
    if (state.rimLight) {
      const target = lightTheme
        ? 0.75 + flowE * 0.18 + fillE * 0.16
        : 0.95 + flowE * 0.5 + fillE * 0.35;
      state.rimLight.intensity =
        THREE.MathUtils.lerp(state.rimLight.intensity, target * lightBreath, Math.min(1, dt * 3));
    }
    const expoTarget = lightTheme
      ? 1.28 + flowE * 0.06 + fillE * 0.08
      : 1.0 + flowE * 0.12 + fillE * 0.16;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(
      renderer.toneMappingExposure,
      expoTarget,
      Math.min(1, dt * 2.5)
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
      root.updateMatrixWorld(true);
      sizeCanvas();
      fitCamera(new THREE.Box3().setFromObject(product));
      createClinicalStream(lid, body);
      createLiquidFill(body);
      state.ready = true;
      if (loadingEl) loadingEl.classList.add('hide');
      applyTheatre(0, 1 / 60);
    } catch (err) {
      console.error(err);
      showError('بارگذاری مدل ناموفق بود.');
    }
  })();

  window.addEventListener('resize', sizeCanvas);

  function applyFrame(dt) {
    const nextTarget = scrubProgress();
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
      const steps = dt > 0.032 ? 2 : 1;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) stepSpring(h);
    } else {
      const fast = Math.abs(state.targetT - state.smoothT) > 0.08;
      const k = fast ? 0.48 : 0.26;
      state.smoothT += (state.targetT - state.smoothT) * k;
    }

    if (!state.ready) return;
    applyTheatre(state.smoothT, dt);

    const idle = 1 - Math.min(1, state.smoothT * 1.6);
    const still = 1 - THREE.MathUtils.clamp(state.scrollSpeed * 28, 0, 1);
    const et = clock.getElapsedTime();
    const idleAmp = idle * (0.4 + 0.6 * still);
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
