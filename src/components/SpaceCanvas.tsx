import { useEffect, useRef } from "react";

interface Star {
  x: number; y: number; r: number; alpha: number; da: number; color: string;
}
interface Comet {
  x: number; y: number; vx: number; vy: number;
  tail: { x: number; y: number }[]; maxTail: number;
  alpha: number; color: string; size: number;
}

export function SpaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const STAR_COUNT = 350;
    const stars: Star[] = [];
    const comets: Comet[] = [];

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.8 + 0.3,
        alpha: Math.random(),
        da: (Math.random() - 0.5) * 0.01,
        color: Math.random() > 0.75 ? "#c8a24e" : "#ffffff",
      });
    }

    function spawnComet() {
      if (comets.length > 2) return;
      const startX = Math.random() * W * 1.2 - W * 0.1;
      const angle = Math.PI / 4 + Math.random() * 0.4;
      const speed = 5 + Math.random() * 7;
      comets.push({
        x: startX, y: -20,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        tail: [], maxTail: 40 + Math.floor(Math.random() * 25),
        alpha: 0.6 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? "#c8a24e" : "#ffffff",
        size: 1.2 + Math.random() * 1.2,
      });
    }

    let animId: number;
    function draw() {
      ctx!.clearRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        s.alpha += s.da;
        if (s.alpha <= 0.15 || s.alpha >= 1) s.da *= -1;
        // Glow for larger stars
        if (s.r > 1.0) {
          const glow = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
          glow.addColorStop(0, s.color);
          glow.addColorStop(1, "transparent");
          ctx!.beginPath();
          ctx!.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx!.fillStyle = glow;
          ctx!.globalAlpha = s.alpha * 0.15;
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = s.color;
        ctx!.globalAlpha = s.alpha * 0.85;
        ctx!.fill();
      }

      // Comets
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.tail.unshift({ x: c.x, y: c.y });
        if (c.tail.length > c.maxTail) c.tail.pop();
        c.x += c.vx; c.y += c.vy;

        // Tail
        for (let t = 0; t < c.tail.length; t++) {
          const tp = c.tail[t];
          const fade = 1 - t / c.tail.length;
          ctx!.beginPath();
          ctx!.arc(tp.x, tp.y, c.size * fade * 0.5, 0, Math.PI * 2);
          ctx!.fillStyle = c.color;
          ctx!.globalAlpha = fade * c.alpha * 0.3;
          ctx!.fill();
        }

        // Head
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        ctx!.fillStyle = c.color;
        ctx!.globalAlpha = c.alpha;
        ctx!.fill();

        // Glow
        const grad = ctx!.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.size * 5);
        grad.addColorStop(0, c.color);
        grad.addColorStop(1, "transparent");
        ctx!.fillStyle = grad;
        ctx!.globalAlpha = c.alpha * 0.1;
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, c.size * 5, 0, Math.PI * 2);
        ctx!.fill();

        if (c.x > W + 100 || c.y > H + 100) comets.splice(i, 1);
      }

      ctx!.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    }
    draw();

    function scheduleComet() {
      spawnComet();
      setTimeout(scheduleComet, 3000 + Math.random() * 5000);
    }
    const cometTimer = setTimeout(scheduleComet, 2000);

    function handleResize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(cometTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.85 }}
    />
  );
}
