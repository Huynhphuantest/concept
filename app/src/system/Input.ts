type InputCode = string;

type Callback = () => void;
type MoveCallback = (x: number, y: number) => void;
type ScrollCallback = (dx: number, dy: number) => void;
type DragCallback = (dx: number, dy: number) => void;

export class Input {
    private static held = new Set<InputCode>();
    private static pressMap = new Map<InputCode, Set<Callback>>();
    private static releaseMap = new Map<InputCode, Set<Callback>>();
    private static moveCallbacks = new Set<MoveCallback>();
    private static scrollCallbacks = new Set<ScrollCallback>();
    private static dragCallbacks = new Set<DragCallback>();

    static pointer = { x: 0, y: 0 };
    static deltaX = 0;
    static deltaY = 0;

    static initialize() {
        let lastX = 0, lastY = 0;

        window.addEventListener("keydown", (e) => {
            if (!e.repeat && !this.held.has(e.code)) {
                this.held.add(e.code);
                this.pressMap.get(e.code)?.forEach(fn => fn());
            }
        });

        window.addEventListener("keyup", (e) => {
            if (this.held.delete(e.code)) {
                this.releaseMap.get(e.code)?.forEach(fn => fn());
            }
        });

        window.addEventListener("pointerdown", (e) => {
            const code = this.mouseButtonCode(e.button);
            if (!this.held.has(code)) {
                this.held.add(code);
                this.pressMap.get(code)?.forEach(fn => fn());
            }

            // 🔧 Fix delta spike by resetting last pointer position
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener("pointerup", (e) => {
            const code = this.mouseButtonCode(e.button);
            if (this.held.delete(code)) {
                this.releaseMap.get(code)?.forEach(fn => fn());
            }
        });

        window.addEventListener("pointermove", (e) => {
        if (document.pointerLockElement) {
            this.deltaX = e.movementX;
            this.deltaY = e.movementY;
        } else {
            this.deltaX = e.clientX - lastX;
            this.deltaY = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
        }

            this.pointer.x = e.clientX;
            this.pointer.y = e.clientY;
            this.moveCallbacks.forEach(fn => fn(this.pointer.x, this.pointer.y));
            this.dragCallbacks.forEach(fn => fn(this.deltaX, this.deltaY));
        });

        window.addEventListener("wheel", (e) => {
            this.scrollCallbacks.forEach(fn => fn(e.deltaX, e.deltaY));
        });
    }
    static update() {
        Input.deltaX = 0;
        Input.deltaY = 0;
    }

    static dispose() {
        this.held.clear();
        this.pressMap.clear();
        this.releaseMap.clear();
        this.moveCallbacks.clear();
        this.scrollCallbacks.clear();
    }

        static onDrag(callback: DragCallback) {
            this.dragCallbacks.add(callback);
        }

    static onPress(code: InputCode, callback: Callback) {
        if (!this.pressMap.has(code)) this.pressMap.set(code, new Set());
        this.pressMap.get(code)!.add(callback);
    }

    static onRelease(code: InputCode, callback: Callback) {
        if (!this.releaseMap.has(code)) this.releaseMap.set(code, new Set());
        this.releaseMap.get(code)!.add(callback);
    }

    static onMove(callback: MoveCallback) {
        this.moveCallbacks.add(callback);
    }

    static onScroll(callback: ScrollCallback) {
        this.scrollCallbacks.add(callback);
    }

    static has(code: InputCode): boolean {
        return this.held.has(code);
    }

    private static mouseButtonCode(button: number): InputCode {
        return (
        button === 0 ? "MouseLeft" :
        button === 1 ? "MouseMiddle" :
        button === 2 ? "MouseRight" :
        `Mouse${button}`
        );
    }
}