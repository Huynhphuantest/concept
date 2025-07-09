import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { Component, EntityBuilder, System } from './system/ECS';
import { Renderer, Physic, Transform } from './system/components/core';
import { PlayerController } from './system/components/player';
import { AI } from './system/components/ai';
import { Sakuya } from './system/components/test/Sakuya';
import { Character } from './system/components/character';
import { Health, Stamina, Will } from './system/components/stats';
import { createGrassField } from './world/enviroment/grass';
import { Hurtbox } from './system/Collider';
import { Visualizer } from './system/Visualizer';

export async function setup(scene:THREE.Scene) {
    const grass = await createGrassField({});
    scene.add(grass);

    // Ground
    const size = 2000;
    new EntityBuilder()
        .addComponent(
        Renderer,
        new THREE.BoxGeometry(size, 0.2, size),
        new THREE.MeshBasicMaterial({ color: "green" })
        )
        .addComponent(
        Physic,
        RAPIER.RigidBodyDesc.fixed(),
        RAPIER.ColliderDesc.cuboid(size / 2, 0.1, size / 2).setFriction(0.9)
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

    // Enemy
    const enemy = new EntityBuilder()
        .addComponent(
            Renderer,
            new THREE.CapsuleGeometry(1, 2),
            new THREE.MeshBasicMaterial({ color: 'red' })
        )
        .addComponent(
            Physic,
            RAPIER.RigidBodyDesc.dynamic().setTranslation(50, 5, 0),
            RAPIER.ColliderDesc.capsule(1, 1),
            { mass: 70 }
        )
        .addComponent(
            Character,
            new Health(100),
            new Stamina(20),
            new Will(150),
            {},
            { speed: 30 }
        )
        .addComponent(
            AI,
            System.getComponent(player, Transform)
        )
        .create();

    new Visualizer(new Hurtbox(
        RAPIER.ColliderDesc.cuboid(1,2,1),
        System.getComponent(enemy, Transform),
        { type: 'Character', character: System.getComponent(enemy, Character)}
    ).collider);
}