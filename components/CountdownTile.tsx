'use client';

import { useEffect, useRef, useState } from 'react';

// The owner's InfernoCard shader, verbatim apart from uOctaves (see fbm below).
// Every side gets its own canvas and is oriented in CSS, so the program keeps
// the uv space it was written for: uv.y runs outward from the card, uv.x along
// the edge.
const VERTEX_SRC = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uCardColor;
  uniform float uOctaves;
  uniform float uHover;
  varying vec2 vUv;

  float hash(float x) { return fract(21654.6512 * sin(385.51 * x)); }
  float hash(vec2 p) { return fract(21654.65155 * sin(35.51 * p.x + 45.51 * p.y)); }

  float noise(vec2 p) {
    vec2 fl = floor(p);
    vec2 fr = fract(p);
    fr.x = smoothstep(0.0, 1.0, fr.x);
    fr.y = smoothstep(0.0, 1.0, fr.y);
    float a = mix(hash(fl + vec2(0.0, 0.0)), hash(fl + vec2(1.0, 0.0)), fr.x);
    float b = mix(hash(fl + vec2(0.0, 1.0)), hash(fl + vec2(1.0, 1.0)), fr.x);
    return mix(a, b, fr.y);
  }

  // The reference hardcodes 5 octaves because its shallowest plume is a third
  // of a 340px card. Ours go down to about 20px, and an octave whose period
  // drops under a pixel stops being smoke and renders as hard blocks - which is
  // what a five-octave 13px strip did once. The CPU passes the count that still
  // fits at three pixels per period; a plume deep enough for all five is
  // unaffected. The bound stays constant because GLSL ES 1.0 requires it.
  float fbm(vec2 p) {
    float v = 0.0, f = 1.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      if (float(i) >= uOctaves) break;
      v += noise(p * f) * a;
      f *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 coord = uv * 2.0 - 1.0;
    coord.x *= uResolution.x / uResolution.y;

    float speed = 1.0;
    float p = fbm(vec2(
      noise(coord + uTime * speed / 2.5),
      noise(coord * 2.0 + cos(uTime * speed / 2.0) / 2.0)
    ));

    vec3 cardColor = uCardColor;

    float minP = smoothstep(0.3, 0.8, uv.y) * 0.45;
    p = max(p, minP);

    float edgeDamp = smoothstep(0.0, 0.20, uv.x) * smoothstep(0.0, 0.20, 1.0 - uv.x);
    p *= mix(edgeDamp, 1.0, smoothstep(0.3, 0.85, uv.y));

    vec3 col = pow(vec3(p), vec3(0.3)) - 0.35;
    col = mix(col, cardColor, 1.0 - smoothstep(0.0, 0.2, pow(1.0 / 2.0, 0.5) - coord.y / 40.0));

    float glowBoost = mix(1.0, 1.4, uHover);
    float s  = smoothstep(0.35, 0.6, col.x);
    float s2 = smoothstep(0.47, 0.6, col.x);
    float s3 = smoothstep(0.51, 0.6, col.x);

    col *= cardColor * 2.5 * s;
    col += cardColor * 1.8 * s2;
    col += cardColor * 3.0 * s3;
    col *= 1.8 * glowBoost;

    float burnpoint = 0.65;
    float normalized = max(abs(coord.y - burnpoint), 0.001);
    float burnMask1 = step(0.1, abs(coord.y - burnpoint));
    col = mix(col, col / ((normalized * 1.9) / 0.3), burnMask1);
    col /= normalized;
    col = min(col, cardColor * mix(5.6, 7.0, uHover));

    float burnpoint2 = 0.62;
    float normalized2 = max(abs(coord.y - burnpoint2), 0.001);
    vec3 col2 = cardColor * p * 2.0;
    float burnMask2 = step(0.005, abs(coord.y - burnpoint2));
    col2 = mix(col2, col2 / ((normalized2 * 4.0) / 0.1), burnMask2);
    col2 /= normalized2 * 2.0;
    col2 = min(col2, cardColor * 3.0);
    col += col2 * 0.15;
    col = min(col, vec3(mix(7.5, 9.5, uHover)));

    float brightness = max(col.r, max(col.g, col.b));
    float alpha = smoothstep(0.02, 0.12, brightness);
    alpha *= smoothstep(0.0, 0.3, uv.y);
    alpha *= 1.0 - smoothstep(0.82, 0.95, uv.y);
    alpha *= smoothstep(0.0, 0.12, uv.x) * smoothstep(0.0, 0.12, 1.0 - uv.x);

    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

// Cyan #8dd7ff: the board's existing accent, the one palette colour that is
// neither neutral nor a status, so the smoke never borrows the green or red
// that DESIGN.md reserves for prayer and live-broadcast state.
const SMOKE_COLOR: [number, number, number] = [0x8d / 255, 0xd7 / 255, 0xff / 255];

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * How many octaves a plume of this depth may carry, in device pixels: octave i
 * has period 1/2^i in shader units and one shader unit is half the plume's
 * depth in pixels, so the last usable octave satisfies depth / 2^i >= 6 (three
 * pixels per period, the Nyquist limit plus headroom for a moving field).
 *
 * Guards on finiteness rather than on zero: a degenerate measurement divides,
 * and a NaN reaching gl.uniform1f would be a silent no-op that leaves the
 * plume drawing with the previous octave count.
 */
function octaveBudget(depthPx: number) {
  if (!Number.isFinite(depthPx) || depthPx <= 0) return 1;
  return Math.min(5, Math.max(1, Math.floor(Math.log2(depthPx / 6)) + 1));
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const vertShader = createShader(gl, gl.VERTEX_SHADER, vs);
  const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!vertShader || !fragShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  gl.detachShader(program, vertShader);
  gl.detachShader(program, fragShader);
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);
  return program;
}

type PlumeProps = {
  side: Side;
  hovered: boolean;
};

/** One side of the ring: a wrapper positioned by CSS and one WebGL canvas. */
function SmokePlume({ side, hovered }: PlumeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The board is driven from a TV with no pointer, but the operator previews on
  // a laptop, where the reference's hover lift is the one part that can fire.
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;
  // A lost WebGL context cannot be rebuilt in place; bumping a generation
  // counter re-runs the whole effect against the restored context.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // An operator previewing on a machine set to reduced motion gets the quiet
    // card instead of the loop, the same way the ticker stands still.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const frame = canvas.parentElement;
    if (!frame) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) return;

    const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
    if (!program) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'position');
    const timeLoc = gl.getUniformLocation(program, 'uTime');
    const resLoc = gl.getUniformLocation(program, 'uResolution');
    const colorLoc = gl.getUniformLocation(program, 'uCardColor');
    const octavesLoc = gl.getUniformLocation(program, 'uOctaves');
    const hoverLoc = gl.getUniformLocation(program, 'uHover');

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Only the frame of a side plume stays unrotated, so its width is the depth
    // on the left and right while its height is the depth on the top and bottom.
    const rotated = side === 'left' || side === 'right';
    let octaves = 1;

    const layout = () => {
      const box = frame.getBoundingClientRect();
      const depth = rotated ? box.width : box.height;
      const along = rotated ? box.height : box.width;
      if (!Number.isFinite(depth) || !Number.isFinite(along) || depth < 1 || along < 1) {
        // Cleared rather than left stale: a harness reading these on a hidden
        // plume would otherwise check the previous size's numbers.
        canvas.dataset.octaves = '';
        canvas.dataset.depth = '';
        return;
      }
      // A side canvas is laid out along the card and then rotated onto the edge,
      // so its own box is along x depth - the reference's shape, not the
      // frame's. CSS cannot express that cross-axis size, which is why it is set
      // from the measured frame instead.
      if (rotated) {
        canvas.style.width = `${along}px`;
        canvas.style.height = `${depth}px`;
      }
      // 1.5 caps fill rate on the TV; the smoke is a soft field, so hidpi buys
      // nothing but cost there.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(along * dpr));
      const h = Math.max(1, Math.round(depth * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      octaves = octaveBudget(depth * dpr);
      canvas.dataset.octaves = String(octaves);
      canvas.dataset.depth = String(Math.round(depth));
    };

    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(frame);

    // A random start keeps the eight plumes of two live tiles from pulsing in
    // step; without it, same-sized sides on both cards would move as mirrors.
    const start = performance.now() - Math.random() * 40000;
    let rafId = 0;
    let lastDraw = performance.now();
    let glow = 0;

    const render = (now: number) => {
      rafId = requestAnimationFrame(render);
      // Night mode hides the rail; drawing into it would spend GPU for nothing.
      if (document.documentElement.classList.contains('night-mode')) return;
      // 30fps: the smoke drifts slowly, so halved fill rate is invisible and
      // keeps two tiles cheap on a TV browser.
      if (now - lastDraw < 33) return;
      const dt = (now - lastDraw) / 1000;
      lastDraw = now;
      if (!canvas.width || !canvas.height) return;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(timeLoc, (now - start) / 1000);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform3f(colorLoc, SMOKE_COLOR[0], SMOKE_COLOR[1], SMOKE_COLOR[2]);
      gl.uniform1f(octavesLoc, octaves);
      // The reference's own frame-rate-independent lerp.
      glow += ((hoveredRef.current ? 1 : 0) - glow) * (1 - Math.pow(0.0005, dt));
      gl.uniform1f(hoverLoc, glow);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    rafId = requestAnimationFrame(render);

    const onLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(rafId);
    };
    const onRestored = () => setGeneration((value) => value + 1);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [generation, side]);

  // width/height start at 0 so a probe can tell "never initialized" (no WebGL)
  // apart from a drawn backing store.
  return (
    <div className={`countdown-tile__plume countdown-tile__plume--${side}`} aria-hidden="true">
      <canvas ref={canvasRef} className="countdown-tile__plume-canvas" width={0} height={0} />
    </div>
  );
}

type CountdownTileProps = {
  label: string;
  value: string;
};

/**
 * One countdown under the prayer list. A filled date (anything but the empty
 * dash) lights the tile with four cyan plumes, one per side; an unset date
 * stays a quiet dark card, so the board never claims a countdown that does not
 * exist.
 */
export function CountdownTile({ label, value }: CountdownTileProps) {
  const filled = value.trim() !== '' && value.trim() !== '-';
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`countdown-tile${filled ? ' countdown-tile--live' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {filled ? (
        <>
          <SmokePlume side="top" hovered={hovered} />
          <SmokePlume side="bottom" hovered={hovered} />
          <SmokePlume side="left" hovered={hovered} />
          <SmokePlume side="right" hovered={hovered} />
        </>
      ) : null}
      <span className="countdown-tile__label">{label}</span>
      <span className="countdown-tile__value">{value}</span>
    </div>
  );
}
