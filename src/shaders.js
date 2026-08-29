export const noiseVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const hoverFns = /* glsl */ `
vec2 hash2h(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float hoverFalloff(float dist, float r) {
  return exp(-pow(dist / max(r, 0.001), 2.0));
}

vec3 sphereNormal(vec2 uv) {
  float rad = max(uSphereUvRadius, 0.0001);
  vec2 p = vec2((uv.x - 0.5) / rad, (0.5 - uv.y) / rad);
  float z2 = 1.0 - dot(p, p);
  if (z2 <= 0.002) return vec3(0.0);
  return normalize(vec3(p.x, p.y, sqrt(z2)));
}

vec3 hoverFx(vec2 uv, float clock) {
  vec3 none = vec3(0.0);
  if (uMouseEnabled < 0.5 || uHitValid < 0.5) return none;
  vec3 n = sphereNormal(uv);
  if (n.z < 0.02) return none;

  float dist = acos(clamp(dot(n, uHitN), -1.0, 1.0));
  vec3 away = cross(cross(uHitN, n), n);
  vec2 dir = length(away.xy) > 1e-5 ? normalize(vec2(away.x, -away.y)) : vec2(0.0);
  float r = max(uMouseRadius / max(uSphereUvRadius, 0.001) * 0.9, 0.05);
  float fall = hoverFalloff(dist, r);
  float trail = texture2D(uMouseTrailTex, uv).r * fall;
  float speed = clamp(u_mouseSpeed, 0.0, 1.0);
  float mode = uHoverMode;
  vec2 disp = vec2(0.0);
  float add = 0.0;
  float str = uMouseStrength;
  float uvScale = uSphereUvRadius;

  if (mode < 0.5) {
    float rings = sin(dist * 34.0 - clock * 9.0);
    float env = exp(-dist / (r * 1.35));
    add = rings * env * 0.55 * str;
    disp = dir * rings * env * 0.018 * str * uvScale;
  } else if (mode < 1.5) {
    float p = 0.5 + 0.5 * sin(clock * 5.4);
    add = fall * p * 0.85 * str;
    disp = dir * fall * (p - 0.5) * 0.014 * str * uvScale;
  } else if (mode < 2.5) {
    add = trail * 0.7 * str;
    vec2 back = length(u_mouseDir) > 0.01 ? -normalize(u_mouseDir) : dir;
    disp = back * trail * 0.028 * str * uvScale;
  } else if (mode < 3.5) {
    vec2 nh = hash2h(n.xy * 18.0 + clock * 1.6) - 0.5;
    disp = nh * fall * 0.05 * str * uvScale;
    add = (nh.x + nh.y) * fall * 0.15 * str;
  } else if (mode < 4.5) {
    add = pow(fall, 2.4) * 1.35 * str;
    disp = -dir * pow(fall, 2.0) * 0.016 * str * uvScale;
  } else if (mode < 5.5) {
    disp = -dir * fall * 0.055 * str * uvScale;
    add = fall * 0.22 * str;
  } else if (mode < 6.5) {
    float wave = fract(clock * 0.42);
    float ring = exp(-pow((dist - wave * 0.42) / 0.028, 2.0));
    add = ring * 1.05 * str;
    disp = dir * ring * 0.024 * str * uvScale;
  } else if (mode < 7.5) {
    float spec = hash2h(floor(n.xy * 42.0 + clock * 3.0)).x;
    add = spec * fall * 0.9 * str;
    disp = (hash2h(n.xy * 30.0) - 0.5) * fall * 0.024 * str * uvScale;
  } else if (mode < 8.5) {
    float ridge = sin((n.x + n.y) * 28.0 + dist * 18.0);
    add = ridge * fall * 0.45 * str;
    disp = vec2(ridge, -ridge) * fall * 0.02 * str * uvScale;
  } else {
    vec2 md = length(u_mouseDir) > 0.01 ? normalize(u_mouseDir) : vec2(0.0, -1.0);
    float aligned = max(0.0, dot(-dir, md));
    float tail = pow(aligned, 4.0) * fall * (0.35 + speed);
    add = (pow(fall, 2.0) * 0.4 + tail) * str;
    disp = md * (fall * 0.024 + tail * 0.036) * str * uvScale;
  }

  return vec3(disp, add);
}
`;

export const noiseFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float time;
uniform float noiseSeed;
uniform float noiseScale;
uniform float noiseSpeed;
uniform float noiseEvolveSpeed;
uniform vec2 u_mouse;
uniform vec2 u_mouseDir;
uniform float u_mouseSpeed;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;
uniform float uHoverMode;
uniform vec3 uHitN;
uniform float uHitValid;
uniform float uSphereUvRadius;
uniform sampler2D uMouseTrailTex;
${hoverFns}

vec2 hash2(vec2 p) {
  p = vec2(
    dot(p, vec2(127.1 + noiseSeed * 0.001, 311.7)),
    dot(p, vec2(269.5, 183.3 + noiseSeed * 0.002))
  );
  return fract(sin(p) * 43758.5453);
}

float worley(vec2 uv) {
  vec2 n = floor(uv);
  vec2 f = fract(uv);
  float d = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g);
      o = 0.5 + 0.5 * sin(time * noiseEvolveSpeed + 6.2831853 * o);
      vec2 r = g + o - f;
      d = min(d, dot(r, r));
    }
  }
  return 1.0 - clamp(sqrt(d), 0.0, 1.0);
}

void main() {
  vec3 h = hoverFx(vUv, time);
  vec2 drift = vec2(time * noiseSpeed, time * noiseSpeed * 0.62);
  vec2 uv = vUv + h.xy;
  float n = worley(uv * noiseScale + drift);
  float n2 = worley(uv * noiseScale * 1.7 - drift * 0.5 + vec2(1.7, 0.3));
  float field = mix(n, n2, 0.35) + h.z * 0.55;
  gl_FragColor = vec4(vec3(clamp(field, 0.0, 1.0)), 1.0);
}
`;

export const coronaFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D iBuffer;
uniform sampler2D iNoise;
uniform sampler2D iGlobeSphere;
uniform sampler2D uMouseTrailTex;
uniform vec2 uResolution;
uniform float uFrameCount;
uniform float uDisplaceFactor;
uniform float uMixFactor;
uniform float uScaleFactor;
uniform float uExpandFactor;
uniform float uUvScale;
uniform float uTime;
uniform vec2 u_mouse;
uniform vec2 u_mouseDir;
uniform float u_mouseSpeed;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;
uniform float uHoverMode;
uniform vec3 uHitN;
uniform float uHitValid;
uniform float uSphereUvRadius;
${hoverFns}

vec2 unscale(vec2 uv, float s) {
  return (uv - 0.5) / max(s, 0.0001) + 0.5;
}

vec4 sampleClamp(sampler2D tex, vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(tex, clamp(uv, 0.0, 1.0));
}

float rimFade(vec2 uv) {
  float d = length(uv - 0.5);
  return 1.0 - smoothstep(0.445, 0.498, d);
}

void main() {
  vec2 noiseUv = unscale(vUv, uUvScale);
  vec4 noise = texture2D(iNoise, noiseUv);
  vec2 displacement = (noise.xy * 2.0 - 1.0);
  vec2 center = vec2(0.5);
  float zoom = (100.0 - uScaleFactor) / 100.0;
  vec2 scaled = (vUv - center) * zoom + center;
  vec3 h = hoverFx(vUv, uTime);
  vec2 sampleUv = scaled + displacement * uDisplaceFactor + h.xy * 1.15;

  vec4 expanded = vec4(0.0);
  float maxI = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 off = vec2(float(x), float(y)) * (uExpandFactor / max(uResolution.x, 1.0));
      vec4 s = sampleClamp(iBuffer, sampleUv + off);
      float intensity = dot(s.rgb, vec3(0.299, 0.587, 0.114));
      if (intensity > maxI) {
        maxI = intensity;
        expanded = s;
      }
    }
  }

  vec4 original = sampleClamp(iGlobeSphere, vUv);
  vec4 color = (uFrameCount <= 4.0)
    ? original
    : mix(expanded, original, uMixFactor);
  color.rgb += vec3(max(h.z, 0.0) * 0.22);
  color.rgb *= rimFade(vUv);
  gl_FragColor = color;
}
`;

export const blendFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uUvScale;
uniform sampler2D tDiffuse;
uniform sampler2D tDisplacementTexture;
uniform sampler2D tGlobeSphere;
uniform sampler2D tGlobeSphereSharp;
uniform sampler2D tNoise;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uBackgroundColor;
uniform float levelsBlack;
uniform float levelsWhite;
uniform float gamma;
uniform float mapStrength;
uniform float sphereInvert;
uniform float sphereAdd;
uniform float mapBlur;
uniform float innerNoiseAmount;
uniform float innerNoiseBlur;
uniform float innerNoiseBlack;
uniform float innerNoiseWhite;
uniform float innerNoiseGamma;
uniform float landBoost;
uniform float uDebugView;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 applyLevels(vec3 c, float b, float w, float g) {
  float ww = max(w, b + 1e-4);
  vec3 n = clamp((c - b) / (ww - b), 0.0, 1.0);
  return pow(n, vec3(1.0 / max(g, 1e-4)));
}

float applyLevels1(float x, float b, float w, float g) {
  float ww = max(w, b + 1e-4);
  float n = clamp((x - b) / (ww - b), 0.0, 1.0);
  return pow(n, 1.0 / max(g, 1e-4));
}

float blurNoise(vec2 uv, float radiusPx) {
  vec2 r = (1.0 / max(uResolution, vec2(1.0))) * radiusPx;
  float a = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      a += luma(texture2D(tNoise, uv + vec2(float(x), float(y)) * r).rgb);
    }
  }
  return a / 9.0;
}

float mapFill(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return luma(texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb);
}

void main() {
  vec2 scaledUVs = (vUv - 0.5) * uUvScale + 0.5;
  if (uDebugView > 0.5 && uDebugView < 1.5) {
    gl_FragColor = texture2D(tNoise, vUv);
    return;
  }
  if (uDebugView > 1.5 && uDebugView < 2.5) {
    gl_FragColor = texture2D(tDiffuse, scaledUVs);
    return;
  }
  if (uDebugView > 2.5 && uDebugView < 3.5) {
    gl_FragColor = texture2D(tDisplacementTexture, scaledUVs);
    return;
  }
  if (uDebugView > 3.5 && uDebugView < 4.5) {
    gl_FragColor = texture2D(tGlobeSphere, scaledUVs);
    return;
  }

  float radial = length(vUv - 0.5);
  float flareGate = 1.0 - smoothstep(0.448, 0.498, radial);

  vec4 tex0 = texture2D(tDisplacementTexture, clamp(scaledUVs, 0.0, 1.0));
  vec4 tex2 = texture2D(tGlobeSphere, clamp(scaledUVs, 0.0, 1.0));
  vec4 tex4 = texture2D(tGlobeSphereSharp, clamp(scaledUVs, 0.0, 1.0));

  float mapA = mapFill(scaledUVs);
  if (mapBlur > 0.5) {
    vec2 r = (1.0 / max(uResolution, vec2(1.0))) * mapBlur;
    float s = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        s += mapFill(scaledUVs + vec2(float(x), float(y)) * r);
      }
    }
    mapA = s / 9.0;
  }

  vec3 differenceBlend1 = abs(tex0.rgb - mapStrength * vec3(mapA));
  vec3 differenceBlend2 = abs(differenceBlend1 - (1.0 - sphereInvert * tex4.rgb));
  vec3 spherePart = clamp(sphereAdd * tex2.rgb, 0.0, 1.0);
  vec3 exclusionBlend = differenceBlend2 + spherePart - 2.0 * differenceBlend2 * spherePart;

  float inside = smoothstep(0.20, 0.95, luma(tex0.rgb));
  float n = luma(texture2D(tNoise, vUv).rgb);
  if (innerNoiseBlur > 0.5) n = blurNoise(vUv, innerNoiseBlur);
  n = applyLevels1(n, innerNoiseBlack, innerNoiseWhite, innerNoiseGamma);

  vec3 injected = exclusionBlend + (n - 0.5) * innerNoiseAmount * inside;
  vec3 shaped = applyLevels(injected, levelsBlack, levelsWhite, gamma);
  float glow = clamp(luma(shaped), 0.0, 1.0);
  float land = smoothstep(0.12, 0.62, mapA);
  vec3 tinted = mix(uColor1, uColor2, glow);
  tinted = mix(tinted, uColor1, land * landBoost);
  tinted = mix(tinted, uColor2, (1.0 - land) * 0.55);
  tinted = mix(tinted, vec3(1.0, 0.62, 0.88), glow * (1.0 - land) * 0.18);
  float cover = luma(tex0.rgb) * flareGate;
  vec3 base = mix(uBackgroundColor, tinted, cover);
  gl_FragColor = vec4(base, 1.0);
}
`;
