import * as THREE from 'three';

export function createTexture(width:number, height:number, func: (x:number, y:number) => THREE.Color):THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height
    const ctx = canvas.getContext("2d")!;
    for(let x = 0; x < width; x++) {
        for(let y = 0; y < height; y++) {
            const color = func(x,y);
            ctx.fillStyle = "#"+color.getHexString();
            ctx.fillRect(x, y, 1, 1);
        }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// --- Vector Utils ---

export function vec3(x: number): { x: number; y: number; z: number };
export function vec3(x: number, y: number): { x: number; y: number; z: number };
export function vec3(x: number, y: number, z: number): { x: number; y: number; z: number };
export function vec3(x: number, y?: number, z?: number) {
  return { x, y: y ?? x, z: z ?? x };
}

export const toVec3 = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x, v.y, v.z);
export const fromVec3 = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
export function cloneVec3(v: { x: number; y: number; z: number }) {
  return { x: v.x, y: v.y, z: v.z };
}
export function vecMid(a: {x: number, y: number, z: number}, b: {x: number, y: number, z: number}) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2
  };
}
export function vecSize(a: {x: number, y: number, z: number}, b: {x: number, y: number, z: number}) {
  return {
    x: Math.abs(a.x - b.x),
    y: Math.abs(a.y - b.y),
    z: Math.abs(a.z - b.z)
  };
}

// --- Quaternion Utils ---

export function quat(): { x: number; y: number; z: number; w: number }; // identity
export function quat(x: number, y: number, z: number, w: number): { x: number; y: number; z: number; w: number };
export function quat(axis: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number; w: number };
export function quat(a?: any, b?: any, c?: any, d?: any) {
  if (a === undefined) return { x: 0, y: 0, z: 0, w: 1 };
  if (typeof a === 'object' && typeof b === 'number') {
    return new THREE.Quaternion().setFromAxisAngle(toVec3(a), b); // axis + angle
  }
  return { x: a, y: b, z: c, w: d }; // full components
}

export const toQuat = (q: { x: number; y: number; z: number; w: number }) =>
  new THREE.Quaternion(q.x, q.y, q.z, q.w);
export const fromQuat = (q: THREE.Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
export function cloneQuat(q: { x: number; y: number; z: number; w: number }) {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}