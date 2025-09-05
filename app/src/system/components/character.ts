import * as RAPIER from '@dimforge/rapier3d';
import { Component, System, type Entity, type EntityWith } from "../ECS";
import { Health, Stamina, Will } from "./stats";
import { Skill } from "./skill";
import { Physic, PhysicController, Transform } from "./core";
import { Vector3, Quaternion } from "three";
import { camera, Lifecycle, scene, TimeFunction, world } from '../../main';
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
    super({cooldown, max: 1, usage:(entity:Entity, dir:Vector3) => {
      const controller = new PhysicController(System.getComponent(entity, Physic));
      controller.moveTo(controller.offset(dir.clone().multiplyScalar(speed)), {
        lerp:true,
        duration:0.25,
        time: TimeFunction.EaseInOut,
      });
      const character = System.getComponent(entity, Character);
      character.isRuning = true;
      character.speed = character.runSpeed;
    }});
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
    super({cooldown, max:1, usage: (entity:Entity) => {
      if(!isGrounded(entity)) {
        this.reset();
        return;
      };
      System.getComponent(entity, Physic).addVelocity(vec3(
        0, strength, 0
      ));
    }});
  }
}
type StatusKey = 'stun' | 'debounce' | 'invincible' | 'root' | 'casting' | 'mute'
class Status {
  private values: Record<StatusKey, number> = {
    stun: 0,
    debounce: 0,
    invincible: 0,
    root: 0,
    casting: 0,
    mute: 0
  };
  decay(dt: number) {
    for (const key in this.values) {
      this.values[key as StatusKey] = Math.max(0, this.values[key as StatusKey] - dt);
    }
  }
  get(key: StatusKey) {
    return this.values[key];
  }
  set(key: StatusKey, value: number) {
    this.values[key] = value;
  }
  max(key: StatusKey, value:number) {
    this.values[key] = Math.max(this.values[key], value);
  }
}
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
  public defense: number = 120;
  public attackPower: number = 99;
  
  public isMoving = false;
  public isRuning: boolean = false;

  public baseSpeed: number = 60;
  public runSpeed: number = 100;
  public speed: number = 50;
  public accelerateSpeed = 0.8;
  public deaccelerateSpeed = 3;

  public lmbCount = 0;
  public lmbMax = 5

  public status = new Status();

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

    this.dashSkill = new DashSkill(0.4, 15);
    this.jumpSkill = new JumpSkill(0.5, 40);
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
    this.status.decay(dt);
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
    if(this.canMove()) this.dashSkill.activate(this.entity, dir);
  }
  jump() {
    if(this.canMove()) this.jumpSkill.activate(this.entity);
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
    const effective = damage * (1 / (1 + this.defense))
    this.health.sub(effective);
  }
  useSkill(n: number):boolean {
    if(this.canAct()) return Object.values(this.skills)[0][n].activate(this.entity);
    return false;
  }
  lockon(entity: EntityWith<[typeof Transform]>) {
    this.locked = entity;
  }
  lockoff() {
    this.locked = null;
  }
  getTarget(): Vector3 {
    if (this.locked === null) {
      const cameraDirection = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
      const intersections = new THREE.Raycaster(
        camera.position,
        cameraDirection
      ).intersectObjects(scene.children);
      if(intersections.length === 0) return cameraDirection.multiplyScalar(camera.far);
      else return intersections[0].point;
    } else {
      return System.getComponent(this.locked, Transform).position.clone();
    }
  }
  die() {
    console.log("Character died:", this.entity);
    // You can emit events or remove entity here
  }
  canMove() {
    return !(
      this.status.get('debounce') > 0 ||
      this.status.get('stun') > 0 ||
      this.status.get('root') > 0
    )
  }
  canAct() {
    return !(
      this.status.get('debounce') > 0 ||
      this.status.get('stun') > 0 ||
      this.status.get('mute') > 0 ||
      this.status.get('casting') > 0
    )
  }
  lmb() {
    if(!this.canAct()) return;
    const selfController = new PhysicController(this.pb);
    this.status.max('debounce', 0.25);
    const quat = this.pb.getRotation();
    const dir = new Vector3(0,0,1).applyQuaternion(quat);
    selfController.moveTo(selfController.offset(dir.clone().multiplyScalar(0.3)), {
      lerp:true, time: TimeFunction.EaseIn, duration: 0.2
    });
    const hitbox = new Hitbox(
      RAPIER.ColliderDesc.cuboid(1.5,2,2),
      undefined,
      allHurtboxes
    );
    hitbox.collider.setRotation(quat);
    hitbox.collider.setTranslation(
      toVec3(this.pb.getPosition())
      .add(
        dir.clone().multiplyScalar(4)
      )
    );
    const visualizer = new Visualizer(hitbox.collider);
    hitbox.onHit((e) => {
      if(e.hit > 1) return;
      if(e.data.type !== 'Character') return;
      if(e.data.character === this) return;
      e.data.character.hurt(this.attackPower);
      const targetController = new PhysicController(e.data.character.pb);
      targetController.moveTo(hitbox.collider.translation(), {
        lerp: true, time: TimeFunction.EaseIn, duration: 0.15
      });
      impactParticlePosition = System.getComponent(e.data.character.entity, Transform).position;
      for(let i = 0; i < 64; i++) impactParticle.start({lifetime: 2});
      if(this.lmbCount === this.lmbMax - 1) {
        targetController.launch(dir, {
          duration: 1,
          speed: 45,
          keepVelocity: true
        })
        e.data.character.status.max('stun', 2);
        this.status.max('debounce', 0.3);
        this.lmbCount = 0;
      }
      e.data.character.status.max('stun', 0.6);
    });
    Lifecycle.delay(() => {
      visualizer.destroy(),
      hitbox.destroy();
    }, 0.25);
    this.lmbCount++;
    if(this.lmbCount === this.lmbMax) {
      this.lmbCount = 0;
      this.status.max('debounce', 0.45);
    }
  }
}