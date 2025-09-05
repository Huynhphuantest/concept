import * as THREE from 'three';
import { Component, System, type EntityWith } from "../ECS";
import { Physic, Transform } from "./core";
import { Character } from './character';
import { Lifecycle } from '../../main';

export class AI extends Component {
    static requires = [Physic, Character]
    target: Character
    targetTransform: Transform
    physics!: Physic
    character!: Character
    constructor(character:Character) {
        super();
        this.target = character;
        this.targetTransform = System.getComponent(character.entity, Transform);
    }
    onStart(): void {
        this.physics = System.getComponent(this.entity, Physic);
        this.character = System.getComponent(this.entity, Character);
        this.character.lockon(this.target.entity as EntityWith<[typeof Transform]>);
        const delay1 = Lifecycle.delay(() => {
            this.character.useSkill(0);
            delay1.start();
        }, 1);
        const delay2 = Lifecycle.delay(() => {
            this.character.useSkill(2);
            delay2.start();
        }, 1);
    }
    onUpdate(dt: number) {
        const pos = new THREE.Vector3().copy(this.physics.getPosition());
        const vec = this.targetTransform.position.clone().sub(pos);
        const dist = vec.lengthSq();
        if(dist < 16) {
            if(this.character.useSkill(3)) Lifecycle.delay(() => this.character.useSkill(1), 1.5);
            this.character.lmb();
        }
        const dir = vec.clone();
        dir.y = 0;
        dir.normalize();
        this.character.pb.face(dir);
        this.character.move(dir, dt);
    }
}