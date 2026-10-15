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
  uniform float uOctaves;
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

  // The octave count is a uniform, not a literal, because how much detail a
  // strip can carry depends on how many pixels it has. Each octave doubles the
  // frequency, and once a period falls under a pixel it stops being smoke and
  // becomes aliasing - which is exactly what happened to the bottom edge when
  // its plume was 13px tall and carried the shader's full five octaves: the
  // last one landed under a pixel and rendered as a band of hard blocks.
  //
  // The CPU works out how many octaves still fit at three pixels per period
  // and passes that in, so a thin strip gets fewer, softer octaves and a tall
  // one gets more. The loop bound stays constant, as GLSL ES 1.0 requires; the
  // uniform only ends it early.
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

    // 0.58 rather than this shader's 0.45, and the whole point is where it lands.
    // The colour gate below opens at p ~0.305, so a floor of 0.225 at the card
    // edge sits well under it: whether the plume shows at all came down to
    // whether the drifting fbm happened to be high that second, and the ring
    // would fade out and back in over time. 0.58 puts the floor just under the
    // gate instead, so the noise only has to tip it, and the ring stays present
    // while still varying - and still well clear of the burn band above, where
    // a floor this size would light the whole strip at once.
    float minP = smoothstep(0.3, 0.8, uv.y) * 0.58;
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
    // The shader's own ramp, unmodified. It is steep - a fifth of a unit from
    // invisible to opaque - which is why the plume used to resolve into
    // hard-edged lozenges, but that is the CSS blur's job to fix now, and this
    // ramp is also where the smoke gets its density. Widening it to soften the
    // edges cost both: at a mean brightness near 0.14 a ramp ending at 0.45 left
    // the plume under a fifth opaque, and the ring all but disappeared.
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
  /** How far coord.x is stretched, solved so the noise drifts outward. */
  aspect: number;
  /** How many octaves this strip's pixels can carry before aliasing. */
  octaves: number;
};

// How much longer the noise runs across a plume than along it, which is what
// makes smoke stream off an edge instead of sitting in round puffs. Two and a
// half is not arbitrary, it is where this stopped looking like spikes: at four,
// a three-octave strip resolves each blob as one hard-tipped thorn, and at one
// they go back to being circles.
const NOISE_STRETCH = 2.5;
const MIN_OCTAVES = 3;
// The most coord units one pixel may be worth and still leave MIN_OCTAVES
// octaves: octave MIN_OCTAVES-1 runs at 2^(MIN_OCTAVES-1) times the base.
const DETAIL_BUDGET = 1 / (3 * Math.pow(2, MIN_OCTAVES - 1));

/**
 * Shapes one strip's noise: how stretched it is, and how many octaves its
 * pixels can hold.
 *
 * rateY is the coord units one pixel is worth across the plume, and perAspect
 * is that same figure per unit of the aspect ratio the shader multiplies coord.x
 * by. Solving rateX = NOISE_STRETCH * rateY for that ratio stretches the noise
 * that many times longer across the plume than along it, which is what makes
 * smoke stream away from the edge it is leaving instead of sitting in round
 * puffs. Because it is solved rather than guessed, a 340x83 strip and a 37x100
 * one come out with the same outward drift, and four strips of very different
 * shape still read as one ring.
 *
 * The stretch is not applied unconditionally, because stretching costs detail:
 * the thinner a strip is, the less of its noise budget the stretch may spend
 * before the octaves run out, and one octave is not smoke, it is a row of blobs.
 * So the aspect is the smaller of the two - the one the drift wants and the one
 * the detail budget allows - with MIN_OCTAVES held back as the floor.
 *
 * The octave count itself follows from the geometry. Octave i runs at frequency
 * 2^i, so the last octave worth keeping is the one whose period is still three
 * pixels - the Nyquist limit plus headroom, since this animates and shimmer
 * reads worse on a wall board than a missing octave does. This is also why the
 * aspect ratio no longer needs clamping on its own account: a 13px-tall strip
 * used to be handed all five octaves the shader ships with, its top two landed
 * finer than a pixel, and that is what rendered its plume as hard blocks.
 *
 * Guards on finiteness rather than on zero: a strip one dimension short
 * divides by that dimension, and the rates come back as Infinity, not as 0.
 * Two Infinities in the ratio below would be NaN, and NaN would reach
 * gl.uniform2f as a silent no-op and leave a strip drawing the previous
 * frame's noise. Such a strip is dropped by the size filter anyway - this only
 * has to keep it harmless until then.
 */
function shapeNoise(uvX: UvRow, uvY: UvRow, w: number, h: number) {
  const rateY = 2 * Math.max(Math.abs(uvY[2]) / w, Math.abs(uvY[3]) / h);
  const perAspect = 2 * Math.max(Math.abs(uvX[2]) / w, Math.abs(uvX[3]) / h);
  if (!Number.isFinite(rateY) || !Number.isFinite(perAspect)) return { aspect: 1, octaves: 1 };

  const forDrift = (NOISE_STRETCH * rateY) / perAspect;
  const forDetail = DETAIL_BUDGET / perAspect;
  const aspect = Math.min(12, Math.max(0.8, Math.min(forDrift, forDetail)));
  const rate = Math.max(aspect * perAspect, rateY);
  return { aspect, octaves: Math.min(5, Math.max(1, Math.floor(Math.log2(1 / (3 * rate)) + 1))) };
}

/**
 * The outward axis of each side, in the shader's own uv space.
 *
 * Everything here stays below uv.y ~0.55, and that ceiling is the whole trick.
 * Above it the shader runs into its own fire: `burnpoint = 0.65` divides colour
 * by |coord.y - 0.65| and `col = min(col, cardColor * 5.6)` clips the result, so
 * any pixel with p above ~0.6 turns solid white. At uv.y 0.62 its floor, minP,
 * already reads past the shader's own colour gate, which lights the whole strip
 * at once and leaves the fbm peaks as hard white shards rather than smoke.
 * 0.55 keeps the floor just under that gate, so the plume is lit by the noise
 * itself and stays patchy and soft.
 *
 * The far end walks to where `alpha *= smoothstep(0, 0.3, uv.y)` has carried the
 * plume to nothing, leaving plain fbm wisps to dissolve on their own.
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
    const octavesLoc = gl.getUniformLocation(program, 'uOctaves');
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
      // The card, not the canvas's parent - the canvas lives inside a wrapper
      // that carries its own blur, and that wrapper is the same shape as the
      // canvas, so measuring against it would report no bleed at all.
      const tileRect = canvas.closest('.countdown-tile')?.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height || !tileRect) {
        strips = [];
        // Cleared rather than left stale: a harness reading these on a
        // hidden canvas would otherwise check the previous size's strips.
        canvas.dataset.octaves = '';
        canvas.dataset.strips = '';
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

      // GL's origin is the bottom-left corner, so these rects are measured from
      // there and NOT from the top the way the bleeds above were. The card's top
      // edge sits at ringH - topBleed and its bottom edge at bottomBleed, which
      // is why the top strip is anchored by subtracting and the side strips are
      // anchored by the bottom bleed. Using the top bleed directly for either of
      // them - which is what bodyTop did - slides the strip upward by the
      // difference between the two bleeds, so it hangs over the card's top
      // corner and the half of it left above the card reads as a stray bright
      // bar rather than as a plume leaving that side.
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

      // The aspect and octave count come from the strip's own geometry, so each
      // edge is shaped and limited on its own terms. Since the strips already
      // fade to nothing at the card's corners, no two of them ever have to agree
      // about a shared pattern.
      const strip = (x: number, y: number, w: number, h: number, uvX: UvRow, uvY: UvRow): Strip => {
        const { aspect, octaves } = shapeNoise(uvX, uvY, w, h);
        return { x, y, w, h, uvX, uvY, aspect, octaves };
      };

      strips = [
        strip(0, ringH - topBleed, ringW, topBleed, alongCardWidth, SIDE_RANGE.top),
        strip(0, 0, ringW, bottomBleed, alongCardWidth, SIDE_RANGE.bottom),
        strip(0, bottomBleed, leftBleed, cardH, alongCardHeight, SIDE_RANGE.left),
        strip(ringW - rightBleed, bottomBleed, rightBleed, cardH, alongCardHeightFlipped, SIDE_RANGE.right),
      ].filter((s) => s.w >= 1 && s.h >= 1);

      // Read back for the drive harness: this is the one number in the effect
      // that nothing on screen can tell you, and getting it wrong shows up as
      // either aliasing or featureless puffs rather than as a wrong value.
      canvas.dataset.octaves = strips.map((s) => `${s.octaves}@${s.aspect.toFixed(1)}`).join(',');
      // And the strip rects, in GL's bottom-up form. Nothing on screen reveals
      // that a strip is drawn a few tens of pixels above the edge it belongs to
      // - it just looks like a stray bar near a corner - so the harness reads
      // these and checks each one against the card's own box.
      canvas.dataset.strips = strips
        .map((s) => [s.x, s.y, s.w, s.h].map((n) => Math.round(n)).join(','))
        .join(';');
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
        // Only the ratio reaches the shader - it divides x by y - so the pair is
        // aspect and a fixed 100 rather than real pixels. Real pixel sizes would
        // reintroduce exactly the per-strip frequency this whole calculation
        // exists to control.
        gl.uniform2f(resLoc, strip.aspect * 100, 100);
        gl.uniform1f(octavesLoc, strip.octaves);
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
  // apart from a drawn backing store. The canvas is wrapped rather than styled
  // directly because its blur creates a stacking context: put either the filter
  // or the -1 on the same element and the -1 starts referring to that context
  // alone, and the smoke renders in front of the card instead of behind it.
  return (
    <div className="countdown-tile__smoke" aria-hidden="true">
      <canvas ref={canvasRef} className="countdown-tile__smoke-canvas" width={0} height={0} />
    </div>
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
