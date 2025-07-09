varying vec2 vUv;
varying float vHeight;

#pragma vertex
    #pragma include <extensions/rotation>

    uniform float TIME;
    uniform sampler2D NOISE;
    uniform float WIND_STRENGTH;
    uniform float WIND_SPEED_TIME;
    uniform float DIR_NOISE_SCALE;

    attribute float height;
    attribute vec3 offset;  // per-instance offset

    void main() {
        const float PI2 = 6.28318530718;
        const float INV_128 = 1.0 / 128.0;
        vUv = uv;
        vHeight = height;

        vec2 base = (offset.xz + TIME * WIND_SPEED_TIME) * INV_128;

        float noise = texture2D(NOISE, base).x * 2.0 - 1.0;
        float angle = texture2D(NOISE, base * DIR_NOISE_SCALE).x * PI2;

        float bend = noise * vUv.y * vUv.y;

        vec3 localPos = rotation3dY(angle) * rotation3dZ(bend) * vec3(
            position.x,
            position.y * height,
            position.z
        );
        vec3 worldPos = localPos + vec3(offset.x, offset.y, offset.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
    }

#pragma fragment

void main() {
    float y = vUv.y;
    float ao = 1.0 - 0.2 * (1.0 - y);

    // Natural dark-to-light green gradient
    vec3 bottom = vec3(0.2, 0.3, 0.1); // deep green
    vec3 top = vec3(0.6, 0.8, 0.2);    // lighter, sunlit green

    // Slight yellow tint based on height
    vec3 tallTint = vec3(0.1, 0.15, 0.0) * vHeight;

    vec3 col = mix(bottom, top, y) + tallTint;
    col *= ao;

    gl_FragColor = vec4(col, 1.0);
}