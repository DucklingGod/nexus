// Premium outline SVG icons — no color, no fill, just strokes.
// All icons inherit currentColor so they follow the gold theme automatically.

interface IconProps {
  size?: number;
  className?: string;
}

const S = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconGlobe({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6M8 2c-2 2-3 4-3 6s1 4 3 6" /></svg>;
}

export function IconFolder({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M2 4h5l2 2h5v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" /></svg>;
}

export function IconGear({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" /></svg>;
}

export function IconTerminal({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect x="1.5" y="2" width="13" height="12" rx="1.5" /><path d="M4.5 6l2.5 2-2.5 2M9 10h4" /></svg>;
}

export function IconClipboard({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect x="3" y="1.5" width="10" height="13" rx="1.5" /><path d="M5.5 1.5V1a1 1 0 011-1h3a1 1 0 011 1v.5M5 7h6M5 10h4" /></svg>;
}

export function IconBrain({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 1.5a3 3 0 012.5 4.8A2.5 2.5 0 0113 8.5a2.5 2.5 0 01-1.5 2.3A3 3 0 018 15a3 3 0 01-3.5-4.2A2.5 2.5 0 013 8.5a2.5 2.5 0 012.5-2.2A3 3 0 018 1.5z" /><path d="M8 4v9" /></svg>;
}

export function IconWrench({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M12.5 3.5a3 3 0 00-4.2 0L3.5 8.3a2 2 0 000 2.8l1.4 1.4a2 2 0 002.8 0l4.8-4.8a3 3 0 000-4.2z" /><path d="M6 10l-1 1" /></svg>;
}

export function IconHand({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 1v7M5.5 3.5V8a2.5 2.5 0 005 0V6M5.5 3.5V7M3 5.5V9a5 5 0 0010 0V8" /></svg>;
}

export function IconCheckCircle({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="8" cy="8" r="6" /><path d="M5.5 8l2 2 3.5-4" /></svg>;
}

export function IconShield({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 1.5l5 2v4.5c0 3.5-5 6-5 6s-5-2.5-5-6V3.5l5-2z" /></svg>;
}

export function IconKey({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="5.5" cy="6.5" r="3.5" /><path d="M9 10l5-5M12 7l1.5 1.5" /></svg>;
}

export function IconBot({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect x="3" y="5" width="10" height="8" rx="2" /><circle cx="6" cy="9" r="0.8" fill="currentColor" /><circle cx="10" cy="9" r="0.8" fill="currentColor" /><path d="M8 5V3M5 3h6" /></svg>;
}

export function IconZap({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M9 1L3.5 9H8l-1 6L12.5 7H8l1-6z" /></svg>;
}

export function IconChart({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect x="2" y="10" width="3" height="4" rx="0.5" /><rect x="6.5" y="6" width="3" height="8" rx="0.5" /><rect x="11" y="2" width="3" height="12" rx="0.5" /></svg>;
}

export function IconBook({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 1.5v13M2.5 1.5h3A2.5 2.5 0 018 4v10.5A2.5 2.5 0 005.5 12h-3V1.5zM13.5 1.5h-3A2.5 2.5 0 008 4v10.5a2.5 2.5 0 012.5-2.5h3V1.5z" /></svg>;
}

export function IconTrendingUp({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M2 12l4-4 2.5 2.5L14 4" /><path d="M10 4h4v4" /></svg>;
}

export function IconDollar({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 1v14M5 4.5h4.5a2 2 0 010 4H5M5 8.5h5a2 2 0 010 4H5" /></svg>;
}

export function IconLightbulb({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M6 13h4M6.5 11h3M8 1a4.5 4.5 0 00-2 8.5h4A4.5 4.5 0 008 1z" /></svg>;
}

export function IconType({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M3 3h10M8 3v11M5 14h6" /></svg>;
}

export function IconSearch({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" /></svg>;
}

export function IconPlus({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="8" cy="8" r="6" /><path d="M8 5v6M5 8h6" /></svg>;
}

export function IconStar({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 1.5l2 4 4.5 1-3.2 3 .8 4.5L8 11.5 3.9 13.5l.8-4.5-3.2-3L6 5z" /></svg>;
}

export function IconChevronDown({ size = 10, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M3 5l5 5 5-5" /></svg>;
}

export function IconClose({ size = 10, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M1 1L9 9M9 1L1 9" /></svg>;
}

export function IconMinimize({ size = 10, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect width="10" height="1" fill="currentColor" /></svg>;
}

export function IconMaximize({ size = 10, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect x="0.5" y="0.5" width="9" height="9" rx="1" /></svg>;
}

export function IconRestore({ size = 10, className }: IconProps) {
  return <svg {...S(size)} className={className}><rect x="2" y="0" width="8" height="8" rx="1" /><rect x="0" y="2" width="8" height="8" rx="1" fill="var(--color-nexus-bg, #0a0a0a)" /></svg>;
}

export function IconSettings({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" /></svg>;
}

export function IconArrowLeft({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M10 3L5 8l5 5" /></svg>;
}

export function IconArrowRight({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M6 3l5 5-5 5" /></svg>;
}

export function IconList({ size = 11, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M2 4h12M2 8h12M2 12h12" /></svg>;
}

export function IconMapPin({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M8 14s-4.5-4.5-4.5-7.5a4.5 4.5 0 019 0c0 3-4.5 7.5-4.5 7.5z" /><circle cx="8" cy="6.5" r="1.5" /></svg>;
}

export function IconWifi({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M2 5.5A10 10 0 0114 5.5M4 8.5A6 6 0 0112 8.5M6.5 11.5a2.5 2.5 0 013 0" /><circle cx="8" cy="13" r="0.5" fill="currentColor" /></svg>;
}

export function IconFileOpen({ size = 14, className }: IconProps) {
  return <svg {...S(size)} className={className}><path d="M10 1v3h3M3 2h5l2 2v9.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-11A.5.5 0 012.5 2H3z" /></svg>;
}
