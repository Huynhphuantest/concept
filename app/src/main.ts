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
export const Time = {
  now: 0,
  delta: 0,
}
export const TimeFunction:Record<string, (t:number) => number> = {
  Linear: (t) => t,
  EaseOut: (t) => Math.sqrt(t),
  EaseOutTri: (t) => Math.sqrt(Math.sqrt(t)),
  EaseIn: (t) => t * t,
  EaseInTri: (t) => t * t * t,
  EaseInOut: (t) => {
    if(t <= 0.5) return 2.0 * t * t; t -= 0.5; return 2.0 * t * (1.0 - t) + 0.5;
  },
  EaseOutOvershoot(t: number) {
    const s = 1.70158; // overshoot amount
    t -= 1;
    return t * t * ((s + 1) * t + s) + 1;
  }
}

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
const entitiesPanel = stats.addPanel(new Stats.Panel('ENT', '#ff8', '#221'));
const drawCallsPanel = stats.addPanel(new Stats.Panel('DRW', '#8ff', '#122'));
export class Delay {
  private resolve!: () => void;
  private elapsed:number;
  constructor(public callback:() => void, public duration:number) {
    this.elapsed = 0;
    this.start();
  }
  jump() { this.callback(); this.resolve(); }
  interrupt() { this.resolve(); }
  reset() { this.elapsed = 0 }
  start() {
    this.resolve = Lifecycle.onUpdate(() => {
      this.elapsed += Time.delta;
      if(this.elapsed > this.duration) this.jump();
    });
  }
}
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
  /**@param duration - seconds */
  static delay(callback:() => void, duration:number):Delay {
    let elapsed = 0;
    const resolve = Lifecycle.onUpdate(() => {
      elapsed += Time.delta;
      if(elapsed > duration) {
        callback();
        resolve();
      }
    });
    return new Delay(callback, duration);
  }
  /**@param duration - seconds */
  static halt(duration:number):Promise<void> {
    return new Promise(r => Lifecycle.delay(r, duration));
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
    UNIFORMS.time.value = performance.now() / 1000;
  }
});
const fps = 60;
function render() {
  const now = performance.now() / 1000;
  const dt = now - UNIFORMS.time.value;
  //if (dt < 1 / fps) return requestAnimationFrame(render);
  UNIFORMS.delta.value = dt;
  Time.delta = dt;
  
  UNIFORMS.time.value = now;
  Time.now = now;

  
  stats.begin();
  Input.update();
  System.update(dt);
  
  Lifecycle.runUpdate();
  world.step();
  
  
  System.render();
  Lifecycle.runRender();
  renderer.render(scene, camera);
  stats.end();

  entitiesPanel.update(System.entities.size, 500); // (value, maxValue for graph)
  drawCallsPanel.update(renderer.info.render.calls, 1000);
  requestAnimationFrame(render);
}

run();


setTimeout(() => {
    const setup = import('./setup');
    setup.then(e => e.setup(scene)) 
});