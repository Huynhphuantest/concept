import * as THREE from 'three';
import { Lifecycle, scene, UNIFORMS } from '../main';

const allParticles = new Set<Particle>();
Lifecycle.onUpdate(() => {
  allParticles.forEach(e => e.onUpdate(UNIFORMS.delta.value));
})
export class Particle {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  max: number;

  private particles: ParticleState[];
  private dummy = new THREE.Object3D();
  private modules: Module[];
  private destroyRule: DestroyRule;
  private instanceColorArray: Float32Array;

  constructor(
    geometry: THREE.BufferGeometry,
    color: THREE.Vector4,
    modules: Module[] = [],
    max: number = 16
  ) {
    this.max = max;
    this.geometry = geometry;
    this.instanceColorArray = new Float32Array(this.max * 4);
    for(let i = 0; i < this.max; i++) {
      const stride = i * 4;
      this.instanceColorArray[stride    ] = color.x;
      this.instanceColorArray[stride + 1] = color.y;
      this.instanceColorArray[stride + 2] = color.z;
      this.instanceColorArray[stride + 3] = color.w;
    }
    geometry.setAttribute(
      'instanceColor',
      new THREE.InstancedBufferAttribute(this.instanceColorArray, 4)
    );
    this.material = new THREE.ShaderMaterial({
      fragmentShader:`
        precision mediump float;
        varying vec4 vColor;

        void main() {
            gl_FragColor = vColor;
        }
      `,
      vertexShader:`
        attribute vec4 instanceColor;
        varying vec4 vColor;

        void main() {
            vColor = instanceColor;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `, transparent: true
    });
    this.modules = modules;
    this.particles = [];
    allParticles.add(this);

    this.destroyRule = modules.find(m => m.type === 'destroy') as DestroyRule || [];

    for (let i = 0; i < max; i++) {
      this.particles.push(createDefaultParticle());
    }

    this.mesh = new THREE.InstancedMesh(geometry, this.material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  start(options?: Partial<ParticleInit>) {
    const index = this.particles.findIndex(p => !p.alive);
    if (index === -1) return;

    const p = this.particles[index];
    p.alive = true;
    p.age = 0;
    p.lifetime = options?.lifetime ?? 5;
    p.spawnCount = 0;

    p.transform = {
      position: options?.position?.clone() ?? new THREE.Vector3(),
      rotation: options?.rotation?.clone() ?? new THREE.Euler(),
      scale: options?.scale?.clone() ?? new THREE.Vector3(1, 1, 1),
    };

    p.color = {
      r: 1, g: 1, b: 1, a: 1
    };

    for (const m of this.modules) {
      m.start?.(p);
    }
  }

  onUpdate(dt: number) {
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.age += dt;

      for (const m of this.modules) {
        m.overtime?.(p, dt);
      }

      if (p.age >= p.lifetime) p.alive = false;

      if (p.alive) {
        this.dummy.position.copy(p.transform.position);
        this.dummy.rotation.copy(p.transform.rotation);
        this.dummy.scale.copy(p.transform.scale);

        // Set color
        const { r, g, b } = p.color;
        const a = p.color.a ?? 1;
        this.instanceColorArray.set([r, g, b, a], i * 4);
      } else {
        this.dummy.scale.set(0, 0, 0);
        this.instanceColorArray.set([0, 0, 0, 0], i * 4)
      }

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;

    const colorAttr = this.mesh.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
    colorAttr.needsUpdate = true;

    if (this.destroyRule.check?.(this.particles)) {
      scene.remove(this.mesh);
    }
  }
}

function createDefaultParticle(): ParticleState {
  return {
    alive: false,
    age: 0,
    lifetime: 5,
    spawnCount: 0,
    transform: {
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1)
    },
    color: { r: 1, g: 1, b: 1, a: 1 }
  };
}

// === Modules ===

export function Transform() {
  let startFn: (t: TransformData) => void = () => {};
  let overtimeFn: (t: TransformData, dt: number) => void = () => {};

  return {
    type: 'transform',
    start(p: ParticleState) { startFn(p.transform); },
    overtime(p: ParticleState, dt: number) { overtimeFn(p.transform, dt); },
    startFn(fn: (t: TransformData) => void) { startFn = fn; return this; },
    overtimeFn(fn: (t: TransformData, dt: number) => void) { overtimeFn = fn; return this; }
  };
}

export function Color() {
  let startFn: (c: ColorData) => void = () => {};
  let overtimeFn: (c: ColorData, dt: number) => void = () => {};

  return {
    type: 'color',
    start(p: ParticleState) { startFn(p.color); },
    overtime(p: ParticleState, dt: number) { overtimeFn(p.color, dt); },
    startFn(fn: (c: ColorData) => void) { startFn = fn; return this; },
    overtimeFn(fn: (c: ColorData, dt: number) => void) { overtimeFn = fn; return this; }
  };
}

export function Fade(
  duration: number = 1,
  curve: (t: number) => number = t => t,
  onFade?: DestroyRule
) {
  return {
    type: 'fade',
    //@ts-ignore
    overtime(p: ParticleState, dt: number) {
      const t = Math.min(1, p.age / duration);
      const alpha = 1 - curve(t);
      p.color.a = alpha;
      if (alpha <= 0) {
        p.alive = false;
        onFade?.check?.([p]);
      }
    }
  };
}

export function Emitter(rate: number = 1, stopRule?: DestroyRule) {
  let time = 0;

  return {
    type: 'emitter',
    overtime(p: ParticleState, dt: number) {
      time += dt;
      if (time >= rate) {
        time = 0;
        p.spawnCount++;
        if (stopRule?.check?.([p])) p.alive = false;
      }
    }
  };
}

// === Destroy rules ===

export const DESTROY = {
  type: 'destroy',
  //@ts-ignore
  check(particles: ParticleState[]) {
    return true;
  }
};

export const DESTROY_AFTER_EMPTY = {
  type: 'destroy',
  check(particles: ParticleState[]) {
    return particles.every(p => !p.alive);
  }
};

export function DESTROY_AFTER_TIME(time: number) {
  return {
    type: 'destroy',
    check(particles: ParticleState[]) {
      return particles.every(p => !p.alive || p.age >= time);
    }
  };
}

export function DESTROY_AFTER_SPAWN(amount: number) {
  return {
    type: 'destroy',
    check(particles: ParticleState[]) {
      return particles.every(p => !p.alive || p.spawnCount >= amount);
    }
  };
}

// === Types ===

export interface ParticleInit {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  lifetime: number;
}

export interface TransformData {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export interface ColorData {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ParticleState {
  alive: boolean;
  age: number;
  lifetime: number;
  spawnCount: number;
  transform: TransformData;
  color: ColorData;
}

export interface Module {
  type: string;
  start?(p: ParticleState): void;
  overtime?(p: ParticleState, dt: number): void;
}

export interface DestroyRule extends Module {
  check(particles: ParticleState[]): boolean;
}

export const ParticleSystem = {
  Transform,
  Color,
  Fade,
  Emitter,
  DESTROY,
  DESTROY_AFTER_EMPTY,
  DESTROY_AFTER_TIME,
  DESTROY_AFTER_SPAWN
};