import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import Stats from 'stats.js';
import Noise from 'noisejs';
import { Input } from './system/Input';
import { System } from './system/ECS';

export const UNIFORMS = {
  time: { value: 0 },
  delta: { value: 0}
};

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  alpha:true,
  premultipliedAlpha:true
});
export const world = new RAPIER.World(new RAPIER.Vector3(0, -90, 0));
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(110, 1, 0.1, 2000);
export const NOISE = new (Noise as any).Noise() as Noise;

const stats = new Stats();
const drawCallDom = document.getElementById("draw-call")!;

// === Lifecycle system ===
export class Lifecycle {
  private static updateCallbacks = new Set<() => void>();
  private static renderCallbacks = new Set<() => void>();
  static onUpdate(fn: () => void) {
    this.updateCallbacks.add(fn);
    return () => this.updateCallbacks.delete(fn);
  }
  static onRender(fn: () => void) {
    this.renderCallbacks.add(fn);
    return () => this.renderCallbacks.delete(fn);
  }
  static remove(fn: () => void) {
    this.updateCallbacks.delete(fn);
    this.renderCallbacks.delete(fn);
  }
  static runUpdate() {
    this.updateCallbacks.forEach(fn => fn());
  }
  static runRender() {
    this.renderCallbacks.forEach(fn => fn());
  }
  static clearAll() {
    this.updateCallbacks.clear();
    this.renderCallbacks.clear();
  }
}

// === Main setup ===
async function run() {
  NOISE.seed(Math.PI);
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  Input.initialize();
  renderer.setPixelRatio(window.devicePixelRatio);

  const dom = document.body;
  const resize = () => {
    const dimension = dom.getBoundingClientRect();
    renderer.setSize(dimension.width, dimension.height);
    camera.aspect = dimension.width / dimension.height;
    camera.updateProjectionMatrix();
  };

  resize();
  window.addEventListener("resize", resize);
  dom.appendChild(renderer.domElement);
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    UNIFORMS.time.value = performance.now();
  }
});
const fps = 60;
function render() {
  const now = performance.now();
  const dt = (now - UNIFORMS.time.value) / 1000;
  if (dt < 1 / fps) {
    requestAnimationFrame(render);
    return;
  }
  UNIFORMS.delta.value = dt;

  UNIFORMS.time.value = now;

  stats.begin();

  Input.update();
  System.update(dt);
  
  Lifecycle.runUpdate();
  world.step();


  System.render();
  Lifecycle.runRender();
  renderer.render(scene, camera);

  stats.end();
  drawCallDom.innerText = `${renderer.info.render.calls}`;
  requestAnimationFrame(render);
}

run();


setTimeout(() => {
    const setup = import('./setup');
    setup.then(e => e.setup(scene)) 
});