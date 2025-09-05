import * as THREE from "three";
import { scene } from "../main";

const DEFAULT_INSTANCE_POOL_GROW = 10;

export class InstancePool {
  mesh: THREE.InstancedMesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.Material | THREE.Material[];
  private available: number[] = []; // freed indices
  private count = 0;                // how many have *ever* been allocated
  defaultGrowSize:number;
  max: number;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    max = 1,
    defaultGrowSize = DEFAULT_INSTANCE_POOL_GROW
  ) {
    this.defaultGrowSize = defaultGrowSize;
    this.geometry = geometry;
    this.material = material;
    this.max = Math.max(1, max);
    this.mesh = new THREE.InstancedMesh(geometry, material, this.max);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.mesh.count = 0;
  }
  getMatrix(i:number) {
    const matrix = new THREE.Matrix4();
    this.mesh.getMatrixAt(i, matrix);
    return matrix;
  }
  setMatrix(i:number, matrix:THREE.Matrix4) {
    this.mesh.setMatrixAt(i, matrix);
  }
  needUpdate(val:boolean) {
    this.mesh.instanceMatrix.needsUpdate = val;
  }
  /** Allocate a new instance index. Auto-grows if needed. */
  request(): number {
    // Reuse a freed slot first
    if (this.available.length > 0) {
      const i = this.available.pop()!;
      this.mesh.count = Math.max(this.mesh.count, i + 1);
      return i;
    }

    // Grow capacity if needed
    if (this.count >= this.max) {
      this.expect(this.defaultGrowSize);
    }

    const i = this.count++;
    this.mesh.count = this.count;
    return i;
  }

  /** Free an index, making it available for reuse. */
  destroy(i: number): number {
    if (i < 0 || i >= this.count) return -1;
    this.available.push(i);
    this.setMatrix(i, new THREE.Matrix4().set(
      0,0,0,0,
      0,0,0,0,
      0,0,0,0,
      0,0,0,0
    ));
    // Do NOT shrink mesh.count here, keeps other indices stable
    return i;
  }

  /** Increase capacity by `amount`. Keeps old transforms. */
  expect(amount: number): number {
    const newMax = this.max + amount;
    const newMesh = new THREE.InstancedMesh(this.geometry, this.material, newMax);

    const tmp = new THREE.Matrix4();
    for (let i = 0; i < this.count; i++) {
      this.mesh.getMatrixAt(i, tmp);
      newMesh.setMatrixAt(i, tmp);
    }

    newMesh.count = this.mesh.count;

    if (this.mesh.parent) {
      const parent = this.mesh.parent;
      parent.remove(this.mesh);
      parent.add(newMesh);
    }

    this.mesh.dispose();
    this.mesh = newMesh;
    this.max = newMax;
    return this.max;
  }

  /** Reduce max capacity (may drop instances). */
  reduce(amount: number) {
    const newMax = Math.max(1, this.max - amount);

    if (newMax >= this.count) {
      this.max = newMax;
      return;
    }

    const newMesh = new THREE.InstancedMesh(this.geometry, this.material, newMax);

    const keep = Math.min(this.count, newMax);
    const tmp = new THREE.Matrix4();
    for (let i = 0; i < keep; i++) {
      this.mesh.getMatrixAt(i, tmp);
      newMesh.setMatrixAt(i, tmp);
    }

    newMesh.count = keep;

    if (this.mesh.parent) {
      const parent = this.mesh.parent;
      const index = parent.children.indexOf(this.mesh);
      parent.remove(this.mesh);
      parent.add(newMesh);
      parent.children[index] = newMesh;
    }

    this.mesh.dispose();
    this.mesh = newMesh;
    this.count = keep;
    this.max = newMax;

    // Also purge freed indices beyond newMax
    this.available = this.available.filter(i => i < this.max);
  }
}