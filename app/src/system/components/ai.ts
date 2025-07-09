import * as THREE from 'three';
import { Component, System } from "../ECS";
import { Physic, Transform } from "./core";
import { Character } from './character';

export class AI extends Component {
    static requires = [Physic, Character]
    target: Transform
    physics!: Physic
    character!: Character
    constructor(target:Transform) {
        super();
        this.target = target;
    }
    onStart(): void {
        this.physics = System.getComponent(this.entity, Physic);
        this.character = System.getComponent(this.entity, Character);
    }
    onUpdate(dt: number) {
        const pos = new THREE.Vector3().copy(this.physics.getPosition());
        const dir = this.target.position.clone().sub(pos).normalize();
        this.character.lookAtDirection(dir);
        this.character.move(dir, dt);
    }
}