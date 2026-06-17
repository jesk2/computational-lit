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
    'ghost-silhouette': new THREE.Vector3( 0,  10,   20 ),
    'bathroom':         new THREE.Vector3(-10,  7,   13 ),
    'ghost-return':     new THREE.Vector3( 8,   1.5, 13 ),
    'window-cracked':   new THREE.Vector3( 6,  10,   13 ),
    'hallway-return':   new THREE.Vector3(-1,   2,   12 ),
};

// ── Room geometry definitions ─────────────────────────────────────────────────

const D = 4.0;
const ROOMS = [
    { id: 'entrance',         x: -3,   y:  1.5, wx: 3,  wy: 3,   color: 0xf0d8a8 },
    { id: 'hallway-return',   x:  0,   y:  1.5, wx: 3,  wy: 3,   color: 0xeecca8 },
    { id: 'ghost-return',     x:  3,   y:  1.5, wx: 3,  wy: 3,   color: 0xd8d0e8 },
    { id: 'mirror',           x: -3,   y:  4.5, wx: 3,  wy: 3,   color: 0xb8cce0 },
    { id: 'hallway',          x:  0,   y:  4.5, wx: 3,  wy: 3,   color: 0xecdcb8 },
    { id: 'bathroom',         x:  3,   y:  4.5, wx: 3,  wy: 3,   color: 0xb4dcd8 },
    { id: 'window-cracked',   x: -1.5, y:  7.5, wx: 6,  wy: 3,   color: 0xc0d4ec },
    { id: 'window',           x:  3,   y:  7.5, wx: 3,  wy: 3,   color: 0xa8ccf0 },
];

const BASE_OP  = 1.0;
const FLOOR_OP = 1.0;
const SIDE_OP  = 0.52;
const CEIL_OP  = 1.0;

// ── Bootstrap ────────────────────────────────────────────────────────────────

const raw     = await fetch('./poems/always.md').then(r => r.text());
const poemMap = parseRooms(raw);

// ── Three.js scene ────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xCCE8F8);

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

    const floorMat = new THREE.MeshBasicMaterial({ color: FLOOR_BROWN, transparent: true, opacity: 0, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wx - 0.06, D - 0.06), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -wy / 2 + 0.01;
    floor.userData.originalColor = vividColor(c).multiplyScalar(0.7);
    floor.userData.isFloor = true;
    floor.renderOrder = 2;
    g.add(addMesh(floor, FLOOR_OP));

    const sideGeo = new THREE.PlaneGeometry(D - 0.06, wy - 0.06);
    const lwIsExterior = (x - wx / 2) <= -4.49;
    const rwIsExterior = (x + wx / 2) >= 4.49;
    const lw = new THREE.Mesh(sideGeo, mk(WALL_BROWN));
    lw.rotation.y =  Math.PI / 2; lw.position.x = -wx / 2 + 0.01;
    lw.userData.originalColor = vividColor(c);
    lw.renderOrder = 1;
    g.add(addMesh(lw, lwIsExterior ? 1.0 : SIDE_OP));

    const rw = new THREE.Mesh(sideGeo, mk(WALL_BROWN));
    rw.rotation.y = -Math.PI / 2; rw.position.x =  wx / 2 - 0.01;
    rw.userData.originalColor = vividColor(c);
    rw.renderOrder = 1;
    g.add(addMesh(rw, rwIsExterior ? 1.0 : SIDE_OP));

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
        'entrance':       { gw: 0.85, gh: 1.8, gx: 0, gy: -0.6,  color: 0x7A4A28, isDoor: true },
        'hallway-return': { gw: 2.2, gh: 1.2, gx: 0, gy:  0.4  },
        'mirror':         { gw: 1.0, gh: 1.8, gx: 0, gy:  0.0  },
        'hallway':        { gw: 2.2, gh: 1.2, gx: 0, gy:  0.4  },
        'bathroom':       { gw: 2.2, gh: 1.2, gx: 0, gy:  0.4  },
    }[id];
    if (winCfg) {
        const { gw, gh, gx, gy, color = 0xCCE8F8, isDoor = false } = winCfg;
        const gz = -D / 2 + 0.03, fz = -D / 2 + 0.04;
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(gw, gh),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })
        );
        glass.position.set(gx, gy, gz);
        g.add(addMesh(glass, 1.0));
        const frameColor = isDoor ? 0x3A1E08 : 0x9a8a78;
        const fMat = () => new THREE.LineBasicMaterial({ color: frameColor, transparent: true, opacity: 0 });
        const addFL = (pts) => g.add(addMesh(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fMat()), 1.0));
        g.add(addMesh(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(gx - gw/2, gy - gh/2, fz), new THREE.Vector3(gx + gw/2, gy - gh/2, fz),
            new THREE.Vector3(gx + gw/2, gy + gh/2, fz), new THREE.Vector3(gx - gw/2, gy + gh/2, fz),
        ]), fMat()), 1.0));
        if (!isDoor) {
            addFL([new THREE.Vector3(gx,        gy - gh/2,        fz), new THREE.Vector3(gx,        gy + gh/2,        fz)]);
            addFL([new THREE.Vector3(gx - gw/2, gy,               fz), new THREE.Vector3(gx + gw/2, gy,               fz)]);
            addFL([new THREE.Vector3(gx - gw/2 - 0.12, gy - gh/2 - 0.06, fz), new THREE.Vector3(gx + gw/2 + 0.12, gy - gh/2 - 0.06, fz)]);
        } else {
            // door panel divider and handle
            addFL([new THREE.Vector3(gx - gw/2 + 0.07, gy,         fz), new THREE.Vector3(gx + gw/2 - 0.07, gy,         fz)]);
            addFL([new THREE.Vector3(gx + gw/2 - 0.18, gy - 0.2,  fz), new THREE.Vector3(gx + gw/2 - 0.18, gy + 0.2,  fz)]);
        }
    }

    scene.add(g);
    setTimeout(() => g.traverse(child => {
        if (child.userData.baseOp !== undefined)
            child.userData.targetOp = child.userData.baseOp;
    }), 300 + idx * 80);
}

ROOMS.forEach((def, i) => makeRoom(def, i));

// ── Bus stop — glass shelter with bench, at ground level ─────────────────────
{
    const bx = 7, sw = 2.2, sh = 2.4, sd = 1.8;
    const by = sh / 2; // bottom at y=0
    const g = new THREE.Group();
    g.position.set(bx, by, 0);
    roomGroups['bus-stop'] = g;

    const frameCol = 0x607068;
    const glassM = () => new THREE.MeshBasicMaterial({ color: 0x9ABFCF, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const solidM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const lineM  = () => new THREE.LineBasicMaterial({ color: frameCol, transparent: true, opacity: 0 });

    // Back glass wall
    const back = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), glassM());
    back.position.z = -sd / 2;
    back.userData.originalColor = new THREE.Color(0xCCE8F8);
    g.add(addMesh(back, 0.38));
    roomMeshes['bus-stop'] = back;

    // Left glass panel (upper portion only — open at bottom for bench access)
    const leftH = sh * 0.62;
    const lwall = new THREE.Mesh(new THREE.PlaneGeometry(sd, leftH), glassM());
    lwall.rotation.y = Math.PI / 2;
    lwall.position.set(-sw / 2, sh / 2 - leftH / 2, 0);
    g.add(addMesh(lwall, 0.32));

    // Roof (solid, slight overhang)
    const roofW = sw + 0.35, roofD = sd + 0.25;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(roofW, roofD), solidM(0x98948C));
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = sh / 2;
    roof.userData.isRoof = true;
    roof.renderOrder = 10;
    g.add(addMesh(roof, 1.0));
    // Roof underside
    const roofU = new THREE.Mesh(new THREE.PlaneGeometry(roofW, roofD), solidM(0x807C78));
    roofU.rotation.x = Math.PI / 2;
    roofU.position.y = sh / 2 - 0.05;
    roofU.userData.isRoof = true;
    roofU.renderOrder = 10;
    g.add(addMesh(roofU, 1.0));
    // Roof outline
    const rw2 = roofW / 2, rd2 = roofD / 2;
    const roofEdge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-rw2, sh/2, -rd2), new THREE.Vector3(rw2, sh/2, -rd2),
        new THREE.Vector3(rw2, sh/2,  rd2),  new THREE.Vector3(-rw2, sh/2, rd2),
        new THREE.Vector3(-rw2, sh/2, -rd2),
    ]), lineM());
    g.add(addMesh(roofEdge, 1.0));

    // Four corner posts
    [[-sw/2, -sd/2], [sw/2, -sd/2], [-sw/2, sd/2], [sw/2, sd/2]].forEach(([px, pz]) => {
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(px, -sh/2, pz), new THREE.Vector3(px, sh/2, pz),
        ]);
        g.add(addMesh(new THREE.Line(geo, lineM()), 1.0));
    });

    // Bench (3D box, along back wall)
    const bSeatTopY = -sh / 2 + 0.44;
    const bH = 0.07, bD = 0.48, bW = sw - 0.4;
    const bCz = -sd / 2 + bD / 2 + 0.08;
    const bCy = bSeatTopY - bH / 2;
    const benchTop = new THREE.Mesh(new THREE.PlaneGeometry(bW, bD), solidM(0xA88C68));
    benchTop.rotation.x = -Math.PI / 2;
    benchTop.position.set(0, bSeatTopY, bCz);
    g.add(addMesh(benchTop, 0.90));
    const benchFront = new THREE.Mesh(new THREE.PlaneGeometry(bW, bH), solidM(0x907050));
    benchFront.position.set(0, bCy, bCz + bD / 2);
    g.add(addMesh(benchFront, 0.90));
    const benchEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(bW, bH, bD)),
        new THREE.LineBasicMaterial({ color: 0x5A3A18, transparent: true, opacity: 0 }));
    benchEdges.position.set(0, bCy, bCz);
    g.add(addMesh(benchEdges, 0.90));
    // Bench legs
    [-(bW / 2 - 0.1), (bW / 2 - 0.1)].forEach(lx => {
        const lg = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(lx, -sh/2, bCz - bD/4),
            new THREE.Vector3(lx, bSeatTopY - bH, bCz - bD/4),
        ]);
        g.add(addMesh(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x5A3A18, transparent: true, opacity: 0 })), 0.90));
    });

    // Schedule board on back wall
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.52), solidM(0xECE6DC));
    board.position.set(0.35, 0.3, -sd / 2 + 0.015);
    g.add(addMesh(board, 0.88));
    const boardBorder = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.025, 0.04,  -sd/2 + 0.02),
        new THREE.Vector3( 0.725, 0.04,  -sd/2 + 0.02),
        new THREE.Vector3( 0.725, 0.56,  -sd/2 + 0.02),
        new THREE.Vector3(-0.025, 0.56,  -sd/2 + 0.02),
    ]), lineM());
    g.add(addMesh(boardBorder, 0.88));

    scene.add(g);
    const busTiming = 300 + ROOMS.length * 80;
    setTimeout(() => g.traverse(c => {
        if (c.userData.baseOp !== undefined) c.userData.targetOp = c.userData.baseOp;
    }), busTiming);
}


// Roof
{
    const ry = 9.0, py = 11.6, hw = 5.0, dh = D/2;

    const addRoofPanel = (vArr, hexColor) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vArr), 3));
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: hexColor, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
        }));
        mesh.userData.isRoof = true;
        mesh.renderOrder = 10;
        addMesh(mesh, 1.0);
        scene.add(mesh);
        setTimeout(() => { mesh.userData.targetOp = 1.0; }, 1300);
    };

    // Left + right slope panels — door brown
    addRoofPanel([
        -hw,ry,-dh,  -hw,ry,dh,   0,py,dh,
        -hw,ry,-dh,   0,py,dh,    0,py,-dh,
         0,py,-dh,    0,py,dh,   hw,ry,dh,
         0,py,-dh,   hw,ry,dh,   hw,ry,-dh,
    ], 0x7A4A28);

    // Front gable triangle — explicitly FLOOR_BROWN (same as ground)
    addRoofPanel([-hw,ry,dh,  hw,ry,dh,  0,py,dh ], 0x8C6A48);
    // Back gable triangle — explicitly FLOOR_BROWN (same as ground)
    addRoofPanel([-hw,ry,-dh, 0,py,-dh,  hw,ry,-dh], 0x8C6A48);

    // Wireframe edges
    const pts = [
        [-hw, ry, -dh], [0, py, -dh], [hw, ry, -dh],
        [-hw, ry,  dh], [0, py,  dh], [hw, ry,  dh],
    ].map(([x,y,z]) => new THREE.Vector3(x,y,z));
    [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[0,3],[1,4],[2,5]].forEach(([a,b]) => {
        const l = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([pts[a], pts[b]]),
            new THREE.LineBasicMaterial({ color: FLOOR_BROWN, transparent: true, opacity: 0 })
        );
        l.userData.isRoof = true;
        l.renderOrder = 10;
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

// bathroom — wall-mounted sink (open-top porcelain box, water inside)
{
    const sx = 3, sy = 3.39, sz = -1.3;
    const sw = 1.1, sh = 0.38, sd = 1.0;
    const sinkMeshes = [];
    const reg = (m, op) => {
        m.userData.baseOp = op; m.userData.targetOp = 0;
        allMeshes.push(m); scene.add(m); sinkMeshes.push(m);
    };
    const mkFace = (col) => new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });

    // Front face — faces +Z, directly toward camera
    const front = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mkFace(0xF2EEE9));
    front.position.set(sx, sy, sz + sd / 2);
    reg(front, 1.0).renderOrder = 3;

    // Left exterior — rotation -PI/2 makes normal face -X (toward camera at x=-2)
    const lside = new THREE.Mesh(new THREE.PlaneGeometry(sd, sh), mkFace(0xC8C4BE));
    lside.rotation.y = -Math.PI / 2;
    lside.position.set(sx - sw / 2, sy, sz);
    reg(lside, 1.0).renderOrder = 3;

    // Right exterior — rotation +PI/2 makes normal face +X
    const rside = new THREE.Mesh(new THREE.PlaneGeometry(sd, sh), mkFace(0xC8C4BE));
    rside.rotation.y = Math.PI / 2;
    rside.position.set(sx + sw / 2, sy, sz);
    reg(rside, 1.0).renderOrder = 3;

    // Back face
    const bface = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mkFace(0xB8B4AE));
    bface.rotation.y = Math.PI;
    bface.position.set(sx, sy, sz - sd / 2);
    reg(bface, 1.0).renderOrder = 3;

    // Basin floor — rotation -PI/2 makes normal face +Y (upward, visible from above)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), mkFace(0xD4CEC8));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(sx, sy - sh / 2, sz);
    reg(floor, 1.0).renderOrder = 3;

    // Box edges
    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(sw, sh, sd)),
        new THREE.LineBasicMaterial({ color: 0x7A6050, transparent: true, opacity: 0 }));
    edges.position.set(sx, sy, sz);
    reg(edges, 0.95).renderOrder = 3;

    // Water surface — sits just above basin floor, visible from above through open top
    const water = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.10, sd - 0.10),
        new THREE.MeshBasicMaterial({ color: 0x3ABDD8, transparent: true, opacity: 0, depthWrite: false }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(sx, sy - sh / 2 + 0.06, sz);
    reg(water, 0.92).renderOrder = 3;

    // Drain circle above water
    const drain = new THREE.Mesh(new THREE.CircleGeometry(0.055, 8),
        new THREE.MeshBasicMaterial({ color: 0x9A8A78, transparent: true, opacity: 0, depthWrite: false }));
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(sx, sy - sh / 2 + 0.065, sz);
    reg(drain, 0.90).renderOrder = 3;

    setTimeout(() => sinkMeshes.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 740);
}
// Faucet: stem rises from back of sink, spout curves forward over basin
detail([
    [[3.0, 3.58, -1.72], [3.0, 3.90, -1.72]],
    [[2.86, 3.86, -1.72], [3.14, 3.86, -1.72]],
    [[3.0, 3.90, -1.72], [3.0, 3.94, -1.52], [3.0, 3.82, -1.3]],
], 740);

// ghost-return — living room (row 1, col 3): sofa + coffee table + rug
{
    const lx = 3, fy = 0; // room center x, floor world y
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ln   = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0 });
    const items = [];
    const reg  = (m, op) => { m.userData.baseOp = op; m.userData.targetOp = 0; allMeshes.push(m); scene.add(m); items.push(m); return m; };

    // Rug — warm terracotta, just above floor
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.7), face(0xB8886A));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(lx, fy + 0.02, 0.15);
    rug.renderOrder = 2;
    reg(rug, 0.86);

    // Sofa along back wall
    const sW = 1.8, sD = 0.62, sH = 0.44, bH = 0.50, bD = 0.13;
    const sZ  = -1.22;                  // seat centre z
    const bZ  = sZ - sD / 2 - bD / 2;  // backrest centre z
    const sofaC = 0x8A7060, sofaE = 0x3C2414;

    // box helper — top + front + both sides + wireframe
    const box = (x, y, z, w, h, d, tC, fC, sC, eC, op) => {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), face(tC));
        t.rotation.x = -Math.PI / 2; t.position.set(x, y + h, z); reg(t, op).renderOrder = 3;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face(fC));
        f.position.set(x, y + h / 2, z + d / 2); reg(f, op).renderOrder = 3;
        const sr = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sr.rotation.y = Math.PI / 2; sr.position.set(x + w / 2, y + h / 2, z); reg(sr, op).renderOrder = 3;
        const sl = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sl.rotation.y = -Math.PI / 2; sl.position.set(x - w / 2, y + h / 2, z); reg(sl, op).renderOrder = 3;
        const _e = reg(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ln(eC)), op + 0.02);
        _e.position.set(x, y + h / 2, z); _e.renderOrder = 3;
    };

    // Seat — top + front + sides
    box(lx, fy, sZ, sW, sH, sD, 0xD8C4B0, 0x4A3020, 0x5A4030, sofaE, 1.0);

    // Backrest — top + front + sides
    box(lx, fy + sH, bZ, sW, bH, bD, 0xCCB8A4, 0x4A3020, 0x5A4030, sofaE, 1.0);

    // Armrests — top + front + outer side + wireframe
    const aW = 0.13, aH = sH + bH * 0.65, aD = sD + bD;
    const aZc = sZ - bD / 2;
    for (const dx of [-(sW / 2 + aW / 2), (sW / 2 + aW / 2)]) {
        box(lx + dx, fy, aZc, aW, aH, aD, 0xE0CCBC, 0x5A4030, 0x4A3020, sofaE, 1.0);
    }

    // Coffee table
    const ctW = 1.0, ctD = 0.45, ctH = 0.27;
    const ctZ = 0.68;

    const ctTop = new THREE.Mesh(new THREE.PlaneGeometry(ctW, ctD), face(0xC89858));
    ctTop.rotation.x = -Math.PI / 2;
    ctTop.position.set(lx, ctH, ctZ);
    reg(ctTop, 1.0).renderOrder = 3;

    const ctBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ctW, 0.05, ctD)), ln(0x3A2010));
    ctBox.position.set(lx, ctH, ctZ);
    reg(ctBox, 0.95).renderOrder = 3;

    // table legs
    for (const [dx, dz] of [[ctW/2-0.07, ctD/2-0.06],[ctW/2-0.07,-(ctD/2-0.06)],[-(ctW/2-0.07),ctD/2-0.06],[-(ctW/2-0.07),-(ctD/2-0.06)]]) {
        reg(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(lx + dx, fy, ctZ + dz),
                new THREE.Vector3(lx + dx, ctH - 0.03, ctZ + dz),
            ]), ln(0x3A2010)), 0.92).renderOrder = 3;
    }

    // small object (book) on table
    const book = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.28, 0.04, 0.18)), ln(0x5C3C20));
    book.position.set(lx + 0.22, ctH + 0.025, ctZ - 0.05);
    reg(book, 0.90).renderOrder = 3;

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 500);
}

// window-cracked — crack only  (room idx 6, ~780ms)
detail([
    [[-3.1, 8.38,BW],[-2.65,8.05,BW],[-2.45,8.28,BW],[-2.1,7.80,BW]],
], 820);

// mirror room (row 2, col 1) — vanity + stool (mirror removed)
{
    const rx = -3, fy = 3;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ln   = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0 });
    const items = [];
    const reg  = (m, op) => { m.userData.baseOp = op; m.userData.targetOp = 0; allMeshes.push(m); scene.add(m); items.push(m); return m; };

    // box(x,y,z, w,h,d, topC,frontC,sideC,edgeC, op) — top + front + both sides + wireframe
    const box = (x, y, z, w, h, d, tC, fC, sC, eC, op) => {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), face(tC));
        t.rotation.x = -Math.PI / 2; t.position.set(x, y + h, z); reg(t, op).renderOrder = 3;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face(fC));
        f.position.set(x, y + h / 2, z + d / 2); reg(f, op).renderOrder = 3;
        const sr = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sr.rotation.y = Math.PI / 2; sr.position.set(x + w / 2, y + h / 2, z); reg(sr, op).renderOrder = 3;
        const sl = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sl.rotation.y = -Math.PI / 2; sl.position.set(x - w / 2, y + h / 2, z); reg(sl, op).renderOrder = 3;
        const _e = reg(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ln(eC)), op + 0.02);
        _e.position.set(x, y + h / 2, z); _e.renderOrder = 3;
    };

    // Vanity / dresser — pulled slightly from back wall
    const vW = 1.2, vH = 0.70, vD = 0.42;
    const vZ = -2 + vD / 2 + 0.40;
    box(rx, fy, vZ, vW, vH, vD, 0xF0DEC0, 0x5A3818, 0x4A2810, 0x2A1808, 1.0);

    // Drawer divider lines + knobs on front face
    const dz = vZ + vD / 2 + 0.005;
    for (const dy of [fy + vH * 0.33, fy + vH * 0.66]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx - vW/2 + 0.06, dy, dz),
            new THREE.Vector3(rx + vW/2 - 0.06, dy, dz),
        ]), ln(0x7A5030)), 0.88).renderOrder = 3;
    }
    for (const [kx, ky] of [[rx - 0.16, fy + vH*0.17],[rx + 0.16, fy + vH*0.17],[rx - 0.16, fy + vH*0.50],[rx + 0.16, fy + vH*0.50]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(kx - 0.025, ky, dz), new THREE.Vector3(kx + 0.025, ky, dz),
        ]), ln(0x3A2010)), 0.92).renderOrder = 3;
    }

    // Stool in front of vanity — full 3D box + legs
    const stH = 0.43, stW = 0.48, stZ = -0.82;
    box(rx, fy, stZ, stW, stH, stW, 0xF0DEC0, 0x5A3818, 0x4A2810, 0x2A1808, 1.0);
    for (const [dx, dz2] of [[stW/2-0.06, stW/2-0.06],[stW/2-0.06,-(stW/2-0.06)],[-(stW/2-0.06),stW/2-0.06],[-(stW/2-0.06),-(stW/2-0.06)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy, stZ + dz2),
            new THREE.Vector3(rx + dx, fy + stH - 0.04, stZ + dz2),
        ]), ln(0x5A3C20)), 0.90).renderOrder = 3;
    }

    // Rug — dusty rose, spans floor
    const mrRug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), face(0xC0908A));
    mrRug.rotation.x = -Math.PI / 2; mrRug.position.set(rx, fy + 0.02, 0.0);
    mrRug.renderOrder = 2; reg(mrRug, 0.82);

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 540);
}

// hallway (row 2, col 2) — console table + coat hooks + vase
{
    const rx = 0, fy = 3;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ln   = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0 });
    const items = [];
    const reg  = (m, op) => { m.userData.baseOp = op; m.userData.targetOp = 0; allMeshes.push(m); scene.add(m); items.push(m); return m; };

    const box = (x, y, z, w, h, d, tC, fC, sC, eC, op) => {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), face(tC));
        t.rotation.x = -Math.PI / 2; t.position.set(x, y + h, z); reg(t, op).renderOrder = 3;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face(fC));
        f.position.set(x, y + h / 2, z + d / 2); reg(f, op).renderOrder = 3;
        const sr = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sr.rotation.y = Math.PI / 2; sr.position.set(x + w / 2, y + h / 2, z); reg(sr, op).renderOrder = 3;
        const sl = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sl.rotation.y = -Math.PI / 2; sl.position.set(x - w / 2, y + h / 2, z); reg(sl, op).renderOrder = 3;
        const _e = reg(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ln(eC)), op + 0.02);
        _e.position.set(x, y + h / 2, z); _e.renderOrder = 3;
    };

    // Console table — pulled slightly from back wall
    const tW = 1.0, tH = 0.76, tD = 0.30;
    const tZ = -2 + tD / 2 + 0.40;
    box(rx, fy, tZ, tW, tH, tD, 0xECD0A0, 0x4A2C10, 0x3A2008, 0x1E1008, 1.0);

    // Two front legs
    for (const dx of [-(tW/2 - 0.06), (tW/2 - 0.06)]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy, tZ + tD/2),
            new THREE.Vector3(rx + dx, fy + tH - 0.03, tZ + tD/2),
        ]), ln(0x4A2C10)), 0.90).renderOrder = 3;
    }

    // Coat hooks on wall (3 pegs)
    const hookY = fy + 2.1, hookZ = -1.97;
    for (const dx of [-0.36, 0, 0.36]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, hookY, hookZ),
            new THREE.Vector3(rx + dx, hookY, hookZ + 0.16),
        ]), ln(0x5A3820)), 0.90).renderOrder = 3;
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx - 0.025, hookY + 0.025, hookZ + 0.14),
            new THREE.Vector3(rx + dx + 0.025, hookY - 0.025, hookZ + 0.16),
        ]), ln(0x5A3820)), 0.88).renderOrder = 3;
    }

    // Vase on table — 3D box
    box(rx + 0.30, fy + tH, tZ, 0.11, 0.32, 0.11, 0xE09050, 0x783010, 0x602808, 0x4A2010, 1.0);

    // Rug — sage grey, spans floor
    const hwRug = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), face(0x909870));
    hwRug.rotation.x = -Math.PI / 2; hwRug.position.set(rx, fy + 0.02, 0.0);
    hwRug.renderOrder = 2; reg(hwRug, 0.80);

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 620);
}

// window-cracked (row 3, large room) — bedroom: bed + headboard + pillows + nightstand
{
    const rx = -1.5, fy = 6;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ln   = c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0 });
    const items = [];
    const reg  = (m, op) => { m.userData.baseOp = op; m.userData.targetOp = 0; allMeshes.push(m); scene.add(m); items.push(m); return m; };

    // box — top + front + both sides + wireframe, all individually visible faces
    const box = (x, y, z, w, h, d, tC, fC, sC, eC, op) => {
        const t = new THREE.Mesh(new THREE.PlaneGeometry(w, d), face(tC));
        t.rotation.x = -Math.PI / 2; t.position.set(x, y + h, z); reg(t, op).renderOrder = 3;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), face(fC));
        f.position.set(x, y + h / 2, z + d / 2); reg(f, op).renderOrder = 3;
        const sr = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sr.rotation.y = Math.PI / 2; sr.position.set(x + w / 2, y + h / 2, z); reg(sr, op).renderOrder = 3;
        const sl = new THREE.Mesh(new THREE.PlaneGeometry(d, h), face(sC));
        sl.rotation.y = -Math.PI / 2; sl.position.set(x - w / 2, y + h / 2, z); reg(sl, op).renderOrder = 3;
        const _e = reg(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ln(eC)), op + 0.02);
        _e.position.set(x, y + h / 2, z); _e.renderOrder = 3;
    };

    const bW = 2.4, bL = 3.0, bFH = 0.18, mTH = 0.22, bZ = -0.30;

    // Bed frame (dark wood) — top + front foot-board face + sides
    box(rx, fy, bZ, bW, bFH, bL, 0x8A6030, 0x3C1C08, 0x2C1008, 0x1A0800, 1.0);

    // Mattress (cream) — top + front + sides, slightly inset
    box(rx, fy + bFH, bZ, bW - 0.12, mTH, bL - 0.12, 0xF4EEE4, 0xC8BEB4, 0xB8AEA4, 0xA09890, 1.0);

    // Headboard — full 3D slab against back wall
    const hdH = 0.62, hdD = 0.12;
    const hdZ = bZ - bL / 2 - hdD / 2 - 0.01;
    box(rx, fy + bFH, hdZ, bW, hdH, hdD, 0x9A7040, 0x3C1C08, 0x2C1008, 0x1A0800, 1.0);

    // Two pillows at head of bed
    const pW = 0.88, pD = 0.46, pH = 0.10;
    const pY = fy + bFH + mTH;
    const pZ = bZ - bL / 2 + pD / 2 + 0.12;
    for (const dx of [-bW / 4, bW / 4]) {
        box(rx + dx, pY, pZ, pW, pH, pD, 0xF8F4EE, 0xD8D2CA, 0xC8C2BA, 0xA8A09A, 1.0);
    }

    // Blanket / duvet — 3D slab covering foot half of mattress
    const blL = bL * 0.58;
    const blZ = bZ + bL / 2 - blL / 2;
    box(rx, fy + bFH + mTH, blZ, bW - 0.14, 0.08, blL, 0x9AACC8, 0x506890, 0x405878, 0x304868, 1.0);

    // Nightstand (right of bed) — full 3D
    const nsX = rx + bW / 2 + 0.34;
    const nsH = bFH + mTH + 0.04;
    const nsZ = bZ + 0.10;
    box(nsX, fy, nsZ, 0.50, nsH, 0.44, 0xD4A870, 0x4A2810, 0x3A1E08, 0x2A1200, 1.0);

    // Lamp on nightstand
    const lamp = reg(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.13, 0.09, 0.26, 6)), ln(0x9A7840)), 0.86);
    lamp.position.set(nsX, fy + nsH + 0.13, nsZ - 0.06);
    lamp.renderOrder = 3;

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 800);
}


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
        } else if (m.material.transparent && m.material.opacity >= 0.999 && m.material.depthTest !== false && !m.userData.isRoof && !m.userData.isFloor) {
            m.material.transparent = false;
            m.material.needsUpdate = true;
        }
    });

    renderer.render(scene, camera);
}

animate();
