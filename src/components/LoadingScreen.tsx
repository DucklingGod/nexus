import { useState, useEffect, useRef } from "react";

export function LoadingScreen() {
  const [fillComplete, setFillComplete] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setFillComplete(true), 2800);
    return () => clearTimeout(timer);
  }, []);

  // Sparkle stars + comets canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const STAR_COUNT = 80;
    const stars: { x: number; y: number; r: number; alpha: number; da: number; color: string }[] = [];
    const comets: {
      x: number; y: number; vx: number; vy: number;
      tail: { x: number; y: number }[]; maxTail: number;
      alpha: number; color: string; size: number;
    }[] = [];

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.2,
        alpha: Math.random(),
        da: (Math.random() - 0.5) * 0.01,
        color: Math.random() > 0.85 ? "#c8a24e" : "#ffffff",
      });
    }

    function spawnComet() {
      if (comets.length > 1) return;
      const startX = Math.random() * W * 1.2 - W * 0.1;
      const angle = Math.PI / 4 + Math.random() * 0.4;
      const speed = 5 + Math.random() * 6;
      comets.push({
        x: startX, y: -20,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        tail: [], maxTail: 35 + Math.floor(Math.random() * 25),
        alpha: 0.6 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? "#c8a24e" : "#ffffff",
        size: 1.2 + Math.random() * 1.2,
      });
    }

    let animId: number;
    function draw() {
      ctx!.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.alpha += s.da;
        if (s.alpha <= 0.05 || s.alpha >= 1) s.da *= -1;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = s.color;
        ctx!.globalAlpha = s.alpha * 0.45;
        ctx!.fill();
      }
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.tail.unshift({ x: c.x, y: c.y });
        if (c.tail.length > c.maxTail) c.tail.pop();
        c.x += c.vx; c.y += c.vy;
        for (let t = 0; t < c.tail.length; t++) {
          const tp = c.tail[t];
          const fade = 1 - t / c.tail.length;
          ctx!.beginPath();
          ctx!.arc(tp.x, tp.y, c.size * fade * 0.5, 0, Math.PI * 2);
          ctx!.fillStyle = c.color;
          ctx!.globalAlpha = fade * c.alpha * 0.35;
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        ctx!.fillStyle = c.color;
        ctx!.globalAlpha = c.alpha;
        ctx!.fill();
        const grad = ctx!.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.size * 5);
        grad.addColorStop(0, c.color);
        grad.addColorStop(1, "transparent");
        ctx!.fillStyle = grad;
        ctx!.globalAlpha = c.alpha * 0.12;
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
      setTimeout(scheduleComet, 2500 + Math.random() * 4000);
    }
    const cometTimer = setTimeout(scheduleComet, 1200);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nexus-bg">
      {/* Sparkle stars + comets canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* SVG filter for liquid displacement */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="liquid-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015"
              numOctaves="3"
              seed="2"
              result="turbulence"
            >
              <animate
                attributeName="baseFrequency"
                values="0.015;0.025;0.015"
                dur="3s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
            >
              <animate
                attributeName="scale"
                values="12;20;12"
                dur="2.5s"
                repeatCount="indefinite"
              />
            </feDisplacementMap>
          </filter>
        </defs>
      </svg>

      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={`h-[300px] w-[500px] rounded-full transition-all duration-1500 ${
            fillComplete
              ? "bg-nexus-gold/[0.08] blur-[100px]"
              : "bg-nexus-gold/[0.02] blur-[60px]"
          }`}
        />
      </div>

      {/* Nexus wordmark with liquid gold fill */}
      <div className="relative" style={{ filter: "url(#liquid-filter)" }}>
        <h1 className="loading-liquid-gold font-display text-[7rem] font-bold leading-none tracking-tight select-none">
          Nexus
        </h1>
      </div>
    </div>
  );
}
