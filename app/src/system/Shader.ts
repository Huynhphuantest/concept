export type Shader = {
  vert: string;
  frag: string;
};

export const DEFAULT_VERT_SHADER = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

export async function getShader(
  shaderName: string,
  args: { modules?: Record<string, string[]> } = {}
): Promise<Shader> {
  const shader = splitShader(await getShaderFile(shaderName));

  return {
    vert: await preprocess(shader.vert, new Set(), args),
    frag: await preprocess(shader.frag, new Set(), args)
  };
}
export async function getComputeShader(
  path: string,
  args: { modules?: Record<string, string[]> } = {}
): Promise<string> {
  const shader = await getShaderFile(path);
  return preprocess(shader, new Set(), args);
}

function splitShader(file: string): Shader {
  const vertex: string[] = [];
  const fragment: string[] = [];
  const both: string[] = [];
  let appending: string[] | undefined = undefined;

  const lines = file.split('\n');
  for (const line of lines) {
    if (!line.includes('#pragma')) {
      if (appending) appending.push(line);
      else both.push(line);
      continue;
    }

    const command = line.split(' ')[1];
    if (command === 'vertex') {
      appending = vertex;
      continue;
    } else if (command === 'fragment') {
      appending = fragment;
      continue;
    }

    if (appending) appending.push(line);
    else both.push(line);
  }

  const bothStr = both.join('\n');
  return {
    vert: bothStr + vertex.join('\n'),
    frag: bothStr + fragment.join('\n')
  };
}

type Instruction = {
  command: string;
  args: string[];
};

function toInstruction(line: string): Instruction {
  const words = line.trim().split(/\s+/);
  return {
    command: words[1],
    args: words.slice(2)
  };
}

const pragmas: {
  [key: string]: (
    processed: string[],
    indices: number[],
    included: Set<string>,
    args: { modules?: Record<string, string[]> }
  ) => Promise<void>;
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
  },

  module: async (processed, indices, _included, args) => {
    const modulesMap = args.modules || {};
    for (const index of indices) {
      const instruction = toInstruction(processed[index]);
      const key = instruction.args[0]?.replace(/['"]/g, '');

      if (!modulesMap[key]) {
        processed[index] = `// missing module for key "${key}"`;
        continue;
      }

      processed[index] = modulesMap[key].join('\n');
    }
  }
};

async function preprocess(
  file: string,
  included = new Set<string>(),
  args: { modules?: Record<string, string[]> } = {}
): Promise<string> {
  const processed: string[] = [];
  const commands: Record<string, number[]> = {};
  const lines = file.split('\n');

  let index = -1;
  for (let line of lines) {
    index++;
    line = line.replace(/\/\/.*$/g, '').trim();
    if (line === '') continue;

    processed.push(line);

    if (!line.includes('#pragma')) continue;

    const command = line.split(/\s+/)[1];
    if (!commands[command]) commands[command] = [];
    commands[command].push(index);
  }

  for (const [key, value] of Object.entries(commands)) {
    if (pragmas[key]) {
      await pragmas[key](processed, value, included, args);
    }
  }

  return processed.join('\n');
}
async function getShaderFile(path: string): Promise<string> {
    const res = await fetch(`/shaders/${path}.glsl?raw`);
    const contentType = res.headers.get("Content-Type");

    if (!res.ok || contentType?.includes("text/html")) {
        throw new Error(`Shader file not found: ${path}`);
    }

    return await res.text();
}