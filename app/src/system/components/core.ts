import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d';
import { Component, System } from "../ECS";
import { scene, world } from '../../main';
import { cloneQuat, cloneVec3, fromQuat, fromVec3, toQuat, toVec3 } from '../../util';

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
  setPosition(pos: { x: number; y: number; z: number }) {
    this.body.setTranslation(pos, true);
    this.wake();
  }
  addPosition(pos: { x: number; y: number; z: number }) {
    const p = this.body.translation();
    this.body.setTranslation({ x: p.x + pos.x, y: p.y + pos.y, z: p.z + pos.z }, true);
  }

  setRotation(rot: { x: number; y: number; z: number; w: number }) {
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
  setVelocity(v: { x: number; y: number; z: number }) {
    this.body.setLinvel(v, true);
    this.wake();
  }

  addVelocity(v: { x: number; y: number; z: number }) {
    const lv = this.body.linvel();
    this.setVelocity({ x: lv.x + v.x, y: lv.y + v.y, z: lv.z + v.z });
  }

  getVelocity() {
    return cloneVec3(this.body.linvel());
  }

  // ---- Angular
  setAngularVelocity(v: { x: number; y: number; z: number }) {
    this.body.setAngvel(v, true);
    this.wake();
  }

  addAngularVelocity(v: { x: number; y: number; z: number }) {
    const av = this.body.angvel();
    this.setAngularVelocity({ x: av.x + v.x, y: av.y + v.y, z: av.z + v.z });
  }

  getAngularVelocity() {
    return cloneVec3(this.body.angvel());
  }

  // ---- Forces / Impulses
  addForce(f: { x: number; y: number; z: number }) {
    this.body.addForce(f, true);
  }

  addImpulse(f: { x: number; y: number; z: number }) {
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
}