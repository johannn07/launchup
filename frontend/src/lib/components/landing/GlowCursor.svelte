<!-- GlowCursor.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Mesh, Program, Renderer, Triangle } from 'ogl';

  export let color = '#67E8F9';
  export let secondaryColor = '#A78BFA';
  export let trailLength = 40;
  export let trailWidth = 8;
  export let trailTaper = 0.8;
  export let followSpeed = 0.16;
  export let glowIntensity = 1.9;
  export let glowSpread = 1.2;
  export let hotspot = 0.65;
  export let brightness = 1.25;
  export let opacity = 1;
  export let pulseSpeed = 1.1;
  export let noiseStrength = 0.035;
  export let idleFade = true;
  export let idleTimeout = 700;
  export let fadeDuration = 900;
  export let blendMode: 'normal' | 'screen' | 'plus-lighter' = 'screen';
  export let maxDevicePixelRatio = 1.5;
  export let enabled = true;
  export let className = '';

  let containerEl: HTMLDivElement;
  let canvasEl: HTMLCanvasElement;

  const MAX_POINTS = 64;

  const VERTEX_SHADER = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const FRAGMENT_SHADER = `
precision highp float;

#define MAX_POINTS 64

uniform vec2 uResolution;
uniform vec2 uPoints[MAX_POINTS];
uniform float uPointCount;
uniform vec3 uColor;
uniform vec3 uSecondaryColor;
uniform float uTrailWidth;
uniform float uTaper;
uniform float uGlowIntensity;
uniform float uGlowSpread;
uniform float uHotspot;
uniform float uBrightness;
uniform float uOpacity;
uniform float uPulseSpeed;
uniform float uNoiseStrength;
uniform float uTime;
uniform float uFade;

varying vec2 vUv;

float sRGB(float x) {
  if (x <= 0.00031308) return 12.92 * x;
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float filmGrain(vec2 p, float time) {
  float frame = time * 18.0;
  float frameIndex = mod(floor(frame), 256.0);
  float nextFrameIndex = mod(frameIndex + 1.0, 256.0);
  float blend = fract(frame);
  blend = blend * blend * (3.0 - 2.0 * blend);
  vec2 pixel = floor(p);
  float current = hash(pixel + vec2(frameIndex * 17.0, frameIndex * 31.0));
  float next = hash(pixel + vec2(nextFrameIndex * 17.0, nextFrameIndex * 31.0));
  return mix(current, next, blend) * 2.0 - 1.0;
}

void main() {
  vec2 pixel = vUv * uResolution;
  float denominator = max(uPointCount - 1.0, 1.0);
  float strongest = 0.0;
  float strongestCore = 0.0;
  float colorWeight = 0.0;
  vec3 colorSum = vec3(0.0);

  for (int i = 0; i < MAX_POINTS - 1; i++) {
    float index = float(i);
    float active = 1.0 - step(uPointCount - 1.0, index);
    vec2 start = uPoints[i];
    vec2 end = uPoints[i + 1];
    vec2 toPixel = pixel - start;
    vec2 segment = end - start;
    float along = clamp(dot(toPixel, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
    float progress = clamp((index + along) / denominator, 0.0, 1.0);
    float life = pow(max(1.0 - progress, 0.0), mix(0.55, 1.25, uTaper));
    float width = uTrailWidth * mix(1.0, 0.25, pow(progress, mix(0.55, 1.6, uTaper)));
    float distanceToTrail = length(toPixel - segment * along);
    float falloff = max(width * (0.8 + uGlowSpread * 1.4), 0.5);
    float beam = min(1.0, (falloff * falloff) / (distanceToTrail * distanceToTrail + falloff * falloff));
    float core = exp(-pow(distanceToTrail / max(width, 0.5), 2.0) * 2.5);
    float pulseAmount = min(abs(uPulseSpeed), 1.0);
    float pulse = 1.0 + sin(uTime * uPulseSpeed * 3.0 - progress * 11.0) * 0.16 * pulseAmount;
    float intensity = (core + beam * uGlowIntensity * 0.55) * life * pulse * active;
    vec3 segmentColor = mix(uColor, uSecondaryColor, progress);

    strongest = max(strongest, intensity);
    strongestCore = max(strongestCore, core * life * active);
    colorSum += segmentColor * intensity;
    colorWeight += intensity;
  }

  float grain = filmGrain(pixel, uTime);
  float noiseAmount = (1.0 - exp(-uNoiseStrength * 2.2)) * 0.4;
  float alpha = clamp(strongest * uOpacity * uFade, 0.0, 1.0);
  if (alpha < 0.0005) discard;

  vec3 color = colorSum / max(colorWeight, 0.0001);
  color = mix(color, vec3(1.0), smoothstep(0.25, 0.95, strongestCore) * uHotspot);
  float luminance = sRGB(clamp(strongest * uBrightness, 0.0, 1.0));
  luminance *= 1.0 + grain * noiseAmount;
  gl_FragColor = vec4(color * luminance, alpha);
}
`;

  const hexToRgb = (hex: string) => {
    let value = (hex || '').replace('#', '').trim();
    if (value.length === 3)
      value = value.split('').map(c => c + c).join('');
    const parsed = Number.parseInt(value || '000000', 16);
    return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
  };

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  onMount(() => {
    const renderer = new Renderer({
      canvas: canvasEl,
      alpha: true,
      dpr: Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio)
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const pointData = Array(MAX_POINTS * 2).fill(0);
    const points = Array.from({ length: MAX_POINTS }, () => ({ x: 0, y: 0 }));
    const target = { x: 0, y: 0 };
    const head = { x: 0, y: 0 };

    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        uResolution: { value: [1, 1] },
        uPoints: { value: pointData },
        uPointCount: { value: trailLength },
        uColor: { value: hexToRgb(color) },
        uSecondaryColor: { value: hexToRgb(secondaryColor) },
        uTrailWidth: { value: trailWidth },
        uTaper: { value: trailTaper },
        uGlowIntensity: { value: glowIntensity },
        uGlowSpread: { value: glowSpread },
        uHotspot: { value: hotspot },
        uBrightness: { value: brightness },
        uOpacity: { value: opacity },
        uPulseSpeed: { value: pulseSpeed },
        uNoiseStrength: { value: noiseStrength },
        uTime: { value: 0 },
        uFade: { value: 0 }
      },
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    let width = 1;
    let height = 1;
    let initialized = false;
    let pointerInside = false;
    let fade = 0;
    let lastInputTime = performance.now();
    let lastFrameTime = performance.now();
    let raf = 0;
    let destroyed = false;

    const resize = () => {
      width = Math.max(containerEl.clientWidth, 1);
      height = Math.max(containerEl.clientHeight, 1);
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
    };

    const initializeTrail = (x: number, y: number) => {
      target.x = x;
      target.y = y;
      head.x = x;
      head.y = y;
      for (const point of points) {
        point.x = x;
        point.y = y;
      }
      initialized = true;
      fade = 1;
    };

    const updatePointer = (event: PointerEvent) => {
      const rect = containerEl.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(rect.height - (event.clientY - rect.top), 0, rect.height);
      if (!initialized) initializeTrail(x, y);
      target.x = x;
      target.y = y;
      pointerInside = true;
      lastInputTime = performance.now();
    };

    const onPointerLeave = () => {
      pointerInside = false;
      lastInputTime = performance.now();
    };

    const render = (now: number) => {
      if (destroyed) return;
      const delta = Math.min((now - lastFrameTime) / 16.667, 3);
      lastFrameTime = now;

      if (initialized) {
        const headEase = 1 - Math.pow(1 - clamp(followSpeed, 0.01, 0.99), delta);
        const chainBase = clamp(0.28 + followSpeed * 0.35, 0.08, 0.92);
        const chainEase = 1 - Math.pow(1 - chainBase, delta);
        head.x += (target.x - head.x) * headEase;
        head.y += (target.y - head.y) * headEase;
        points[0].x = head.x;
        points[0].y = head.y;

        for (let i = 1; i < MAX_POINTS; i++) {
          points[i].x += (points[i - 1].x - points[i].x) * chainEase;
          points[i].y += (points[i - 1].y - points[i].y) * chainEase;
        }

        for (let i = 0; i < MAX_POINTS; i++) {
          pointData[i * 2] = points[i].x;
          pointData[i * 2 + 1] = points[i].y;
        }
      }

      const idleFor = now - lastInputTime;
      const shouldFade = idleFade && (!pointerInside || idleFor > idleTimeout);
      const fadeStep = (16.667 * delta) / Math.max(fadeDuration, 16);
      const fadeTarget = initialized && enabled && !shouldFade ? 1 : 0;
      fade += (fadeTarget - fade) * Math.min(1, fadeStep * 7);

      program.uniforms.uPointCount.value = clamp(Math.round(trailLength), 2, MAX_POINTS);
      program.uniforms.uColor.value = hexToRgb(color);
      program.uniforms.uSecondaryColor.value = hexToRgb(secondaryColor);
      program.uniforms.uTrailWidth.value = Math.max(trailWidth, 0.1);
      program.uniforms.uTaper.value = clamp(trailTaper, 0, 1);
      program.uniforms.uGlowIntensity.value = Math.max(glowIntensity, 0);
      program.uniforms.uGlowSpread.value = Math.max(glowSpread, 0);
      program.uniforms.uHotspot.value = clamp(hotspot, 0, 1);
      program.uniforms.uBrightness.value = Math.max(brightness, 0);
      program.uniforms.uOpacity.value = clamp(opacity, 0, 1);
      program.uniforms.uPulseSpeed.value = pulseSpeed;
      program.uniforms.uNoiseStrength.value = clamp(noiseStrength, 0, 1);
      program.uniforms.uTime.value = now * 0.001;
      program.uniforms.uFade.value = fade;

      renderer.render({ scene: mesh });
      if (!destroyed) raf = requestAnimationFrame(render);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerEl);
    containerEl.addEventListener('pointermove', updatePointer);
    containerEl.addEventListener('pointerenter', updatePointer);
    containerEl.addEventListener('pointerleave', onPointerLeave);
    resize();
    raf = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      containerEl.removeEventListener('pointermove', updatePointer);
      containerEl.removeEventListener('pointerenter', updatePointer);
      containerEl.removeEventListener('pointerleave', onPointerLeave);
      mesh.geometry.remove();
      program.remove();
    };
  });
</script>

<div bind:this={containerEl} class="glow-cursor {className}" {...$$restProps}>
  <canvas bind:this={canvasEl} class="glow-cursor__canvas" style="mix-blend-mode: {blendMode}" aria-hidden="true"></canvas>
  <div class="glow-cursor__content">
    <slot />
  </div>
</div>

<style>
  .glow-cursor {
    position: relative;
    width: 100%;
    min-height: 100vh;
  }
  .glow-cursor__canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
    z-index: 9999;
  }
  .glow-cursor__content {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
  }
</style>