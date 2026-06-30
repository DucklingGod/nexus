import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Star {
  x: number; y: number; r: number; alpha: number; da: number; color: string;
}
interface Comet {
  x: number; y: number; vx: number; vy: number;
  tail: { x: number; y: number }[]; maxTail: number;
  alpha: number; color: string; size: number;
}

interface SpaceFxSettings {
  starsEnabled: boolean;
  starDensity: number;
  starBrightness: number;
  starGoldRatio: number;
  cometsEnabled: boolean;
  cometFrequency: number;
  cometSpeed: number;
  canvasOpacity: number;
  glowEnabled: boolean;
}

const DEFAULTS: SpaceFxSettings = {
  starsEnabled: true,
  starDensity: 350,
  starBrightness: 0.85,
  starGoldRatio: 25,
  cometsEnabled: true,
  cometFrequency: 5,
  cometSpeed: 8,
  canvasOpacity: 0.85,
  glowEnabled: true,
};

function key(k: keyof SpaceFxSettings) { return `theme.spaceFx.${k}`; }

async function loadSettings(): Promise<SpaceFxSettings> {
  try {
    const all = await invoke<Record<string, string>>("engine_rpc", { method: "settings.get_all", params: {} });
    const s = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof SpaceFxSettings)[]) {
      const v = all[key(k)];
      if (v !== undefined && v !== null && v !== "") {
        if (typeof DEFAULTS[k] === "boolean") (s as any)[k] = v === "true";
        else (s as any)[k] = Number(v) || DEFAULTS[k];
      }
    }
    return s;
  } catch {
    return DEFAULTS;
  }
}

export function SpaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef<SpaceFxSettings>(DEFAULTS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    let stars: Star[] = [];
    let comets: Comet[] = [];

    function makeStars(count: number, goldRatio: number): Star[] {
      const arr: Star[] = [];
      for (let i = 0; i < count; i++) {
        arr.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.8 + 0.3,
          alpha: Math.random(),
          da: (Math.random() - 0.5) * 0.01,
          color: Math.random() * 100 < goldRatio ? "#c8a24e" : "#ffffff",
        });
      }
      return arr;
    }

    function spawnComet(speed: number) {
      if (comets.length > 3) return;
      const startX = Math.random() * W * 1.2 - W * 0.1;
      const angle = Math.PI / 4 + Math.random() * 0.4;
      const s = speed + Math.random() * 4;
      comets.push({
        x: startX, y: -20,
        vx: Math.cos(angle) * s, vy: Math.sin(angle) * s,
        tail: [], maxTail: 40 + Math.floor(Math.random() * 25),
        alpha: 0.6 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? "#c8a24e" : "#ffffff",
        size: 1.2 + Math.random() * 1.2,
      });
    }

    // Initial load
    loadSettings().then(s => {
      settingsRef.current = s;
      stars = makeStars(s.starDensity, s.starGoldRatio);
      canvas.style.opacity = String(s.canvasOpacity);
    });

    // Listen for settings changes from ThemeSettings
    function onSettingsChange() {
      loadSettings().then(s => {
        settingsRef.current = s;
        // Rebuild stars if density or gold ratio changed
        if (stars.length !== s.starDensity) {
          stars = makeStars(s.starDensity, s.starGoldRatio);
        } else {
          // Just update colors
          for (const star of stars) {
            star.color = Math.random() * 100 < s.starGoldRatio ? "#c8a24e" : "#ffffff";
          }
        }
        canvas!.style.opacity = String(s.canvasOpacity);
      });
    }
    window.addEventListener("nexus-theme-changed", onSettingsChange);

    let animId: number;
    let cometTimer: ReturnType<typeof setTimeout>;

    function draw() {
      const s = settingsRef.current;
      ctx!.clearRect(0, 0, W, H);

      // Stars
      if (s.starsEnabled) {
        for (const star of stars) {
          star.alpha += star.da;
          if (star.alpha <= 0.15 || star.alpha >= 1) star.da *= -1;
          // Glow for larger stars
          if (s.glowEnabled && star.r > 1.0) {
            const glow = ctx!.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.r * 4);
            glow.addColorStop(0, star.color);
            glow.addColorStop(1, "transparent");
            ctx!.beginPath();
            ctx!.arc(star.x, star.y, star.r * 4, 0, Math.PI * 2);
            ctx!.fillStyle = glow;
            ctx!.globalAlpha = star.alpha * 0.15;
            ctx!.fill();
          }
          ctx!.beginPath();
          ctx!.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx!.fillStyle = star.color;
          ctx!.globalAlpha = star.alpha * s.starBrightness;
          ctx!.fill();
        }
      }

      // Comets
      if (s.cometsEnabled) {
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
            ctx!.globalAlpha = fade * c.alpha * 0.3;
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
          ctx!.globalAlpha = c.alpha * 0.1;
          ctx!.beginPath();
          ctx!.arc(c.x, c.y, c.size * 5, 0, Math.PI * 2);
          ctx!.fill();

          if (c.x > W + 100 || c.y > H + 100) comets.splice(i, 1);
        }
      }

      ctx!.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    }
    draw();

    function scheduleComet() {
      const s = settingsRef.current;
      if (s.cometsEnabled) spawnComet(s.cometSpeed);
      cometTimer = setTimeout(scheduleComet, s.cometFrequency * 1000 + Math.random() * 3000);
    }
    cometTimer = setTimeout(scheduleComet, 2000);

    function handleResize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      stars = makeStars(settingsRef.current.starDensity, settingsRef.current.starGoldRatio);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(cometTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("nexus-theme-changed", onSettingsChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: DEFAULTS.canvasOpacity }}
    />
  );
}
