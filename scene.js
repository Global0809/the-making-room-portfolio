import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { createFlyingBooks } from './flying-books.js?v=spatial-20261028-1';

// A small, hand-built studio. Nothing in this scene is a pre-rendered room image.
// The archive remains available through the companion HTML controls.
export async function createRoom({ canvas, onSelect = () => {}, onHover = () => {}, onReady = () => {}, onCameraChange = () => {}, reducedMotion = false }) {
  const scene = new THREE.Scene();
  const smallDevice = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const modestGPU = smallDevice || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 5);
  const warmWall = new THREE.Color('#4a4032');
  scene.background = warmWall.clone();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !modestGPU, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, modestGPU ? 1.25 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;

  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 80);
  const room = new THREE.Group();
  scene.add(room);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(5, 5);
  const pointerTarget = new THREE.Vector2();
  const pointerEase = new THREE.Vector2();
  const interactive = [];
  const allTextures = [];
  const allGeometries = new Set();
  const allMaterials = new Set();
  const livingLeaves = [];
  const reels = [];
  const geomCache = new Map();
  const matCache = new Map();
  let motion = !reducedMotion;
  let isVisible = !document.hidden;
  let initializing = true;
  let disposed = false;
  let frame = 0;
  let lastTime = 0;
  let needFrames = 2;
  let hover = null;
  let pointerClient = { x: 0, y: 0 };
  let pointerDown = null;
  let wasDragged = false;
  let lastActivation = -Infinity;
  let aspect = 1.7;
  let intro = motion ? 0 : 1;
  let lighting = 'day';
  let lightingMix = 0;
  let ambientTime = 0;
  let totalFrames = 0;
  let overlayOpen = false;
  let mediaPlaying = false;
  let pendingHoverCheck = true;
  let lastHoverCheck = -Infinity;
  let lastShadowUpdate = -Infinity;
  let shadowDirty = false;
  let burstCursor = 0;
  let activeBursts = 0;
  const cameraTarget = new THREE.Vector3(0, 3.3, 0);
  const cameraBase = new THREE.Vector3(0, 5.55, 17.6);
  const focusOffset = new THREE.Vector2();
  const focusTarget = new THREE.Vector2();
  const dragOffset = new THREE.Vector2();
  const lookTarget = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const propCenter = new THREE.Vector3();
  let focusedCategory = null;
  let targetZoom = 1;
  let lastCameraNotice = 0;
  let seed = 284731;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const yieldToBrowser = () => globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise(resolve => setTimeout(resolve, 0));

  function material(color, roughness = .65, metalness = 0, extra = {}) {
    const key = `${color}:${roughness}:${metalness}:${JSON.stringify(extra)}`;
    if (!matCache.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
      matCache.set(key, m); allMaterials.add(m);
    }
    return matCache.get(key);
  }
  const paint = material('#cda632', .51);
  const paintEdge = material('#b48a34', .59);
  const paintBack = material('#a78337', .86);
  const cream = material('#e9debc', .7);
  const ink = material('#272720', .52);
  const brass = material('#bfa372', .32, .62);
  const walnut = material('#60422d', .64);
  const paper = material('#dfd6bb', .91);

  function geometry(key, factory) {
    if (!geomCache.has(key)) { const g = factory(); geomCache.set(key, g); allGeometries.add(g); }
    return geomCache.get(key);
  }
  function mesh(g, m, parent = room) {
    allGeometries.add(g); allMaterials.add(m);
    const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  function box(w, h, d, m, x = 0, y = 0, z = 0, parent = room, radius = .025) {
    const r = Math.min(radius, w / 4, h / 4, d / 4);
    const key = `b:${w}:${h}:${d}:${r}`;
    const o = mesh(geometry(key, () => r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d)), m, parent);
    o.position.set(x, y, z); return o;
  }
  function sphere(r, m, x = 0, y = 0, z = 0, parent = room, segments = 24) {
    const o = mesh(geometry(`s:${r}:${segments}`, () => new THREE.SphereGeometry(r, segments, Math.floor(segments * .7))), m, parent);
    o.position.set(x, y, z); return o;
  }
  function cylinder(rt, rb, h, m, x = 0, y = 0, z = 0, parent = room, segments = 24) {
    const o = mesh(geometry(`c:${rt}:${rb}:${h}:${segments}`, () => new THREE.CylinderGeometry(rt, rb, h, segments)), m, parent);
    o.position.set(x, y, z); return o;
  }
  function torus(r, tube, m, x = 0, y = 0, z = 0, parent = room, arc = Math.PI * 2) {
    const o = mesh(geometry(`t:${r}:${tube}:${arc}`, () => new THREE.TorusGeometry(r, tube, 8, 40, arc)), m, parent);
    o.position.set(x, y, z); return o;
  }
  function group(x, y, z, parent = room) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  function tube(points, radius, m, parent = room) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, Math.max(12, points.length * 5), radius, 7, false), m, parent);
  }
  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8); allTextures.push(t); return t;
  }
  function texturedMaterial(texture, color = '#ffffff', roughness = .85) {
    const m = new THREE.MeshStandardMaterial({ color, map: texture, roughness }); allMaterials.add(m); return m;
  }
  function artPlane(w, h, texture, x, y, z, parent = room) {
    const o = mesh(geometry(`p:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)), texturedMaterial(texture), parent);
    o.position.set(x, y, z); return o;
  }
  function hot(g, category, radius = .25) {
    g.userData.category = category;
    g.userData.baseY = g.position.y;
    g.userData.baseRotation = g.rotation.z;
    g.userData.hoverAmount = 0;
    g.traverse(o => { if (o.isMesh) o.userData.category = category; });
    interactive.push(g);
    return g;
  }
  function plaque(label, width, x, y, z, parent = room) {
    const texture = canvasTexture(512, 112, (ctx, w, h) => {
      ctx.fillStyle = '#d9c68d'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a3b26'; ctx.font = '600 42px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, w / 2, h / 2 + 1);
      ctx.strokeStyle = '#b39b62'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, w - 16, h - 16);
    });
    box(width + .025, width * .218 + .025, .035, brass, x, y, z, parent, .008);
    return artPlane(width, width * .218, texture, x, y, z + .019, parent);
  }

  // Real room surfaces with subtle plaster and individual timber planks.
  const plaster = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#74644c'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 13000; i++) {
      const n = rand(); ctx.fillStyle = n > .5 ? 'rgba(255,244,219,.026)' : 'rgba(15,12,7,.03)'; ctx.fillRect(rand() * w, rand() * h, rand() * 2 + .2, rand() * 2 + .2);
    }
  });
  plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping; plaster.repeat.set(6, 4);
  const wallMaterial = texturedMaterial(plaster, '#948c7c', .95);
  const wall = box(35, 19, .12, wallMaterial, 0, 7, -1.22, room, 0);
  wall.castShadow = false;
  const sidewall = box(.12, 19, 20, material('#4f4434', .97), -9.8, 7, 8.7, room, 0);
  sidewall.castShadow = false;
  const floor = box(32, .15, 25, material('#69503a', .85), 0, -.16, 6, room, 0);
  floor.castShadow = false;
  const woodTexture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#9a7550'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 210; i++) {
      ctx.strokeStyle = `rgba(${rand() > .45 ? '56,31,16' : '224,189,139'},${rand() * .055 + .015})`;
      ctx.lineWidth = rand() * 1.8 + .2;
      const y = rand() * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * .3, y + rand() * 7, w * .6, y - rand() * 5, w, y + rand() * 5); ctx.stroke();
    }
  });
  woodTexture.wrapS = THREE.RepeatWrapping; woodTexture.repeat.x = 2;
  const woodColors = ['#a88865', '#a18362', '#af8c65', '#987653', '#ad8960', '#b28f6d'];
  for (let row = 0; row < 18; row++) {
    const z = row * .65 - .65;
    for (let col = 0; col < 8; col++) {
      const x = col * 4.2 - 16.8 + (row % 2 ? 2.1 : 0);
      const b = box(4.18, .045, .635, texturedMaterial(woodTexture, woodColors[(row + col) % woodColors.length]), x, -.055, z, room, .003); b.castShadow = false;
    }
  }
  box(31, .15, .09, material('#3b3025', .7), 0, .04, -1.08, room, .005);
  box(31, .025, .045, material('#80684b', .7), 0, .125, -1.025, room, .002);
  await yieldToBrowser();

  // The sculptural yellow shelving, stepped rather than a rectangular bookcase.
  const shelf = group(.65, .08, -.38);
  const columns = [
    { x: 0, h: 4.30, levels: [.12, 1.42, 2.85, 4.30] },
    { x: 1.34, h: 3.13, levels: [.12, 1.55, 3.13] },
    { x: 2.68, h: 6.55, levels: [.12, 1.50, 3.08, 4.64, 6.55] },
    { x: 4.02, h: 5.45, levels: [.12, 1.50, 2.90, 4.16, 5.45] },
  ];
  for (const c of columns) {
    box(1.30, c.h, .075, paintBack, c.x, c.h / 2, -.69, shelf, .012);
    box(.13, c.h + .1, 1.14, paint, c.x - .625, c.h / 2, -.12, shelf, .023);
    box(.13, c.h + .1, 1.14, paint, c.x + .625, c.h / 2, -.12, shelf, .023);
    for (const h of c.levels) box(1.30, .13, 1.14, paint, c.x, h, -.12, shelf, .025);
    // Small feet and a dark inset edge keep the case grounded on the floor.
    for (const x of [-.46, .46]) cylinder(.035, .027, .13, walnut, c.x + x, -.03, .13, shelf, 12);
  }
  box(5.32, .09, .04, paintEdge, 2.01, .075, .47, shelf, .008);

  const bookColors = ['#9e5950', '#b58b62', '#c6bc92', '#65796a', '#445d62', '#b8ab74', '#d2c3a5', '#786c64', '#c07f57', '#887e46', '#4e5551'];
  function book(x, y, z, w, h, color, parent = shelf, title = '') {
    const g = group(x, y + h / 2, z, parent);
    const cover = material(color, .8);
    box(w, h, .43, cover, 0, 0, 0, g, .012);
    box(w - .025, h - .06, .414, paper, .004, 0, -.015, g, .003);
    box(w, h, .027, cover, 0, 0, .221, g, .009);
    for (const yy of [-h * .34, h * .34]) box(w * .75, .012, .006, material('#d8c394', .7), 0, yy, .239, g, .002);
    if (title) {
      const t = canvasTexture(128, 512, (ctx, tw, th) => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, tw, th); ctx.translate(tw / 2, th / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#eadcb4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 27px Georgia'; ctx.fillText(title, 0, 0, 420);
      });
      artPlane(w * .82, h * .76, t, 0, 0, .239, g);
    }
    return g;
  }
  function books(x, y, z, count, parent = shelf, maxWidth = 1.0, names = []) {
    const widths = Array.from({ length: count }, () => .08 + rand() * .075);
    const scale = maxWidth / widths.reduce((a, b) => a + b, 0);
    let at = x - maxWidth / 2;
    widths.forEach((v, i) => {
      const w = v * scale - .009, h = .68 + rand() * .39;
      const b = book(at + w / 2, y, z, w, h, bookColors[Math.floor(rand() * bookColors.length)], parent, names[i] || '');
      b.rotation.z = i === count - 1 ? -.06 : (rand() - .5) * .035;
      at += w + .009;
    });
  }
  function bookStack(x, y, z, n, parent = shelf) {
    let yy = y;
    for (let i = 0; i < n; i++) {
      const h = .10 + rand() * .06, w = .65 + rand() * .15;
      const g = group(x + (rand() - .5) * .05, yy + h / 2, z, parent); g.rotation.y = (rand() - .5) * .12;
      const m = material(bookColors[Math.floor(rand() * bookColors.length)], .77);
      box(w, h, .51, m, 0, 0, 0, g, .01); box(w - .04, h - .035, .50, paper, 0, 0, .007, g, .004);
      box(w, .015, .51, m, 0, h / 2, 0, g, .004); yy += h + .004;
    }
  }
  books(0, .20, -.01, 7, shelf, 1.02, ['STORIES', '', 'DESIGN']);
  books(1.34, 1.63, -.05, 6, shelf, .98, ['', 'IDEAS']);
  books(2.68, 1.58, -.07, 6, shelf, 1.02, ['HUMAN', 'AI']);
  books(2.55, 3.16, -.10, 5, shelf, .72, ['MAKING']);
  books(4.02, .20, -.12, 5, shelf, 1.0, ['FORM', '', 'SOUND']);
  bookStack(4.04, 2.98, -.03, 3);
  bookStack(1.34, .20, -.05, 3);

  // Clay and paper make this feel occupied, without distracting constant motion.
  function vase(x, y, z, size, color, parent = shelf) {
    const g = group(x, y, z, parent);
    const m = material(color, .85);
    sphere(size * .62, m, 0, size * .62, 0, g).scale.set(1, 1.25, 1);
    cylinder(size * .22, size * .32, size * .5, m, 0, size * 1.36, 0, g);
    torus(size * .235, size * .045, m, 0, size * 1.62, 0, g).rotation.x = Math.PI / 2;
    return g;
  }
  vase(2.97, 3.16, .08, .20, '#8d6651');
  vase(1.65, 3.21, -.04, .28, '#b66e4d');
  const twig = material('#65553a', .9);
  for (let i = 0; i < 4; i++) {
    const x = 1.65 + (i - 1.5) * .035;
    tube([[x, 3.63, -.04], [x - .08, 3.96 + i * .06, -.02], [x - .27 + i * .12, 4.22 + i * .06, -.01]], .008, twig, shelf);
    const l = sphere(.10, material('#a38d55', .92), x - .22 + i * .10, 4.16 + i * .06, -.02, shelf, 12); l.scale.set(.4, 1.9, .17); l.rotation.z = -.5 + i * .3;
    livingLeaves.push({ object: l, z: l.rotation.z, y: l.rotation.y, phase: i * 1.8, amplitude: .025 });
  }

  // Moon lamp: a quiet focal point on the lowest tower.
  const lamp = group(-.03, 4.43, -.12, shelf);
  cylinder(.26, .30, .08, brass, 0, .015, 0, lamp);
  cylinder(.035, .04, .13, brass, 0, .10, 0, lamp);
  const moon = sphere(.39, material('#f3edcc', .63, 0, { emissive: '#cabd8b', emissiveIntensity: .18 }), 0, .50, 0, lamp, 40);
  const moonLight = new THREE.PointLight('#f6d59b', .5, 3, 2); moonLight.position.set(0, .47, .08); lamp.add(moonLight);
  await yieldToBrowser();

  // Left shelf, trailing pothos, ceramic pot, and two framed miniatures.
  const wallShelf = group(-4.1, 5.62, -.48);
  box(4.45, .14, .80, paint, 0, 0, 0, wallShelf, .026);
  for (const x of [-1.68, 1.68]) {
    box(.055, .38, .08, brass, x, -.23, -.23, wallShelf, .008);
    const strut = box(.055, .055, .54, brass, x, -.20, -.02, wallShelf, .008); strut.rotation.x = .66;
  }
  const pot = group(-1.55, .10, -.04, wallShelf);
  cylinder(.20, .14, .34, material('#b46f4e', .91), 0, .17, 0, pot);
  cylinder(.19, .19, .035, material('#493b27', .95), 0, .345, 0, pot);
  const leafMats = ['#57633c', '#69764b', '#76804d', '#485c35'].map(c => material(c, .86));
  for (let j = 0; j < 6; j++) {
    const length = 1.0 + rand() * .9;
    const origin = (j - 2.5) * .08;
    const points = [[origin, .37, 0], [origin + .17, .18, .12], [origin + .25, -.24, .20], [origin + .18 + (j % 2 ? .08 : -.17), -length * .6, .21], [origin + .10, -length, .17]];
    tube(points, .012, material('#5a633b', .85), pot);
    for (let k = 0; k < 7; k++) {
      const t = k / 6, x = origin + Math.sin(t * 3.1) * .22 + (k % 2 ? .09 : -.06), y = .24 - t * length;
      const leaf = sphere(.13 + rand() * .03, leafMats[(k + j) % leafMats.length], x, y, .23, pot, 12);
      leaf.scale.set(.60, 1.1, .18); leaf.rotation.z = (k % 2 ? -.65 : .65); leaf.rotation.y = (rand() - .5) * .8;
      livingLeaves.push({ object: leaf, z: leaf.rotation.z, y: leaf.rotation.y, phase: j * .6 + t * 2.7, amplitude: .025 + t * .065 });
    }
  }
  const abstractArt = canvasTexture(420, 560, (ctx, w, h) => {
    ctx.fillStyle = '#e4d6af'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ae654b'; ctx.beginPath(); ctx.arc(218, 210, 137, Math.PI, 0); ctx.fill(); ctx.fillRect(81, 210, 274, 155);
    ctx.fillStyle = '#5a684f'; ctx.beginPath(); ctx.ellipse(142, 342, 71, 160, -.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cab565'; ctx.fillRect(212, 300, 52, 191);
    ctx.strokeStyle = '#554534'; ctx.lineWidth = 5; ctx.strokeRect(46, 46, w - 92, h - 92);
  });
  function framed(texture, w, h, x, y, z, parent, color = '#4d3b28') {
    const g = group(x, y, z, parent); box(w + .09, h + .09, .07, material(color, .55), 0, 0, 0, g, .012);
    box(w + .025, h + .025, .018, cream, 0, 0, .042, g, .002); artPlane(w, h, texture, 0, 0, .055, g); return g;
  }
  framed(abstractArt, .56, .73, -.57, .48, -.12, wallShelf).rotation.z = -.045;
  const photoArt = canvasTexture(400, 400, (ctx, w, h) => {
    ctx.fillStyle = '#c0bba1'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#718278'; ctx.fillRect(30, 35, 340, 215);
    ctx.fillStyle = '#d6bf77'; ctx.beginPath(); ctx.arc(283, 110, 43, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b6658'; ctx.beginPath(); ctx.moveTo(30, 250); ctx.lineTo(145, 109); ctx.lineTo(211, 209); ctx.lineTo(284, 152); ctx.lineTo(370, 250); ctx.fill();
    ctx.fillStyle = '#786b53'; ctx.font = '18px Georgia'; ctx.textAlign = 'center'; ctx.fillText('STUDIES IN POSSIBILITY', 200, 313);
  });
  framed(photoArt, .58, .58, .29, .40, -.10, wallShelf).rotation.z = .03;
  bookStack(1.40, .10, -.02, 3, wallShelf);
  vase(1.45, .56, -.05, .14, '#ddd4b1', wallShelf);
  await yieldToBrowser();

  // Corkboard as a physical index of the reconstructed process.
  const corkTexture = canvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#a98756'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { ctx.fillStyle = rand() > .5 ? 'rgba(67,39,14,.12)' : 'rgba(255,224,158,.14)'; ctx.fillRect(rand() * w, rand() * h, rand() * 3 + .5, rand() * 2 + .5); }
  });
  const process = group(-4.93, 4.23, -.96);
  box(2.27, 1.58, .10, walnut, 0, 0, 0, process, .025);
  box(2.13, 1.44, .028, texturedMaterial(corkTexture), 0, 0, .061, process, .005);
  const noteColors = ['#e5d69a', '#d0ab85', '#d8c5a0'];
  const notes = [
    { x: -.57, y: .17, r: -.09, title: 'THE QUESTION', lines: ['What do I want', 'this work to say?'] },
    { x: .43, y: .24, r: .055, title: 'THE PROMPT', lines: ['Describe. Generate.', 'Question. Refine.'] },
    { x: .04, y: -.37, r: -.045, title: 'THE REFLECTION', lines: ['Human intention,', 'AI possibilities.'] },
  ];
  notes.forEach((n, i) => {
    const g = group(n.x, n.y, .092, process); g.rotation.z = n.r;
    const tex = canvasTexture(420, 260, (ctx, w, h) => {
      ctx.fillStyle = noteColors[i]; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#4f402b'; ctx.font = '600 23px Georgia'; ctx.fillText(n.title, 26, 57);
      ctx.font = '27px Georgia'; n.lines.forEach((s, k) => ctx.fillText(s, 26, 112 + k * 39));
    });
    box(.80, .49, .012, material(noteColors[i]), 0, 0, 0, g, .003); artPlane(.80, .49, tex, 0, 0, .009, g);
    sphere(.027, material('#876647', .48), 0, .19, .023, g, 12);
  });
  hot(process, 'Process');

  // A printed infographic beside the board, on its own wall hooks.
  const infoTexture = canvasTexture(512, 720, (ctx, w, h) => {
    ctx.fillStyle = '#e3dbbd'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#40594d'; ctx.font = 'bold 39px Georgia'; ctx.fillText('INFORMATION', 40, 78); ctx.fillText('INTO INSIGHT', 40, 124);
    ctx.fillStyle = '#9a7045'; ctx.font = '18px Arial'; ctx.fillText('AN EXPLORATION WITH GENERATIVE AI', 41, 166);
    const colors = ['#5c7560', '#b98c46', '#bd7354', '#737b65'];
    for (let i = 0; i < 4; i++) { ctx.fillStyle = colors[i]; ctx.fillRect(48 + i * 105, 406 - i * 39, 71, 102 + i * 39); }
    ctx.strokeStyle = '#786d52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(36, 511); ctx.lineTo(473, 511); ctx.stroke();
    ctx.fillStyle = '#6c6954'; for (let i = 0; i < 5; i++) ctx.fillRect(43, 562 + i * 19, i === 4 ? 263 : 420, 5);
  });
  const infographic = framed(infoTexture, .88, 1.24, -2.72, 4.10, -.94, room, '#b59a63');
  hot(infographic, 'Infographics');

  // Microphone, with its perforated grille and curved cradle.
  const mic = group(.03, 2.96, .08, shelf);
  cylinder(.29, .33, .055, ink, 0, .026, .02, mic);
  cylinder(.028, .032, .37, brass, 0, .23, .02, mic);
  const micBody = group(0, .77, .02, mic); micBody.rotation.z = -.13;
  box(.36, .64, .27, material('#42483d', .5), 0, 0, 0, micBody, .11);
  for (let i = 0; i < 10; i++) box(.27, .014, .018, material('#adb09b', .34, .6), 0, -.22 + i * .047, .143, micBody, .003);
  torus(.29, .017, brass, 0, .65, .02, mic, Math.PI).rotation.z = Math.PI;
  cylinder(.045, .045, .10, brass, -.255, .70, .02, mic).rotation.z = Math.PI / 2;
  cylinder(.045, .045, .10, brass, .255, .70, .02, mic).rotation.z = Math.PI / 2;
  tube([[0, .50, -.12], [.12, .15, -.18], [.40, .07, -.07], [.44, .04, .25]], .012, ink, mic);
  plaque('PODCASTS', .80, 0, -.015, .454, mic); hot(mic, 'Podcasts');

  // A pair of genuine work images can replace these studies without changing the room.
  const imageStudy = framed(abstractArt, .69, .94, .03, 1.99, .05, shelf, '#6f4a33'); imageStudy.rotation.z = -.07;
  const imageMini = framed(photoArt, .42, .45, -.30, 1.75, .18, shelf, '#c0a266'); imageMini.rotation.z = .04;
  const imageGroup = group(0, 0, 0, shelf); imageGroup.add(imageStudy, imageMini); hot(imageGroup, 'AI images');
  await yieldToBrowser();

  // Film projector with two open reels, a glazed lens, and a brass focus ring.
  const projector = group(2.68, .21, .02, shelf);
  box(.78, .43, .53, material('#657060', .6), 0, .30, 0, projector, .05);
  box(.82, .08, .56, ink, 0, .05, 0, projector, .012);
  for (const x of [-.26, .27]) box(.08, .15, .09, ink, x, -.015, .07, projector, .008);
  const lens = cylinder(.145, .17, .25, brass, .32, .35, .29, projector); lens.rotation.x = Math.PI / 2;
  const glass = cylinder(.125, .125, .026, material('#455b55', .12, .35), .32, .35, .43, projector); glass.rotation.x = Math.PI / 2;
  for (const [x, y, r] of [[-.24, .76, .28], [.28, .80, .25]]) {
    const reel = group(x, y, .02, projector); reels.push(reel);
    torus(r, .025, material('#9da293', .4, .5), 0, 0, 0, reel);
    cylinder(.05, .05, .07, brass, 0, 0, .005, reel).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; const spoke = box(r * .85, .035, .035, material('#9da293', .4, .5), Math.cos(a) * r * .48, Math.sin(a) * r * .48, 0, reel, .008); spoke.rotation.z = a; }
  }
  for (let i = 0; i < 5; i++) box(.12, .012, .01, ink, -.15, .18 + i * .044, .274, projector, .002);
  plaque('EXPLAINER FILMS', 1.02, 0, -.055, .45, projector); hot(projector, 'Explainer films');

  // Vinyl and headphones occupy a whole listening cubby.
  const music = group(4.02, 1.61, .05, shelf);
  const sleeveTexture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ae7361'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#d7ba7b';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(256, 270, 190 - i * 28, Math.PI, 0); ctx.lineWidth = 11; ctx.strokeStyle = i % 2 ? '#5b6b59' : '#d8bc80'; ctx.stroke(); }
    ctx.fillStyle = '#ecdcb3'; ctx.font = '36px Georgia'; ctx.textAlign = 'center'; ctx.fillText('MAIN CHARACTER', 256, 440);
  });
  const sleeve = box(.74, .79, .045, material('#ae7361'), -.16, .41, -.07, music, .005); sleeve.rotation.z = -.06;
  const sleeveFace = artPlane(.74, .79, sleeveTexture, -.16, .41, -.042, music); sleeveFace.rotation.z = -.06;
  const record = group(.20, .44, .035, music);
  const disc = cylinder(.38, .38, .026, material('#252721', .32), 0, 0, 0, record, 56); disc.rotation.x = Math.PI / 2;
  for (const r of [.22, .26, .30, .34]) torus(r, .0025, material('#47483c', .47), 0, 0, .016, record);
  cylinder(.105, .105, .029, material('#b99d57'), 0, 0, .020, record).rotation.x = Math.PI / 2;
  // A printed label mark makes the slow record rotation perceptible.
  box(.014, .056, .002, cream, .032, .038, .037, record, .002);
  cylinder(.014, .014, .034, ink, 0, 0, .038, record).rotation.x = Math.PI / 2;
  const hp = group(.03, .39, .35, music); hp.rotation.z = .14;
  const band = torus(.31, .038, material('#453e30', .51), 0, .25, 0, hp, Math.PI); band.rotation.z = 0;
  box(.14, .28, .14, material('#373a31', .54), -.30, .22, .015, hp, .05);
  box(.14, .28, .14, material('#373a31', .54), .30, .22, .015, hp, .05);
  box(.055, .23, .16, material('#99865f', .62), -.23, .22, .015, hp, .025);
  box(.055, .23, .16, material('#99865f', .62), .23, .22, .015, hp, .025);
  plaque('AI SONGS', .77, 0, -.01, .46, music); hot(music, 'AI songs');

  // Retro telephone with raised keys and a coiled cord.
  const phone = group(4.02, 4.24, -.02, shelf);
  const pink = material('#c28f86', .48);
  const basePhone = box(.82, .19, .47, pink, 0, .11, .06, phone, .065); basePhone.rotation.x = .06;
  const dial = cylinder(.175, .175, .028, material('#dfb3a0', .5), .02, .216, .10, phone, 40);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10; cylinder(.026, .026, .011, material('#98776d', .6), .02 + Math.cos(a) * .125, .234, .10 + Math.sin(a) * .125, phone, 12); }
  const handset = group(0, .32, -.04, phone);
  box(.62, .13, .14, pink, 0, .08, 0, handset, .06);
  for (const x of [-.30, .30]) { sphere(.125, pink, x, .015, 0, handset).scale.set(.88, .88, 1.35); }
  const coilPoints = [];
  for (let i = 0; i <= 88; i++) { const t = i / 88; coilPoints.push([.36 + Math.sin(t * Math.PI * 20) * .037, .29 - t * .25, .03 + Math.cos(t * Math.PI * 20) * .037 + t * .10]); }
  tube(coilPoints, .009, material('#a4756e', .6), phone);
  await yieldToBrowser();

  // Globe, continents, meridians, and a tilted brass cradle.
  const globeTexture = canvasTexture(768, 384, (ctx, w, h) => {
    ctx.fillStyle = '#82988b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(220,218,171,.25)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 48; y < h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#c4c7a0';
    const land = [ [[.08,.23],[.16,.17],[.24,.20],[.28,.32],[.23,.41],[.18,.45],[.15,.34]], [[.24,.43],[.31,.48],[.32,.62],[.28,.77],[.25,.86],[.23,.64]], [[.46,.22],[.54,.20],[.58,.28],[.53,.35],[.48,.32]], [[.47,.36],[.57,.35],[.61,.48],[.56,.67],[.51,.65],[.46,.48]], [[.57,.22],[.70,.14],[.83,.21],[.91,.31],[.85,.43],[.78,.40],[.73,.51],[.65,.39]], [[.81,.65],[.90,.60],[.94,.69],[.91,.78],[.82,.76]] ];
    for (const pts of land) { ctx.beginPath(); pts.forEach(([x,y],i) => i ? ctx.lineTo(x*w,y*h) : ctx.moveTo(x*w,y*h)); ctx.closePath(); ctx.fill(); }
  });
  const globe = group(4.06, 3.40, -.03, shelf);
  cylinder(.23, .27, .055, brass, 0, .02, 0, globe);
  cylinder(.03, .04, .15, brass, 0, .11, 0, globe);
  const globeTilt = group(0, .49, 0, globe); globeTilt.rotation.z = -.25;
  torus(.365, .015, brass, 0, 0, 0, globeTilt).rotation.y = .38;
  const globeBall = sphere(.32, texturedMaterial(globeTexture, '#ffffff', .71), 0, 0, 0, globeTilt, 40);

  // Chessboard: ceramic pieces sitting in the highest open bay.
  const chess = group(2.68, 4.74, -.01, shelf);
  box(.99, .065, .69, walnut, 0, .02, 0, chess, .012);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) box(.116, .006, .078, (x + y) % 2 ? ink : cream, (x - 3.5) * .116, .058, (y - 3.5) * .078, chess, .001);
  function chessPiece(x, z, h, m, king = false) {
    cylinder(.037, .052, .035, m, x, .09, z, chess, 16);
    cylinder(.019, .035, h * .58, m, x, .105 + h * .29, z, chess, 16);
    torus(.030, .009, m, x, .105 + h * .54, z, chess).rotation.x = Math.PI / 2;
    sphere(king ? .035 : .030, m, x, .12 + h * .66, z, chess, 16);
    if (king) { box(.018, .065, .018, m, x, .16 + h * .70, z, chess, .003); box(.05, .016, .018, m, x, .17 + h * .70, z, chess, .003); }
  }
  for (let i = 0; i < 5; i++) chessPiece((i - 2) * .16, i % 2 ? -.17 : .17, .15 + i * .018, i % 2 ? ink : cream, i === 2);
  // A large back panel repeats the checker motif and makes the chess bay readable at a distance.
  const checkerTexture = canvasTexture(400, 400, (ctx, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { ctx.fillStyle = (i+j)%2 ? '#4a4c3d' : '#d9cfab'; ctx.fillRect(i*50,j*50,50,50); } });
  const checker = framed(checkerTexture, .91, .91, 0, .75, -.46, chess, '#7e6135'); checker.rotation.z = -.025;
  await yieldToBrowser();

  // Typewriter and pages: the writing shelf.
  const writing = group(1.34, .65, .14, shelf);
  const typeBody = box(.88, .19, .51, material('#aaa78e', .65), 0, .10, 0, writing, .045); typeBody.rotation.x = -.04;
  box(.86, .12, .16, ink, 0, .21, -.13, writing, .03);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) cylinder(.025, .025, .024, r === 2 ? cream : material('#555a4b'), (c - 4) * .075 + (r % 2) * .018, .207 - r * .025, .04 + r * .095, writing, 10);
  box(.41, .016, .047, ink, 0, .153, .32, writing, .009);
  const sheetTexture = canvasTexture(400, 512, (ctx, w, h) => {
    ctx.fillStyle = '#e7dfc4'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#615e4a'; ctx.font = 'bold 27px Georgia'; ctx.fillText('A NEW WAY', 39, 85); ctx.fillText('OF MAKING.', 39, 121);
    ctx.fillStyle = '#93907c'; for (let i = 0; i < 12; i++) ctx.fillRect(40, 171 + i * 21, i === 11 ? 178 : 310, 4);
  });
  const sheet = group(0, .43, -.17, writing); sheet.rotation.x = -.18;
  box(.56, .52, .012, paper, 0, 0, 0, sheet, .003); artPlane(.56, .52, sheetTexture, 0, 0, .009, sheet);
  plaque('ARTICLES', .76, 0, -.06, .31, writing); hot(writing, 'Articles');

  // A low stool and woven rug extend the room into the foreground.
  const stool = group(-1.37, .01, 1.52);
  cylinder(.46, .47, .13, material('#917044', .72), 0, .96, 0, stool, 40);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3 + .3; const leg = cylinder(.045, .063, .91, walnut, Math.cos(a) * .28, .49, Math.sin(a) * .28, stool, 16); leg.rotation.z = Math.sin(a) * .13; leg.rotation.x = Math.cos(a) * .13;
  }
  torus(.29, .022, walnut, 0, .35, 0, stool).rotation.x = Math.PI / 2;
  bookStack(0, 1.035, 0, 2, stool);
  const rugTexture = canvasTexture(768, 512, (ctx,w,h) => {
    ctx.fillStyle = '#887a58'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#b2a17a'; ctx.lineWidth = 8; ctx.strokeRect(24,24,w-48,h-48); ctx.lineWidth = 3; ctx.strokeRect(43,43,w-86,h-86);
    for (let i=0;i<180;i++) { ctx.fillStyle = i%2 ? 'rgba(222,203,157,.06)' : 'rgba(53,50,32,.06)'; ctx.fillRect(0,i*3,w,1); }
    ctx.strokeStyle = '#a69771'; ctx.lineWidth = 3;
    for (let i=0;i<9;i++) { const x=88+i*74;ctx.beginPath();ctx.moveTo(x,h/2-59);ctx.lineTo(x+29,h/2);ctx.lineTo(x,h/2+59);ctx.lineTo(x-29,h/2);ctx.closePath();ctx.stroke(); }
  });
  const rug = artPlane(5.3, 2.70, rugTexture, 1.94, -.025, 2.49, room); rug.rotation.x = -Math.PI/2; rug.rotation.z = -.045; rug.castShadow = false;

  const hemi = new THREE.HemisphereLight('#ffebc4', '#514b3a', 1.30); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe1a0', 3.2); sun.position.set(-6.3, 10, 9); sun.target.position.set(1.0, 1.3, -.7); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(modestGPU?1024:2048, modestGPU?1024:2048); sun.shadow.camera.left = -11; sun.shadow.camera.right = 11; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -6; sun.shadow.camera.near = .5; sun.shadow.camera.far = 30; sun.shadow.bias = -.00035; sun.shadow.normalBias = .025; sun.shadow.radius = 3;
  const fill = new THREE.DirectionalLight('#e8dabb', .52); fill.position.set(6, 4, 7); scene.add(fill);
  const wallGlow = new THREE.PointLight('#e9b767', .65, 12, 2); wallGlow.position.set(-4, 6, 4); scene.add(wallGlow);

  // Soft contact shadows add grounding to the bevelled geometry.
  const aoTexture = canvasTexture(128,128,(ctx,w,h) => {
    const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); g.addColorStop(0,'rgba(20,14,5,.55)');g.addColorStop(.45,'rgba(20,14,5,.22)');g.addColorStop(1,'rgba(20,14,5,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  });
  const aoMat = new THREE.MeshBasicMaterial({map:aoTexture,transparent:true,depthWrite:false,opacity:.6});allMaterials.add(aoMat);
  const ao = mesh(new THREE.PlaneGeometry(6.6,2.5),aoMat);ao.rotation.x=-Math.PI/2;ao.position.set(2.7,-.018,-.03);ao.castShadow=false;ao.receiveShadow=false;

  // Air is a real volume in front of and between the objects. One GPU draw call
  // carries both sunlit dust and the slower, brighter evening fireflies.
  const dustCount = modestGPU ? 112 : 252;
  const fireflyCount = modestGPU ? 14 : 26;
  const particleCount = dustCount + fireflyCount;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSeeds = new Float32Array(particleCount * 4);
  const particleSizes = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    const firefly = i >= dustCount;
    particlePositions[i * 3] = -6.9 + rand() * 13.4;
    particlePositions[i * 3 + 1] = .32 + rand() * 7.1;
    particlePositions[i * 3 + 2] = .45 + rand() * 5.1;
    particleSeeds.set([rand() * Math.PI * 2, .65 + rand() * 1.3, rand() * Math.PI * 2, firefly ? 1 : 0], i * 4);
    particleSizes[i] = firefly ? .038 + rand() * .024 : .013 + rand() * .022;
  }
  const particleGeometry = new THREE.BufferGeometry(); allGeometries.add(particleGeometry);
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(particleSeeds, 4));
  particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(particleSizes, 1));
  const pointFragment = `
    varying vec3 vTint;
    varying float vAlpha;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float r = dot(p, p);
      if (r > 1.0) discard;
      float halo = exp(-r * 5.5) * (1.0 - smoothstep(.55, 1.0, r));
      float core = exp(-r * 32.0) * .28;
      gl_FragColor = vec4(vTint, (halo + core) * vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
  const particleMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 120 }, uReveal: { value: 0 },
      uWarm: { value: new THREE.Color('#ffedbb') }, uCool: { value: new THREE.Color('#d7e4ac') },
    },
    vertexShader: `
      attribute vec4 aSeed;
      attribute float aSize;
      uniform float uTime, uNight, uScale, uReveal;
      uniform vec3 uWarm, uCool;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        float fly = aSeed.w;
        float t = uTime * (.13 + fly * .27) * aSeed.y;
        vec3 p = position;
        p.x += sin(t + aSeed.x) * (.18 + fly * .23) + sin(t * .41 + aSeed.z) * .12;
        p.y += sin(t * .72 + aSeed.z) * (.24 + fly * .25);
        p.z += cos(t * .62 + aSeed.x) * (.19 + fly * .11);
        float shimmer = .68 + .32 * sin(uTime * (.8 + fly * .6) + aSeed.x * 2.0);
        float glow = mix(.42 - uNight * .21, uNight * .94, fly);
        vAlpha = glow * shimmer * uReveal;
        vTint = mix(uWarm, uCool, uNight * fly);
        gl_PointSize = clamp(aSize * uScale * (1.0 + fly * .8) * (1.0 + p.z * .055), 1.4, 17.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: pointFragment,
  }); allMaterials.add(particleMaterial);
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false; particles.renderOrder = 3; particles.visible = motion; room.add(particles);

  // Two restrained shafts catch the suspended dust; the room geometry still
  // occludes them naturally. The very soft edges never read as graphic stripes.
  const shaftMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uNight: { value: 0 }, uTime: { value: 0 }, uTint: { value: new THREE.Color('#f9d78f') } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uNight, uTime;
      uniform vec3 uTint;
      void main() {
        float across = pow(max(0.0, sin(vUv.x * 3.14159265)), 2.5);
        float ends = smoothstep(0.0, .22, vUv.y) * (1.0 - smoothstep(.62, 1.0, vUv.y));
        float breath = .94 + .06 * sin(uTime * .23);
        gl_FragColor = vec4(uTint, across * ends * .028 * (1.0 - uNight * .94) * breath);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }); allMaterials.add(shaftMaterial);
  for (let i = 0; i < 2; i++) {
    const shaftGeometry = new THREE.PlaneGeometry(i ? .63 : 1.36, 12.6); allGeometries.add(shaftGeometry);
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.set(-2.9 + i * 2.1, 4.7, 2.6 - i * .7); shaft.rotation.z = -.59;
    shaft.renderOrder = 1; room.add(shaft);
  }

  // Selection sends a small wake through that object's air, never across the UI.
  // Fixed buffers are reused; repeated exploration cannot accumulate particles.
  const burstCapacity = modestGPU ? 48 : 90;
  const burstPositions = new Float32Array(burstCapacity * 3);
  const burstAlphas = new Float32Array(burstCapacity);
  const burstSizes = new Float32Array(burstCapacity);
  const burstState = Array.from({ length: burstCapacity }, () => ({ age: 2, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, phase: 0 }));
  const burstGeometry = new THREE.BufferGeometry(); allGeometries.add(burstGeometry);
  burstGeometry.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3).setUsage(THREE.DynamicDrawUsage));
  burstGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(burstAlphas, 1).setUsage(THREE.DynamicDrawUsage));
  burstGeometry.setAttribute('aSize', new THREE.BufferAttribute(burstSizes, 1).setUsage(THREE.DynamicDrawUsage));
  const burstMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 120 }, uTint: { value: new THREE.Color('#ffe8b0') } },
    vertexShader: `
      attribute float aAlpha, aSize;
      uniform float uScale;
      uniform vec3 uTint;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        vTint = uTint; vAlpha = aAlpha;
        gl_PointSize = clamp(aSize * uScale, 1.0, 16.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: pointFragment,
  }); allMaterials.add(burstMaterial);
  const bursts = new THREE.Points(burstGeometry, burstMaterial); bursts.frustumCulled = false; bursts.visible = false; bursts.renderOrder = 4; room.add(bursts);
  const burstOrigin = new THREE.Vector3();
  function pulse(category, strength = 1) {
    if (!motion || !isVisible || disposed) return;
    const target = interactive.find(g => g.userData.category === category) || hover;
    if (target) { scene.updateMatrixWorld(true); new THREE.Box3().setFromObject(target).getCenter(burstOrigin); burstOrigin.z += .45; }
    else burstOrigin.set(2.7, 3.6, .8);
    const count = Math.round((modestGPU ? 20 : 30) * strength);
    for (let j = 0; j < count; j++) {
      const index = burstCursor++ % burstCapacity;
      const p = burstState[index], angle = rand() * Math.PI * 2, speed = (.10 + rand() * .32) * strength;
      Object.assign(p, { age: 0, life: .85 + rand() * .85, x: burstOrigin.x + (rand() - .5) * .17, y: burstOrigin.y + (rand() - .5) * .17, z: burstOrigin.z + rand() * .16, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + .16, vz: (rand() - .25) * .17, phase: rand() * 6.28 });
      burstSizes[index] = .018 + rand() * .031;
    }
    bursts.visible = true; activeBursts = Math.min(burstCapacity, activeBursts + count); invalidate();
  }

  const daySunColor = new THREE.Color('#ffe1a0'), nightSunColor = new THREE.Color('#c9d3c4'), nightWallColor = new THREE.Color('#302e27');
  function applyLighting(amount) {
    sun.intensity = THREE.MathUtils.lerp(3.2, .65, amount); sun.color.copy(daySunColor).lerp(nightSunColor, amount);
    hemi.intensity = THREE.MathUtils.lerp(1.30, .67, amount); fill.intensity = THREE.MathUtils.lerp(.52, .28, amount);
    wallGlow.intensity = THREE.MathUtils.lerp(.65, 1.8, amount);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.22, 1.02, amount);
    scene.background.copy(warmWall).lerp(nightWallColor, amount);
    particleMaterial.uniforms.uNight.value = amount; shaftMaterial.uniforms.uNight.value = amount;
    const breath = motion ? 1 + Math.sin(ambientTime * .72) * .035 + Math.sin(ambientTime * .23) * .018 : 1;
    moonLight.intensity = THREE.MathUtils.lerp(.5, 2.8, amount) * breath;
    moon.material.emissiveIntensity = THREE.MathUtils.lerp(.18, .80, amount) * breath;
  }

  // Optional supplied studies. Texture failures intentionally leave the physical art in place.
  const textureLoader = new THREE.TextureLoader();
  const replaceStudy = (url, target) => textureLoader.load(url, t => {
    if(disposed) {t.dispose();return;}
    t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);allTextures.push(t);
    const art=target.children.find(o=>o.isMesh&&o.geometry.type==='PlaneGeometry');
    if(art){art.material.map=t;art.material.needsUpdate=true;invalidate();}
  },undefined,()=>{});
  // Root may provide artwork paths on the canvas without coupling this scene to archive filenames.
  replaceStudy(canvas.dataset.artwork || 'assets/apple-the-bite.webp',imageStudy);
  replaceStudy(canvas.dataset.infographic || 'assets/fake-news-thumb.webp',infographic);

  const flyingBooks = createFlyingBooks({ THREE, parent: room, smallDevice: modestGPU, reducedMotion });

  function frameCategory(category) {
    const prop=interactive.find(o=>o.userData.category===category);
    focusedCategory=prop?category:null;dragOffset.set(0,0);
    if(prop){
      scene.updateMatrixWorld(true);bounds.setFromObject(prop).getCenter(propCenter);
      focusTarget.set(propCenter.x-cameraTarget.x,propCenter.y-cameraTarget.y+.18);
      targetZoom=aspect<.8?2.05:aspect<1.2?1.65:1.6;
    }else {focusTarget.set(0,0);targetZoom=1;}
    if(!motion){focusOffset.copy(focusTarget);camera.zoom=targetZoom;}
    pendingHoverCheck=true;invalidate();
  }

  function fit() {
    const rect=canvas.getBoundingClientRect();const width=Math.max(1,rect.width);const height=Math.max(1,rect.height);aspect=width/height;
    renderer.setSize(width,height,false);
    if(aspect<.8)intro=1;
    const viewHeight=aspect<.8?Math.max(10.5,5.8/aspect):aspect<1.2?9.4:8.55;
    const pointScale = height / viewHeight * renderer.getPixelRatio();
    particleMaterial.uniforms.uScale.value = pointScale; burstMaterial.uniforms.uScale.value = pointScale;
    camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;
    // Portrait uses a slightly elevated, whole-bookcase view. The HTML archive is the mobile navigation.
    if(aspect<.8){cameraTarget.set(2.68,1.85,0);cameraBase.set(2.68,4.40,18.2);}
    else if(aspect<1.2){cameraTarget.set(.5,3.25,0);cameraBase.set(.5,5.65,18.2);}
    else {cameraTarget.set(-.20,3.32,0);cameraBase.set(-.20,5.65,18.2);}
    frameCategory(focusedCategory);
    camera.position.copy(cameraBase);camera.lookAt(cameraTarget);camera.updateProjectionMatrix();pendingHoverCheck=true;invalidate();
  }
  function invalidate(count=2){needFrames=Math.max(needFrames,count);if(!initializing&&!frame&&isVisible&&!disposed)frame=requestAnimationFrame(render);}
  function pointerMove(event){
    const rect=canvas.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    pointerClient={x:event.clientX,y:event.clientY};
    if(pointerDown&&event.pointerId===pointerDown.id){
      const dx=event.clientX-pointerDown.x,dy=event.clientY-pointerDown.y;
      pointerDown.distance=Math.max(pointerDown.distance,Math.hypot(dx,dy));
      if(focusedCategory&&pointerDown.distance>8){
        dragOffset.set(THREE.MathUtils.clamp(pointerDown.panX-dx/rect.width*2,-1.1,1.1),THREE.MathUtils.clamp(pointerDown.panY+dy/rect.height*1.4,-.7,.7));
      }
    }
    if(event.pointerType!=='touch')pointerTarget.set(pointer.x,pointer.y);
    pendingHoverCheck=event.pointerType!=='touch';invalidate();
  }
  function clearPointer(){pointer.set(5,5);pointerTarget.set(0,0);if(hover){hover=null;onHover(null,pointerClient.x,pointerClient.y);canvas.style.cursor='';}invalidate();}
  function down(event){
    if(pointerDown||event.isPrimary===false||event.button>0)return;
    wasDragged=false;pointerMove(event);
    // Press activation must survive the gentle hover lift and camera parallax.
    // Those presentation changes can put a thin grille between rays on release.
    const target=hitAtPointer();
    pointerDown={id:event.pointerId,x:event.clientX,y:event.clientY,target,distance:0,panX:dragOffset.x,panY:dragOffset.y};
  }
  function up(event){
    if(!pointerDown||event.pointerId!==pointerDown.id)return;const press=pointerDown;pointerDown=null;
    wasDragged=Math.max(press.distance,Math.hypot(event.clientX-press.x,event.clientY-press.y))>8;
    if(event.pointerType==='touch')pointerTarget.set(0,0);
    if(wasDragged){clearPointer();return;}
    pointerMove(event);const target=press.target || hitAtPointer();
    if(target){lastActivation=performance.now();pulse(target.userData.category);onSelect(target.userData.category);}
  }
  function cancelPointer(){pointerDown=null;wasDragged=true;clearPointer();}
  function leave(){if(pointerDown)cancelPointer();else clearPointer();}
  function click(event){
    // Some assistive/browser input dispatches click without a pointer sequence.
    if(wasDragged || performance.now()-lastActivation<400)return;
    pointerMove(event);const target=hitAtPointer();
    if(target){lastActivation=performance.now();pulse(target.userData.category);onSelect(target.userData.category);}
  }
  function hitAtPointer(){
    if(Math.abs(pointer.x)>1 || Math.abs(pointer.y)>1)return null;
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
    const intersections=raycaster.intersectObjects(interactive,true);let next=null;
    if(intersections.length){let object=intersections[0].object;while(object&&!interactive.includes(object))object=object.parent;next=object;}
    // Give thin props (a microphone grille, film-reel spokes) a coherent target.
    // Empty space within a prop's silhouette belongs to that same object.
    if(!next){
      const hit=new THREE.Vector3();let nearest=Infinity;
      for(const g of interactive){const bounds=new THREE.Box3().setFromObject(g).expandByScalar(.055);if(raycaster.ray.intersectBox(bounds,hit)){const distance=raycaster.ray.origin.distanceToSquared(hit);if(distance<nearest){nearest=distance;next=g;}}}
    }
    return next;
  }
  function updateRaycast(time){
    if(smallDevice || overlayOpen || !pendingHoverCheck || time-lastHoverCheck<65)return;
    pendingHoverCheck=false;lastHoverCheck=time;
    const next=hitAtPointer();
    if(next!==hover){hover=next;canvas.style.cursor=hover?'pointer':'';if(hover)pulse(hover.userData.category,.27);onHover(hover?hover.userData.category:null,pointerClient.x,pointerClient.y);}
  }
  function render(time){
    frame=0;if(disposed||!isVisible)return;
    // Draw at most 30fps (24 on touch/mobile). Ambient effects never require a
    // 120Hz screen to redraw a mostly static collection of physical objects.
    const interval=1000/(modestGPU?24:30);
    if(lastTime && time-lastTime<interval-.5){frame=requestAnimationFrame(render);return;}
    const dt=lastTime?Math.min((time-lastTime)/1000,.075):.016;lastTime=time;
    const ambientActive=motion&&!overlayOpen&&!mediaPlaying;
    let changing=false;
    if(intro<1){intro=Math.min(1,intro+dt*.72);changing=true;}
    const eased=1-Math.pow(1-intro,4);
    const targetX=ambientActive&&!smallDevice?pointerTarget.x*(focusedCategory?.36:.80):0;
    const targetY=ambientActive&&!smallDevice?pointerTarget.y*(focusedCategory?.20:.34):0;
    pointerEase.x=THREE.MathUtils.damp(pointerEase.x,targetX,3.4,dt);pointerEase.y=THREE.MathUtils.damp(pointerEase.y,targetY,3.4,dt);
    if(Math.abs(pointerEase.x-targetX)+Math.abs(pointerEase.y-targetY)>.0008){changing=true;pendingHoverCheck=true;}
    const response=motion?4.2:1000;
    focusOffset.x=THREE.MathUtils.damp(focusOffset.x,focusTarget.x+dragOffset.x,response,dt);
    focusOffset.y=THREE.MathUtils.damp(focusOffset.y,focusTarget.y+dragOffset.y,response,dt);
    const zoom=THREE.MathUtils.damp(camera.zoom,targetZoom,response,dt);
    const cameraMoving=Math.abs(zoom-targetZoom)+Math.abs(focusOffset.x-focusTarget.x-dragOffset.x)+Math.abs(focusOffset.y-focusTarget.y-dragOffset.y)>.0008;
    if(cameraMoving){changing=true;pendingHoverCheck=true;}
    camera.zoom=zoom;camera.updateProjectionMatrix();
    camera.position.set(cameraBase.x+focusOffset.x+pointerEase.x,cameraBase.y+focusOffset.y+pointerEase.y+(1-eased)*.5,cameraBase.z+(1-eased)*1.3);
    lookTarget.set(cameraTarget.x+focusOffset.x+pointerEase.x*.12,cameraTarget.y+focusOffset.y+pointerEase.y*.12,0);camera.lookAt(lookTarget);
    if((cameraMoving||changing)&&time-lastCameraNotice>100){lastCameraNotice=time;onCameraChange();}
    updateRaycast(time);
    for(const g of interactive){
      const target=hover===g?1:0;g.userData.hoverAmount=THREE.MathUtils.damp(g.userData.hoverAmount,target,10,dt);
      if(Math.abs(g.userData.hoverAmount-target)>.002)changing=true;
      const nextY=g.userData.baseY+(motion?.055:0)*g.userData.hoverAmount;
      const nextRotation=g.userData.baseRotation+(motion?.012:0)*g.userData.hoverAmount;
      if(Math.abs(g.position.y-nextY)>.0001 || Math.abs(g.rotation.z-nextRotation)>.0001)shadowDirty=true;
      g.position.y=nextY;g.rotation.z=nextRotation;
    }
    if(ambientActive){
      ambientTime+=dt;
      particleMaterial.uniforms.uTime.value=ambientTime;
      particleMaterial.uniforms.uReveal.value=Math.min(1,ambientTime*.8);
      shaftMaterial.uniforms.uTime.value=ambientTime;
      for(const leaf of livingLeaves){
        leaf.object.rotation.z=leaf.z+Math.sin(ambientTime*.62+leaf.phase)*leaf.amplitude;
        leaf.object.rotation.y=leaf.y+Math.sin(ambientTime*.44+leaf.phase+.8)*leaf.amplitude*.8;
      }
      const reelSpeed=.32+projector.userData.hoverAmount*.95;
      for(let i=0;i<reels.length;i++)reels[i].rotation.z-=dt*reelSpeed*(i?.92:1);
      record.rotation.z-=dt*(.20+music.userData.hoverAmount*.4);
      globeBall.rotation.y+=dt*.09;
      sheet.rotation.x=-.18+Math.sin(ambientTime*.57)*.019;
      flyingBooks.update(ambientTime,true);
    }
    const desiredLight=lighting==='night'?1:0;
    if(Math.abs(lightingMix-desiredLight)>.001){
      lightingMix=motion?THREE.MathUtils.damp(lightingMix,desiredLight,4.1,dt):desiredLight;changing=true;
    }else lightingMix=desiredLight;
    applyLighting(lightingMix);
    if(activeBursts&&ambientActive){
      activeBursts=0;
      for(let i=0;i<burstCapacity;i++){
        const p=burstState[i];p.age+=dt;
        if(p.age>=p.life){burstAlphas[i]=0;continue;}
        activeBursts++;
        const age=p.age, fade=1-age/p.life;
        burstPositions[i*3]=p.x+p.vx*age+Math.sin(age*2.3+p.phase)*age*.035;
        burstPositions[i*3+1]=p.y+p.vy*age+age*age*.035;
        burstPositions[i*3+2]=p.z+p.vz*age;
        burstAlphas[i]=Math.min(1,age*12)*fade*fade*.82;
      }
      burstGeometry.attributes.position.needsUpdate=true;burstGeometry.attributes.aAlpha.needsUpdate=true;burstGeometry.attributes.aSize.needsUpdate=true;
      bursts.visible=activeBursts>0;
    }
    // Tiny internal motions reuse baked shadows. Only actual prop feedback
    // updates the shadow map, at most eight times per second and once settled.
    if(shadowDirty&&(time-lastShadowUpdate>125||!changing)){renderer.shadowMap.needsUpdate=true;shadowDirty=false;lastShadowUpdate=time;}
    renderer.render(scene,camera);totalFrames++;needFrames=Math.max(0,needFrames-1);
    if(ambientActive||changing||needFrames>0)frame=requestAnimationFrame(render);
  }
  function visibility(){isVisible=!document.hidden;if(isVisible){lastTime=0;invalidate();}else if(frame){cancelAnimationFrame(frame);frame=0;}}
  const observer=new ResizeObserver(fit);observer.observe(canvas);
  canvas.addEventListener('pointermove',pointerMove,{passive:true});canvas.addEventListener('pointerleave',leave);canvas.addEventListener('pointerdown',down,{passive:true});canvas.addEventListener('pointerup',up,{passive:true});canvas.addEventListener('pointercancel',cancelPointer);canvas.addEventListener('lostpointercapture',cancelPointer);canvas.addEventListener('click',click);document.addEventListener('visibilitychange',visibility);
  fit();
  // Let the native page stay interactive while the GPU prepares material programs.
  // Texture/resize callbacks can invalidate during this await without drawing early.
  await yieldToBrowser();
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  if(typeof renderer.compileAsync==='function') {
    try {await renderer.compileAsync(scene,camera);} catch { /* Normal render remains the fallback. */ }
  }
  initializing=false;invalidate();onReady();
  return {
    setLighting(mode){
      lighting=mode==='night'?'night':'day';const night=lighting==='night';
      if(!motion){lightingMix=night?1:0;applyLighting(lightingMix);}
      renderer.shadowMap.needsUpdate=true;invalidate();
    },
    setMotion(enabled){
      motion=Boolean(enabled)&&!reducedMotion;particles.visible=motion;pointerTarget.set(0,0);
      flyingBooks.update(ambientTime,motion);
      if(!motion){
        intro=1;pointerEase.set(0,0);activeBursts=0;bursts.visible=false;
        for(const p of burstState)p.age=p.life;
      }
      lastTime=0;invalidate();
    },
    setActivity(activity={}){
      if('overlayOpen' in activity)overlayOpen=Boolean(activity.overlayOpen);
      if('mediaPlaying' in activity)mediaPlaying=Boolean(activity.mediaPlaying);
      if(overlayOpen||mediaPlaying){
        activeBursts=0;bursts.visible=false;for(const p of burstState)p.age=p.life;
      }
      if(overlayOpen){
        clearPointer();pointerEase.set(0,0);intro=1;
        for(const g of interactive){g.userData.hoverAmount=0;g.position.y=g.userData.baseY;g.rotation.z=g.userData.baseRotation;}
        renderer.shadowMap.needsUpdate=true;
      }
      lastTime=0;invalidate();
    },
    pulse(category){pulse(category);},
    getDiagnostics(){return {
      particleCount:motion?particleCount:0,dustCount:motion?dustCount:0,fireflyCount:motion?fireflyCount:0,
      activeBursts,ambientActive:motion&&isVisible&&!overlayOpen&&!mediaPlaying&&!disposed,
      motion,reducedMotion,lighting,lightingMix:Number(lightingMix.toFixed(3)),overlayOpen,mediaPlaying,
      frames:totalFrames,ambientTime:Number(ambientTime.toFixed(3)),frameCap:modestGPU?24:30,
      drawCalls:renderer.info.render.calls,shadowAutoUpdate:renderer.shadowMap.autoUpdate,disposed,
      cameraZoom:Number(camera.zoom.toFixed(3)),focusedCategory,cameraOffset:[Number(focusOffset.x.toFixed(3)),Number(focusOffset.y.toFixed(3))],pixelRatio:renderer.getPixelRatio(),flyingBooks:flyingBooks.getDiagnostics(),
      parallax:[Number(pointerEase.x.toFixed(3)),Number(pointerEase.y.toFixed(3))],
    };},
    getCategoryPositions(){
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const rect=canvas.getBoundingClientRect();const positions={};
      for(const g of interactive){const center=new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()).project(camera);positions[g.userData.category]={x:(center.x*.5+.5)*rect.width,y:(-center.y*.5+.5)*rect.height};}
      return positions;
    },
    focusCategory:frameCategory,
    dispose(){
      disposed=true;if(frame)cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancelPointer);canvas.removeEventListener('lostpointercapture',cancelPointer);canvas.removeEventListener('click',click);document.removeEventListener('visibilitychange',visibility);flyingBooks.dispose();
      allGeometries.forEach(g=>g.dispose());allMaterials.forEach(m=>m.dispose());allTextures.forEach(t=>t.dispose());renderer.dispose();
    },
  };
}
