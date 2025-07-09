class Stat extends EventTarget {
  protected dom:HTMLElement|undefined
  protected current;
  constructor(readonly max: number, current?: number) {
    super();
    this.current = current ?? max;
  }
  get value() { return this.current; }
  set value(amount: number) { this.current = amount; this.check(); }
  bind(dom:Element) { this.dom = dom as HTMLElement; this.updateDOM() }
  add(amount: number) { this.current += amount; this.check(); }
  sub(amount: number) { this.current -= amount; this.check(); }
  protected check() {
    if (this.current < 0) { this.dispatchEvent(new CustomEvent("Depleted")); }
    else if (this.current > this.max) { this.current = this.max; }
    this.updateDOM();
  }
  updateDOM() {
    if(!this.dom) return;
    this.dom.style.setProperty("--percentage", `${(this.current/this.max)*100}%`);
    this.dom.style.setProperty("--text", `"${this.current}/${this.max}"`);
  }
}

export class Health extends Stat {
  temp: number;
  constructor(max: number, current?: number, options?: { maxTemporary?: number }) {
    super(max, current);
    this.temp = options?.maxTemporary ?? 0;
  }
  protected override check() {
    if (this.current < 0) { this.dispatchEvent(new CustomEvent("Depleted")); this.current = 0 }
    else if (this.current > this.max + this.temp) { this.current = this.max + this.temp; }
    this.updateDOM();
  }
}
export class Stamina extends Stat {}
export class Will extends Stat {}