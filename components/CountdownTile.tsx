'use client';

import { useEffect, useRef, useState } from 'react';

// The fragment program is the owner's InfernoCard shader, kept verbatim except
// the hover uniform: the wall board has no pointer, so its glow boost could
// never fire and would only be a uniform nobody sets.
const VERTEX_SRC = `
  attribute vec2 position;
  uniform vec4 uUvX;
  uniform vec4 uUvY;
  varying vec2 vUv;
  void main() {
    vec2 local = position * 0.5 + 0.5;
    // Each edge of the ring needs the plume pointing its own way, so the corner
    // coordinates are mapped per side. Two affine rows cover rotation and
    // reflection as well as a plain scale, which is what the shader's own
    // alpha falloffs then act on: uv.y runs outward from the card, so the mass
    // band sits at the card edge and dissolves away from it, and uv.x runs along
    // the edge so the ends fade out at the corners instead of stopping dead.
    vUv.x = uUvX.x + local.x * uUvX.z + local.y * uUvX.w;
    vUv.y = uUvY.x + local.x * uUvY.z + local.y * uUvY.w;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uCardColor;
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

  float fbm(vec2 p) {
    float v = 0.0, f = 1.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
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

    float s  = smoothstep(0.35, 0.6, col.x);
    float s2 = smoothstep(0.47, 0.6, col.x);
    float s3 = smoothstep(0.51, 0.6, col.x);

    col *= cardColor * 2.5 * s;
    col += cardColor * 1.8 * s2;
    col += cardColor * 3.0 * s3;
    col *= 1.8;

    float burnpoint = 0.65;
    float normalized = max(abs(coord.y - burnpoint), 0.001);
    float burnMask1 = step(0.1, abs(coord.y - burnpoint));
    col = mix(col, col / ((normalized * 1.9) / 0.3), burnMask1);
    col /= normalized;
    col = min(col, cardColor * 5.6);

    float burnpoint2 = 0.62;
    float normalized2 = max(abs(coord.y - burnpoint2), 0.001);
    vec3 col2 = cardColor * p * 2.0;
    float burnMask2 = step(0.005, abs(coord.y - burnpoint2));
    col2 = mix(col2, col2 / ((normalized2 * 4.0) / 0.1), burnMask2);
    col2 /= normalized2 * 2.0;
    col2 = min(col2, cardColor * 3.0);
    col += col2 * 0.15;
    col = min(col, vec3(7.5));

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

/** An affine row: uv = row.x + local.x * row.z + local.y * row.w. */
type UvRow = [number, number, number, number];

type Strip = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Runs along the edge, so the strip's ends fade at the card's corners. */
  uvX: UvRow;
  /** Runs outward from the card edge, hot against the card and gone at the rail. */
  uvY: UvRow;
};

/**
 * The outward axis of each side, in the shader's own uv space.
 *
 * Everything here stays below uv.y ~0.55, and that is the whole trick. Above
 * that the shader runs into its own fire: `burnpoint = 0.65` divides colour by
 * |coord.y - 0.65| and `col = min(col, cardColor * 5.6)` clips the result, so any
 * pixel with p above ~0.6 turns solid white. Its floor, minP, already reads
 * 0.25 by uv.y 0.7, so there is no room up there for a plume that stays smoke.
 * Mapping a strip down to uv.y 0 walks straight into that wall - which is what
 * put a bright slab against the card before.
 *
 * So each strip climbs from 0.55 at the card edge down to 0.10 outward, where
 * `alpha *= smoothstep(0, 0.3, uv.y)` has carried the plume to nothing and
 * minP has fallen to zero, leaving plain fbm wisps to fade out on their own.
 *
 * The sign is what makes each side face outward: local.y increases upward in GL,
 * and local.x increases rightward, so a strip below or beside the card counts
 * the other way.
 */
const SIDE_RANGE: Record<Side, UvRow> = {
  top: [0.55, 0, 0, -0.45],
  bottom: [0.1, 0, 0, 0.45],
  left: [0.55, 0, -0.45, 0],
  right: [0.1, 0, 0.45, 0],
};

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

function SmokeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A lost WebGL context cannot be rebuilt in place; bumping a generation counter
  // re-runs the whole effect against the restored context.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // An operator previewing on a machine set to reduced motion gets the quiet
    // card instead of the loop, the same way the ticker stands still.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

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
    const uvXLoc = gl.getUniformLocation(program, 'uUvX');
    const uvYLoc = gl.getUniformLocation(program, 'uUvY');

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);

    const start = performance.now() - Math.random() * 40000;
    let rafId = 0;
    let lastDraw = Number.NEGATIVE_INFINITY;

    /**
     * The ring is drawn as four strips instead of one full-canvas quad, so each
     * edge gets its own uv mapping and the plume leaves the card sideways as
     * well as upward. One canvas and one WebGL context still serve all four;
     * only the scissor rect and two uniforms change per pass.
     *
     * The uv mapping is built here rather than looked up from a table because it
     * depends on the card's measured extent: each strip has to fade out exactly
     * at the card's corners. A strip whose along-edge axis is stretched over the
     * whole ring puts its bright middle right on the corner, where the two
     * neighbouring strips then overlap and stack into a hard bright wedge.
     *
     * Bleeds are read from the DOM rather than hardcoded, so the CSS stays the
     * single place that decides how much clear rail the smoke may use.
     */
    let strips: Strip[] = [];

    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const tileRect = canvas.parentElement?.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height || !tileRect) {
        strips = [];
        return;
      }

      // 1.5 keeps the smoke crisp on hidpi previews while capping fill rate on
      // the TV, where sub-pixel smoke detail is invisible from the sofa anyway.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const ringW = Math.max(1, Math.round(canvasRect.width * dpr));
      const ringH = Math.max(1, Math.round(canvasRect.height * dpr));
      if (canvas.width !== ringW || canvas.height !== ringH) {
        canvas.width = ringW;
        canvas.height = ringH;
      }

      const leftBleed = Math.max(0, (tileRect.left - canvasRect.left) * dpr);
      const rightBleed = Math.max(0, (canvasRect.right - tileRect.right) * dpr);
      const topBleed = Math.max(0, (tileRect.top - canvasRect.top) * dpr);
      const bottomBleed = Math.max(0, (canvasRect.bottom - tileRect.bottom) * dpr);

      // GL's origin is bottom-left, so every rect here is measured from there.
      const bodyTop = topBleed;
      const cardW = Math.max(1, ringW - leftBleed - rightBleed);
      const cardH = Math.max(1, ringH - topBleed - bottomBleed);

      // A strip running along the card's top or bottom edge has to fade out at
      // the card's corners, so its uv.x spans the card's width inside the wider
      // ring rather than the ring's own width.
      const alongCardWidth: UvRow = [-leftBleed / cardW, 0, ringW / cardW, 0];
      // The side strips are exactly as tall as the card, so uv.x already runs
      // corner to corner; the right one counts the other way so its fade lands on
      // its own two ends instead of running off the far edge.
      const alongCardHeight: UvRow = [0, 0, 0, 1];
      const alongCardHeightFlipped: UvRow = [1, 0, 0, -1];

      strips = (
        [
          { x: 0, y: bodyTop, w: ringW, h: topBleed, uvX: alongCardWidth, uvY: SIDE_RANGE.top },
          { x: 0, y: 0, w: ringW, h: bottomBleed, uvX: alongCardWidth, uvY: SIDE_RANGE.bottom },
          { x: 0, y: bodyTop, w: leftBleed, h: cardH, uvX: alongCardHeight, uvY: SIDE_RANGE.left },
          {
            x: ringW - rightBleed,
            y: bodyTop,
            w: rightBleed,
            h: cardH,
            uvX: alongCardHeightFlipped,
            uvY: SIDE_RANGE.right,
          },
        ] satisfies Strip[]
      ).filter((strip) => strip.w >= 1 && strip.h >= 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const render = (now: number) => {
      rafId = requestAnimationFrame(render);
      // Night mode hides the rail; drawing into it would spend GPU for nothing.
      if (document.documentElement.classList.contains('night-mode')) return;
      // 30fps: the smoke drifts slowly, so halved fill rate is invisible and
      // keeps two tiles cheap on a TV browser.
      if (now - lastDraw < 33) return;
      lastDraw = now;
      if (!strips.length) return;

      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);

      gl.uniform1f(timeLoc, (now - start) / 1000);
      gl.uniform3f(colorLoc, SMOKE_COLOR[0], SMOKE_COLOR[1], SMOKE_COLOR[2]);

      for (const strip of strips) {
        gl.viewport(strip.x, strip.y, strip.w, strip.h);
        gl.scissor(strip.x, strip.y, strip.w, strip.h);
        // Each strip resolves its own resolution, which is what makes its noise
        // isotropic in its own pixels: the shader scales coord.x by
        // width/height, so a strip's proportions become the shape of its wisps.
        // A 483x30 strip gets long horizontal streaks, a 54x140 one gets tall
        // vertical ones, and both read as smoke leaving that edge. Sharing one
        // resolution across the ring would instead give every strip the ring's
        // 2.6:1 ratio, which leaves the side plumes as small round blobs.
        gl.uniform2f(resLoc, strip.w, strip.h);
        gl.uniform4fv(uvXLoc, strip.uvX);
        gl.uniform4fv(uvYLoc, strip.uvY);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.disable(gl.SCISSOR_TEST);
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
  }, [generation]);

  // width/height start at 0 so a probe can tell "never initialized" (no WebGL)
  // apart from a drawn backing store.
  return (
    <canvas ref={canvasRef} className="countdown-tile__smoke" width={0} height={0} aria-hidden="true" />
  );
}

type CountdownTileProps = {
  label: string;
  value: string;
};

/**
 * One countdown under the prayer list. A filled date (anything but the empty
 * dash) lights the tile with the cyan smoke shader; an unset date stays a
 * quiet dark card, so the board never claims a countdown that does not exist.
 */
export function CountdownTile({ label, value }: CountdownTileProps) {
  const filled = value.trim() !== '' && value.trim() !== '-';

  return (
    <div className={`countdown-tile${filled ? ' countdown-tile--live' : ''}`}>
      {filled ? <SmokeCanvas /> : null}
      <span className="countdown-tile__label">{label}</span>
      <span className="countdown-tile__value">{value}</span>
    </div>
  );
}
