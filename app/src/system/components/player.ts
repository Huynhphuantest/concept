import * as THREE from 'three';
import { Input } from '../Input';
import { Physic, Transform } from "./core";
import { Component, System } from "../ECS";
import { camera } from "../../main";
import { Character } from './character';
import { toVec3 } from '../../util';

export class PlayerController extends Component {
  static requires = [Physic, Character];
  character!:Character;
  physic!: Physic;
  yaw = 0;
  pitch = 0;
  readonly dragFall = -5;
  readonly cameraOffset = new THREE.Vector3(0, 3, 7);
  readonly cameraPosLerp = 1;
  readonly cameraRotLerp = 1;
  private targetCamPos = new THREE.Vector3();
  private targetCamRot = new THREE.Quaternion();
  constructor() {
    super();
  }
  onStart(): void {
    this.character = System.getComponent(this.entity, Character);
    this.physic = System.getComponent(this.entity, Physic);

    this.character.health.bind(document.getElementById("health-container")!);

    //LMB
    Input.onPress("Enter", () => { this.character.lmb() })
    // Jump
    Input.onPress("Space", () => { this.character.jump() });
    // Lockon
    Input.onPress("KeyL", () => {
      if(this.character.locked !== null) {
        this.character.lockoff();
        return;
      }
      const allTargets = System.query(Character);
      let closest:number|undefined = undefined;
      let closestDist = -1;
      const facing = this.character.getFacing();
      const pos = System.getComponent(this.entity, Transform).position;
      allTargets.forEach(e => {
        if(e === this.entity) return;
        const transform = System.getComponent(e, Transform);
        const dir = transform.position.clone().sub(
          pos
        ).normalize();
        const dot = facing.dot(dir);
        if(closestDist < dot) {
          closest = e;
          closestDist = dot;
        }
      });
      if(closest === undefined) return;
      this.character.lockon(closest);
    })

    // Camera rotation
    Input.onDrag((dx, dy) => {
      const sensitivity = 0.008;
      this.yaw -= dx * sensitivity;
      this.pitch -= dy * sensitivity;
      this.pitch = Math.max(
        -Math.PI/2 + 0.5, Math.min(
          Math.PI/2 - 0.1,
          this.pitch)
      );
    });
  }
  followPlayer():THREE.Quaternion {
    // Follow player
    const pos = toVec3(this.physic.getPosition());
    const offset = this.cameraOffset.clone();
    const camQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.targetCamPos = pos.clone().add(offset.clone().applyQuaternion(camQuat));
    this.targetCamRot = camQuat;
    // Sync
    const flippedYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + Math.PI);
    return flippedYaw;
  }
  followTarget():THREE.Quaternion {
    const locked = this.character.locked!;
    const lockedPos = toVec3(System.getComponent(locked, Physic).getPosition());
    const pos = toVec3(this.physic.getPosition());
    const up = new THREE.Vector3(0, 1, 0); // World up
    const targetQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(pos, lockedPos, up)
      ), 'YXZ').y)
    );
    const offset = this.cameraOffset.clone().applyQuaternion(targetQuat);
    camera.position.lerp(new THREE.Vector3(
      pos.x + (offset.x - 3),
      pos.y + offset.y,
      pos.z + offset.z,
    ), this.cameraPosLerp);
    const cameraQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(camera.position, lockedPos, up)
    );
    camera.quaternion.slerp(cameraQuat, this.cameraRotLerp);
    return targetQuat;
  }
  updateSkillDisplay() {
    const dom = document.querySelector("#skill > #slot1 > .content")! as HTMLElement;
    dom.innerText = `${this.character.skills["Knife"][0].stock}`;
  }
  onUpdate(dt:number): void {
    this.updateSkillDisplay();
    const quat = this.character.locked ?
      this.followTarget() :
      this.followPlayer();
    camera.position.lerp(this.targetCamPos, this.cameraPosLerp);
    camera.quaternion.slerp(this.targetCamRot, this.cameraRotLerp);
    this.physic.setRotation(quat);

    // WASD movement
    const input = new THREE.Vector3();
    if (Input.has("KeyW")) input.z += 1;
    if (Input.has("KeyS")) input.z -= 1;
    if (Input.has("KeyA")) input.x += 1;
    if (Input.has("KeyD")) input.x -= 1;
    
    if (input.lengthSq() > 0) {
      input.normalize();
      input.applyQuaternion(quat);
      this.character.move(input, dt);
      if (Input.has("ShiftLeft")) this.character.dash(input);
    }
  }
  onRender(): void {
  }
}