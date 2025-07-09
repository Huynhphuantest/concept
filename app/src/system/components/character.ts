import * as RAPIER from '@dimforge/rapier3d';
import { Component, System, type Entity, type EntityWith } from "../ECS";
import { Health, Stamina, Will } from "./stats";
import { Skill } from "./skill";
import { Physic, Transform } from "./core";
import { Vector3, Quaternion, Euler } from "three";
import { world } from '../../main';
import { lerp, toVec3, vec3 } from '../../util';
import { allHurtboxes, Hitbox } from '../Collider';
import { Visualizer } from '../Visualizer';
import { Particle, ParticleSystem } from '../../system/Particle';
import * as THREE from 'three';
let impactParticlePosition = new Vector3();
const impactParticle = new Particle(
  new THREE.SphereGeometry(0.1),
  new THREE.Vector4(1,0,0,1),
  [
      ParticleSystem.Transform()
      .startFn(t => {
        t.scale.set(0.6,8,0.6);
        const dir = new THREE.Vector3().random().subScalar(0.5).normalize();
        t.rotation.setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
        dir.multiplyScalar(5);
        t.position.copy(impactParticlePosition.clone().add(dir));
      })
      .overtimeFn((t, dt) => {
        const local = t.position.clone().sub(impactParticlePosition);
        local.multiplyScalar(1 + dt * 0.5);
        local.add(impactParticlePosition);
        t.position.copy(local);
        t.scale.x *= 0.9;
        t.scale.z *= 0.9;
      }),
      ParticleSystem.Fade(0.4, t => t),
  ],
  512
);
class DashSkill extends Skill {
  constructor(cooldown:number, speed:number) {
    super(cooldown, 1, 1, (entity:Entity, dir:Vector3) => {
      System.getComponent(entity, Physic).setVelocity(
        dir.clone().multiplyScalar(speed)
      );
      const character = System.getComponent(entity, Character);
      character.isRuning = true;
      character.speed = character.runSpeed;
    });
  }
}
const isGrounded = (entity:Entity) => {
  const pb = System.getComponent(entity, Physic);
  const shape = new RAPIER.Capsule(0.4, 0.2); // halfHeight, radius
  const shapePos = pb.body.translation(); // Current position
  shapePos.y -= 2.8;
  const shapeRot = new RAPIER.Quaternion(0, 0, 0,1); // No rotation
  const shapeVel = { x: 0, y: -1, z: 0 }; // Direction to cast (down)
  const maxDist = 0.1;

  const hit = world.castShape(
    shapePos,
    shapeRot,
    shapeVel,
    shape,
    maxDist,
    1.0,             // maxTOI: max time of impact (just leave it at 1)
    true             // stopAtPenetration: true = return on first overlap
  );

  return !!hit && hit.time_of_impact < 1e-4; // toi = time of impact
}
class JumpSkill extends Skill {
  constructor(cooldown:number, strength:number) {
    super(cooldown, 1, 1, (entity:Entity) => {
      if(!isGrounded(entity)) {
        this.reset();
        return;
      };
      System.getComponent(entity, Physic).addVelocity(vec3(
        0,
        strength,
        0
      ));
    });
  }
}
type StatusKey =
  | 'stunned'
  | 'debounced'
  | 'iframe'
  | 'rooted'
  | 'silenced'
  | 'casting';
export class Character extends Component {
  static override requires = [Transform, Physic];
  transform!: Transform;
  pb!: Physic;

  public locked: EntityWith<[typeof Transform]> | null = null;
  public skills: Record<string, Skill[]>;

  // Stats
  public health: Health;
  public stamina: Stamina;
  public will: Will;
  public defense: number = 70;
  public attackPower: number = 1;
  
  public isMoving = false;
  public isRuning: boolean = false;

  public baseSpeed: number = 60;
  public runSpeed: number = 120;
  public speed: number = 50;
  public accelerateSpeed = 0.8;
  public deaccelerateSpeed = 3;

  public lmbCount = 0;
  public lmbMax = Infinity

  public status: Record<StatusKey, number> = {
    stunned: 0,
    debounced: 0,
    iframe: 0,
    rooted: 0,
    silenced: 0,
    casting: 0,
  };

  public dashSkill: DashSkill;
  public jumpSkill: JumpSkill;

  constructor(
    health: Health,
    stamina: Stamina,
    will: Will,
    skills: Record<string, Skill[]>,
    opts?: {
      defense?: number;
      speed?: number;
      attack?: number;
    }
  ) {
    super();
    this.health = health;
    this.stamina = stamina;
    this.will = will;
    this.skills = skills;

    if (opts?.defense) this.defense = opts.defense;
    if (opts?.speed) this.baseSpeed = opts.speed;
    this.speed = this.baseSpeed;
    this.runSpeed = this.baseSpeed * 1.5; //
    if (opts?.attack) this.attackPower = opts.attack;

    this.dashSkill = new DashSkill(750, 90);
    this.jumpSkill = new JumpSkill(100, 40);
  }

  onStart(): void {
    this.transform = System.getComponent(this.entity, Transform);
    this.health.addEventListener("Depleted", () => this.die());
    this.pb = System.getComponent(this.entity, Physic);
    this.pb.body.setLinearDamping(0.9);
    this.pb.collider.setFriction(0.95);
    this.pb.body.setEnabledRotations(false, true, false, true);
  }
  onUpdate(dt:number): void {
    this.decayStatuses(dt);
    if(this.pb.getVelocity().y < 0) {
      this.pb.addVelocity(vec3(0, -5, 0));
    }
    if(!this.isMoving) {
      this.isRuning = false;
    }
    if(this.isRuning) {
      this.speed = lerp(this.speed, this.runSpeed, this.accelerateSpeed * dt);
    } else this.speed = lerp(this.speed, this.baseSpeed, this.deaccelerateSpeed * dt);
    this.isMoving = false;
  }
  decayStatuses(dt:number): void {
    for (const key in this.status) {
      this.status[key as StatusKey] = Math.max(0, this.status[key as StatusKey] - dt);
    }
  }
  move(dir: Vector3, mul = 1, blend = 0.1) {
    if(!this.canMove()) return;
    const s = this.speed * mul;
    const posSpeed = s * blend;
    const velSpeed = s * (1 - blend);
    this.pb.addPosition(dir.clone().multiplyScalar(posSpeed));
    this.pb.addVelocity(dir.clone().multiplyScalar(velSpeed));
    this.isMoving = true;
  }
  dash(dir: Vector3) {
    this.dashSkill.activate(this.entity, dir);
  }
  jump() {
    this.jumpSkill.activate(this.entity);
  }
  lookAtDirection(dir: Vector3) {
    const targetQuat = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, 1),
      dir.clone().normalize()
    );
    this.transform.quaternion.copy(targetQuat);
  }
  lookAtEntity(target: EntityWith<[typeof Transform]>) {
    const t = System.getComponent(target, Transform);
    const dir = t.position.clone().sub(this.transform.position);
    this.lookAtDirection(dir);
  }
  hurt(damage: number) {
    const effective = Math.max(0, damage - this.defense);
    this.health.sub(effective);
  }
  useSkill(name: string): boolean {
    const set = this.skills[name];
    if (!set || set.length === 0) return false;
    for (const s of set) {
      if (s.activate(this.entity)) return true;
    }
    return false;
  }
  lockon(entity: EntityWith<[typeof Transform]>) {
    this.locked = entity;
  }
  lockoff() {
    this.locked = null;
  }
  getFacing(): Vector3 {
    if (this.locked === null) {
      const yawOnly = new Quaternion().setFromEuler(
        new Euler(0, new Euler().setFromQuaternion(this.transform.quaternion, "YXZ").y, 0)
      );
      return new Vector3(0, 0, 1).applyQuaternion(yawOnly).normalize().add(this.transform.position);
    } else {
      return System.getComponent(this.locked, Transform).position;
    }
  }
  die() {
    console.log("Character died:", this.entity);
    // You can emit events or remove entity here
  }
  canMove() {
    return !(
      this.status.debounced > 0 ||
      this.status.stunned > 0 ||
      this.status.casting > 0 ||
      this.status.rooted > 0
    )
  }
  canAct() {
    return !(
      this.status.debounced > 0 ||
      this.status.stunned > 0 ||
      this.status.silenced > 0 ||
      this.status.casting > 0
    )
  }
  lmb() {
    if(!this.canAct()) return;
    this.status.debounced += 0.125;
    const quat = this.pb.getRotation();
    const dir = new Vector3(0,0,1).applyQuaternion(quat);
    this.pb.addVelocity(dir.clone().multiplyScalar(40));
    const hitbox = new Hitbox(
      RAPIER.ColliderDesc.cuboid(1.5,2,2),
      undefined,
      allHurtboxes
    );
    hitbox.collider.setRotation(quat);
    hitbox.collider.setTranslation(
      toVec3(
        this.pb.getPosition()
      ).add(
        dir.clone().multiplyScalar(3)
      )
    );
    const visualizer = new Visualizer(hitbox.collider);
    hitbox.onHit((e) => {
      if(e.hit > 1) return;
      if(e.data.type !== 'Character') return;
      System.getComponent(e.data.character.entity, Physic).addVelocity(
        dir.clone().multiplyScalar(40)
      );
      impactParticlePosition = System.getComponent(e.data.character.entity, Transform).position;
      for(let i = 0; i < 64; i++) impactParticle.start({lifetime: 2});
      if(this.lmbCount === this.lmbMax - 1) {
        System.getComponent(e.data.character.entity, Physic).addVelocity(
          dir.clone().multiplyScalar(150)
        );
        e.data.character.status.stunned += 5;
        this.status.debounced += 0.3;
        this.lmbCount = 0;
      }
      e.data.character.status.stunned += 0.5;
    });
    setTimeout(() => {
      visualizer.destroy(),
      hitbox.destroy();
    }, 250);
    this.lmbCount++;
    if(this.lmbCount === this.lmbMax) {
      this.lmbCount = 0;
      this.status.debounced += 0.25;
    }
  }
}