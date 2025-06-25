import * as THREE from 'three';
import { getShader } from '../../shader';
import { createTexture } from '../../util';
import { Noise } from 'noisejs';
import { scene } from '../../main';
const NOISE = new Noise(0);
export async function createGrassField({
    width = 10,
    height = 10,
    density = 5,
    grassWidth = 1,
    grassSegment = 5,
    noise = createTexture(256, 256, (x,y) => {
        const value = Math.abs(NOISE.perlin2(x,y));
        console.log(value);
        return new THREE.Color(value, value, value)
    })
}:{
    width?:number,
    height?:number,
    density?:number,
    grassWidth?:number,
    grassSegment?:number,
    noise?:THREE.Texture
}):Promise<THREE.Mesh> {
    const geometry = createGrassBladeGeometry(grassWidth, grassSegment);
    const shader = await getShader("grass");
    const material = new THREE.ShaderMaterial({
        vertexShader:shader.vert,
        fragmentShader:shader.frag
    })
    scene.add(new THREE.Mesh(
        new THREE.PlaneGeometry(10,10),
        new THREE.MeshBasicMaterial({
            map:noise
        })
    ))
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        wireframe:true
    }))
}
function createGrassBladeGeometry(width:number, segment:number):THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    let base1:number[], base2:number[], base3:number[];
    let position:number[] = [];
    let indices:number[] = [];
    let index = 0;
    for(let i = 0; i <= segment; i++) {
        const ratio = i / segment;
        const y = ratio;
        const w = (1 - ratio) * (width / 2);
        base1 = [w, y, 0];
        base2 = [Math.cos(2.0944) * w, y, Math.sin(2.0944) * w];
        base3 = [Math.cos(4.18879) * w, y, Math.sin(4.18879) * w];
        position.push(...base1, ...base2, ...base3);
        
        if(i === segment) {
            const top = [0,1,0];
            position.push(...top);
            const t = index;
            const l1 = index - 3;
            const l2 = index - 2;
            const l3 = index - 1;
            indices.push(
                l1, l2, t,
                l2, l3, t,
                l3, l1, t
            );
        }
        else if(i !== 0) {
            const b1 = index;
            const b2 = index + 1;
            const b3 = index + 2;
            const l1 = index - 3;
            const l2 = index - 2;
            const l3 = index - 1;
            indices.push(
                b1, l1, b2,
                l2, l1, b2,
                l2, b3, b2,
                l2, b3, l3,
                l3, b1, b3,
                l3, b1, l1
            );
        }

        index += 3;
    }
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position), 3));
    return geometry;
}