import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/Addons.js';

import { createGrassField } from "./world/enviroment/grass";

export const renderer = new THREE.WebGLRenderer({antialias:true});
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(110, 1, 0.1, 2000);
const dom = document.body;
const control = new OrbitControls(camera, dom);

async function run() {
    camera.position.set(0,0,10);

    renderer.setPixelRatio(window.devicePixelRatio);
    const resize = () => {
        const dimension = dom.getBoundingClientRect();
        renderer.setSize(dimension.width, dimension.height);
        camera.aspect = dimension.width / dimension.height;
        camera.updateProjectionMatrix();
        control.update();
    }
    resize();
    window.addEventListener("resize", resize);
    dom.appendChild(renderer.domElement);
    render();
}
function render() {
    requestAnimationFrame(render);
    
    renderer.render(scene, camera);
}



async function setup() {
    const grass = await createGrassField({});
    scene.add(grass);
}

run();
setup();