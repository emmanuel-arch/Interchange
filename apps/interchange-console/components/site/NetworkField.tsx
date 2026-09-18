"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The network, in motion.
//
// Member nodes sit on two rings around the Registry. Every beat, one member
// asks a question: a pulse leaves it, reaches the Registry, and fans out to the
// members that hold the borrower — who light up as they answer. It is the real
// shape of an exposure query, drawn, not a decorative particle field.
//
// Canvas, not DOM: a few hundred moving elements in the DOM cost layout on every
// frame. Paused when off screen, and a single still frame for reduced motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";

type Node = { x: number; y: number; r: number; ring: number; angle: number; glow: number };
type Pulse = { from: Node; to: Node; t: number; speed: number; color: string; then?: () => void };

const SIGNAL = "16, 185, 129";

export function NetworkField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let nodes: Node[] = [];
    let hub: Node = { x: 0, y: 0, r: 7, ring: 0, angle: 0, glow: 1 };
    const pulses: Pulse[] = [];
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let beat = 0;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = w * (w > 900 ? 0.68 : 0.5);
      const cy = h * 0.5;
      const base = Math.min(w, h);
      hub = { x: cx, y: cy, r: 7, ring: 0, angle: 0, glow: 1 };
      nodes = [];
      const rings = [
        { count: 7, radius: base * 0.24, r: 4.2 },
        { count: 10, radius: base * 0.42, r: 3.2 },
      ];
      rings.forEach((ring, ri) => {
        for (let i = 0; i < ring.count; i++) {
          const angle = (i / ring.count) * Math.PI * 2 + ri * 0.35;
          nodes.push({ x: 0, y: 0, r: ring.r, ring: ring.radius, angle, glow: 0 });
        }
      });
      place(0);
    };

    const place = (time: number) => {
      for (const n of nodes) {
        const drift = reduced ? 0 : time * 0.00003 * (n.ring > Math.min(w, h) * 0.3 ? -1 : 1);
        n.x = hub.x + Math.cos(n.angle + drift) * n.ring * (w > 900 ? 1.25 : 1);
        n.y = hub.y + Math.sin(n.angle + drift) * n.ring * 0.78;
      }
    };

    const ask = () => {
      if (!nodes.length) return;
      const asker = nodes[Math.floor(Math.random() * nodes.length)];
      asker.glow = 1;
      pulses.push({
        from: asker,
        to: hub,
        t: 0,
        speed: 1.4,
        color: "255, 255, 255",
        then: () => {
          hub.glow = 1;
          // Screening sends the question only to members that might hold the borrower.
          const holders = nodes.filter((n) => n !== asker && Math.random() < 0.28);
          for (const hnode of holders) {
            pulses.push({
              from: hub,
              to: hnode,
              t: 0,
              speed: 1.1 + Math.random() * 0.8,
              color: SIGNAL,
              then: () => {
                hnode.glow = 1;
                pulses.push({ from: hnode, to: hub, t: 0, speed: 1.6, color: SIGNAL });
              },
            });
          }
        },
      });
    };

    const draw = (time: number) => {
      const dt = Math.min(64, time - last) / 1000;
      last = time;
      place(time);
      ctx.clearRect(0, 0, w, h);

      // Spokes
      for (const n of nodes) {
        ctx.strokeStyle = `rgba(255,255,255,${0.035 + n.glow * 0.12})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.lineTo(n.x, n.y);
        ctx.stroke();
      }

      // Pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt * p.speed;
        const t = Math.min(1, p.t);
        const x = p.from.x + (p.to.x - p.from.x) * t;
        const y = p.from.y + (p.to.y - p.from.y) * t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
        g.addColorStop(0, `rgba(${p.color},0.95)`);
        g.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        if (p.t >= 1) {
          pulses.splice(i, 1);
          p.then?.();
        }
      }

      // Nodes
      for (const n of [...nodes, hub]) {
        n.glow = Math.max(0, n.glow - dt * 0.9);
        if (n.glow > 0.02) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 7);
          g.addColorStop(0, `rgba(${SIGNAL},${0.45 * n.glow})`);
          g.addColorStop(1, `rgba(${SIGNAL},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = n === hub ? `rgba(${SIGNAL},1)` : `rgba(255,255,255,${0.35 + n.glow * 0.65})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hub ring
      ctx.strokeStyle = `rgba(${SIGNAL},0.35)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 18 + Math.sin(time / 600) * 2, 0, Math.PI * 2);
      ctx.stroke();

      beat += dt;
      if (beat > 1.7) {
        beat = 0;
        ask();
      }
      if (visible && !reduced) raf = requestAnimationFrame(draw);
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting;
      if (visible && !was && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    });
    io.observe(canvas);

    if (reduced) {
      nodes.forEach((n, i) => (n.glow = i % 4 === 0 ? 0.8 : 0));
      draw(performance.now());
    } else {
      ask();
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
