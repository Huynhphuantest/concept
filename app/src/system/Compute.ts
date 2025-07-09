import * as THREE from 'three';
import { renderer, UNIFORMS } from '../main';
import { DEFAULT_VERT_SHADER } from './Shader';
export class ComputeShader<T extends Record<string, THREE.IUniform>> {
    readonly size: number;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private current: THREE.WebGLRenderTarget;
    private next: THREE.WebGLRenderTarget;
    private material: THREE.ShaderMaterial;
    constructor(size: number, shader: string, initalData:Float32Array, uniforms: T) {
        this.size = size;
        this.scene = new THREE.Scene();
        // Fullscreen ortho camera
        const dataTexture = new THREE.DataTexture(
            initalData,
            size,
            size,
            THREE.RGBAFormat,
            THREE.FloatType
        )
        dataTexture.needsUpdate = true;
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.current = new THREE.WebGLRenderTarget(size, size, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false,
            generateMipmaps: false
        });
        this.next = this.current.clone();
        renderer.initRenderTarget(this.current);
        renderer.copyTextureToTexture(dataTexture, this.current.texture);
        this.material = new THREE.ShaderMaterial({
            fragmentShader: shader,
            vertexShader: DEFAULT_VERT_SHADER,
            uniforms: {
                data: { value: this.current.texture },
                resolution: { value: new THREE.Vector2(size, size) },
                time: UNIFORMS.time,
                delta: UNIFORMS.delta,
                ...uniforms
            }
        });
        const quad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            this.material
        );
        this.scene.add(quad);
    }

    step(uniforms:T) {
        this.material.uniforms.data.value = this.current.texture;
        for(const [key, value] of Object.entries(uniforms)) {
            this.material.uniforms[key].value = value;
        }
        renderer.setRenderTarget(this.next);
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(null);

        const temp = this.current;
        this.current = this.next;
        this.next = temp;
    }

    get texture() {
        return this.current.texture;
    }
}