import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { Lifecycle, scene } from '../main';

const visualizers:Set<Visualizer> = new Set();
Lifecycle.onUpdate(() => {
    visualizers.forEach(e => e.update());
});
export class Visualizer {
    mesh: THREE.Mesh;
    collider: RAPIER.Collider;

    constructor(collider: RAPIER.Collider, material?: THREE.Material) {
        this.collider = collider;
        this.mesh = this.createMesh(collider, material);
        scene.add(this.mesh);
        visualizers.add(this);
        this.update();
    }

    private createMesh(collider: RAPIER.Collider, material?: THREE.Material): THREE.Mesh {
        const shape = collider.shape;
        let geometry: THREE.BufferGeometry;

        if (shape.type === RAPIER.ShapeType.Cuboid) {
            //@ts-ignore
            const h = shape.halfExtents;
            geometry = new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2);
        } else if (shape.type === RAPIER.ShapeType.Ball) {
            //@ts-ignore
            geometry = new THREE.SphereGeometry(shape.radius, 16, 16);
        } else if (shape.type === RAPIER.ShapeType.Capsule) {
            //@ts-ignore
            const r = shape.radius;
            //@ts-ignore
            const h = shape.halfHeight * 2;
            geometry = new THREE.CapsuleGeometry(r, h, 8, 16);
        } else {
            geometry = new THREE.BoxGeometry(1, 1, 1); // fallback
            console.warn('Unsupported shape type:', shape.type);
        }

        const mat = material || new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
        return new THREE.Mesh(geometry, mat);
    }
    update() {
        const t = this.collider.translation();
        const r = this.collider.rotation();
        this.mesh.position.set(t.x, t.y, t.z);
        this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    get object3D() {
        return this.mesh;
    }
    destroy() {
        this.mesh.geometry.dispose();
        scene.remove(this.mesh);
        if(Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(e => e.dispose());
        }
        else this.mesh.material.dispose();
        visualizers.delete(this);
    }
}