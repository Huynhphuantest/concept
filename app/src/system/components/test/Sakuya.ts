import * as THREE from "three";
import * as RAPIER from '@dimforge/rapier3d';
import { Component, System, type Entity } from "../../ECS";
import { Character } from "../character";
import { Skill } from "../skill";
import { Health, Stamina, Will } from "../stats";
import { EntityBuilder } from "../../ECS";
import { Transform, Physic, Renderer, PhysicController } from "../core";
import { toQuat, toVec3, vec3 } from "../../../util";
import { Delay, Lifecycle, TimeFunction } from "../../../main";
import { allHurtboxes, Hitbox } from "../../Collider";
import { Particle, ParticleSystem } from "../../Particle";
import { InstancePool } from "../../Instancing";
const knifeHitParticlePosition = new THREE.Vector3();
const knifeHitParticle = new Particle(
    new THREE.SphereGeometry(1),
    new THREE.Vector4(0.9, 0.1, 0.15),
    [
        ParticleSystem.Transform()
        .startFn(t => {
            t.position.copy(knifeHitParticlePosition);
            t.scale.set(0.6,3,0.6);
            t.rotation.setFromVector3(new THREE.Vector3().randomDirection());
        })
        .overtimeFn(t => {
            t.scale.x *= 0.8;
            t.scale.x *= 1.2;
            t.scale.x *= 0.8;
        }),
        ParticleSystem.Fade(0.2, t => t * t)
    ]
)
const DEFAULT_KNIFE_SPEED = 120;
class Knife {
    static pool = new InstancePool(new THREE.BoxGeometry(1,1,2), new THREE.LineBasicMaterial({color:'yellow'}), 250, 100);
    entity:number;
    index:number;
    transform:Transform;
    physic:Physic;
    owner:number;
    hitbox:Hitbox;
    despawnResolve?:Delay;
    constructor(owner:number) {
        this.owner = owner;
        this.entity = System.create();
        this.transform = System.addComponent(this.entity, Transform);
        this.physic = System.addComponent(this.entity, Physic,
            RAPIER.RigidBodyDesc.dynamic(),
            RAPIER.ColliderDesc.ball(1).setSensor(true),
            { mass: 5 }
        );
        this.physic.setGravityScale(0);
        this.hitbox = new Hitbox(RAPIER.ColliderDesc.ball(1), this.transform);
        this.hitbox.onHit((e) => {
            if(e.data.type !== 'Character') return;
            if(e.data.character.entity === this.owner) return;
            knifeHitParticlePosition.copy(e.data.character.pb.getPosition());
            knifeHitParticle.start();
            e.data.character.hurt(10);
            this.hitbox.destroy();
            knifeHitParticle.start()
            this.despawnResolve?.jump();
        });
        this.hitbox.active = false;
        this.index = Knife.pool.request();
        const outer = this;
        System.addComponent(this.entity, class extends Component {
            onRender() {
                Knife.pool.setMatrix(outer.index, new THREE.Matrix4().compose(
                    toVec3(outer.physic.getPosition()),
                    toQuat(outer.physic.getRotation()),
                    new THREE.Vector3(1,1,1)
                ));
                Knife.pool.needUpdate(true);
            }
            onDestroy() {
                Knife.pool.destroy(outer.index);
            }
        });
    }
    launchToward(target:THREE.Vector3, speed:number) {
        this.activate();
        const dir = target.clone().sub(this.physic.getPosition()).normalize();
        this.physic.setVelocity(dir.multiplyScalar(speed));
    }
    launchForward(speed:number) {
        this.activate();
        this.physic.setVelocity(new THREE.Vector3(0, 0, speed).applyQuaternion(
            this.physic.getRotation()
        ));
    }
    activate() {
        this.hitbox.active = true;
        this.despawnResolve = Lifecycle.delay(() => System.destroy(this.entity), 3);
    }
}
Lifecycle.onUpdate(() => console.log(Knife.pool.max))
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
            new Skill({cooldown:3, max: 3, usage: (entity:Entity) => {
                const character = System.getComponent(entity, Character);
                const target = character.getTarget();
                for(let i = 0; i < 5; i++) {
                    const knife = new Knife(entity);
                    knife.physic.setPosition(character.pb.getPosition());
                    Lifecycle.delay(() => knife.launchToward(target.clone().add(
                        new THREE.Vector3().randomDirection()
                    ), DEFAULT_KNIFE_SPEED), Math.random() * 0.25);
                }
                character.status.max('casting', 0.3);
            }}),
            new Skill({cooldown:22, max: 1, usage: async (entity:Entity) => {
                const character = System.getComponent(entity, Character);
                const controller = new PhysicController(character.pb);
                character.status.max('debounce', 2.5);
                controller.moveTo(
                    controller.offset(vec3(0, 10, 0)), {
                        lerp:true,
                        time:TimeFunction.EaseOut,
                        duration:1,
                });
                await Lifecycle.halt(0.5);
                controller.freeze(2);
                const amount = 36;
                const knifes:Knife[] = [];
                const offsets:THREE.Vector3[] = [];
                const resolve = Lifecycle.onUpdate(() => {
                    const target = character.getTarget();
                    const direction = character.pb.getRotation();
                    knifes.forEach((knife, i) => {
                        knife.physic.setPosition(controller.offset(offsets[i].clone().applyQuaternion(direction)));
                        knife.physic.face(
                        target
                            .clone()
                            .sub(knife.physic.getPosition())
                            .normalize()
                        );
                    });
                });
                async function spawn(s:number, c: number) {
                    const pos = new THREE.Vector3(0,c,s).multiplyScalar(8);
                    offsets.push(pos);
                    const knife = new Knife(entity);
                    knifes.push(knife);
                    knife.physic.setPosition(controller.offset(pos));
                    await Lifecycle.halt(1);
                    const index = knifes.indexOf(knife);
                    knifes.splice(index, 1);
                    offsets.splice(index, 1);
                    if(knifes.length === 0) resolve();
                    knife.launchForward(DEFAULT_KNIFE_SPEED)
                }
                for(let i = 0; i < amount; i++) {
                    const t = (i / amount) * Math.PI
                    character.status.max('debounce', (i / amount * 1));
                    Lifecycle.delay(() => {
                        spawn(Math.sin(t), Math.cos(t));
                        spawn(Math.sin(t + Math.PI), Math.cos(t + Math.PI));
                    }, (i / amount) * 1);
                }
            }}),
            new Skill({cooldown:12, usage: async(entity:Entity) => {
                const character = System.getComponent(entity, Character);
                character.status.max('casting', 0.5);
                const amount = 120;
                async function spawn(s:number, c: number) {
                    const dir = new THREE.Vector3(c,0,s);
                    const pos = dir.clone().multiplyScalar(2);
                    const knife = new Knife(entity);
                    knife.physic.setPosition(pos.add(character.pb.getPosition()));
                    knife.physic.face(dir);
                    await Lifecycle.halt(0.25);
                    knife.launchForward(DEFAULT_KNIFE_SPEED);
                }
                for(let i = 0; i < amount; i++) {
                    const t = (i / amount) * Math.PI * 4
                    character.status.max('casting', (i / amount * 0.5));
                    Lifecycle.delay(() => {
                        spawn(Math.sin(t), Math.cos(t));
                    }, (i / amount) * 0.5);
                }
            }}),
            new Skill({cooldown:22, usage: async(entity:Entity) => {
                const character = System.getComponent(entity, Character);
                const physic = character.pb;
                const controller = new PhysicController(physic);
                character.status.max('debounce', 1);
                const origin = toVec3(character.pb.getPosition());
                const dir = new THREE.Vector3(0,0,1).applyQuaternion(physic.getRotation());
                const hitbox = new Hitbox(
                    RAPIER.ColliderDesc.cuboid(1.5, 2, 4),
                    undefined,
                    allHurtboxes
                );
                hitbox.collider.setRotation(character.pb.getRotation());
                hitbox.collider.setTranslation(origin.add(dir.clone().multiplyScalar(3)));
                const delay = Lifecycle.delay(() => {
                    hitbox.destroy();
                }, 0.25)
                hitbox.onHit(async (e) => {
                    if(e.data.type != 'Character') return;
                    if(e.data.character.entity === entity) return;
                    if(e.hit > 1) return
                    const target = e.data.character;
                    target.status.max('stun', 5);
                    new PhysicController(target.pb).freeze(5);
                    target.hurt(5);
                    controller.moveTo(controller.offset(dir.clone().multiplyScalar(-18)), {
                        lerp:true,
                        time:TimeFunction.EaseOut,
                        duration:0.25
                    });
                    const rand = () => {
                        const r = Math.random();
                        return Math.pow(r, 1/3);
                    } // Math.random that is bias toward 1 in a power way
                    const origin = toVec3(target.pb.getPosition());
                    for(let i = 0; i < 150; i++) {
                        Lifecycle.delay(async () => {
                            const knifeDir = new THREE.Vector3().randomDirection();
                            if(knifeDir.y < 0) knifeDir.y *= -1;
                            const pos = origin.clone().add(knifeDir.clone().multiplyScalar(8));
                            pos.y -= 10;
                            const knife = new Knife(entity);
                            knife.physic.setPosition(pos);
                            pos.y += 10;
                            new PhysicController(knife.physic).moveTo(pos, {
                                lerp:true,
                                duration: 1,
                                time:TimeFunction.EaseOutOvershoot
                            });
                            knife.physic.face(knifeDir.negate())
                            await Lifecycle.halt(1);
                            knife.launchForward(DEFAULT_KNIFE_SPEED);
                        }, rand() * 3);
                    }
                    delay.jump();
                });
            }})
        ]
    },
    { speed: 150}
).create();