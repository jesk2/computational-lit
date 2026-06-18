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
    'entrance':         { left: '5%',  top: '8%'  },
    'mirror':           { left: '4%',  top: '38%' },
    'hallway':          { left: '36%', top: '53%' },
    'window':           { left: '63%', top: '32%' },
    'bus-stop':         { left: '72%', top: '10%' },
    'ghost-silhouette': { left: '38%', top: '7%'  },
    'bathroom':         { left: '5%',  top: '17%' },
    'ghost-return':     { left: '60%', top: '6%'  },
    'window-cracked':   { left: '53%', top: '13%' },
    'hallway-return':   { left: '28%', top: '12%' },
};

// Camera position that best shows each room
const ROOM_CAMERAS = {
    'entrance':         new THREE.Vector3(-4,   3,   13 ),
    'mirror':           new THREE.Vector3(-10,  5,   13 ),
    'hallway':          new THREE.Vector3( 0,   5,   13 ),
    'window':           new THREE.Vector3(-1.5, 9,   14 ),
    'bus-stop':         new THREE.Vector3( 5,   2.2, 11 ),
    'ghost-silhouette': new THREE.Vector3( 0,  10,   20 ),
    'bathroom':         new THREE.Vector3( 7,  10,   14 ),
    'ghost-return':     new THREE.Vector3( 8,   3,   13 ),
    'window-cracked':   new THREE.Vector3(-2,   4,   11 ),
    'hallway-return':   new THREE.Vector3(-1,   3,   12 ),
};

// Where each room camera looks — keeps ground-floor views pointing at the floor, not the sky
const ROOM_LOOK_AT = {
    'entrance':         new THREE.Vector3(-3,   0.5, 0),
    'mirror':           new THREE.Vector3(-3,   3.5, 0),
    'hallway':          new THREE.Vector3( 0,   3.5, 0),
    'window':           new THREE.Vector3(-1.5, 7.5, 0),
    'bus-stop':         new THREE.Vector3( 7,   1.5, -0.3),
    'ghost-silhouette': new THREE.Vector3( 0,   6.0, 0),
    'bathroom':         new THREE.Vector3( 3,   7.2, 0),
    'ghost-return':     new THREE.Vector3( 3,   0.5, 0),
    'window-cracked':   new THREE.Vector3( 0,   1.5, 0),
    'hallway-return':   new THREE.Vector3( 0,   0.5, 0),
};

// per-step room highlight overrides
const ROOM_HIGHLIGHT = {
    'window':         'window-cracked',  // "sky hangs low" → bedroom window
    'bathroom':       'window',          // "ghost beneath my ribs" → study desk
    'window-cracked': 'hallway-return',  // "leave the window cracked" → ground floor middle
};

// Per-step background colours — progressive dusk to night
const SCENE_BG = {
    'window':           0xB84820,   // warm amber dusk (sky hangs low)
    'bus-stop':         0x4A2858,   // deep purple twilight
    'ghost-silhouette': 0x1C1040,   // early night
    'bathroom':         0x120B28,   // dark night
    'ghost-return':     0x0C0820,   // deeper night
    'window-cracked':   0x080614,   // very dark
    'hallway-return':   0x060412,   // darkest (last step stays dark)
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
let bedroomGlass  = null;
const nightStars  = [];
const allGlassPanes     = []; // all non-door window glass panes
const ghostFigureMeshes = []; // roof figure, visible from ghost-silhouette step onward
let bgTarget = new THREE.Color(0xCCE8F8); // smooth sky colour target

function addMesh(mesh, baseOp) {
    mesh.userData.baseOp   = baseOp;
    mesh.userData.targetOp = 0;
    mesh.material.opacity  = 0;
    allMeshes.push(mesh);
    return mesh;
}

const WALL_BROWN  = new THREE.Color(0xDEC8A8);
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
        new THREE.LineBasicMaterial({ color: 0x5C5048, transparent: true, opacity: 0 })
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
        if (id === 'window-cracked') bedroomGlass = glass;
        if (!isDoor) { glass.userData.isGlass = true; allGlassPanes.push(glass); }
        const frameColor = isDoor ? 0x3A1E08 : 0x5C5048;
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

// Stars behind the bedroom window — visible only during the 'window' poem step
// window-cracked room: x=-1.5, y=7.5; glass at world (-1.5, 7.75, -1.97)
{
    const pos = [];
    const rng = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 32; i++) {
        pos.push(rng(-3.7, 0.7), rng(7.1, 8.4), rng(-1.96, -1.95));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    const starMesh = new THREE.Points(starGeo,
        new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.05, transparent: true, opacity: 0,
            sizeAttenuation: true, depthTest: false })
    );
    addMesh(starMesh, 0.88);
    scene.add(starMesh);
    nightStars.push(starMesh);
}

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
    back.userData.originalColor = new THREE.Color(0x2A3848);
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

    // Ambiguous dog shadow on ground near bus stop
    const dogShape = new THREE.Shape();
    dogShape.moveTo(0.78, 0.06);
    dogShape.bezierCurveTo(0.88, 0.22, 0.72, 0.30, 0.52, 0.22);
    dogShape.bezierCurveTo(0.28, 0.14, 0.04, 0.26, -0.14, 0.28);
    dogShape.bezierCurveTo(-0.30, 0.30, -0.48, 0.26, -0.58, 0.18);
    dogShape.bezierCurveTo(-0.70, 0.28, -0.78, 0.22, -0.70, 0.08);
    dogShape.bezierCurveTo(-0.82, -0.04, -0.68, -0.20, -0.48, -0.22);
    dogShape.bezierCurveTo(-0.26, -0.26, 0.08, -0.24, 0.32, -0.18);
    dogShape.bezierCurveTo(0.58, -0.12, 0.72, -0.10, 0.78, 0.06);
    const dogGeo  = new THREE.ShapeGeometry(dogShape);
    const dogMesh = new THREE.Mesh(dogGeo,
        new THREE.MeshBasicMaterial({ color: 0x040308, transparent: true, opacity: 0, depthWrite: false }));
    dogMesh.rotation.x = -Math.PI / 2;
    dogMesh.rotation.z =  Math.PI * 0.12;
    dogMesh.scale.set(0.85, 0.85, 1);
    dogMesh.position.set(8.4, 0.015, 0.9);
    dogMesh.renderOrder = 2;
    dogMesh.userData.baseOp   = 0.58;
    dogMesh.userData.targetOp = 0;
    allMeshes.push(dogMesh);
    scene.add(dogMesh);
    setTimeout(() => { dogMesh.userData.targetOp = 0.58; }, busTiming);
}


// ── Ghost figure in roof — visible from ghost-silhouette step onward ──────────
{
    const gfReg = (m, op) => {
        m.userData.baseOp = op; m.userData.targetOp = 0;
        allMeshes.push(m); scene.add(m); ghostFigureMeshes.push(m); return m;
    };
    const gfMat = () => new THREE.LineBasicMaterial({ color: 0xEEECCC, transparent: true, opacity: 0 });
    const gfX = 0.4, gfZ = -0.2;  // slightly off-centre on roof ridge

    // Soft glow behind figure
    const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xFFFFAA, transparent: true, opacity: 0 }));
    glow.position.set(gfX, 11.65, gfZ);
    gfReg(glow, 0.13);

    // Head circle
    const headPts = [];
    for (let i = 0; i <= 10; i++) {
        const a = i / 10 * Math.PI * 2;
        headPts.push(new THREE.Vector3(gfX + Math.cos(a)*0.16, 12.02 + Math.sin(a)*0.20, gfZ));
    }
    gfReg(new THREE.Line(new THREE.BufferGeometry().setFromPoints(headPts), gfMat()), 0.72);

    // Body
    gfReg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(gfX, 11.80, gfZ),
        new THREE.Vector3(gfX, 11.26, gfZ),
    ]), gfMat()), 0.72);

    // Left arm raised
    gfReg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(gfX, 11.62, gfZ),
        new THREE.Vector3(gfX - 0.34, 11.88, gfZ),
    ]), gfMat()), 0.66);

    // Right arm raised
    gfReg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(gfX, 11.62, gfZ),
        new THREE.Vector3(gfX + 0.30, 11.82, gfZ),
    ]), gfMat()), 0.66);
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
            new THREE.LineBasicMaterial({ color: 0x5C5048, transparent: true, opacity: 0 })
        );
        l.userData.isRoof = true;
        l.renderOrder = 10;
        addMesh(l, 1.0);
        scene.add(l);
        setTimeout(() => { l.userData.targetOp = 1.0; }, 1300);
    });
}


// Explicit exterior vertical edge lines — depthTest:false so they render on top of exterior side walls
{
    const dh = D / 2;
    [[-4.5, -dh], [-4.5, dh], [4.5, -dh], [4.5, dh]].forEach(([ex, ez]) => {
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ex, 0, ez),
            new THREE.Vector3(ex, 9, ez),
        ]);
        const l = new THREE.Line(geo,
            new THREE.LineBasicMaterial({ color: 0x5C5048, transparent: true, opacity: 0, depthTest: false })
        );
        addMesh(l, 1.0);
        l.userData.targetOp = 1.0;
        scene.add(l);
    });
}

// ── Room detail geometry ──────────────────────────────────────────────────────
// All details use the same LineBasicMaterial style as the structural edges.
// BW = just in front of the back wall to avoid z-fighting.

const DET_OP = 0.90;
const BW = -D / 2 + 0.02;


// detail: create + register multiple polylines, fade in after delay
function detail(polylines, delay) {
    const mat = new THREE.LineBasicMaterial({ color: 0x5C5048, transparent: true, opacity: 0 });
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

// hallway-return — chandelier is built inside the dining table block below

// hallway — ceiling pendant  (room idx 4, ~620ms)
detail([
    [[0, 5.85, -0.8],[0, 5.2, -0.8]],
], 660);
addBulb(0, 5.05, -0.8, 660);

// bathroom — wall-mounted sink (open-top porcelain box, water inside)
{
    const sx = 3, sy = 3.30, sz = -1.45;
    const sw = 0.68, sh = 0.28, sd = 0.50;
    const sinkMeshes = [];
    const reg = (m, op) => {
        m.userData.baseOp = op; m.userData.targetOp = 0;
        allMeshes.push(m); scene.add(m); sinkMeshes.push(m); return m;
    };
    const mkFace = (col) => new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0, depthWrite: false
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

    // Back face (exterior, faces wall)
    const bface = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mkFace(0xB8B4AE));
    bface.rotation.y = Math.PI;
    bface.position.set(sx, sy, sz - sd / 2);
    reg(bface, 1.0).renderOrder = 3;

    // Inner back face — faces +Z (camera side), blocks wall colour showing through open top
    const bfaceInner = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mkFace(0xF2EEE9));
    bfaceInner.position.set(sx, sy, sz - sd / 2 + 0.01);
    reg(bfaceInner, 1.0).renderOrder = 3;

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
    [[3.0, 3.44, -1.70], [3.0, 3.72, -1.70]],
    [[2.92, 3.68, -1.70], [3.08, 3.68, -1.70]],
    [[3.0, 3.72, -1.70], [3.0, 3.76, -1.58], [3.0, 3.62, -1.45]],
], 740);

// bathroom — toilet (to the right of the sink)
{
    const bfy = 3.0; // bathroom floor y
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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

    const pC = 0xF4F0ED, pF = 0xEEEAE5, pS = 0xE8E4DF, pE = 0xC8C4BE;
    const tx = 3.66, tW = 0.40, tH = 0.40, tD = 0.52, tz = -1.48;

    // Toilet bowl/pedestal
    box(tx, bfy, tz, tW, tH, tD, pC, pF, pS, pE, 1.0);
    // Seat lid — slightly smaller, slightly forward
    box(tx, bfy + tH, tz + 0.02, tW - 0.02, 0.03, tD - 0.04, pC, pF, pS, pE, 1.0);
    // Tank against back wall
    const tkZ = tz - tD / 2 - 0.09;
    box(tx, bfy + tH, tkZ, tW - 0.02, 0.26, 0.18, pC, pF, pS, pE, 1.0);

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 740);
}

// ghost-return — living room (row 1, col 3): sofa + coffee table + rug
{
    const lx = 3, fy = 0; // room center x, floor world y
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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
    const sofaC = 0x8A7060, sofaE = 0x9A7858;

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
    box(lx, fy, sZ, sW, sH, sD, 0xD8C4B0, 0xCCAA88, 0xBBA880, sofaE, 1.0);

    // Accent pillow — slightly off-centre, resting on seat against backrest
    box(lx + 0.52, fy + sH, sZ - sD * 0.15, 0.36, 0.13, 0.26, 0xE4D8C8, 0xD8CCB8, 0xCCC0A8, 0xA89888, 1.0);

    // Backrest — top + front + sides
    box(lx, fy + sH, bZ, sW, bH, bD, 0xCCB8A4, 0xCCAA88, 0xBBA880, sofaE, 1.0);

    // Armrests — top + front + outer side + wireframe
    const aW = 0.13, aH = sH + bH * 0.65, aD = sD + bD;
    const aZc = sZ - bD / 2;
    for (const dx of [-(sW / 2 + aW / 2), (sW / 2 + aW / 2)]) {
        box(lx + dx, fy, aZc, aW, aH, aD, 0xE0CCBC, 0xBBA880, 0xCCAA88, sofaE, 1.0);
    }

    // Coffee table
    const ctW = 1.0, ctD = 0.45, ctH = 0.27;
    const ctZ = 0.68;

    const ctTop = new THREE.Mesh(new THREE.PlaneGeometry(ctW, ctD), face(0xC89858));
    ctTop.rotation.x = -Math.PI / 2;
    ctTop.position.set(lx, ctH, ctZ);
    reg(ctTop, 1.0).renderOrder = 3;

    const ctBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ctW, 0.05, ctD)), ln(0x9A7858));
    ctBox.position.set(lx, ctH, ctZ);
    reg(ctBox, 0.95).renderOrder = 3;

    // table legs
    for (const [dx, dz] of [[ctW/2-0.07, ctD/2-0.06],[ctW/2-0.07,-(ctD/2-0.06)],[-(ctW/2-0.07),ctD/2-0.06],[-(ctW/2-0.07),-(ctD/2-0.06)]]) {
        reg(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(lx + dx, fy, ctZ + dz),
                new THREE.Vector3(lx + dx, ctH - 0.03, ctZ + dz),
            ]), ln(0x9A7858)), 0.92).renderOrder = 3;
    }

    // small object (book) on table
    const book = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.28, 0.04, 0.18)), ln(0x5C3C20));
    book.position.set(lx + 0.22, ctH + 0.025, ctZ - 0.05);
    reg(book, 0.90).renderOrder = 3;

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 500);
}

// window-cracked (bedroom) — crack on large window
detail([
    [[-3.1, 8.38,BW],[-2.65,8.05,BW],[-2.45,8.28,BW],[-2.1,7.80,BW]],
], 820);

// hallway-return window crack — for "leave the window cracked" poem step
detail([
    [[-0.10, 1.90, BW],[0.16, 1.60, BW],[0.32, 1.76, BW]],
    [[0.16,  1.60, BW],[0.28, 1.44, BW]],
], 820);

// mirror room (row 2, col 1) — vanity + stool (mirror removed)
{
    const rx = -3, fy = 3;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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
    box(rx, fy, vZ, vW, vH, vD, 0xF0DEC0, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);

    // Drawer divider lines + knobs on front face
    const dz = vZ + vD / 2 + 0.005;
    for (const dy of [fy + vH * 0.33, fy + vH * 0.66]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx - vW/2 + 0.06, dy, dz),
            new THREE.Vector3(rx + vW/2 - 0.06, dy, dz),
        ]), ln(0xBBA880)), 0.88).renderOrder = 3;
    }
    for (const [kx, ky] of [[rx - 0.16, fy + vH*0.17],[rx + 0.16, fy + vH*0.17],[rx - 0.16, fy + vH*0.50],[rx + 0.16, fy + vH*0.50]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(kx - 0.025, ky, dz), new THREE.Vector3(kx + 0.025, ky, dz),
        ]), ln(0x9A7858)), 0.92).renderOrder = 3;
    }

    // Stool in front of vanity — full 3D box + legs
    const stH = 0.43, stW = 0.48, stZ = -0.82;
    box(rx, fy, stZ, stW, stH, stW, 0xF0DEC0, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);
    for (const [dx, dz2] of [[stW/2-0.06, stW/2-0.06],[stW/2-0.06,-(stW/2-0.06)],[-(stW/2-0.06),stW/2-0.06],[-(stW/2-0.06),-(stW/2-0.06)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy, stZ + dz2),
            new THREE.Vector3(rx + dx, fy + stH - 0.04, stZ + dz2),
        ]), ln(0x9A7858)), 0.90).renderOrder = 3;
    }

    // Items on vanity top
    const vtY = fy + vH;   // = 3.70
    const vtZ = vZ + 0.04; // slightly forward from centre

    // Perfume bottle — small blue-glass box + neck
    box(rx - 0.34, vtY, vtZ, 0.08, 0.13, 0.07, 0xC4DCF0, 0xA8C8E8, 0x90B8D8, 0x6890B8, 1.0);
    box(rx - 0.34, vtY + 0.13, vtZ, 0.04, 0.05, 0.04, 0xC4DCF0, 0xA8C8E8, 0x90B8D8, 0x6890B8, 1.0);

    // Round compact / powder box (shallow, golden-toned)
    box(rx + 0.08, vtY, vtZ, 0.12, 0.03, 0.12, 0xD4B870, 0xC0A450, 0xB09040, 0x907030, 1.0);

    // Jewellery — a small chain drape (lines)
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rx + 0.26, vtY + 0.01, vtZ - 0.06),
        new THREE.Vector3(rx + 0.34, vtY + 0.01, vtZ - 0.01),
        new THREE.Vector3(rx + 0.40, vtY + 0.01, vtZ + 0.05),
    ]), ln(0xC8A840)), 0.80).renderOrder = 3;

    // Small hairbrush outline (thin elongated box)
    box(rx - 0.08, vtY, vtZ - 0.06, 0.06, 0.02, 0.20, 0xC8B49A, 0xBBA880, 0xAA9870, 0x887850, 1.0);

    // Rug — dusty rose, spans floor
    const mrRug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), face(0xC0908A));
    mrRug.rotation.x = -Math.PI / 2; mrRug.position.set(rx, fy + 0.02, 0.0);
    mrRug.renderOrder = 2; reg(mrRug, 0.82);

    // Mirror on back wall above vanity
    {
        const mirW = 0.80, mirH = 0.90;
        const mirCY = fy + vH + mirH / 2 + 0.04;
        const mirZ  = -1.96;
        // Solid brown frame backing (sticks out beyond glass on all sides)
        // depthWrite:true so glass in front passes depth test; isFloor prevents promotion
        const mirBacking = new THREE.Mesh(
            new THREE.PlaneGeometry(mirW + 0.14, mirH + 0.14),
            new THREE.MeshBasicMaterial({ color: 0x7A5028, transparent: true, opacity: 0, depthWrite: true }));
        mirBacking.userData.isFloor = true;
        mirBacking.position.set(rx, mirCY, mirZ - 0.02);
        reg(mirBacking, 1.0).renderOrder = 2;
        // Glass surface — blueish-white, semi-opaque
        const mirGlass = new THREE.Mesh(new THREE.PlaneGeometry(mirW, mirH), face(0xD8ECF8));
        mirGlass.position.set(rx, mirCY, mirZ);
        reg(mirGlass, 0.80).renderOrder = 3;
    }

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 540);
}

// hallway (row 2, col 2) — kitchen: counter + stove + toaster + sink + upper cabinet
{
    const rx = 0, fy = 3;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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

    // Main counter along back wall
    const ctrW = 2.20, ctrH = 0.88, ctrD = 0.54;
    const ctrZ = -2 + ctrD / 2 + 0.08;
    box(rx, fy, ctrZ, ctrW, ctrH, ctrD, 0xE0D8C8, 0xCCC4B0, 0xC0B8A4, 0xA09880, 1.0);
    // Countertop overhang
    const ctop = new THREE.Mesh(new THREE.PlaneGeometry(ctrW + 0.04, ctrD + 0.04), face(0xD4C8B0));
    ctop.rotation.x = -Math.PI / 2; ctop.position.set(rx, fy + ctrH + 0.004, ctrZ);
    reg(ctop, 1.0).renderOrder = 3;

    // Stove — right portion of counter (dark top panel)
    const stX = rx + 0.50;
    const stTop = new THREE.Mesh(new THREE.PlaneGeometry(0.80, ctrD - 0.06), face(0x2E2A26));
    stTop.rotation.x = -Math.PI / 2; stTop.position.set(stX, fy + ctrH + 0.006, ctrZ);
    reg(stTop, 1.0).renderOrder = 3;
    // 4 burner rings (2×2 grid)
    for (const [bx, bz] of [[stX-0.17, ctrZ-0.12],[stX+0.17, ctrZ-0.12],[stX-0.17, ctrZ+0.12],[stX+0.17, ctrZ+0.12]]) {
        const rpts = [];
        for (let i = 0; i <= 10; i++) {
            const a = i / 10 * Math.PI * 2;
            rpts.push(new THREE.Vector3(bx + Math.cos(a)*0.09, fy + ctrH + 0.009, bz + Math.sin(a)*0.09));
        }
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rpts), ln(0x808070)), 0.90).renderOrder = 3;
        const irpts = [];
        for (let i = 0; i <= 8; i++) {
            const a = i / 8 * Math.PI * 2;
            irpts.push(new THREE.Vector3(bx + Math.cos(a)*0.045, fy + ctrH + 0.009, bz + Math.sin(a)*0.045));
        }
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints(irpts), ln(0x606058)), 0.78).renderOrder = 3;
    }
    // Oven door handle
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(stX - 0.28, fy + ctrH * 0.52, ctrZ + ctrD/2 + 0.005),
        new THREE.Vector3(stX + 0.28, fy + ctrH * 0.52, ctrZ + ctrD/2 + 0.005),
    ]), ln(0x9A9080)), 0.88).renderOrder = 3;

    // Toaster — left side of counter
    const tsX = rx - 0.52, tsZ = ctrZ + 0.03;
    const tsW = 0.22, tsH = 0.15, tsD = 0.17;
    box(tsX, fy + ctrH, tsZ, tsW, tsH, tsD, 0xC4BEB2, 0xB0ACA0, 0xA4A094, 0x7A7870, 1.0);
    // Toaster slots on top
    for (const dx of [-0.052, 0.052]) {
        const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.055, tsD - 0.05), face(0x222018));
        slot.rotation.x = -Math.PI / 2; slot.position.set(tsX + dx, fy + ctrH + tsH + 0.002, tsZ);
        reg(slot, 0.95).renderOrder = 4;
    }
    // Toaster lever
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tsX - tsW/2 - 0.01, fy + ctrH + tsH * 0.55, tsZ - 0.02),
        new THREE.Vector3(tsX - tsW/2 - 0.07, fy + ctrH + tsH * 0.18, tsZ - 0.02),
    ]), ln(0x686058)), 0.88).renderOrder = 3;

    // Sink basin (left-centre of counter)
    const snX = rx - 0.18;
    box(snX, fy + ctrH, ctrZ, 0.36, 0.07, 0.26, 0xD4D0C8, 0xC0BCBA, 0xB4B0A8, 0x888078, 0.85);
    const waterSurf = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), face(0x8ABFCF));
    waterSurf.rotation.x = -Math.PI / 2; waterSurf.position.set(snX, fy + ctrH + 0.04, ctrZ);
    reg(waterSurf, 0.45).renderOrder = 4;
    // Faucet
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(snX, fy + ctrH + 0.04, ctrZ - 0.13),
        new THREE.Vector3(snX, fy + ctrH + 0.34, ctrZ - 0.13),
        new THREE.Vector3(snX, fy + ctrH + 0.36, ctrZ - 0.05),
        new THREE.Vector3(snX, fy + ctrH + 0.34, ctrZ + 0.06),
    ]), ln(0xA89870)), 0.86).renderOrder = 3;

    // Upper cabinet against back wall
    const ucY = fy + 2.10, ucH = 0.60, ucW = 1.80, ucD = 0.26;
    box(rx, ucY, -2 + ucD/2 + 0.04, ucW, ucH, ucD, 0xDED8C8, 0xCCC6B4, 0xC0BAA8, 0xA09888, 1.0);
    for (const kx of [-ucW/4, ucW/4]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + kx, ucY + ucH * 0.15, -2 + ucD + 0.04),
            new THREE.Vector3(rx + kx, ucY + ucH * 0.85, -2 + ucD + 0.04),
        ]), ln(0xA09888)), 0.82).renderOrder = 3;
    }
    for (const kx of [-(ucW/4 - 0.14), (ucW/4 - 0.14)]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + kx - 0.04, ucY + ucH * 0.50, -2 + ucD + 0.04),
            new THREE.Vector3(rx + kx + 0.04, ucY + ucH * 0.50, -2 + ucD + 0.04),
        ]), ln(0x888070)), 0.88).renderOrder = 3;
    }

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 620);
}

// window-cracked (row 3, large room) — bedroom: bed + headboard + pillows + nightstand
{
    const rx = -1.5, fy = 6;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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
    box(rx, fy, bZ, bW, bFH, bL, 0x8A6030, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);

    // Mattress (cream) — top + front + sides, slightly inset
    box(rx, fy + bFH, bZ, bW - 0.12, mTH, bL - 0.12, 0xF4EEE4, 0xC8BEB4, 0xB8AEA4, 0xA09890, 1.0);

    // Headboard — full 3D slab against back wall
    const hdH = 0.62, hdD = 0.12;
    const hdZ = bZ - bL / 2 - hdD / 2 - 0.01;
    box(rx, fy + bFH, hdZ, bW, hdH, hdD, 0x9A7040, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);

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
    box(nsX, fy, nsZ, 0.50, nsH, 0.44, 0xD4A870, 0xBBA880, 0xBBA880, 0x9A7858, 1.0);

    // Lamp on nightstand
    const lamp = reg(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.13, 0.09, 0.26, 6)), ln(0x9A7840)), 0.86);
    lamp.position.set(nsX, fy + nsH + 0.13, nsZ - 0.06);
    lamp.renderOrder = 3;

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 800);
}


// entrance (row 1, col 1) — doormat + shoes  (~320ms)
{
    const rx = -3, fy = 0;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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

    // Doormat near the door
    const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.60, 0.38), face(0x786054));
    matMesh.rotation.x = -Math.PI / 2;
    matMesh.position.set(rx, fy + 0.01, -1.62);
    matMesh.renderOrder = 2;
    reg(matMesh, 0.82);

    // Pair of shoes beside mat (right side of door)
    box(rx + 0.38, fy, -1.62, 0.09, 0.07, 0.24, 0x505048, 0x404038, 0x383830, 0x282828, 0.86);
    box(rx + 0.52, fy, -1.56, 0.09, 0.07, 0.24, 0x505048, 0x404038, 0x383830, 0x282828, 0.84);

    // Umbrella leaning against wall (left of door)
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rx - 0.28, fy + 0.02, -1.92),
        new THREE.Vector3(rx - 0.24, fy + 0.76, -1.74),
    ]), ln(0x485848)), 0.80).renderOrder = 3;
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rx - 0.38, fy + 0.76, -1.74),
        new THREE.Vector3(rx - 0.24, fy + 0.80, -1.68),
        new THREE.Vector3(rx - 0.10, fy + 0.76, -1.74),
    ]), ln(0x485848)), 0.78).renderOrder = 3;

    // Small key tray on wall ledge beside door
    box(rx + 0.54, fy + 1.08, -1.93, 0.24, 0.04, 0.10, 0xC8C0B0, 0xBBB0A0, 0xADA494, 0x908878, 0.82);

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 320);
}

// hallway-return (row 1, col 2) — dining table + chairs  (~480ms)
{
    const rx = 0, fy = 0;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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

    // Rug under table
    const dtRug = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), face(0xA89080));
    dtRug.rotation.x = -Math.PI / 2; dtRug.position.set(rx, fy + 0.02, -0.30);
    dtRug.renderOrder = 2; reg(dtRug, 0.78);

    // Dining table — wider and proportional
    const tW = 1.30, tH = 0.62, tD = 0.72, tZ = -0.30;
    box(rx, fy, tZ, tW, tH, tD, 0xECD8B8, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);
    for (const [dx, dz] of [[tW/2-0.09, tD/2-0.08],[tW/2-0.09,-(tD/2-0.08)],[-(tW/2-0.09),tD/2-0.08],[-(tW/2-0.09),-(tD/2-0.08)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy, tZ + dz),
            new THREE.Vector3(rx + dx, fy + tH - 0.03, tZ + dz),
        ]), ln(0x9A7858)), 0.90).renderOrder = 3;
    }

    // Candle centrepiece
    box(rx, fy + tH, tZ, 0.05, 0.14, 0.05, 0xF8F0DC, 0xEDE4C8, 0xE4DCB8, 0xB8B090, 1.0);
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rx,        fy + tH + 0.14, tZ),
        new THREE.Vector3(rx + 0.01, fy + tH + 0.22, tZ),
    ]), ln(0xF0A040)), 0.78).renderOrder = 3;

    // Chairs — seat raised on legs so top sits at ~0.44m (tH - small gap)
    const legH = 0.38, cW = 0.44, cSH = 0.08, cD = 0.40, cbH = 0.34, cbD = 0.07;
    const cTop = 0xD8C8B4, cFront = 0xCCAA88, cSide = 0xBBA880, cEdge = 0x9A7858;

    // Front chair — person faces –Z toward table, backrest at +Z edge
    const czF = tZ + tD / 2 + 0.38;
    box(rx, fy + legH, czF, cW, cSH, cD, cTop, cFront, cSide, cEdge, 1.0);
    box(rx, fy + legH + cSH, czF + cD / 2 - cbD / 2, cW, cbH, cbD, cTop, cFront, cSide, cEdge, 1.0);
    for (const [dx, dz] of [[cW/2-0.05,cD/2-0.04],[cW/2-0.05,-(cD/2-0.04)],[-(cW/2-0.05),cD/2-0.04],[-(cW/2-0.05),-(cD/2-0.04)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy,        czF + dz),
            new THREE.Vector3(rx + dx, fy + legH, czF + dz),
        ]), ln(cEdge)), 0.86).renderOrder = 3;
    }

    // Back chair — person faces +Z toward table, backrest at –Z edge
    const czB = tZ - tD / 2 - 0.35;
    box(rx, fy + legH, czB, cW, cSH, cD, cTop, cFront, cSide, cEdge, 1.0);
    box(rx, fy + legH + cSH, czB - cD / 2 + cbD / 2, cW, cbH, cbD, cTop, cFront, cSide, cEdge, 1.0);
    for (const [dx, dz] of [[cW/2-0.05,cD/2-0.04],[cW/2-0.05,-(cD/2-0.04)],[-(cW/2-0.05),cD/2-0.04],[-(cW/2-0.05),-(cD/2-0.04)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy,        czB + dz),
            new THREE.Vector3(rx + dx, fy + legH, czB + dz),
        ]), ln(cEdge)), 0.86).renderOrder = 3;
    }

    // Chandelier above dining table
    {
        const cx = rx, cz = tZ;
        const hy    = 2.85;      // ceiling hook
        const hubY  = 2.10;      // crown hub
        const armY  = 1.88;      // arm tips
        const aR    = 0.42;      // horizontal arm reach
        const dropY = 1.42;      // pendant drop bottoms (0.80 above table top)
        const centY = 1.30;      // central crystal tip
        const gold  = 0xA8862A;  // brass/gold

        // Suspension rod ceiling → hub
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(cx, hy, cz), new THREE.Vector3(cx, hubY, cz),
        ]), ln(gold)), 0.90).renderOrder = 4;

        // Hub crown ring (12-sided horizontal polygon)
        const hubPts = [];
        for (let i = 0; i <= 12; i++) {
            const a = i / 12 * Math.PI * 2;
            hubPts.push(new THREE.Vector3(cx + Math.cos(a) * 0.16, hubY, cz + Math.sin(a) * 0.16));
        }
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hubPts), ln(gold)), 0.90).renderOrder = 4;

        // 4 arms radiating outward and slightly downward
        for (const [dx, dz] of [[aR, 0], [-aR, 0], [0, aR], [0, -aR]]) {
            reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(cx, hubY, cz), new THREE.Vector3(cx + dx, armY, cz + dz),
            ]), ln(gold)), 0.90).renderOrder = 4;
        }

        // Decorative outer ring at arm-tip height
        const outerPts = [];
        for (let i = 0; i <= 16; i++) {
            const a = i / 16 * Math.PI * 2;
            outerPts.push(new THREE.Vector3(cx + Math.cos(a) * aR * 0.85, armY, cz + Math.sin(a) * aR * 0.85));
        }
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outerPts), ln(gold)), 0.90).renderOrder = 4;

        // Bobeche cups at each arm tip (small horizontal ring)
        for (const [dx, dz] of [[aR, 0], [-aR, 0], [0, aR], [0, -aR]]) {
            const bPts = [];
            for (let i = 0; i <= 8; i++) {
                const a = i / 8 * Math.PI * 2;
                bPts.push(new THREE.Vector3(cx + dx + Math.cos(a) * 0.055, armY, cz + dz + Math.sin(a) * 0.055));
            }
            reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints(bPts), ln(gold)), 0.88).renderOrder = 4;
        }

        // Pendant chains hanging from each arm tip
        for (const [dx, dz] of [[aR, 0], [-aR, 0], [0, aR], [0, -aR]]) {
            reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(cx + dx, armY, cz + dz), new THREE.Vector3(cx + dx, dropY, cz + dz),
            ]), ln(gold)), 0.90).renderOrder = 4;
        }

        // Central pendant rod from hub
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(cx, hubY, cz), new THREE.Vector3(cx, centY + 0.10, cz),
        ]), ln(gold)), 0.90).renderOrder = 4;

        // Crystal teardrop: 4 facet lines converging to a tip
        const crR = 0.065, tipY = centY - 0.08;
        for (let i = 0; i < 4; i++) {
            const a = i / 4 * Math.PI * 2;
            reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(cx + Math.cos(a) * crR, centY + 0.10, cz + Math.sin(a) * crR),
                new THREE.Vector3(cx, tipY, cz),
            ]), ln(gold)), 0.85).renderOrder = 4;
        }

        // Glowing bulbs: 4 pendant tips + 1 central crystal
        const mkBulb = (bx, by, bz, r = 0.09) => {
            const m = new THREE.Mesh(
                new THREE.SphereGeometry(r, 8, 6),
                new THREE.MeshBasicMaterial({ color: 0xffeaa0, transparent: true, opacity: 0 })
            );
            m.position.set(bx, by, bz);
            reg(m, 0.92).renderOrder = 4;
        };
        mkBulb(cx + aR, dropY - 0.04, cz);
        mkBulb(cx - aR, dropY - 0.04, cz);
        mkBulb(cx, dropY - 0.04, cz + aR);
        mkBulb(cx, dropY - 0.04, cz - aR);
        mkBulb(cx, centY - 0.04, cz, 0.07);
    }

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 480);
}

// window (row 3, col 3) — study desk + books + lamp + chair  (~840ms)
{
    const rx = 3, fy = 6;
    const face = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false });
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

    // Desk against back wall
    const dW = 0.88, dH = 0.74, dD = 0.40;
    const dZ = -2 + dD / 2 + 0.12;   // = -1.68
    box(rx, fy, dZ, dW, dH, dD, 0xD4C090, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);
    for (const [dx, dz2] of [[dW/2-0.06,dD/2-0.05],[dW/2-0.06,-(dD/2-0.05)],[-(dW/2-0.06),dD/2-0.05],[-(dW/2-0.06),-(dD/2-0.05)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy,            dZ + dz2),
            new THREE.Vector3(rx + dx, fy + dH - 0.03, dZ + dz2),
        ]), ln(0x9A7858)), 0.88).renderOrder = 3;
    }

    // Stacked books (left of desk)
    box(rx - 0.20, fy + dH,        dZ, 0.26, 0.06, 0.20, 0x7888A8, 0x6878A0, 0x586890, 0x485878, 1.0);
    box(rx - 0.20, fy + dH + 0.06, dZ, 0.26, 0.05, 0.18, 0x9E7850, 0x886040, 0x785030, 0x604030, 1.0);
    box(rx - 0.20, fy + dH + 0.11, dZ, 0.22, 0.04, 0.16, 0x688068, 0x587058, 0x486048, 0x385038, 1.0);

    // Open notebook on desk (centre)
    box(rx + 0.08, fy + dH, dZ + 0.04, 0.30, 0.015, 0.22, 0xF4F0E8, 0xECE8E0, 0xE4E0D8, 0xC0B8A8, 1.0);

    // Pencil cup
    const cupE = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.042, 0.036, 0.12, 7)),
        ln(0x9A8870));
    cupE.position.set(rx + 0.30, fy + dH + 0.06, dZ);
    reg(cupE, 0.86).renderOrder = 3;

    // Desk lamp — stem + shade
    reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(rx + 0.26, fy + dH,        dZ - 0.06),
        new THREE.Vector3(rx + 0.26, fy + dH + 0.30, dZ - 0.06),
        new THREE.Vector3(rx + 0.10, fy + dH + 0.34, dZ + 0.02),
    ]), ln(0x8A7858)), 0.84).renderOrder = 3;
    const lampShade = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.06, 0.10, 0.08, 6)),
        ln(0xD4C890));
    lampShade.position.set(rx + 0.10, fy + dH + 0.34, dZ + 0.02);
    reg(lampShade, 0.88).renderOrder = 3;

    // Chair in front of desk — person faces –Z toward desk
    const legH = 0.38, cW = 0.42, cSH = 0.08, cD = 0.38, cbH = 0.30, cbD = 0.06;
    const czC = dZ + dD / 2 + 0.34;
    box(rx, fy + legH, czC, cW, cSH, cD, 0xD4C0A8, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);
    // Backrest at +Z edge (behind person, faces camera)
    box(rx, fy + legH + cSH, czC + cD / 2 - cbD / 2, cW, cbH, cbD, 0xC8B498, 0xCCAA88, 0xBBA880, 0x9A7858, 1.0);
    for (const [dx, dz2] of [[cW/2-0.05,cD/2-0.04],[cW/2-0.05,-(cD/2-0.04)],[-(cW/2-0.05),cD/2-0.04],[-(cW/2-0.05),-(cD/2-0.04)]]) {
        reg(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(rx + dx, fy,        czC + dz2),
            new THREE.Vector3(rx + dx, fy + legH, czC + dz2),
        ]), ln(0x9A7858)), 0.86).renderOrder = 3;
    }

    // Photo frame on back wall above desk
    const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.26, 0.20, 0.02)), ln(0x9A7858));
    frame.position.set(rx, fy + dH + 0.10, -1.97);
    reg(frame, 0.78).renderOrder = 3;
    const frameFill = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.14), face(0xD0C8B8));
    frameFill.position.set(rx, fy + dH + 0.10, -1.96);
    reg(frameFill, 0.68).renderOrder = 3;

    setTimeout(() => items.forEach(m => { m.userData.targetOp = m.userData.baseOp; }), 840);
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

    if (step === -1) hint.classList.add('hidden');

    // Restore previous room
    if (step >= 0 && step < SEQUENCE.length) {
        const oldId = SEQUENCE[step];
        textBlocks[oldId].className = 'poem-block visited';
        setRoomOpaque(ROOM_HIGHLIGHT[oldId] || oldId);
    }

    step = clamped;
    const id     = SEQUENCE[step];
    const isLast = step === SEQUENCE.length - 1;

    // Smooth sky transition — glass will mirror the background colour in animate()
    const isDark = SCENE_BG[id] !== undefined;
    bgTarget.setHex(isDark ? SCENE_BG[id] : 0xCCE8F8);

    // Stars appear once it's truly dark (ghost-silhouette) and persist
    if (id === 'ghost-silhouette') nightStars.forEach(m => { m.userData.targetOp = m.userData.baseOp; });

    // Ghost figure appears at ghost-silhouette and persists
    if (id === 'ghost-silhouette') ghostFigureMeshes.forEach(m => { m.userData.targetOp = m.userData.baseOp; });

    if (isLast) {
        textBlocks[id].className = 'poem-block visited';
    } else {
        textBlocks[id].className = 'poem-block active';
        setRoomTranslucent(ROOM_HIGHLIGHT[id] || id);
    }

    const look = ROOM_LOOK_AT[id] || TARGET;
    camTo(ROOM_CAMERAS[id] || new THREE.Vector3(0, 6, 18), 0.035, look);
    if (isLast) setTimeout(() => camTo(OVERVIEW_CAM, 0.018, TARGET), 1400);

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

let camFrom  = camera.position.clone();
let camTo_   = camera.position.clone();
let lookFrom = TARGET.clone();
let lookTo_  = TARGET.clone();
let lookCur  = TARGET.clone();
let camT     = 1;
let camSpeed = 0.035;
const eio    = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;

function camTo(pos, speed = 0.035, look = TARGET) {
    camFrom  = camera.position.clone();
    camTo_   = pos.clone();
    lookFrom = lookCur.clone();
    lookTo_  = look.clone();
    camT     = 0;
    camSpeed = speed;
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
        lookCur.lerpVectors(lookFrom, lookTo_, eio(camT));
        camera.lookAt(lookCur);
    }

    // Smooth background + glass colour transitions
    scene.background.lerp(bgTarget, 0.025);
    allGlassPanes.forEach(g => g.material.color.copy(scene.background));

    // Opacity lerp for all meshes; promote to opaque pass once fully faded in
    allMeshes.forEach(m => {
        const t = m.userData.targetOp ?? 0;
        const d = t - m.material.opacity;
        if (Math.abs(d) > 0.001) {
            m.material.opacity += d * 0.075;
        } else if (m.material.transparent && m.material.opacity >= 0.999 && m.material.depthTest !== false && !m.userData.isRoof && !m.userData.isFloor && !m.userData.isGlass) {
            m.material.transparent = false;
            m.material.depthWrite = true;
            m.material.needsUpdate = true;
        }
    });

    renderer.render(scene, camera);
}

animate();
