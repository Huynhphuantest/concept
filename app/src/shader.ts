export type Shader = {
    vert:string;
    frag:string;
}

export async function getShader(shaderName:string):Promise<Shader> {
    const shader = splitShader(await getShaderFile(shaderName));

    return {
        vert: await preprocess(shader.vert),
        frag: await preprocess(shader.frag)
    };
}
function splitShader(file:string):Shader {
    let vertex:string[] = [];
    let fragment:string[] = [];
    let both:string[] = [];
    let appending:undefined|string[] = undefined;
    const lines = file.split("\n");
    for(const line of lines) {
        if(!line.includes("#pragma")) {
            if(appending !== undefined) appending.push(line);
            else both.push(line);
            continue;
        }
        const instruction = line.split(" ");
        const command = instruction[1];
        if(command === "vertex") { appending = vertex; continue; }
        else if(command === "fragment") { appending = fragment; continue; }
        if(appending !== undefined) appending.push(line);
        else both.push(line);
    }
    const bothStr = both.join("\n");
    const vertStr = bothStr + vertex.join("\n");
    const fragStr = bothStr + fragment.join("\n");
    return {
        vert:vertStr,
        frag:fragStr,
    };
}
type Instruction = {
    command:string,
    args:string[]
}
function toInstruction(line:string):Instruction {
    const words = line.split(" ");
    return {
        command: words[1],
        args: words.slice(2)
    }
}
const pragmas: {
    [key: string]: (processed: string[], indices: number[], included: Set<string>) => Promise<void>
} = {
    include: async (processed, indices, included) => {
        for (const index of indices) {
            const instruction = toInstruction(processed[index]);
            const raw = instruction.args[0];
            const name = raw.replace(/[<>]/g, '');

            if (included.has(name)) {
                processed[index] = ''; // Skip duplicate include
                continue;
            }

            included.add(name);

            const file = await getShaderFile(name);
            const processedInclude = await preprocess(file, included);
            processed[index] = processedInclude;
        }
    }
}
async function preprocess(file: string, included = new Set<string>()): Promise<string> {
    const processed: string[] = [];
    const commands: { [key: string]: number[] } = {};
    const lines = file.split("\n");

    let index = -1;
    for (let line of lines) {
        index++;
        // Remove inline and full-line comments
        line = line.replace(/\/\/.*$/g, "").trim();
        if (line === "") continue;

        processed.push(line)

        if (!line.includes("#pragma")) continue;

        const command = line.split(/\s+/)[1];
        if (!commands[command]) commands[command] = [];
        commands[command].push(index);
    }

    for (const [key, value] of Object.entries(commands)) {
        if (pragmas[key]) {
            await pragmas[key](processed, value, included);
        }
    }

    return processed.join("\n");
}
async function getShaderFile(path: string): Promise<string> {
    const res = await fetch(`/shaders/${path}.glsl?raw`);
    const contentType = res.headers.get("Content-Type");

    if (!res.ok || contentType?.includes("text/html")) {
        throw new Error(`Shader file not found: ${path}`);
    }

    return await res.text();
}