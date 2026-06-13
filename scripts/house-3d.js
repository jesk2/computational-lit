import * as THREE from 'three';

// ── Poem loading ─────────────────────────────────────────────────────────────

function parseRooms(raw) {
    const body = raw.replace(/^---[\s\S]*?---\n/, '').trim();
    const map  = {};
    const re   = /\[([^\]]+)\]\n([\s\S]*?)(?=\n\[|$)/g;
    let m;
    while ((m = re.exec(body)) !== null) map[m[1].trim()] = m[2].trim();
    return map;
}

// ── Sequence + layout ────────────────────────────────────────────────────────
// Poem order preserved from the markdown file

const SEQUENCE = [
    'entrance', 'mirror', 'hallway', 'window', 'bus-stop',
    'ghost-silhouette', 'bathroom', 'ghost-return', 'window-cracked', 'hallway-return'
];

// Where each block lives on the viewport (% from top-left corner)
const TEXT_POSITIONS = {
    'entrance':         { left: '5%',  top: '66%' },
    'mirror':           { left: '4%',  top: '38%' },
    'hallway':          { left: '36%', top: '53%' },
    'window':           { left: '63%', top: '32%' },
    'bus-stop':         { left: '78%', top: '56%' },
    'ghost-silhouette': { left: '38%', top: '7%'  },
    'bathroom':         { left: '5%',  top: '17%' },
    'ghost-return':     { left: '56%', top: '72%' },
    'window-cracked':   { left: '53%', top: '13%' },
    'hallway-return':   { left: '28%', top: '76%' },
};

// Camera position that best shows each room
const ROOM_CAMERAS = {
    'entrance':         new THREE.Vector3(-4,   1.5, 13 ),
    'mirror':           new THREE.Vector3(-10,  5,   13 ),
    'hallway':          new THREE.Vector3( 0,   5,   13 ),
    'window':           new THREE.Vector3( 8,   5,   13 ),
    'bus-stop':         new THREE.Vector3(12,   2.5, 12 ),
    'ghost-silhouette': new THREE.Vector3( 2,   7,   18 ),
    'bathroom':         new THREE.Vector3(-10,  7,   13 ),
    'ghost-return':     new THREE.Vector3( 0,  -0.5, 10 ),
    'window-cracked':   new THREE.Vector3( 6,  10,   13 ),
    'hallway-return':   new THREE.Vector3(-1,   2,   12 ),
};

// ── Room geometry definitions ─────────────────────────────────────────────────

const D = 4.0;
const ROOMS = [
    { id: 'ghost-return',     x:  0,   y: -0.6, wx: 9,  wy: 1.2, color: 0xd8d0e8 },
    { id: 'entrance',         x: -3,   y:  1.5, wx: 3,  wy: 3,   color: 0xf0d8a8 },
    { id: 'hallway-return',   x:  0,   y:  1.5, wx: 3,  wy: 3,   color: 0xeecca8 },
    { id: 'mirror',           x: -3,   y:  4.5, wx: 3,  wy: 3,   color: 0xb8cce0 },
    { id: 'hallway',          x:  0,   y:  4.5, wx: 3,  wy: 3,   color: 0xecdcb8 },
    { id: 'bathroom',         x:  3,   y:  4.5, wx: 3,  wy: 3,   color: 0xb4dcd8 },
    { id: 'window-cracked',   x: -1.5, y:  7.5, wx: 6,  wy: 3,   color: 0xc0d4ec },
    { id: 'window',           x:  3,   y:  7.5, wx: 3,  wy: 3,   color: 0xa8ccf0 },
    { id: 'ghost-silhouette', x:  0,   y: 10.2, wx: 9,  wy: 2.4, color: 0xe4d8f0 },
];

const BASE_OP  = 1.0;
const FLOOR_OP = 1.0;
const SIDE_OP  = 1.0;
const CEIL_OP  = 1.0;

// ── Bootstrap ────────────────────────────────────────────────────────────────

const raw     = await fetch('./poems/always.md').then(r => r.text());
const poemMap = parseRooms(raw);

// ── Three.js scene ────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7f1eb);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-wrap').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
const TARGET      = new THREE.Vector3(0, 6, 0);
const OVERVIEW_CAM = new THREE.Vector3(-2, 12, 34);
camera.position.copy(OVERVIEW_CAM);
camera.lookAt(TARGET);

scene.add(new THREE.AmbientLight(0xfff8f0, 1.5));
const sun = new THREE.DirectionalLight(0xffe8cc, 0.6);
sun.position.set(-6, 12, 10);
scene.add(sun);

// ── Build rooms ───────────────────────────────────────────────────────────────

const roomMeshes  = {};
const roomGroups  = {};
const allMeshes   = [];

function addMesh(mesh, baseOp) {
    mesh.userData.baseOp   = baseOp;
    mesh.userData.targetOp = 0;
    mesh.material.opacity  = 0;
    allMeshes.push(mesh);
    return mesh;
}

const WALL_BROWN  = new THREE.Color(0xCCAA88);
const FLOOR_BROWN = new THREE.Color(0x8C6A48);

function vividColor(c) {
    const hsl = {};
    c.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, Math.min(1.0, hsl.s * 3.5), hsl.l * 0.65);
}

function makeRoom(def, idx) {
    const { id, x, y, wx, wy, color } = def;
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    roomGroups[id] = g;

    const c    = new THREE.Color(color);
    const fade = c.clone().lerp(new THREE.Color(0xf7f1eb), 0.55);
    const mk   = col => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false });

    const z0 = -D / 2 + 0.01;
    if (id === 'window' || id === 'window-cracked') {
        // Window opening bounds (local coords, matching detail line positions)
        const openX1 = id === 'window' ? -1.2 : -2.3;
        const openX2 = -openX1;
        const openY1 = -0.5, openY2 = 1.0;
        const rx = wx / 2 - 0.03, ry = wy / 2 - 0.03;

        const topH  = ry - openY2;
        const botH  = openY1 + ry;
        const leftW = openX1 + rx;
        const rightW = rx - openX2;

        const addStrip = (pw, ph, px, py) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mk(WALL_BROWN));
            m.position.set(px, py, z0);
            m.userData.originalColor = vividColor(c);
            g.add(addMesh(m, BASE_OP));
            return m;
        };
        roomMeshes[id] = addStrip(wx - 0.06, topH,           0,                  openY2 + topH / 2);
        addStrip(wx - 0.06, botH,            0,                  -ry + botH / 2);
        addStrip(leftW,     openY2 - openY1, -rx + leftW / 2,    (openY1 + openY2) / 2);
        addStrip(rightW,    openY2 - openY1,  rx - rightW / 2,   (openY1 + openY2) / 2);
    } else {
        const back = new THREE.Mesh(new THREE.PlaneGeometry(wx - 0.06, wy - 0.06), mk(WALL_BROWN));
        back.position.z = z0;
        back.userData.originalColor = vividColor(c);
        g.add(addMesh(back, BASE_OP));
        roomMeshes[id] = back;
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wx - 0.06, D - 0.06), mk(FLOOR_BROWN));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -wy / 2 + 0.01;
    floor.userData.originalColor = vividColor(c).multiplyScalar(0.7);
    floor.userData.isFloor = true;
    g.add(addMesh(floor, FLOOR_OP));

    const sideGeo = new THREE.PlaneGeometry(D - 0.06, wy - 0.06);
    const lw = new THREE.Mesh(sideGeo, mk(WALL_BROWN));
    lw.rotation.y =  Math.PI / 2; lw.position.x = -wx / 2 + 0.01;
    lw.userData.originalColor = vividColor(c);
    g.add(addMesh(lw, SIDE_OP));

    const rw = new THREE.Mesh(sideGeo, mk(WALL_BROWN));
    rw.rotation.y = -Math.PI / 2; rw.position.x =  wx / 2 - 0.01;
    rw.userData.originalColor = vividColor(c);
    g.add(addMesh(rw, SIDE_OP));

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(wx - 0.06, D - 0.06), mk(WALL_BROWN));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = wy / 2 - 0.01;
    ceil.userData.originalColor = vividColor(c);
    g.add(addMesh(ceil, CEIL_OP));

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(wx, wy, D)),
        new THREE.LineBasicMaterial({ color: 0x9a8a78, transparent: true, opacity: 0 })
    );
    g.add(addMesh(edges, 1.0));

    const winCfg = {
        'window':         { gw: 2.4, gh: 1.5, gx: 0, gy:  0.25 },
        'window-cracked': { gw: 4.6, gh: 1.5, gx: 0, gy:  0.25 },
        'entrance':       { gw: 1.0, gh: 2.0, gx: 0, gy: -0.5  },
        'hallway-return': { gw: 2.2, gh: 1.2, gx: 0, gy:  0.4  },
        'mirror':         { gw: 1.0, gh: 1.8, gx: 0, gy:  0.0  },
        'hallway':        { gw: 2.2, gh: 1.2, gx: 0, gy:  0.4  },
        'bathroom':       { gw: 2.2, gh: 1.2, gx: 0, gy:  0.4  },
    }[id];
    if (winCfg) {
        const { gw, gh, gx, gy } = winCfg;
        const gz = -D / 2 + 0.03, fz = -D / 2 + 0.04;
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(gw, gh),
            new THREE.MeshBasicMaterial({ color: 0x7ab8e8, transparent: true, opacity: 0, depthWrite: false })
        );
        glass.position.set(gx, gy, gz);
        g.add(addMesh(glass, 1.0));
        const fMat = () => new THREE.LineBasicMaterial({ color: 0x9a8a78, transparent: true, opacity: 0 });
        const addFL = (pts) => g.add(addMesh(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fMat()), 1.0));
        g.add(addMesh(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(gx - gw/2, gy - gh/2, fz), new THREE.Vector3(gx + gw/2, gy - gh/2, fz),
            new THREE.Vector3(gx + gw/2, gy + gh/2, fz), new THREE.Vector3(gx - gw/2, gy + gh/2, fz),
        ]), fMat()), 1.0));
        addFL([new THREE.Vector3(gx,        gy - gh/2,        fz), new THREE.Vector3(gx,        gy + gh/2,        fz)]);
        addFL([new THREE.Vector3(gx - gw/2, gy,               fz), new THREE.Vector3(gx + gw/2, gy,               fz)]);
        addFL([new THREE.Vector3(gx - gw/2 - 0.12, gy - gh/2 - 0.06, fz), new THREE.Vector3(gx + gw/2 + 0.12, gy - gh/2 - 0.06, fz)]);
    }

    scene.add(g);
    setTimeout(() => g.traverse(child => {
        if (child.userData.baseOp !== undefined)
            child.userData.targetOp = child.userData.baseOp;
    }), 300 + idx * 80);
}

ROOMS.forEach((def, i) => makeRoom(def, i));

// ── Bus stop — open shelter (back wall + roof overhang + two poles) ───────────
{
    const bx = 7, by = 1.5;
    const sw = 2.2, sh = 2.4, sd = 2.0; // shelter width, height, depth
    const roofW = sw + 0.5, roofD = sd + 0.4;
    const col  = new THREE.Color(0xd8d2c4);
    const fade = col.clone().lerp(new THREE.Color(0xf7f1eb), 0.5);
    const mk   = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const g    = new THREE.Group();
    g.position.set(bx, by, 0);

    // Back wall
    const back = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mk(WALL_BROWN));
    back.position.z = -sd / 2;
    back.userData.originalColor = vividColor(col);
    g.add(addMesh(back, BASE_OP));
    roomMeshes['bus-stop'] = back;
    roomGroups['bus-stop'] = g;

    const lwall = new THREE.Mesh(new THREE.PlaneGeometry(sd, sh * 0.55), mk(WALL_BROWN));
    lwall.rotation.y = Math.PI / 2;
    lwall.position.set(-sw / 2, -sh * 0.22, 0);
    lwall.userData.originalColor = vividColor(col);
    g.add(addMesh(lwall, SIDE_OP));

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(roofW, roofD), mk(WALL_BROWN));
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = sh / 2;
    roof.userData.originalColor = vividColor(col);
    g.add(addMesh(roof, FLOOR_OP));

    // Two front poles
    const poleMat = new THREE.LineBasicMaterial({ color: 0x8a7a68, transparent: true, opacity: 0 });
    [[-sw / 2 + 0.1], [sw / 2 - 0.1]].forEach(([px]) => {
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(px, -sh / 2, sd / 2),
            new THREE.Vector3(px,  sh / 2, sd / 2),
        ]);
        const pole = new THREE.Line(geo, poleMat.clone());
        g.add(addMesh(pole, 1.0));
    });

    // Roof edge outline
    const roofEdgePts = [
        new THREE.Vector3(-roofW/2, sh/2, -sd/2),
        new THREE.Vector3( roofW/2, sh/2, -sd/2),
        new THREE.Vector3( roofW/2, sh/2,  sd/2 + 0.2),
        new THREE.Vector3(-roofW/2, sh/2,  sd/2 + 0.2),
        new THREE.Vector3(-roofW/2, sh/2, -sd/2),
    ];
    const roofEdge = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(roofEdgePts),
        new THREE.LineBasicMaterial({ color: 0x8a7a68, transparent: true, opacity: 0 })
    );
    g.add(addMesh(roofEdge, 1.0));

    scene.add(g);
    const busTiming = 300 + ROOMS.length * 80;
    setTimeout(() => g.traverse(c => {
        if (c.userData.baseOp !== undefined) c.userData.targetOp = c.userData.baseOp;
    }), busTiming);
}

// Outer walls
[
    { x: -4.5, y: 4.5, z: 0,   w: D, h: 12, ry: Math.PI/2, op: 1.0 }, // left side
    { x:  4.5, y: 4.5, z: 0,   w: D, h: 12, ry: Math.PI/2, op: 1.0 }, // right side
    { x:  3,   y: 1.5, z:-D/2, w: 3, h:  3, ry: 0,         op: 1.0 }, // structural ground-floor-right (no room here)
].forEach(({ x, y, z, w, h, ry, op }) => {
    const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: WALL_BROWN, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    m.position.set(x, y, z); m.rotation.y = ry;
    addMesh(m, op);
    scene.add(m);
    setTimeout(() => { m.userData.targetOp = op; }, 1100);
});

// Roof
{
    const ry = 11.4, py = 14.0, hw = 5.0;
    const pts = [
        [-hw, ry, -D/2], [0, py, -D/2], [hw, ry, -D/2],
        [-hw, ry,  D/2], [0, py,  D/2], [hw, ry,  D/2],
    ].map(([x,y,z]) => new THREE.Vector3(x,y,z));
    [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]].forEach(([a,b]) => {
        const l = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([pts[a], pts[b]]),
            new THREE.LineBasicMaterial({ color: WALL_BROWN, transparent: true, opacity: 0 })
        );
        addMesh(l, 1.0);
        scene.add(l);
        setTimeout(() => { l.userData.targetOp = 1.0; }, 1300);
    });
}


// ── Room detail geometry ──────────────────────────────────────────────────────
// All details use the same LineBasicMaterial style as the structural edges.
// BW = just in front of the back wall to avoid z-fighting.

const DET_OP = 0.90;
const BW = -D / 2 + 0.02;

// rect: closed rectangle polyline as array of [x,y,z] tuples
function rect(x1, y1, x2, y2, z) {
    return [[x1,y1,z],[x2,y1,z],[x2,y2,z],[x1,y2,z],[x1,y1,z]];
}
// circ: closed circle polyline
function circ(cx, cy, cz, r, n = 10) {
    return Array.from({ length: n + 1 }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz];
    });
}
// detail: create + register multiple polylines, fade in after delay
function detail(polylines, delay) {
    const mat = new THREE.LineBasicMaterial({ color: 0x9a8a78, transparent: true, opacity: 0 });
    const lines = polylines.map(pts => {
        const l = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))),
            mat.clone()
        );
        l.userData.baseOp   = DET_OP;
        l.userData.targetOp = 0;
        allMeshes.push(l);
        scene.add(l);
        return l;
    });
    setTimeout(() => lines.forEach(l => { l.userData.targetOp = DET_OP; }), delay);
}

// Small glowing sphere for pendant bulbs
function addBulb(x, y, z, delay) {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffeaa0, transparent: true, opacity: 0 })
    );
    mesh.position.set(x, y, z);
    mesh.userData.baseOp   = 0.90;
    mesh.userData.targetOp = 0;
    allMeshes.push(mesh);
    scene.add(mesh);
    setTimeout(() => { mesh.userData.targetOp = 0.90; }, delay);
}

// ghost-return — foundation beams + posts  (room idx 0, ~300ms)
detail([
    [[-4.2,-0.28,BW],[4.2,-0.28,BW]],
    [[-2.5,-1.14,BW],[-2.5,-0.06,BW]],
    [[0,   -1.14,BW],[0,   -0.06,BW]],
    [[2.5, -1.14,BW],[2.5, -0.06,BW]],
], 340);

// hallway-return — ceiling pendant  (room idx 2, ~460ms)
detail([
    [[0, 2.85, -0.8],[0, 2.2, -0.8]],
], 500);
addBulb(0, 2.05, -0.8, 500);

// hallway — ceiling pendant  (room idx 4, ~620ms)
detail([
    [[0, 5.85, -0.8],[0, 5.2, -0.8]],
], 660);
addBulb(0, 5.05, -0.8, 660);

// bathroom — bathtub outline + tap  (room idx 5, ~700ms)
detail([
    rect(1.6,  3.1,  4.4,  4.0,  BW),
    rect(1.72, 3.22, 4.28, 3.88, BW),
    [[4.1,  4.0, BW],[4.1,  4.18, BW]],
    [[3.96, 4.1, BW],[4.24, 4.1,  BW]],
], 740);

// window-cracked — crack only  (room idx 6, ~780ms)
detail([
    [[-3.1, 8.38,BW],[-2.65,8.05,BW],[-2.45,8.28,BW],[-2.1,7.80,BW]],
], 820);

// ghost-silhouette — human silhouette in attic  (room idx 8, ~940ms)
detail([
    circ(1.5, 10.95, BW, 0.22),
    [[1.5, 10.73,BW],[1.5, 9.55, BW]],
    [[1.05,10.38,BW],[1.95,10.38,BW]],
    [[1.5, 9.55, BW],[1.12,9.02, BW]],
    [[1.5, 9.55, BW],[1.88,9.02, BW]],
], 980);

// ── Text layer ────────────────────────────────────────────────────────────────

const poemLayer = document.getElementById('poem-layer');
const textBlocks = {}; // id → div

SEQUENCE.forEach(id => {
    const pos  = TEXT_POSITIONS[id];
    const text = poemMap[id] || '';

    const div = document.createElement('div');
    div.className = 'poem-block upcoming';
    div.style.left = pos.left;
    div.style.top  = pos.top;
    div.innerHTML = `<span class="poem-block-text">${text}</span>`;
    poemLayer.appendChild(div);
    textBlocks[id] = div;
});

// Start hint
const hint = document.createElement('div');
hint.className = 'start-hint';
hint.textContent = 'click or → to begin';
document.body.appendChild(hint);

// ── Room opacity helpers ──────────────────────────────────────────────────────

function setRoomOpaque(id) {
    const g = roomGroups[id];
    if (!g) return;
    g.traverse(child => {
        if (child.userData.baseOp !== undefined)
            child.userData.targetOp = child.userData.baseOp;
        if (child.isMesh && child.userData.originalColor)
            child.material.color.copy(child.userData.isFloor ? FLOOR_BROWN : WALL_BROWN);
    });
}

function setRoomTranslucent(id) {
    const g = roomGroups[id];
    if (!g) return;
    g.traverse(child => {
        if (child.userData.baseOp === undefined) return;
        if (child.isMesh) {
            child.userData.targetOp = child.userData.baseOp;
            if (child.userData.originalColor)
                child.material.color.copy(child.userData.originalColor);
        }
    });
}

// ── Navigation state ──────────────────────────────────────────────────────────

let step = -1; // -1 = not started
const counter = document.getElementById('nav-counter');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

function goTo(newStep) {
    const clamped = Math.max(0, Math.min(SEQUENCE.length - 1, newStep));

    // Hide hint on first step
    if (step === -1) hint.classList.add('hidden');

    // Restore previous room to opaque
    if (step >= 0 && step < SEQUENCE.length) {
        const oldId = SEQUENCE[step];
        textBlocks[oldId].className = 'poem-block visited';
        setRoomOpaque(oldId);
    }

    step = clamped;
    const id     = SEQUENCE[step];
    const isLast = step === SEQUENCE.length - 1;

    if (isLast) {
        textBlocks[id].className = 'poem-block visited';
        // no translucency on last step — camera pulls back to overview
    } else {
        textBlocks[id].className = 'poem-block active';
        setRoomTranslucent(id);
    }

    // Move camera to face this room, then zoom out at the end
    camTo(ROOM_CAMERAS[id] || new THREE.Vector3(0, 6, 18));
    if (isLast) setTimeout(() => camTo(OVERVIEW_CAM, 0.018), 1400);

    counter.textContent = `${step + 1} / ${SEQUENCE.length}`;
    btnPrev.disabled = step === 0;
    btnNext.disabled = isLast;
}

function advance() {
    if (step < SEQUENCE.length - 1) goTo(step + 1);
}
function retreat() { if (step > 0) goTo(step - 1); }

// Start with no step active
btnPrev.disabled = true;
counter.textContent = '— / ' + SEQUENCE.length;

// ── Camera animation ──────────────────────────────────────────────────────────

let camFrom = camera.position.clone();
let camTo_  = camera.position.clone();
let camT    = 1;
let camSpeed = 0.035; // slowed for the final zoom-out
const eio   = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

function camTo(pos, speed = 0.035) {
    camFrom   = camera.position.clone();
    camTo_    = pos.clone();
    camT      = 0;
    camSpeed  = speed;
}

// ── Input ─────────────────────────────────────────────────────────────────────

btnNext.addEventListener('click', advance);
btnPrev.addEventListener('click', retreat);

// Click canvas = advance
renderer.domElement.addEventListener('click', () => advance());

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') advance();
    if (e.key === 'ArrowLeft')                   retreat();
});

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render loop ───────────────────────────────────────────────────────────────

function animate() {
    requestAnimationFrame(animate);

    // Camera lerp
    if (camT < 1) {
        camT = Math.min(camT + camSpeed, 1);
        camera.position.lerpVectors(camFrom, camTo_, eio(camT));
        camera.lookAt(TARGET);
    }

    // Opacity lerp for all meshes; promote to opaque pass once fully faded in
    allMeshes.forEach(m => {
        const t = m.userData.targetOp ?? 0;
        const d = t - m.material.opacity;
        if (Math.abs(d) > 0.001) {
            m.material.opacity += d * 0.075;
        } else if (m.material.transparent && m.material.opacity >= 0.999) {
            m.material.transparent = false;
            m.material.needsUpdate = true;
        }
    });

    renderer.render(scene, camera);
}

animate();
