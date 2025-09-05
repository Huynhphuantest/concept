import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { Component, EntityBuilder, System } from './system/ECS';
import { Renderer, Physic, Transform } from './system/components/core';
import { PlayerController } from './system/components/player';
import { AI } from './system/components/ai';
import { Sakuya } from './system/components/test/Sakuya';
import { Character } from './system/components/character';
import { createGrassField } from './world/enviroment/grass';
import { Hurtbox } from './system/Collider';
import { Visualizer } from './system/Visualizer';

export async function setup(scene:THREE.Scene) {
    const grass = await createGrassField({});
    scene.add(grass);

    // Ground
    const size = 500;
    new EntityBuilder()
        .addComponent(
        Renderer,
            new THREE.BoxGeometry(size, 5, size),
            new THREE.MeshBasicMaterial({ color: "green" })
        )
        .addComponent(
        Physic,
            RAPIER.RigidBodyDesc.fixed(),
            RAPIER.ColliderDesc.cuboid(size / 2, 2.5, size / 2).setFriction(0.9)
        )
        .create();
    // Player
    const player = Sakuya();
    System.addComponent(player, class DirArrow extends Component {
        static requires = [Renderer];
        render!: Renderer;
        arrow: THREE.ArrowHelper;
        constructor() {
            super();
            this.arrow = new THREE.ArrowHelper();
            this.arrow.setColor(new THREE.Color('purple'));
            this.arrow.setLength(5);
            scene.add(this.arrow);
        }
        onStart() {
            this.render = System.getComponent(this.entity, Renderer);
        }
        onUpdate() {
            const capsule = this.render.mesh;
            const dir = new THREE.Vector3(0, 0, 1);
            dir.applyQuaternion(capsule.quaternion).normalize();
            this.arrow.setDirection(dir);
            this.arrow.position.copy(capsule.position);
        }
    });

    System.addComponent(player, PlayerController);
    const enemy = Sakuya();
    System.addComponent(enemy, AI, System.getComponent(player, Character));
    System.getComponent(enemy, Physic).setPosition({
        x:100,
        y:50,
        z:0
    })
    new Visualizer(new Hurtbox(
        RAPIER.ColliderDesc.cuboid(1,2,1),
        System.getComponent(enemy, Transform),
        { type: 'Character', character: System.getComponent(enemy, Character)}
    ).collider);
    new Visualizer(new Hurtbox(
        RAPIER.ColliderDesc.cuboid(1,2,1),
        System.getComponent(player, Transform),
        { type: 'Character', character: System.getComponent(player, Character)}
    ).collider);
}