import { Lifecycle, UNIFORMS } from "../../main";
import { type Entity } from "../ECS";

const skills:Skill[] = [];
Lifecycle.onUpdate(() => { skills.forEach(e => e.update()) })
export class Skill<Args extends any[] = any[]> {
    last: number;
    cooldown: number;
    max: number;
    stock: number;
    protected usage: (entity:Entity, ...args:Args) => void;
    constructor({cooldown, max, stock, usage}: {
        cooldown: number,
        max?: number,
        stock?: number,
        usage: (entity:Entity, ...args:Args) => void
    }) { 
        this.cooldown = cooldown;
        this.max = max ?? 1;
        this.stock = stock ?? this.max;
        this.usage = usage;
        this.last = 0;
        skills.push(this)
    }
    update(): void {
        const now = UNIFORMS.time.value;
        if (this.stock >= this.max) { this.last = now; return; }
        const elapsed = now - this.last;
        if (elapsed >= this.cooldown) {
            this.stock++;
            this.last = now - (elapsed - this.cooldown);
        }
    }
    activate(entity:Entity, ...args:Args): boolean {
        if (this.stock < 1) return false;
        this.stock--;
        this.use(entity, ...args);
        return true;
    }
    protected use(entity:Entity, ...args:Args): void { this.usage(entity, ...args); }
    restore(amount = 1): void {
        this.stock = Math.min(this.stock + amount, this.max);
    }
    reset(): void {
        this.stock = this.max;
        this.last = 0;
    }
}