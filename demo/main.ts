import {
  AmbientLight,
  Box3,
  Box3Helper,
  Color,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Mesh,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { World } from 'flit';

// Load testing: ?n=8000 cranks the ball count (clamped to [1, 20000]).
const params = new URLSearchParams(location.search);
const COUNT = Math.min(Math.max(Number(params.get('n')) || 220, 1), 20000);
const DT = 1 / 60;
const BOX = {
  min: [-9, 0, -9] as [number, number, number],
  max: [9, 12, 9] as [number, number, number],
};

// ---------- physics ----------
const world = new World({ restitution: 0.62, groundY: 0, bounds: BOX });
for (let i = 0; i < COUNT; i += 1) {
  const radius = 0.28 + Math.random() * 0.22;
  world.addParticle({
    position: [(Math.random() - 0.5) * 14, 4 + Math.random() * 8, (Math.random() - 0.5) * 14],
    velocity: [(Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 6],
    radius,
    mass: radius ** 3, // density ~1: big balls push small balls around
  });
}

// ---------- rendering ----------
const scene = new Scene();
scene.background = new Color(0x0b0e14);

const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(16, 11, 16);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;

scene.add(new AmbientLight(0xffffff, 0.45));
const sun = new DirectionalLight(0xffffff, 1.4);
sun.position.set(8, 16, 6);
scene.add(sun);

const floor = new Mesh(
  new PlaneGeometry(18.4, 18.4),
  new MeshStandardMaterial({ color: 0x1d2433, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

scene.add(
  new Box3Helper(
    new Box3(new Vector3(...BOX.min), new Vector3(...BOX.max)),
    new Color(0x33415c),
  ),
);

// Drop mesh detail at high counts so load tests aren't trivially GPU-bound.
const segments = COUNT > 2000 ? { w: 10, h: 7 } : { w: 20, h: 14 };
const balls = new InstancedMesh(
  new SphereGeometry(1, segments.w, segments.h),
  new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }),
  COUNT,
);
const palette = new Color();
for (let i = 0; i < COUNT; i += 1) {
  palette.setHSL(0.35 + 0.35 * ((i * 7) % COUNT) / COUNT, 0.7, 0.55);
  balls.setColorAt(i, palette);
}
scene.add(balls);

const _matrix = new Matrix4();
function syncInstances(): void {
  const { positions } = world;
  for (let i = 0; i < world.count; i += 1) {
    const r = world.radiusOf(i);
    _matrix.makeScale(r, r, r);
    _matrix.setPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    balls.setMatrixAt(i, _matrix);
  }
  balls.instanceMatrix.needsUpdate = true;
}

// ---------- main loop: fixed-step physics with an accumulator ----------
const hud = document.getElementById('hud')!;
let accumulator = 0;
let last = performance.now();
let stepMs = 0;
let frameMs = 16.7;
let frame = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const frameDelta = now - last;
  accumulator += Math.min(frameDelta / 1000, 0.1); // clamp long tab-outs
  last = now;
  frameMs = frameMs * 0.95 + frameDelta * 0.05; // smoothed, for fps

  while (accumulator >= DT) {
    const t0 = performance.now();
    world.step(DT);
    stepMs = stepMs * 0.95 + (performance.now() - t0) * 0.05; // smoothed
    accumulator -= DT;
  }

  syncInstances();
  controls.update();
  renderer.render(scene, camera);

  frame += 1;
  if (frame % 15 === 0) {
    hud.textContent =
      `flit demo | ${world.count} balls | ${(1000 / frameMs).toFixed(0)} fps | ` +
      `step ${stepMs.toFixed(3)} ms\n?n=8000 to load test | drag to orbit, wheel to zoom`;
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
