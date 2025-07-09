import * as THREE from 'three';
import { getShader } from '../../system/Shader';
import { createTexture } from '../../util';
import { scene, UNIFORMS, NOISE, camera, Lifecycle } from '../../main';

type FLOAT_UNIFORM = { value:number };
const DEFAULT_NOISE_SIZE = 256;

const MEMOIZE_GEOMETRY:Map<string, THREE.BufferGeometry> = new Map();

export async function createGrassField({
    width = 50,
    length = 50,
    density = 8,
    grassWidth = 0.35,
    grassSegment = 1,
    grassMaxHeight = 3.5,
    grassMinHeight = 2.0,
    position = new THREE.Vector3(0,0,0),
    noiseTexture = (() => {
        NOISE.seed(1 / Math.PI);
        const scale = 10 / DEFAULT_NOISE_SIZE;
        return createTexture(DEFAULT_NOISE_SIZE, DEFAULT_NOISE_SIZE, (x, y) => {
            const value = (NOISE.simplex2(x * scale, y * scale) + 1) / 2;
            return new THREE.Color(value, value, value);
        });
    })(),
    option = {
        WIND_STRENGTH: { value: 0.1 },
        WIND_SPEED_TIME: { value: 0.002 },
        DIR_NOISE_SCALE: { value: 0.07 },
    },
}: {
    width?: number,
    length?: number,
    density?: number,
    grassWidth?: number,
    grassSegment?: number,
    grassMaxHeight?: number,
    grassMinHeight?: number,
    noiseTexture?: THREE.Texture,
    position?: THREE.Vector3,
    option?: {
        WIND_STRENGTH?: FLOAT_UNIFORM,
        WIND_SPEED_TIME?: FLOAT_UNIFORM,
        DIR_NOISE_SCALE?: FLOAT_UNIFORM,
    }
}): Promise<THREE.Mesh> {
    const baseGeometry = createGrassBladeGeometry(grassWidth, grassSegment);
    const shader = await getShader("grass");

    const material = new THREE.ShaderMaterial({
        uniforms: {
            NOISE: { value: noiseTexture },
            TIME: UNIFORMS.time,
            ...option
        },
        vertexShader: shader.vert,
        fragmentShader: shader.frag
    });

    const step = 1 / density;
    const xCount = Math.floor(width / step);
    const yCount = Math.floor(length / step);
    const total = xCount * yCount;

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = baseGeometry.index;
    geometry.attributes = baseGeometry.attributes;

    const offsets = new Float32Array(total * 3);
    const height = new Float32Array(total);
    for (let i = 0, offsetIndex = 0, heightIndex = 0; i < xCount; i++) {
        for (let j = 0; j < yCount; j++) {
            const x = i * step + (Math.random() - 0.5) * step;
            const y = j * step + (Math.random() - 0.5) * step;
            offsets[offsetIndex++] = x + position.x;
            offsets[offsetIndex++] = 0 + position.y;
            offsets[offsetIndex++] = y + position.z;
            height[heightIndex++] = grassMinHeight + (NOISE.simplex2(x * 0.1, y * 0.1) + 1) * 0.5 * (grassMaxHeight - grassMinHeight);
        }
    }

    geometry.instanceCount = total;
    geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    geometry.setAttribute('height', new THREE.InstancedBufferAttribute(height, 1));

    const mesh = new THREE.Mesh(geometry, material);
    mesh.geometry.boundingBox = new THREE.Box3(
        new THREE.Vector3(0, 0, 0),  // min
        new THREE.Vector3(width, grassMaxHeight, length)     // max
    );
    mesh.frustumCulled = false;
    scene.add(new THREE.Box3Helper(mesh.geometry.boundingBox));

    Lifecycle.onUpdate(() => {
        const frustum = new THREE.Frustum();
        const camMatrix = new THREE.Matrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(camMatrix);

        const box = mesh.geometry.boundingBox!.clone();
        box.applyMatrix4(mesh.matrixWorld);
        mesh.visible = frustum.intersectsBox(box);
    })

    return mesh;
}

function createGrassBladeGeometry(width: number, segment: number): THREE.BufferGeometry {
    const memory = MEMOIZE_GEOMETRY.get(`${width},${segment}`);
    if(memory !== undefined) return memory;
    const geometry = new THREE.BufferGeometry();
    let position: number[] = [];
    let indices: number[] = [];
    let uv: number[] = [];
    let index = 0;

    for (let i = 0; i <= segment; i++) {
        const ratio = i / segment;
        const y = ratio;
        const w = (1 - ratio) * (width / 2);
        const angle = 2.0944; // 120 deg
        const base1 = [w, y, 0];
        const base2 = [Math.cos(angle) * w, y, Math.sin(angle) * w];
        const base3 = [Math.cos(angle * 2) * w, y, Math.sin(angle * 2) * w];
        position.push(...base1, ...base2, ...base3);
        uv.push(0.5, ratio, 0, ratio, 1, ratio);

        if (i === segment) {
            const top = [0, 1, 0];
            position.push(...top);
            const t = index;
            const l1 = index - 3;
            const l2 = index - 2;
            const l3 = index - 1;
            indices.push(l2, l1, t, l3, l2, t, l1, l3, t);
            uv.push(0.5, 1.0);
        } else if (i !== 0) {
            const b1 = index;
            const b2 = index + 1;
            const b3 = index + 2;
            const l1 = index - 3;
            const l2 = index - 2;
            const l3 = index - 1;
            indices.push(
                b2, l1, b1, l1, b2, l2,
                b3, l2, b2, l2, b3, l3,
                b1, l3, b3, l3, b1, l1
            );
        }

        index += 3;
    }

    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    MEMOIZE_GEOMETRY.set(`${width},${segment}`, geometry);
    return geometry;
}