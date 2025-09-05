import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d';
import { Component, System } from "../ECS";
import { Lifecycle, scene, Time, world } from '../../main';
import { cloneQuat, cloneVec3, fromQuat, fromVec3, toQuat, toVec3, vec3 } from '../../util';
type Vec3 = {x:number, y:number, z:number};
type Quat = {x:number, y:number, z:number, w:number};

export class GameObject extends Component {}

export class Transform extends Component {
  position = new THREE.Vector3();
  quaternion = new THREE.Quaternion();

  set(x: number, y: number, z: number) {
    this.position.set(x, y, z);
  }

  copy(other: Transform) {
    this.position.copy(other.position);
    this.quaternion.copy(other.quaternion);
  }

  direction(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
  }

  lookAt(target: THREE.Vector3) {
    const m = new THREE.Matrix4().lookAt(this.position, target, new THREE.Vector3(0, 1, 0));
    this.quaternion.setFromRotationMatrix(m);
  }
}

export class Renderer extends Component {
  static override requires = [Transform];
  mesh: THREE.Mesh;
  transform!: Transform;
  smoothSyncLerp?: number;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material, 
    options?: {
      smoothSyncLerp?:number
    }
  ) {
    super();
    this.mesh = new THREE.Mesh(geometry, material);
    this.smoothSyncLerp = options?.smoothSyncLerp
  }

  onStart() {
    this.transform = System.getComponent(this.entity, Transform);
    scene.add(this.mesh);
  }

  onUpdate() {
    if(this.smoothSyncLerp) {
      this.mesh.position.lerp(this.transform.position, this.smoothSyncLerp);
      this.mesh.quaternion.slerp(this.transform.quaternion, this.smoothSyncLerp);
    } else {
      this.mesh.position.copy(this.transform.position);
      this.mesh.quaternion.copy(this.transform.quaternion);
    }
  }

  onDestroy() {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(mat => mat.dispose());
    } else {
      this.mesh.material.dispose();
    }
  }
}

export class Physic extends Component {
  static override requires = [Transform];
  transform!: Transform;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;

  constructor(
    bodyDesc: RAPIER.RigidBodyDesc,
    colliderDesc: RAPIER.ColliderDesc,
    options?: {
      mass?: number;
      friction?: number;
      restitution?: number;
      isSensor?: boolean;
      linearDamping?: number;
      angularDamping?: number;
    }
  ) {
    super();

    if (options?.friction !== undefined) colliderDesc.setFriction(options.friction);
    if (options?.restitution !== undefined) colliderDesc.setRestitution(options.restitution);
    if (options?.isSensor) colliderDesc.setSensor(options.isSensor);
    if (options?.mass !== undefined) colliderDesc.setMass(options.mass);

    this.body = world.createRigidBody(bodyDesc);
    this.collider = world.createCollider(colliderDesc, this.body);

    if (options?.linearDamping !== undefined) this.body.setLinearDamping(options.linearDamping);
    if (options?.angularDamping !== undefined) this.body.setAngularDamping(options.angularDamping);
  }

  onStart() {
    this.transform = System.getComponent(this.entity, Transform);
    this.syncFromPhysics();
  }

  onUpdate() {
    this.syncFromPhysics();
  }

  onDestroy() {
    world.removeCollider(this.collider, true);
    world.removeRigidBody(this.body);
  }

  // ---- Syncing
  syncFromPhysics() {
    this.transform.position.copy(toVec3(this.body.translation()));
    this.transform.quaternion.copy(toQuat(this.body.rotation()));
  }

  syncToPhysics() {
    this.body.setTranslation(fromVec3(this.transform.position), true);
    this.body.setRotation(fromQuat(this.transform.quaternion), true);
    this.wake();
  }

  // ---- Position / Rotation
  setPosition(pos: Vec3) {
    this.body.setTranslation(pos, true);
    this.wake();
  }
  addPosition(pos: Vec3) {
    const p = this.body.translation();
    this.body.setTranslation({ x: p.x + pos.x, y: p.y + pos.y, z: p.z + pos.z }, true);
  }
  setRotation(rot: Quat) {
    this.body.setRotation(rot, true);
    this.wake();
  }
  getPosition() {
    return cloneVec3(this.body.translation());
  }
  getRotation() {
    return cloneQuat(this.body.rotation());
  }
  // ---- Velocity
  setVelocity(v: Vec3) {
    this.body.setLinvel(v, true);
    this.wake();
  }
  addVelocity(v: Vec3) {
    const lv = this.body.linvel();
    this.setVelocity({ x: lv.x + v.x, y: lv.y + v.y, z: lv.z + v.z });
  }
  getVelocity() {
    return cloneVec3(this.body.linvel());
  }
  // ---- Angular
  setAngularVelocity(v: Vec3) {
    this.body.setAngvel(v, true);
    this.wake();
  }
  addAngularVelocity(v: Vec3) {
    const av = this.body.angvel();
    this.setAngularVelocity({ x: av.x + v.x, y: av.y + v.y, z: av.z + v.z });
  }
  getAngularVelocity() {
    return cloneVec3(this.body.angvel());
  }
  // ---- Forces / Impulses
  addForce(f: Vec3) {
    this.body.addForce(f, true);
  }
  addImpulse(f: Vec3) {
    this.body.applyImpulse(f, true);
  }
  // ---- Misc
  wake() {
    this.body.wakeUp();
  }
  sleep() {
    this.body.sleep();
  }
  isSleeping() {
    return this.body.isSleeping();
  }
  setMass(mass: number) {
    this.body.setAdditionalMass(mass, true);
  }
  setFriction(v: number) {
    this.collider.setFriction(v);
  }
  setRestitution(v: number) {
    this.collider.setRestitution(v);
  }
  setDamping(linear: number, angular: number) {
    this.body.setLinearDamping(linear);
    this.body.setAngularDamping(angular);
  }
  lockTranslation(x: boolean, y: boolean, z: boolean) {
    this.body.setEnabledTranslations(x, y, z, true);
  }
  lockRotation(x: boolean, y: boolean, z: boolean) {
    this.body.setEnabledRotations(x, y, z, true);
  }
  setSensor(v: boolean) {
    this.collider.setSensor(v);
  }
  isSensor() {
    return this.collider.isSensor();
  }
  setGravityScale(f:number) {
    return this.body.setGravityScale(f, true);
  }
  lookAt(target: Vec3, up: {x:0, y:1, z:0}) {
    const pos = toVec3(this.getPosition());
    const eye = toVec3(target);
    const m = new THREE.Matrix4().lookAt(eye, pos, toVec3(up));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.setRotation(q);
  }
  face(direction: Vec3) {
    this.setRotation(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction
    ));
  }
}
function lerp(a:Vec3, b:Vec3, t:number):Vec3 {
  return {
    x: a.x + (b.x - a.x) * t, 
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}
export class PhysicController {
  currentAction?: () => void;
  constructor(private pb:Physic) {}
  offset(o:Vec3):Vec3 {
    const v = this.pb.getPosition();
    return {
      x: v.x + o.x,
      y: v.y + o.y,
      z: v.z + o.z
    };
  }
  moveTo(pos: Vec3, options?: {} & {
    lerp?:true,
    time: (t:number) => number,
    duration: number
  }):PhysicController {
    if(!options?.lerp) this.pb.setPosition(pos);
    else {
      this.currentAction?.();
      let elapsed = 0;
      const origin = this.pb.getPosition();
      const resolve = Lifecycle.onUpdate(() => {
        this.pb.setVelocity(vec3(0,0,0));
        elapsed += Time.delta;
        let t = elapsed / options.duration;
        if(t > 1) t = 1;
        this.pb.setPosition(lerp(origin, pos, options.time(t)));
        if(t === 1) resolve();
      });
      this.currentAction = resolve;
    }
    return this
  }
  launch(dir: Vec3, options: {} & {
    duration: number,
    speed?: number,
    keepVelocity?: boolean
  }):PhysicController {
    this.currentAction?.();
    let elapsed = 0;
    const speed = options.speed ?? 1;
    const moveVec = {
      x: dir.x * speed,
      y: dir.y * speed,
      z: dir.z * speed
    };
    const resolve = Lifecycle.onUpdate(() => {
      this.pb.setVelocity(vec3(0,0,0));
      this.pb.addPosition({
        x: moveVec.x * Time.delta,
        y: moveVec.y * Time.delta,
        z: moveVec.z * Time.delta
      });
      elapsed += Time.delta;
      if(elapsed > options.duration) {
        if(options.speed) this.pb.setVelocity(moveVec);
        resolve();
      }
    });
    this.currentAction = resolve;
    return this;
  }
  freeze(duration:number) {
    const origin = this.pb.getPosition();
    const resolve = Lifecycle.onUpdate(() => {
      this.pb.setVelocity(vec3(0,0,0));
      this.pb.setPosition(origin);
    });
    Lifecycle.delay(resolve, duration);
  }
}