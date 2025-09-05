import * as THREE from 'three';
import { Input } from '../Input';
import { Physic, Renderer, Transform } from "./core";
import { Component, System } from "../ECS";
import { camera } from "../../main";
import { Character } from './character';

export class PlayerController extends Component {
  static requires = [Physic, Character];
  character!:Character;
  physic!: Physic;
  yaw = 0;
  pitch = 0;
  readonly dragFall = -5;
  readonly cameraOffset = new THREE.Vector3(0, 3, 7);
  readonly cameraPosLerp = 0.3;
  readonly cameraRotLerp = 0.4;
  private targetCamPos = new THREE.Vector3();
  private targetCamRot = new THREE.Quaternion();
  constructor() {
    super();
  }
  onStart(): void {
    this.character = System.getComponent(this.entity, Character);
    this.physic = System.getComponent(this.entity, Physic);

    this.character.health.bind(document.getElementById("health-container")!);

    Input.onPress("Digit1", () => this.character.useSkill(0));
    Input.onPress("Digit2", () => this.character.useSkill(1));
    Input.onPress("Digit3", () => this.character.useSkill(2));
    Input.onPress("Digit4", () => this.character.useSkill(3));
    // Lockon
    Input.onPress("KeyL", () => {
      if(this.character.locked !== null) {
        this.character.lockoff();
        return;
      }
      const allTargets = System.query(Character);
      let closest:number|undefined = undefined;
      let closestDist = -1;
      const facing = this.character.getTarget().normalize();
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
    const pos = System.getComponent(this.entity, Renderer).mesh.position;
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
    const target = System.getComponent(locked, Renderer).mesh.position;
    const pos = System.getComponent(this.entity, Renderer).mesh.position;
    const up = new THREE.Vector3(0, 1, 0);
    const direction = target.clone().sub(pos);
    direction.y = 0;
    direction.normalize();
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0,0,1),
      direction
    );
    const offset = new THREE.Vector3(
      -2,3,-7
    ).clone().applyQuaternion(targetQuat)
    const cameraPos = offset.add(pos);
    const cameraQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(camera.position, target, up)
    );
    this.targetCamPos = cameraPos;
    this.targetCamRot = cameraQuat;
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

    if (Input.has("Space")) this.character.jump();
    if (Input.has("Enter")) this.character.lmb();
    // WASD movement
    if (Input.has("ControlLeft")) this.character.isRuning = true;
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