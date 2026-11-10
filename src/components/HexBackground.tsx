import { useEffect, useRef } from "react";

/**
 * CodeQuest hex field. Static grid is rasterised once; only cells near the
 * cursor are redrawn, and the rAF loop sleeps the moment nothing is glowing.
 * Pointer-events: none — it never intercepts input or obstructs content.
 */
export function HexBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const R = 22; // hex radius
    const W = Math.sqrt(3) * R;
    const H = 1.5 * R;
    const RADIUS = 150; // influence radius px
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cols = 0;
    let rows = 0;
    let base: HTMLCanvasElement | null = null;
    let glow: Float32Array = new Float32Array(0);
    let target: Float32Array = new Float32Array(0);
    let mouse: { x: number; y: number } | null = null;
    let raf = 0;
    let lineColor = "";
    let glowRGB = "77, 156, 255";

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      lineColor = cs.getPropertyValue("--hex-line").trim() || "rgba(255,255,255,0.04)";
      glowRGB = cs.getPropertyValue("--hex-glow").trim() || glowRGB;
    };

    const center = (c: number, r: number) => ({ x: c * W + (r % 2 ? W / 2 : 0), y: r * H });

    const hexPath = (g: CanvasRenderingContext2D, x: number, y: number, rad: number) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + rad * Math.cos(a);
        const py = y + rad * Math.sin(a);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
    };

    const build = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      cols = Math.ceil(w / W) + 2;
      rows = Math.ceil(h / H) + 2;
      glow = new Float32Array(cols * rows);
      target = new Float32Array(cols * rows);
      readColors();
      base = document.createElement("canvas");
      base.width = canvas.width;
      base.height = canvas.height;
      const b = base.getContext("2d")!;
      b.scale(dpr, dpr);
      b.strokeStyle = lineColor;
      b.lineWidth = 1;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const { x, y } = center(c, r);
          hexPath(b, x, y, R - 1.5);
          b.stroke();
        }
      draw();
    };

    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (base) ctx.drawImage(base, 0, 0);
      ctx.scale(dpr, dpr);
      let active = false;
      for (let i = 0; i < glow.length; i++) {
        const g = glow[i];
        if (g < 0.01) continue;
        active = true;
        const r = Math.floor(i / cols);
        const c = i % cols;
        const { x, y } = center(c, r);
        hexPath(ctx, x, y, R - 2);
        ctx.fillStyle = `rgba(${glowRGB}, ${0.13 * g})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${glowRGB}, ${0.45 * g})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      return active;
    };

    const tick = () => {
      target.fill(0);
      if (mouse) {
        const rect = canvas.getBoundingClientRect();
        const mx = mouse.x - rect.left;
        const my = mouse.y - rect.top;
        const r0 = Math.max(0, Math.floor((my - RADIUS) / H));
        const r1 = Math.min(rows - 1, Math.ceil((my + RADIUS) / H));
        const c0 = Math.max(0, Math.floor((mx - RADIUS) / W) - 1);
        const c1 = Math.min(cols - 1, Math.ceil((mx + RADIUS) / W) + 1);
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const { x, y } = center(c, r);
            const d = Math.hypot(x - mx, y - my);
            if (d < RADIUS) target[r * cols + c] = Math.pow(1 - d / RADIUS, 1.6);
          }
      }
      let moving = false;
      for (let i = 0; i < glow.length; i++) {
        const diff = target[i] - glow[i];
        if (Math.abs(diff) > 0.005) {
          glow[i] += diff * (reduce ? 1 : diff > 0 ? 0.35 : 0.08);
          moving = true;
        } else glow[i] = target[i];
      }
      const lit = draw();
      raf = moving || (lit && mouse) ? requestAnimationFrame(tick) : 0;
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mouse = { x: e.clientX, y: e.clientY };
      wake();
    };
    const onLeave = () => {
      mouse = null;
      wake();
    };

    const ro = new ResizeObserver(build);
    ro.observe(canvas);
    const mo = new MutationObserver(() => build());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    const onVis = () => document.hidden && cancelAnimationFrame(raf);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className ?? "pointer-events-none absolute inset-0 h-full w-full"} />;
}
