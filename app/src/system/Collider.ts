import * as RAPIER from '@dimforge/rapier3d';
import { Transform } from './components/core';
import { Lifecycle } from '../main';
import { vecMid, vecSize } from '../util';
import { Visualizer } from './Visualizer';
import type { Character } from './components/character';

const hitboxWorld = new RAPIER.World({ x: 0, y: 0, z: 0 });
const allHitboxes: Set<Hitbox> = new Set();
const allHurtboxes: Set<Hurtbox> = new Set();
const hitboxMap = new Map<RAPIER.Collider, Hitbox>();

type NoneData = {
  type: 'None'
}
type CharacterData = {
  type: 'Character'
  character: Character
}
type HitboxData = NoneData | CharacterData

Lifecycle.onUpdate(() => {
  hitboxWorld.step();
  for (const hb of allHitboxes) hb.update();
});

export type HitEvent = {
  by: Hitbox;
  target: Hitbox;
  hit: number;
  data: HitboxData ;
};

export class Hitbox extends EventTarget {
  readonly collider: RAPIER.Collider;
  active = true;
  follow?: Transform;
  targets: Set<Hitbox>;
  hits = new Map<RAPIER.Collider, number>();
  resolved = new Set<Hitbox>();
  data: HitboxData;

  constructor(
    shape: RAPIER.ColliderDesc,
    follow?: Transform,
    targets?: Set<Hitbox>,
    data?: any
  ) {
    super();
    this.collider = hitboxWorld.createCollider(shape);
    this.follow = follow;
    this.targets = new Set(targets ?? allHitboxes);
    this.data = data ?? {
      type: 'None'
    };

    allHitboxes.add(this);
    hitboxMap.set(this.collider, this);
  }

  update(): void {
    this.resolved.clear();

    if (this.follow) {
      this.collider.setTranslation(this.follow.position);
    }

    if (!this.active) return;

    hitboxWorld.contactPairsWith(this.collider, Hitbox._handleContact(this));
  }
  onHit(callback: (event: HitEvent) => void) {
    this.addEventListener('hit', (e) => callback((e as CustomEvent<HitEvent>).detail));
  }

  private static _handleContact(self: Hitbox) {
    return (otherCollider: RAPIER.Collider) => {
      const other = hitboxMap.get(otherCollider);
      if (!other || !self.targets.has(other)) return;
      if (self.resolved.has(other)) return;

      self.resolved.add(other);
      self.hit(other);
      other.hit(self);
    };
  }

  hit(target: Hitbox): void {
    const prev = this.hits.get(target.collider) ?? 0;
    const next = prev + 1;
    this.hits.set(target.collider, next);

    this.dispatchEvent(new CustomEvent<HitEvent>('hit', {
      detail: { by: this, target, hit: next, data: target.data }
    }));
  }

  setActive(state: boolean): void {
    this.active = state;
    this.collider.setEnabled(state);
  }

  destroy(): void {
    hitboxWorld.removeCollider(this.collider, true);
    hitboxMap.delete(this.collider);
    allHitboxes.delete(this);
  }
}

export class Hurtbox extends Hitbox {
  constructor(shape: RAPIER.ColliderDesc, follow?: Transform, data?:HitboxData) {
    super(shape, follow, new Set(), data);
    allHurtboxes.add(this);
  }

  override update(): void {
    if (this.follow) {
      this.collider.setTranslation(this.follow.position);
    }
  }
  override destroy(): void {
    super.destroy();
    allHurtboxes.delete(this);
  }
}

export function createHitboxFromPoints(
  pointA: { x: number; y: number; z: number },
  pointB: { x: number; y: number; z: number },
  follow?: Transform,
  targets?: Set<Hitbox>
): Hitbox {
  const center = vecMid(pointA, pointB);
  const size = vecSize(pointA, pointB);
  const shape = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);

  const hitbox = new Hitbox(shape, follow, targets);
  hitbox.collider.setTranslation(center);
  new Visualizer(hitbox.collider);
  return hitbox;
}

export { allHitboxes, allHurtboxes };