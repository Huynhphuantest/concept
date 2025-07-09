export type Entity = number;
type ComponentType = new (...args:any) => Component;
export type EntityWith<T extends ComponentType[]> = Entity & {
  __components__: T;
};

export class Component extends EventTarget {
  static requires?: (new (...args:any[]) => Component)[];
  constructor() { super(); }
  entity!: Entity;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onDestroy?(): void;
  onRender?():void;
}

type ComponentMap = Map<Function, Component>;

export class System {
  private static entities = new Map<Entity, ComponentMap>();
  private static nextId = 0;

  static create(): Entity {
    const id = this.nextId++;
    this.entities.set(id, new Map());
    return id;
  }
  static destroy(entity: Entity): void {
    const comps = this.entities.get(entity);
    if (!comps) return;

    for (const comp of comps.values()) {
      comp.onDestroy?.();
    }
    this.entities.delete(entity);
  }

  static addComponent<T extends Component, A extends any[]>(
    entity: Entity,
    Comp: new (...args:A) => T,
    ...args: A
  ): T {
    const components = this.entities.get(entity);
    if (!components) throw console.error(new Error("Entity does not exist."));

    // Avoid duplicate
    if (components.has(Comp)) {
        console.warn("ComponentDuplication: Entity already has this component: "+ Comp);
        return components.get(Comp) as T;
    }

    // Handle dependencies
    const required = (Comp as any).requires;
    if (required) {
      for (const Req of required) {
        if (!components.has(Req)) {
          this.addComponent(entity, Req);
        }
      }
    }
    const comp = new Comp(...args);

    comp.entity = entity;
    components.set(Comp, comp);
    comp.onStart?.();
    return comp;
  }

  static getComponent<T extends Component>(entity: Entity, Comp: new (...args:any[]) => T): T {
    const comp = this.entities.get(entity)?.get(Comp);
    if(!comp) throw console.error(Error("Component "+Comp+" not found for entity:"+entity));
    return comp as T;
  }

  static removeComponent(entity: Entity, Comp: Function): void {
      const comps = this.entities.get(entity);
      const comp = comps?.get(Comp);
      comp?.onDestroy?.();
      comps?.delete(Comp);
    }
  static getComponentOptional<T extends Component>(
    entity: Entity,
    Comp: new (...args: any[]) => T
  ): T | undefined {
    return this.entities.get(entity)?.get(Comp) as T | undefined;
  }

  static hasComponent<T extends Component>(
    entity: Entity,
    Comp: new (...args: any[]) => T
  ): boolean {
    return this.entities.get(entity)?.has(Comp) ?? false;
  }

  static query(...types: Function[]): Entity[] {
    const result: Entity[] = [];
    for (const [id, comps] of this.entities.entries()) {
      if (types.every(type => comps.has(type))) {
        result.push(id);
      }
    }
    return result;
  }

  static update(dt: number) {
    for (const comps of this.entities.values()) {
      for (const comp of comps.values()) {
        comp.onUpdate?.(dt);
      }
    }
  }
  static render() {
    for (const comps of this.entities.values()) {
      for (const comp of comps.values()) {
        comp.onRender?.();
      }
    }
  }
}
export class EntityBuilder<T extends ComponentType[] = []> {
  private entity: Entity;
  private components: (() => void)[] = [];

  constructor() {
    this.entity = System.create();
  }

  addComponent<
    C extends new (...args:A) => Component,
    A extends any[],
    NT extends [...T, C]
  >(
    Comp: C,
    ...args: A
  ): EntityBuilder<NT> {
    this.components.push(() => {
      System.addComponent(this.entity, Comp, ...args);
    });
    return this as any as EntityBuilder<NT>;
  }

  create(): EntityWith<T> {
    for (const fn of this.components) fn();
    return this.entity as EntityWith<T>;
  }
}