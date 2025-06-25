import * as THREE from 'three';

export function createTexture(width:number, height:number, func: (x:number, y:number) => THREE.Color):THREE.Texture {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext("2d")!;
    for(let x = 0; x < width; x++) {
        for(let y = 0; y < height; y++) {
            console.log('d');
            const color = func(x,y);
            ctx.fillStyle = "#"+color.getHexString();
            ctx.fillRect(x, y, 1, 1);
        }
    }
    return new THREE.CanvasTexture(canvas);
}