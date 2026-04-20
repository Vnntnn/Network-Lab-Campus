/**
 * IsometricCampusMap — FUI/HUD 2.5D network campus.
 * SPEN-inspired: void background, cyan/matrix accents, corner-notched
 * panels, animated data-flow cables with real port labels from topology store.
 */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import type { LabPod } from "@/api/queries";
import { useTopologyStore } from "@/stores/topologyStore";
import type { TopologyEdgeData } from "@/types/topology";

export type PodCampusStatus = "online" | "offline" | "pending" | "locked";

// ── Isometric projection ──────────────────────────────────────────────────
const TW   = 210;
const TH   = TW / 2;
const HW   = TW / 2;
const HH   = TH / 2;
const COLS = 4;
const ORIGIN = { x: 700, y: 210 } as const;

function isoPos(col: number, row: number) {
  return {
    x: ORIGIN.x + (col - row) * HW,
    y: ORIGIN.y + (col + row) * HH,
  };
}

function buildBox(col: number, row: number, h: number) {
  const { x: px, y: py } = isoPos(col, row);
  const TN  = [px,       py - h      ] as const;
  const TE  = [px + HW,  py + HH - h ] as const;
  const TS  = [px,       py + TH - h ] as const;
  const TW_ = [px - HW,  py + HH - h ] as const;
  const BS  = [px,       py + TH      ] as const;
  const BE  = [px + HW,  py + HH      ] as const;
  const BW  = [px - HW,  py + HH      ] as const;
  const pt  = ([x, y]: readonly [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  return {
    top:       `M ${pt(TN)} L ${pt(TE)} L ${pt(TS)} L ${pt(TW_)} Z`,
    left:      `M ${pt(TW_)} L ${pt(TS)} L ${pt(BS)} L ${pt(BW)} Z`,
    right:     `M ${pt(TE)} L ${pt(TS)} L ${pt(BS)} L ${pt(BE)} Z`,
    topCenter: { x: px,      y: py + HH - h },
    topFront:  { x: TS[0],   y: TS[1] },
    topRight:  { x: TE[0],   y: TE[1] },
    topLeft:   { x: TW_[0],  y: TW_[1] },
    gndFront:  { x: BS[0],   y: BS[1] },
    gndCenter: { x: px,      y: py + HH },
    gndRight:  { x: BE[0],   y: BE[1] },
  };
}

// ── Device themes ─────────────────────────────────────────────────────────
type Theme = {
  typeLabel: string;
  topA: string; topB: string;
  left: string; right: string;
  accent: string; glow: string;
  panelA: string;
};

const THEMES: Record<string, Theme> = {
  arista_eos: {
    typeLabel: "Arista EOS",
    topA: "#153d2a", topB: "#0a2419",
    left: "#091d13", right: "#050e09",
    panelA: "#1a4e34",
    accent: "#2de6aa", glow: "rgba(45,230,170,0.60)",
  },
  cisco_iosxe: {
    typeLabel: "Cisco IOS-XE",
    topA: "#10304e", topB: "#082033",
    left: "#071929", right: "#040f18",
    panelA: "#163e62",
    accent: "#31c4ff", glow: "rgba(49,196,255,0.60)",
  },
  cisco_iosxr: {
    typeLabel: "Cisco IOS-XR",
    topA: "#1a1045", topB: "#10092c",
    left: "#0e0825", right: "#060413",
    panelA: "#231452",
    accent: "#8594ff", glow: "rgba(133,148,255,0.60)",
  },
};

const FALLBACK_THEME = THEMES.cisco_iosxe;

function portName(deviceType: string, idx: number): string {
  if (deviceType === "arista_eos")  return `Et${idx}/0`;
  if (deviceType === "cisco_iosxr") return `Gi0/0/${idx}`;
  return `Gi0/${idx}`;
}

// ── Layout ────────────────────────────────────────────────────────────────
type DeviceItem = {
  pod: LabPod;
  col: number; row: number;
  theme: Theme; height: number;
  selected: boolean; status: PodCampusStatus;
  locked: boolean; depth: number;
};

const TYPE_HEIGHT: Record<string, number> = {
  arista_eos: 52, cisco_iosxe: 72, cisco_iosxr: 96,
};

function layoutDevices(
  pods: LabPod[], selectedId: number | null,
  statusByPodId?: Partial<Record<number, PodCampusStatus>>,
  lockedPodIds?: Set<number>,
): DeviceItem[] {
  return pods.map((pod, i) => ({
    locked:   lockedPodIds?.has(pod.id) ?? false,
    status:   lockedPodIds?.has(pod.id) ? "locked" : (statusByPodId?.[pod.id] ?? "pending"),
    pod, col: i % COLS, row: Math.floor(i / COLS),
    theme:    THEMES[pod.device_type] ?? FALLBACK_THEME,
    height:   (TYPE_HEIGHT[pod.device_type] ?? 68) + (i % 2) * 8,
    selected: pod.id === selectedId,
    depth:    (i % COLS) + Math.floor(i / COLS),
  }));
}

// ── Cable ─────────────────────────────────────────────────────────────────
function Cable({ from, to, srcPort, dstPort, animDur }: {
  from: DeviceItem; to: DeviceItem;
  srcPort: string; dstPort: string; animDur: number;
}) {
  const fb = buildBox(from.col, from.row, from.height);
  const tb = buildBox(to.col,   to.row,   to.height);
  const fx = fb.topRight.x;  const fy = fb.topRight.y - 6;
  const tx = tb.topLeft.x;   const ty = tb.topLeft.y - 6;
  const lift = Math.min(Math.abs(fx - tx) * 0.48, 75);
  const cx1 = fx + (tx - fx) * 0.25;  const cy1 = Math.min(fy, ty) - lift;
  const cx2 = fx + (tx - fx) * 0.75;  const cy2 = Math.min(fy, ty) - lift;
  const path = `M ${fx.toFixed(1)} ${fy.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`;

  // Port label mid-positions (approx bezier points at t=0.18, t=0.82)
  const t1 = 0.18; const t2 = 0.82;
  const lx1 = fx + (tx - fx) * t1;
  const ly1 = fy + (ty - fy) * t1 - lift * 4 * t1 * (1 - t1) - 13;
  const lx2 = fx + (tx - fx) * t2;
  const ly2 = fy + (ty - fy) * t2 - lift * 4 * t2 * (1 - t2) - 13;
  const accent = to.theme.accent;
  const glow   = to.theme.glow;

  return (
    <g>
      <path d={path} stroke={glow} strokeWidth={7} fill="none" strokeLinecap="round" opacity={0.20} />
      <path d={path} stroke={accent} strokeWidth={1.8} fill="none"
        strokeDasharray="10 5" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" values="60;0" dur={`${animDur}s`} repeatCount="indefinite" />
      </path>
      <circle r={3.2} fill={accent} opacity={0.95}>
        <animateMotion path={path} dur={`${animDur}s`} repeatCount="indefinite" />
      </circle>
      <circle r={2} fill={accent} opacity={0.50}>
        <animateMotion path={path} dur={`${animDur * 1.3}s`} begin={`${animDur * 0.5}s`} repeatCount="indefinite" />
      </circle>
      {/* Source port label */}
      <g transform={`translate(${lx1 - 36},${ly1 - 8})`}>
        <rect width={72} height={16} rx={4} fill="rgba(2,5,12,0.93)" stroke={accent} strokeWidth={0.6} />
        <text x={36} y={11} textAnchor="middle" fontSize={7.5}
          fill={accent} fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.05em">{srcPort}</text>
      </g>
      {/* Dest port label */}
      <g transform={`translate(${lx2 - 36},${ly2 - 8})`}>
        <rect width={72} height={16} rx={4} fill="rgba(2,5,12,0.93)" stroke={accent} strokeWidth={0.6} />
        <text x={36} y={11} textAnchor="middle" fontSize={7.5}
          fill={accent} fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.05em">{dstPort}</text>
      </g>
    </g>
  );
}

// ── Ground grid ───────────────────────────────────────────────────────────
function GroundGrid({ rows, cols }: { rows: number; cols: number }) {
  const els: React.ReactNode[] = [];
  for (let r = 0; r <= rows; r++) {
    const s = isoPos(0, r); const e = isoPos(cols, r);
    els.push(<line key={`r${r}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y}
      stroke="rgba(49,196,255,0.055)" strokeWidth={0.8} />);
  }
  for (let c = 0; c <= cols; c++) {
    const s = isoPos(c, 0); const e = isoPos(c, rows);
    els.push(<line key={`c${c}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y}
      stroke="rgba(49,196,255,0.055)" strokeWidth={0.8} />);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = isoPos(c, r); const tr = isoPos(c+1, r);
      const bl = isoPos(c, r+1); const br = isoPos(c+1, r+1);
      els.push(<polygon key={`t${c}-${r}`}
        points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
        fill={(r + c) % 2 === 0 ? "rgba(49,196,255,0.016)" : "rgba(49,196,255,0.007)"} />);
    }
  }
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const p = isoPos(c, r);
      els.push(<circle key={`d${c}-${r}`} cx={p.x} cy={p.y} r={1.8} fill="rgba(49,196,255,0.22)" />);
    }
  }
  return <g>{els}</g>;
}

// ── Device surface details per type ──────────────────────────────────────
function DeviceSurface({ item }: { item: DeviceItem }) {
  const { col, row, height, theme, pod } = item;
  const { x: px, y: py } = isoPos(col, row);

  if (pod.device_type === "arista_eos") {
    return (
      <g>
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={px - HW * 0.72 + i * 8.8} y={py + HH - height - 2.5}
            width={6} height={3.5} rx={0.8}
            fill={i < 8 ? theme.accent : "rgba(255,255,255,0.06)"}
            opacity={i < 8 ? (i < 6 ? 0.88 : 0.55) : 0.28} />
        ))}
        <rect x={px + HW - 30} y={py + HH - height - 5} width={22} height={7} rx={1.5}
          fill="rgba(255,255,255,0.04)" stroke={theme.accent} strokeWidth={0.7} opacity={0.5} />
      </g>
    );
  }
  if (pod.device_type === "cisco_iosxe") {
    return (
      <g>
        {Array.from({ length: 4 }).map((_, i) => (
          <rect key={i} x={px - HW * 0.55 + i * 12} y={py + HH - height - 3}
            width={9} height={5} rx={1}
            fill={i < 2 ? theme.accent : "rgba(255,255,255,0.08)"}
            opacity={i < 2 ? 0.85 : 0.35} />
        ))}
        <rect x={px + HW * 0.30} y={py + HH - height - 4} width={12} height={6} rx={1.5}
          fill="rgba(255,255,255,0.04)" stroke={theme.accent} strokeWidth={0.7} opacity={0.55} />
      </g>
    );
  }
  // cisco_iosxr – card slots
  return (
    <g>
      {[-1, 1].map((side) => (
        <rect key={side} x={px + side * HW * 0.52 - 16} y={py + HH - height - 5}
          width={28} height={7} rx={1.5}
          fill={theme.panelA} stroke={theme.accent} strokeWidth={0.7} opacity={0.6} />
      ))}
      {Array.from({ length: 3 }).map((_, i) => (
        <rect key={i} x={px - 14 + i * 10} y={py + HH - height - 4}
          width={7} height={5} rx={1} fill={theme.accent} opacity={0.65} />
      ))}
    </g>
  );
}

// ── 3D device box ─────────────────────────────────────────────────────────
function DeviceBox({ item, onSelect }: { item: DeviceItem; onSelect: (pod: LabPod) => void }) {
  const { col, row, theme, height, selected, pod, status, locked } = item;
  const box = buildBox(col, row, height);
  const { x: px, y: py } = isoPos(col, row);
  const gtId = `gt-${pod.id}`;
  const glId = `gl-${pod.id}`;
  const statusColor = status === "online" ? "#2de6aa" : status === "offline" ? "#ff6f85"
    : status === "locked" ? "#ffc043" : "#5a6a8a";

  return (
    <motion.g
      onClick={() => { if (!locked) onSelect(pod); }}
      style={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.70 : 1 }}
      whileHover={{ y: selected ? -9 : -5 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
    >
      <defs>
        <linearGradient id={gtId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme.topA} />
          <stop offset="100%" stopColor={theme.topB} />
        </linearGradient>
        <linearGradient id={glId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={theme.left} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.72)" />
        </linearGradient>
      </defs>

      {/* Ground glow */}
      <ellipse cx={px} cy={py + TH - 3} rx={HW * 0.60} ry={HH * 0.32}
        fill={theme.glow} opacity={selected ? 0.65 : 0.22} style={{ filter: "blur(14px)" }} />

      <path d={box.left}  fill={`url(#${glId})`} stroke={selected ? theme.accent + "80" : "rgba(255,255,255,0.06)"} strokeWidth={selected ? 1.2 : 0.5} />
      <path d={box.right} fill={theme.right}      stroke={selected ? theme.accent + "60" : "rgba(255,255,255,0.04)"} strokeWidth={selected ? 1.2 : 0.4} />
      <path d={box.top}   fill={`url(#${gtId})`} stroke={selected ? theme.accent : "rgba(255,255,255,0.12)"}        strokeWidth={selected ? 1.8 : 0.9} />

      <DeviceSurface item={item} />

      {/* Brand stripe */}
      <line x1={px - HW * 0.44} y1={py + HH - height + 10} x2={px + HW * 0.44} y2={py + HH - height + 10}
        stroke={theme.accent} strokeWidth={selected ? 2 : 1} opacity={0.38} strokeLinecap="round" />

      {/* Rack lines on left face */}
      {[0.28, 0.52, 0.74].map((t, i) => (
        <line key={i}
          x1={box.gndFront.x - HW * t} y1={box.gndFront.y - height * 0.26 - i * 10}
          x2={box.gndFront.x}           y2={box.gndFront.y - height * 0.13 - i * 8}
          stroke="rgba(255,255,255,0.04)" strokeWidth={0.8} />
      ))}

      {/* Status LED */}
      <circle cx={px - HW + 14} cy={py + HH - height - 2} r={4.5}
        fill={statusColor} opacity={selected ? 1 : 0.82} />
      {status === "online" && (
        <>
          <circle cx={px - HW + 14} cy={py + HH - height - 2} r={9} fill={statusColor} opacity={0.14}>
            <animate attributeName="r" values="6;12;6" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.14;0.02;0.14" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={px - HW + 14} cy={py + HH - height - 2} r={14}
            fill="none" stroke={statusColor} strokeWidth={0.7} opacity={0.28}>
            <animate attributeName="r" values="10;18;10" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.28;0;0.28" dur="2.2s" repeatCount="indefinite" />
          </circle>
        </>
      )}
      {selected && (
        <path d={box.top} fill="none" stroke={theme.accent} strokeWidth={1.6} opacity={0.42}
          strokeDasharray="6 4">
          <animate attributeName="stroke-dashoffset" values="20;0" dur="1.4s" repeatCount="indefinite" />
        </path>
      )}
    </motion.g>
  );
}

// ── FUI corner-notched label card ─────────────────────────────────────────
function DeviceLabel({ item, onSelect }: { item: DeviceItem; onSelect: (pod: LabPod) => void }) {
  const { col, row, height, theme, selected, pod, locked, status } = item;
  const box = buildBox(col, row, height);
  const lx = box.gndFront.x; const ly = box.gndFront.y + 14;
  const W = 168; const H = 52; const R = 8; const NOTCH = 10;
  const cx = lx - W / 2; const cy = ly;
  const cardPath = `M ${cx+R} ${cy} L ${cx+W-NOTCH} ${cy} L ${cx+W} ${cy+NOTCH} L ${cx+W} ${cy+H} L ${cx+R} ${cy+H} Q ${cx} ${cy+H} ${cx} ${cy+H-R} L ${cx} ${cy+R} Q ${cx} ${cy} ${cx+R} ${cy} Z`;
  const typeShort = pod.device_type.includes("arista") ? "EOS" : pod.device_type.includes("xr") ? "IOS-XR" : "IOS-XE";

  return (
    <g onClick={() => { if (!locked) onSelect(pod); }}
      style={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.75 : 1 }}>
      <line x1={lx} y1={box.gndFront.y} x2={lx} y2={ly}
        stroke={selected ? theme.accent : "rgba(162,177,211,0.13)"} strokeWidth={selected ? 1.4 : 0.7}
        strokeDasharray={selected ? "none" : "3 3"} />
      <path d={cardPath} fill="rgba(4,8,18,0.95)"
        stroke={selected ? theme.accent : "rgba(162,177,211,0.13)"} strokeWidth={selected ? 1.8 : 0.9} />
      {/* FUI top bar */}
      <line x1={cx+R} y1={cy+0.5} x2={cx+W-NOTCH} y2={cy+0.5}
        stroke={selected ? theme.accent : theme.accent + "50"} strokeWidth={1.5} />
      {/* Glass sheen */}
      <path d={`M ${cx+R} ${cy} L ${cx+W-NOTCH} ${cy} L ${cx+W} ${cy+NOTCH} L ${cx+W} ${cy+H/2} L ${cx} ${cy+H/2} L ${cx} ${cy+R} Q ${cx} ${cy} ${cx+R} ${cy} Z`}
        fill="rgba(255,255,255,0.022)" />
      {/* Left accent bar */}
      <rect x={cx} y={cy+R} width={2.5} height={H-R*2} rx={1.2}
        fill={theme.accent} opacity={selected ? 0.95 : 0.48} />
      {/* Type badge */}
      <rect x={cx+9} y={cy+9} width={46} height={13} rx={3.5}
        fill={selected ? theme.accent+"28" : "rgba(49,196,255,0.07)"}
        stroke={selected ? theme.accent+"80" : "rgba(49,196,255,0.25)"} strokeWidth={0.8} />
      <text x={cx+32} y={cy+19.5} textAnchor="middle" fontSize={7.5} fontWeight={700}
        fill={selected ? theme.accent : "rgba(49,196,255,0.80)"}
        fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.07em">{typeShort}</text>
      <text x={cx+W-9} y={cy+20} textAnchor="end" fontSize={7.5}
        fill="rgba(60,72,100,1)" fontFamily="'IBM Plex Mono',monospace">{pod.device_ip}</text>
      <text x={cx+12} y={cy+H-13} fontSize={12} fontWeight={700}
        fill={selected ? "#f5f8ff" : "#c7d4ef"} fontFamily="'Space Grotesk',sans-serif">
        {pod.pod_name.length > 17 ? pod.pod_name.slice(0, 15)+"…" : pod.pod_name}
      </text>
      {locked && <text x={cx+W-9} y={cy+H-10} textAnchor="end" fontSize={7.5} fontWeight={700}
        fill="#ffc043" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.08em">LOCKED</text>}
      {!locked && status === "offline" && <text x={cx+W-9} y={cy+H-10} textAnchor="end" fontSize={7.5} fontWeight={700}
        fill="#ff6f85" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.06em">OFFLINE</text>}
      {selected && !locked && <text x={cx+W-9} y={cy+H-10} textAnchor="end" fontSize={7.5} fontWeight={600}
        fill={theme.accent} fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.06em">ENTER ›</text>}
    </g>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
function IsometricCampusMapInner({
  pods, selectedPodId, onSelectPod, statusByPodId, lockedPodIds,
}: {
  pods: LabPod[];
  selectedPodId: number | null;
  onSelectPod: (pod: LabPod) => void;
  statusByPodId?: Partial<Record<number, PodCampusStatus>>;
  lockedPodIds?: Set<number>;
}) {
  const rows   = Math.max(1, Math.ceil(pods.length / COLS));
  const devices = useMemo(
    () => layoutDevices(pods, selectedPodId, statusByPodId, lockedPodIds)
      .sort((a, b) => a.depth - b.depth || a.col - b.col),
    [pods, selectedPodId, statusByPodId, lockedPodIds],
  );

  const topoEdges  = useTopologyStore((s) => s.edges);
  const podKeyMap  = useMemo(
    () => new Map(devices.map((d) => [`pod-${d.pod.id}`, d])),
    [devices],
  );

  const cables = useMemo(() => {
    if (topoEdges.length > 0) {
      return topoEdges.slice(0, 14).flatMap((edge, i) => {
        const src = podKeyMap.get(edge.source);
        const dst = podKeyMap.get(edge.target);
        if (!src || !dst) return [];
        const eData = (edge.data ?? {}) as TopologyEdgeData;
        return [{
          from: src, to: dst,
          srcPort: eData.sourceLabel ?? portName(src.pod.device_type, 1),
          dstPort: eData.targetLabel ?? portName(dst.pod.device_type, 1),
          animDur: 2.5 + i * 0.35,
        }];
      });
    }
    const hub = devices[0];
    if (!hub) return [];
    return devices.slice(1, 9).map((dev, i) => ({
      from: hub, to: dev,
      srcPort: portName(hub.pod.device_type, i + 1),
      dstPort: portName(dev.pod.device_type, 1),
      animDur: 2.6 + i * 0.38,
    }));
  }, [topoEdges, podKeyMap, devices]);

  const statusCounts = useMemo(() => {
    const c: Record<PodCampusStatus, number> = { online: 0, offline: 0, pending: 0, locked: 0 };
    for (const d of devices) c[d.status] += 1;
    return c;
  }, [devices]);

  return (
    <div className="relative h-full min-h-[680px] overflow-hidden rounded-[28px] border border-edge-subtle bg-[#010308] shadow-[0_28px_90px_rgba(0,0,0,0.82)]">
      <div className="pointer-events-none absolute inset-0 bg-grid-animated opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_68%_44%_at_52%_18%,rgba(49,196,255,0.09),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_42%_32%_at_20%_82%,rgba(45,230,170,0.07),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_36%_26%_at_84%_76%,rgba(133,148,255,0.06),transparent)]" />

      {/* FUI corner brackets */}
      <svg className="pointer-events-none absolute left-3 top-3 opacity-60" width={60} height={60}>
        <polyline points="20,2 2,2 2,20" stroke="rgba(49,196,255,0.6)" strokeWidth={1.5} fill="none" />
      </svg>
      <svg className="pointer-events-none absolute right-3 bottom-[56px] opacity-60" width={60} height={60}>
        <polyline points="40,58 58,58 58,40" stroke="rgba(49,196,255,0.6)" strokeWidth={1.5} fill="none" />
      </svg>

      <svg viewBox="0 0 1400 820" className="absolute inset-0 h-full w-full"
        aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <GroundGrid cols={COLS} rows={rows} />
        <ellipse cx={700} cy={460} rx={460} ry={115}
          fill="rgba(49,196,255,0.04)" style={{ filter: "blur(24px)" }} />
        {cables.map((c, i) => <Cable key={i} {...c} />)}
        {devices.map((item) => <DeviceBox key={item.pod.id} item={item} onSelect={onSelectPod} />)}
        {devices.map((item) => <DeviceLabel key={`lbl-${item.pod.id}`} item={item} onSelect={onSelectPod} />)}
      </svg>

      {pods.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="hud-panel max-w-sm p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-edge-glow bg-cyan-glow shadow-glow-cyan-sm">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(49,196,255,0.9)" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="7" height="5" rx="1" /><rect x="15" y="3" width="7" height="5" rx="1" />
                <rect x="8.5" y="16" width="7" height="5" rx="1" />
                <line x1="5.5" y1="8" x2="5.5" y2="12" /><line x1="18.5" y1="8" x2="18.5" y2="12" />
                <line x1="5.5" y1="12" x2="12" y2="12" /><line x1="18.5" y1="12" x2="12" y2="12" />
                <line x1="12" y1="12" x2="12" y2="16" />
              </svg>
            </div>
            <p className="text-2xs font-mono uppercase tracking-widest text-cyan-300">no hardware devices</p>
            <p className="mt-2 text-sm font-semibold text-ink-bright">Add devices via Manage Nodes</p>
            <p className="mt-1 text-xs text-ink-muted">Each node represents a physical device on your lab network</p>
          </div>
        </div>
      )}

      <div className="absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] glass-nav px-4 py-2.5">
        <div className="flex items-center gap-2 text-2xs font-mono text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-matrix animate-pulse" />
          Network Lab Campus · {pods.length} {pods.length === 1 ? "device" : "devices"}
          {topoEdges.length > 0 && <span className="text-cyan-300/60"> · {cables.length} live links</span>}
        </div>
        <div className="flex items-center gap-3 text-2xs font-mono">
          <span className="flex items-center gap-1 text-ink-muted"><span className="h-1.5 w-1.5 rounded-full bg-matrix" />{statusCounts.online} up</span>
          <span className="flex items-center gap-1 text-ink-muted"><span className="h-1.5 w-1.5 rounded-full bg-crimson" />{statusCounts.offline} dn</span>
          {statusCounts.locked > 0 && <span className="flex items-center gap-1 text-ink-muted"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />{statusCounts.locked} lck</span>}
          {(["arista_eos", "cisco_iosxe", "cisco_iosxr"] as const).map((k) => (
            <span key={k} className="hidden items-center gap-1.5 text-ink-muted xl:flex">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: THEMES[k].accent }} />
              {THEMES[k].typeLabel}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export const IsometricCampusMap = memo(IsometricCampusMapInner);
