/** 3D view, loaded on demand. Ported from the original artifact and generalized to any room shape. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { featureBottom, featureHeight, LIGHT_GLOW, itemHeight, itemPaint, itemType } from '../model/defaults';
import { bounds, wallFrames } from '../model/geometry';
import { DEFAULT_CEILING, type Item, type Paint, type Plan, type Sketch } from '../model/types';
import { h, toSvgString } from '../render/el';
import { hex, PaintDefs, sketchInBox } from '../render/patterns';

const T = 5;

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const texCache = new Map<string, PaintTex>();
const artCache = new Map<string, THREE.Texture>();

interface PaintTex {
  tex: THREE.Texture;
  /** Inches covered by one repeat of the texture. */
  span: [number, number];
  loaded: boolean;
  /** Clones made before the image finished drawing; they need a re-upload when it does. */
  waiting: THREE.Texture[];
}

/** A repeating texture for a patterned paint. A sketch repeats at its own size, like the plan; other patterns every 48 inches. */
function paintTexture(p: Paint, sketches: Sketch[]): PaintTex | null {
  if (!p.pattern && p.sketch === undefined) return null;
  const sk = p.sketch !== undefined ? sketches[p.sketch] : undefined;
  const key = JSON.stringify([p, sk ?? 0]);
  const hit = texCache.get(key);
  if (hit) return hit;
  const s = p.scale && p.scale > 0 ? p.scale : 1;
  const span: [number, number] = sk ? [sk.w * s, sk.h * s] : [48, 48];
  const px: [number, number] = [256, Math.max(16, Math.round((256 * span[1]) / span[0]))];
  const defs = new PaintDefs(sketches, 't');
  const fill = defs.fill(p, hex(p.color ?? 'cccccc'));
  const svg = toSvgString(
    h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: px[0], height: px[1], viewBox: `0 0 ${span[0]} ${span[1]}` }, defs.el(), h('rect', { x: 0, y: 0, width: span[0], height: span[1], fill })),
  );
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = px;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pt: PaintTex = { tex, span, loaded: false, waiting: [] };
  const img = new Image();
  img.onload = () => {
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    pt.loaded = true;
    for (const t of [tex, ...pt.waiting]) t.needsUpdate = true;
    pt.waiting = [];
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  texCache.set(key, pt);
  return pt;
}

function artTexture(sk: Sketch): THREE.Texture {
  const key = 'art' + JSON.stringify(sk);
  const hit = artCache.get(key);
  if (hit) return hit;
  const svg = toSvgString(h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 256, height: Math.round((256 * sk.h) / sk.w) }, sketchInBox(sk, 0, 0, 256, Math.round((256 * sk.h) / sk.w))));
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round((256 * sk.h) / sk.w);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  artCache.set(key, tex);
  return tex;
}

function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...extra });
}

function paintMat(p: Paint | undefined, fallback: string, sketches: Sketch[], size: [number, number] = [1, 1], extra: THREE.MeshStandardMaterialParameters = {}, centered = false) {
  const color = hex(p?.color ?? fallback);
  const pt = p ? paintTexture(p, sketches) : null;
  if (!pt) return mat(color, extra);
  // Each mesh needs its own repeat, so clone. Clones count their own versions, so one made
  // before the image has drawn must be told when it has.
  const t = pt.tex.clone();
  t.needsUpdate = true;
  if (!pt.loaded) pt.waiting.push(t);
  const rx = size[0] / pt.span[0];
  const ry = size[1] / pt.span[1];
  t.repeat.set(rx, ry);
  // The plan starts a piece's pattern at its center; do the same here.
  if (centered) t.offset.set(-rx / 2, -ry / 2);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0, ...extra });
}

function box(w: number, hh: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(hh, 0.01), Math.max(d, 0.01)), m);
  g.position.set(x, y, z);
  g.castShadow = true;
  g.receiveShadow = true;
  return g;
}

export interface ThreeView {
  update(plan: Plan): void;
  dispose(): void;
}

export function mountThree(el: HTMLElement, plan0: Plan): ThreeView {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.prepend(renderer.domElement);
  const cam = new THREE.PerspectiveCamera(50, 1, 1, 4000);
  const ctl = new OrbitControls(cam, renderer.domElement);
  ctl.enableDamping = true;
  ctl.maxPolarAngle = Math.PI * 0.495;
  ctl.minDistance = 40;
  ctl.maxDistance = 1200;
  const scene = new THREE.Scene();
  let root: THREE.Group | null = null;
  let walls: { p: THREE.Vector3; n: THREE.Vector3; mats: THREE.Material[] }[] = [];
  let placed = false;
  let running = true;

  const resize = () => {
    const w = el.clientWidth;
    const hh = el.clientHeight;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    cam.aspect = w / hh;
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const tick = () => {
    if (!running) return;
    requestAnimationFrame(tick);
    ctl.update();
    for (const w of walls) {
      const outside = cam.position.clone().sub(w.p).dot(w.n) < 0;
      const target = outside ? 0.12 : 1;
      for (const m of w.mats) {
        m.opacity += (target - m.opacity) * 0.25;
        const see = m.opacity < 0.99;
        if (m.transparent !== see) {
          // An opaque material's shader forces alpha to 1, so switching needs a recompile.
          m.transparent = see;
          m.needsUpdate = true;
        }
        m.depthWrite = m.opacity > 0.5;
      }
    }
    renderer.render(scene, cam);
  };
  tick();

  function build(plan: Plan) {
    if (root) scene.remove(root);
    root = new THREE.Group();
    scene.add(root);
    walls = [];
    const sk = plan.sketches ?? [];
    const H = plan.ceiling || DEFAULT_CEILING;
    const b = bounds(plan.verts);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.y0 + b.y1) / 2;
    const span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    scene.background = new THREE.Color(cssVar('--sheet', '#fdfdfb'));
    root.add(new THREE.HemisphereLight(0xffffff, 0x888880, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(cx + 60, 320, cz - span * 0.2);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: 1200 });
    sun.shadow.bias = -0.0005;
    root.add(sun, sun.target);

    // Floor: the room polygon. Shape coords (x, -y) so that after rotating -90° about x it lands at (x, 0, y).
    const shape = new THREE.Shape(plan.verts.map(([x, y]) => new THREE.Vector2(x, -y)));
    const fg = new THREE.ShapeGeometry(shape);
    const uv = fg.attributes.uv as THREE.BufferAttribute;
    const pos = fg.attributes.position as THREE.BufferAttribute;
    // UVs in inches; paintMat's [1, 1] size then repeats the texture once per pattern span.
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
    const floorMat = paintMat(plan.floor, 'e4e2dc', sk);
    const floor = new THREE.Mesh(fg, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    root.add(floor);

    // Walls with gaps for openings.
    for (const f of wallFrames(plan)) {
      const w = plan.walls[f.i];
      const m = paintMat(w.paint, 'c9d6bf', sk, [f.len, H], { transparent: false, opacity: 1 });
      const mats: THREE.Material[] = [m];
      const g = new THREE.Group();
      g.position.set(f.a[0], 0, f.a[1]);
      g.rotation.y = Math.atan2(-f.u[1], f.u[0]);
      const seg = (a: number, bb: number, y0: number, y1: number) => {
        if (bb - a < 0.1 || y1 - y0 < 0.1) return;
        const s = box(bb - a, y1 - y0, T, m, (a + bb) / 2, (y0 + y1) / 2, -T / 2);
        s.castShadow = false;
        g.add(s);
      };
      const cuts = (w.features ?? []).filter((x) => x.kind !== 'art' && x.kind !== 'fireplace').sort((p, q) => p.at - q.at);
      let cur = 0;
      for (const ft of cuts) {
        seg(cur, ft.at, 0, H);
        const top = featureBottom(ft) + featureHeight(ft);
        seg(ft.at, ft.at + ft.w, Math.min(top, H), H);
        if (ft.kind === 'window') seg(ft.at, ft.at + ft.w, 0, featureBottom(ft));
        if (ft.kind === 'slider' || ft.kind === 'window') {
          const gl = new THREE.MeshStandardMaterial({ color: 0xbfd8e6, transparent: true, opacity: 0.28, roughness: 0.1 });
          const y0 = featureBottom(ft);
          g.add(box(ft.w, top - y0, 1, gl, ft.at + ft.w / 2, (y0 + top) / 2, -T / 2));
          const fr = mat('#eef0ee');
          mats.push(fr);
          for (const uu of [ft.at + 1, ft.at + ft.w / 2, ft.at + ft.w - 1]) g.add(box(2, top - y0, 2, fr, uu, (y0 + top) / 2, -T / 2));
        }
        if (ft.kind === 'door') {
          const dm = paintMat(ft.paint, 'c9a272', sk);
          mats.push(dm);
          const leaf = box(ft.w - 1, top - 1, 1.5, dm, ft.at + ft.w / 2, (top - 1) / 2, -T / 2);
          leaf.castShadow = false;
          g.add(leaf);
        }
        cur = ft.at + ft.w;
      }
      seg(cur, f.len + T, 0, H);
      for (const ft of w.features ?? []) {
        if (ft.kind === 'fireplace') {
          const br = mat(cssVar('--hearth', '#b9a594'));
          const fire = mat('#1c1c1c');
          mats.push(br, fire);
          const fh = featureHeight(ft);
          const c = ft.at + ft.w / 2;
          g.add(box(ft.w, fh, 3, br, c, fh / 2, 1.5));
          g.add(box(Math.min(ft.w * 0.62, ft.w - 4), Math.min(fh - 8, 30) - 4, 1, fire, c, 4 + (Math.min(fh - 8, 30) - 4) / 2, 3.2));
          g.add(box(ft.w + 6, 2, 6, br, c, fh + 1, 3));
          if (ft.depth && ft.depth > 0) g.add(box(ft.w + 8, 2, ft.depth, br, c, 1, ft.depth / 2));
        }
        if (ft.kind === 'art') {
          const fh = featureHeight(ft);
          const y0 = featureBottom(ft);
          const s = ft.paint?.sketch !== undefined ? sk[ft.paint.sketch] : undefined;
          const am = s ? new THREE.MeshStandardMaterial({ map: artTexture(s), roughness: 0.9 }) : paintMat(ft.paint, 'c97b4a', sk);
          mats.push(am);
          const frame = mat('#2a2522');
          mats.push(frame);
          g.add(box(ft.w + 2, fh + 2, 1, frame, ft.at + ft.w / 2, y0 + fh / 2, 0.5));
          const art = new THREE.Mesh(new THREE.PlaneGeometry(ft.w, fh), am);
          art.position.set(ft.at + ft.w / 2, y0 + fh / 2, 1.05);
          g.add(art);
        }
      }
      root.add(g);
      walls.push({ p: new THREE.Vector3(f.a[0] + (f.u[0] * f.len) / 2, H / 2, f.a[1] + (f.u[1] * f.len) / 2), n: new THREE.Vector3(f.n[0], 0, f.n[1]), mats });
    }

    for (const it of plan.items) root.add(itemMesh(it, sk, H));

    if (!placed) {
      placed = true;
      cam.position.set(cx + span * 0.2, span * 1.15, b.y1 + span * 0.65);
      ctl.target.set(cx, 20, cz);
      ctl.update();
    }
  }

  build(plan0);
  return {
    update: build,
    dispose() {
      running = false;
      ro.disconnect();
      ctl.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function itemMesh(it: Item, sk: Sketch[], ceiling: number): THREE.Object3D {
  const ht = itemHeight(it);
  const type = itemType(it);
  const p = itemPaint(it);
  const m = paintMat(p, '999999', sk, [it.w, it.d], type === 'storage' ? { roughness: 0.4 } : {}, true);
  const g = new THREE.Group();
  g.position.set(it.x, 0, it.y);
  g.rotation.y = (-(it.rot ?? 0) * Math.PI) / 180;
  if (type === 'rug') {
    const r = box(it.w, ht, it.d, paintMat(p, 'b9bdc0', sk, [it.w, it.d], { roughness: 1 }, true), 0, ht / 2, 0);
    r.castShadow = false;
    g.add(r);
  } else if (type === 'lamp') {
    const r = Math.max(it.w, it.d) / 2;
    const bm = mat(hex(p.color ?? 'c9a85a'), { metalness: 0.4, roughness: 0.4 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 1.5, 24), bm);
    base.position.y = 0.75;
    g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, ht - 12, 8), bm);
    pole.position.y = (ht - 12) / 2;
    pole.castShadow = true;
    g.add(pole);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 9, 10, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf5f1e6, side: THREE.DoubleSide, emissive: 0x40382a, roughness: 0.9 }),
    );
    shade.position.y = ht - 5;
    shade.castShadow = true;
    g.add(shade);
  } else if (type === 'light') {
    g.add(ceilingLight(it, sk, ceiling));
  } else if (type === 'plant') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(it.w * 0.3, it.w * 0.24, Math.min(14, ht * 0.4), 18), mat('#b5654a'));
    pot.position.y = Math.min(14, ht * 0.4) / 2;
    g.add(pot);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(it.w / 2, 14, 10), m);
    leaves.scale.y = (ht * 0.7) / it.w;
    leaves.position.y = ht * 0.6;
    leaves.castShadow = true;
    g.add(leaves);
  } else if (it.shape === 'round') {
    const r = it.w / 2;
    const cy = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ht, 28), m);
    cy.scale.z = it.d / it.w;
    cy.position.y = ht / 2;
    cy.castShadow = cy.receiveShadow = true;
    g.add(cy);
  } else if (type === 'seat') {
    const seatH = Math.min(17, ht);
    const back = Math.min(8, it.d * 0.3);
    const parts =
      it.shape === 'L'
        ? (() => {
            const sd = Math.min(it.seatDepth ?? it.d * 0.6, it.d);
            const cw = Math.min(it.chaiseWidth ?? it.w * 0.4, it.w);
            const L = -it.w / 2;
            const Tp = -it.d / 2;
            const body = { x0: L, x1: L + it.w, z0: Tp, z1: Tp + sd };
            const ch = it.chaiseSide === 'left' ? { x0: L, x1: L + cw, z0: Tp + sd, z1: it.d / 2 } : { x0: it.w / 2 - cw, x1: it.w / 2, z0: Tp + sd, z1: it.d / 2 };
            return [body, ch];
          })()
        : [{ x0: -it.w / 2, x1: it.w / 2, z0: -it.d / 2, z1: it.d / 2 }];
    for (const q of parts) g.add(box(q.x1 - q.x0, seatH, q.z1 - q.z0, m, (q.x0 + q.x1) / 2, seatH / 2, (q.z0 + q.z1) / 2));
    if (ht > seatH + 2) g.add(box(it.w, ht - seatH, back, m, 0, seatH + (ht - seatH) / 2, -it.d / 2 + back / 2));
    if (it.shape !== 'L' && it.w > 40 && ht > seatH + 2) {
      const arm = Math.min(5, it.w * 0.08);
      const ah = Math.min(25, ht) - seatH;
      for (const sx of [-1, 1]) g.add(box(arm, ah, it.d - back, m, sx * (it.w / 2 - arm / 2), seatH + ah / 2, back / 2));
    }
  } else if (type === 'table') {
    const top = 1.5;
    g.add(box(it.w, top, it.d, m, 0, ht - top / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(1.5, ht - top, 1.5, m, sx * (it.w / 2 - 2), (ht - top) / 2, sz * (it.d / 2 - 2)));
  } else if (type === 'bed') {
    g.add(box(it.w, ht * 0.6, it.d, m, 0, (ht * 0.6) / 2, 0));
    g.add(box(it.w, ht * 1.8, 3, m, 0, ht * 0.9, -it.d / 2 + 1.5));
    for (const sx of [-1, 1]) g.add(box(it.w / 2 - 4, 5, 14, mat('#f4f1ea'), (sx * it.w) / 4, ht * 0.6 + 2.5, -it.d / 2 + 11));
  } else {
    g.add(box(it.w, ht, it.d, m, 0, ht / 2, 0));
  }
  return g;
}

/** A drum light hanging from the ceiling: canopy, stem if it drops far, shade, glowing diffuser, and a real light. */
function ceilingLight(it: Item, sk: Sketch[], ceiling: number): THREE.Object3D {
  const g = new THREE.Group();
  const p = itemPaint(it);
  const ht = itemHeight(it);
  const body = Math.min(ht, 12);
  const stem = ht - body;
  const r = it.w / 2;
  const round = it.shape !== 'rect';
  const metal = mat('#d0d0d0', { metalness: 0.6, roughness: 0.35 });
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(3, r * 0.5), Math.min(3, r * 0.5), 1, 16), metal);
  canopy.position.y = ceiling - 0.5;
  g.add(canopy);
  if (stem > 0) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, stem, 8), metal);
    rod.position.y = ceiling - stem / 2;
    g.add(rod);
  }
  const insideHex = hex(!p.pattern || p.pattern === 'solid' ? (p.color2 ?? LIGHT_GLOW) : LIGHT_GLOW);
  const outer = paintMat(p, LIGHT_GLOW, sk, [Math.PI * it.w, body], { side: THREE.FrontSide, emissive: new THREE.Color(hex(p.color ?? LIGHT_GLOW)), emissiveIntensity: 0.25 });
  const inner = new THREE.MeshStandardMaterial({ color: insideHex, side: THREE.BackSide, emissive: new THREE.Color(insideHex), emissiveIntensity: 0.6 });
  const yMid = ceiling - stem - body / 2;
  const shell = (m: THREE.Material) =>
    round ? new THREE.Mesh(new THREE.CylinderGeometry(r, r, body, 32, 1, true), m) : new THREE.Mesh(new THREE.BoxGeometry(it.w, body, it.d), m);
  for (const m of [outer, inner]) {
    const s = shell(m);
    s.position.y = yMid;
    if (round) s.scale.z = it.d / it.w;
    g.add(s);
  }
  const diffuser = new THREE.Mesh(round ? new THREE.CircleGeometry(r * 0.96, 32) : new THREE.PlaneGeometry(it.w * 0.96, it.d * 0.96), new THREE.MeshBasicMaterial({ color: '#fffaf0' }));
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.y = ceiling - stem - body + 0.6;
  if (round) diffuser.scale.y = it.d / it.w;
  g.add(diffuser);
  const bulb = new THREE.PointLight(new THREE.Color(hex(LIGHT_GLOW)), 1.1, 260, 1);
  bulb.position.y = ceiling - stem - body - 1;
  g.add(bulb);
  return g;
}
