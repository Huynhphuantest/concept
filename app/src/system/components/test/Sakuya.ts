import * as THREE from "three";
import * as RAPIER from '@dimforge/rapier3d';
import { System, type Entity } from "../../ECS";
import { Character } from "../character";
import { Skill } from "../skill";
import { Health, Stamina, Will } from "../stats";
import { EntityBuilder } from "../../ECS";
import { Transform, Physic, Renderer } from "../core";
import { vec3 } from "../../../util";

// Knife projectile prefab
function createKnife(origin: THREE.Vector3, target: THREE.Vector3) {
    const dir = target.clone().sub(origin).normalize();
    const offset = new THREE.Vector3().randomDirection();
    offset.multiplyScalar(0.01);
    dir.add(offset);
    const speed = 160;

    const knife = new EntityBuilder()
        .addComponent(Transform)
        .addComponent(Renderer,
            new THREE.BoxGeometry(1,1,1),
            new THREE.MeshBasicMaterial({color:'yellow'})
        )
        .addComponent(Physic,
            RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z),
            RAPIER.ColliderDesc.ball(1).setSensor(true),
            { mass: 5 }
        )
        .create();

    setTimeout(() => {
        System.destroy(knife);
    }, 3000)

    const body = System.getComponent(knife, Physic);
    body.setVelocity(vec3(dir.x * speed, dir.y * speed, dir.z * speed));
    body.body.setGravityScale(0, true);
}

export const Sakuya = () => new EntityBuilder()
    .addComponent(Physic,
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0),
        RAPIER.ColliderDesc.capsule(1, 1),
        { mass: 70 }
    )
    .addComponent(
        Renderer,
        new THREE.CapsuleGeometry(1, 2),
        new THREE.MeshBasicMaterial(),
        { smoothSyncLerp: 1 }
    )
    .addComponent(Character,
        new Health(100),
        new Stamina(20),
        new Will(150),
        {
            'Knife': [
                new Skill(100, 10, 1, (entity:Entity) => {
                    const character = System.getComponent(entity, Character);
                    const origin = System.getComponent(character.entity, Transform).position.clone();
                    const target = character.getFacing();
                    character.hurt(5);
                    for(let i = 0; i < 5; i++) createKnife(origin, target);
                })
            ]
        },
        { speed: 150}
    )
    .create();