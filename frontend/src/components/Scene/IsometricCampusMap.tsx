import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import type { LabPod } from "@/api/queries";

export type PodCampusStatus = "online" | "offline" | "pending" | "locked";

// ── Isometric geometry ─────────────────────────────────────────────────────
const TW = 200;
const TH = 100;
const HW = TW / 2;
const HH = TH / 2;
const ORIGIN = { x: 700, y: 200 } as const;
const COLS = 4;

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
  const pt  = ([x, y]: readonly [number, number]) => `${x},${y}`;

  return {
    top:       `M ${pt(TN)} L ${pt(TE)} L ${pt(TS)} L ${pt(TW_)} Z`,
    left:      `M ${pt(TW_)} L ${pt(TS)} L ${pt(BS)} L ${pt(BW)} Z`,
    right:     `M ${pt(TE)} L ${pt(TS)} L ${pt(BS)} L ${pt(BE)} Z`,
    gndFront:  { x: BS[0],  y: BS[1] },
    topCenter: { x: px,     y: py + HH - h },
    topFront:  { x: TS[0],  y: TS[1] },
    gndCenter: { x: px,     y: py + HH },
    topE:      { x: TE[0],  y: TE[1] },
    topW:      { x: TW_[0], y: TW_[1] },
  };
}

// ── Device themes ──────────────────────────────────────────────────────────
type Theme = {
  typeLabel: string;
  topA: string; topB: string;
  left: string; right: string;
  accent: string; glow: string;
  badge: "cyan" | "default" | "pulse";
};

const THEMES: Record<string, Theme> = {
  arista_eos: {
    typeLabel: "Arista EOS",
    topA: "#1a5c3c", topB: "#0c3424",
    left: "#0a2c1c", right: "#061810",
    accent: "#2de6aa", glow: "rgba(45,230,170,0.55)",
    badge: "default",
  },
  cisco_iosxe: {
    typeLabel: "Cisco IOS-XE",
    topA: "#163a5e", topB: "#0c2440",
    left: "#0a1e38", right: "#060f20",
    accent: "#31c4ff", glow: "rgba(49,196,255,0.55)",
    badge: "cyan",
  },
  cisco_iosxr: {
    typeLabel: "Cisco IOS-XR",
    topA: "#20145a", topB: "#140c3a",
    left: "#120a32", right: "#08061a",
    accent: "#8594ff", glow: "rgba(133,148,255,0.55)",
    badge: "pulse",
  },
};

const FALLBACK_THEME = THEMES.cisco_iosxe;

// ── Port naming helpers ────────────────────────────────────────────────────
function getPortLabel(deviceType: string, portIndex: number): string {
  if (deviceType === "arista_eos") return `Et${portIndex}/0`;
  if (deviceType === "cisco_iosxr") return `Gi0/0/${portIndex}`;
  return `Gi0/${portIndex}`;
}

// ── Layout types ───────────────────────────────────────────────────────────
type DeviceItem = {
  pod: LabPod;
  col: number; row: number;
  theme: Theme; height: number;
  selected: boolean;
  status: PodCampusStatus;
  locked: boolean;
  depth: number;
};

function layoutDevices(
  pods: LabPod[],
  selectedId: number | null,
  statusByPodId?: Partial<Record<number, PodCampusStatus>>,
  lockedPodIds?: Set<number>
): DeviceItem[] {
  return pods.map((pod, i) => ({
    locked:   lockedPodIds?.has(pod.id) ?? false,
    status:   lockedPodIds?.has(pod.id) ? "locked" : (statusByPodId?.[pod.id] ?? "pending"),
    pod, col: i % COLS, row: Math.floor(i / COLS),
    theme:    THEMES[pod.device_type] ?? FALLBACK_THEME,
    height:   64 + (i % 3) * 14,
    selected: pod.id === selectedId,
    depth:    (i % COLS) + Math.floor(i / COLS),
  }));
}

// ── Cable with animated data packets + dual port labels ────────────────────
function Cable({
  fromItem, toItem, portIdx, animDur,
}: {
  fromItem: DeviceItem;
  toItem: DeviceItem;
  portIdx: number;
  animDur: number;
}) {
  const f  = isoPos(fromItem.col, fromItem.row);
  const t  = isoPos(toItem.col,   toItem.row);
  const fx = f.x;  const fy = f.y + HH;
  const tx = t.x;  const ty = t.y + HH;

  // Slight offset so stacked cables don't overlap exactly
  const offY = portIdx % 2 === 0 ? -4 : 4;
  const path = `M ${fx} ${fy + offY} Q ${(fx + tx) / 2} ${(fy + ty) / 2 + offY - 18} ${tx} ${ty + offY}`;

  const srcPort = getPortLabel(fromItem.pod.device_type, portIdx + 1);
  const dstPort = getPortLabel(toItem.pod.device_type, portIdx + 1);

  // Mid-point for the label
  const mx = (fx + tx) / 2;
  const my = (fy + ty) / 2 + offY - 26;

  const accent = toItem.theme.accent;
  const glow   = toItem.theme.glow;

  return (
    <g>
      {/* Glow halo */}
      <path d={path} stroke={glow} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.28} />
      {/* Dashed cable */}
      <path d={path} stroke={accent} strokeWidth={1.6} fill="none"
        strokeDasharray="10 6" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" values="48;0" dur={`${animDur}s`} repeatCount="indefinite" />
      </path>
      {/* Moving data packet */}
      <circle r={3} fill={accent} opacity={0.92}>
        <animateMotion path={path} dur={`${animDur + 0.5}s`} repeatCount="indefinite" />
      </circle>
      {/* Second offset packet */}
      <circle r={2} fill={accent} opacity={0.55}>
        <animateMotion path={path} dur={`${animDur + 1.2}s`} begin={`${animDur * 0.6}s`} repeatCount="indefinite" />
      </circle>

      {/* Port label pill (centered on cable midpoint) */}
      <g transform={`translate(${mx - 60},${my - 9})`}>
        <rect width={120} height={18} rx={6} fill="rgba(3,5,11,0.92)"
          stroke={accent} strokeWidth={0.7} opacity={0.96} />
        <text x={60} y={12.5} textAnchor="middle" fontSize={7.5}
          fill={accent} fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.06em">
          {srcPort} ↔ {dstPort}
        </text>
      </g>
    </g>
  );
}

// ── Isometric 3D device box ────────────────────────────────────────────────
function DeviceBox({ item, onSelect }: { item: DeviceItem; onSelect: (pod: LabPod) => void }) {
  const { col, row, theme, height, selected, pod, status, locked } = item;
  const box    = buildBox(col, row, height);
  const { x: px, y: py } = isoPos(col, row);
  const gradId = `g-top-${pod.id}`;
  const gradSideId = `g-side-${pod.id}`;

  const statusColor = status === "online"  ? "#2de6aa"
    : status === "offline" ? "#ff6f85"
    : status === "locked"  ? "#ffc043"
    : "#8ea0c9";

  return (
    <motion.g
      onClick={() => { if (!locked) onSelect(pod); }}
      style={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.72 : 1 }}
      whileHover={{ y: selected ? -8 : -5 }}
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={theme.topA} />
          <stop offset="100%" stopColor={theme.topB} />
        </linearGradient>
        <linearGradient id={gradSideId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor={theme.left} />
          <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
        </linearGradient>
      </defs>

      {/* Ground shadow glow */}
      <ellipse cx={px} cy={py + TH - 2} rx={HW * 0.58} ry={HH * 0.32}
        fill={theme.glow} opacity={selected ? 0.60 : 0.25}
        style={{ filter: "blur(12px)" }} />

      {/* Left face */}
      <path d={box.left} fill={`url(#${gradSideId})`}
        stroke={selected ? theme.accent : "rgba(255,255,255,0.07)"}
        strokeWidth={selected ? 1.4 : 0.5} />

      {/* Right face */}
      <path d={box.right}
        fill={selected ? theme.right.replace(")", ",0.9)").replace("rgb", "rgba") : theme.right}
        stroke={selected ? theme.accent : "rgba(255,255,255,0.05)"}
        strokeWidth={selected ? 1.4 : 0.5} />

      {/* Top face */}
      <path d={box.top} fill={`url(#${gradId})`}
        stroke={selected ? theme.accent : "rgba(255,255,255,0.14)"}
        strokeWidth={selected ? 2 : 1} />

      {/* Selection ring on top face */}
      {selected && (
        <path d={box.top} fill="none"
          stroke={theme.accent} strokeWidth={1.8} opacity={0.5}
          strokeDasharray="4 3">
          <animate attributeName="stroke-dashoffset" values="14;0" dur="1.2s" repeatCount="indefinite" />
        </path>
      )}

      {/* Port bank on top face (6 ports) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i}
          x={px - 36 + i * 9} y={py + HH - height - 3}
          width={6} height={3.5} rx={1}
          fill={i < 6 ? theme.accent : "rgba(255,255,255,0.06)"}
          opacity={i < 6 ? (i < 4 ? 0.85 : 0.5) : 0.25}
        />
      ))}

      {/* SFP/uplink port (right side of top) */}
      <rect x={px + HW - 22} y={py + HH - height - 4}
        width={10} height={5} rx={1.5}
        fill={theme.accent} opacity={0.6}
        stroke={theme.accent} strokeWidth={0.5} />

      {/* Brand stripe */}
      <line
        x1={px - HW * 0.42} y1={py + HH - height + 8}
        x2={px + HW * 0.42} y2={py + HH - height + 8}
        stroke={theme.accent} strokeWidth={selected ? 2 : 1}
        opacity={0.45} strokeLinecap="round"
      />

      {/* Rack unit lines on left face */}
      {[0.3, 0.55, 0.78].map((t, i) => (
        <line key={i}
          x1={box.gndFront.x - HW * t} y1={box.gndFront.y - height * 0.28 - i * 10}
          x2={box.gndFront.x}           y2={box.gndFront.y - height * 0.14 - i * 8}
          stroke="rgba(255,255,255,0.05)" strokeWidth={0.8}
        />
      ))}

      {/* Status LED */}
      <circle cx={px - HW + 18} cy={py + HH - height - 1} r={4.5}
        fill={statusColor} opacity={selected ? 1 : 0.8} />
      {(status === "online" || selected) && (
        <circle cx={px - HW + 18} cy={py + HH - height - 1} r={9}
          fill={statusColor} opacity={0.18}>
          <animate attributeName="r" values="6;11;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.18;0.05;0.18" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Active pulse ring (selected only) */}
      {selected && (
        <circle cx={px - HW + 18} cy={py + HH - height - 1} r={14}
          fill="none" stroke={statusColor} strokeWidth={0.8} opacity={0.4}>
          <animate attributeName="r" values="10;16;10" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
    </motion.g>
  );
}

// ── Device label card ──────────────────────────────────────────────────────
function DeviceLabel({ item, onSelect }: { item: DeviceItem; onSelect: (pod: LabPod) => void }) {
  const { col, row, height, theme, selected, pod, locked, status } = item;
  const box = buildBox(col, row, height);
  const lx  = box.gndFront.x;
  const ly  = box.gndFront.y + 12;
  const W = 162, H = 50, R = 9;
  const typeShort = pod.device_type.includes("arista") ? "EOS"
    : pod.device_type.includes("xr") ? "IOS-XR" : "IOS-XE";

  return (
    <g
      onClick={() => { if (!locked) onSelect(pod); }}
      style={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.78 : 1 }}
    >
      {/* Connector line from box to label */}
      <line
        x1={lx} y1={box.gndFront.y}
        x2={lx} y2={ly}
        stroke={selected ? theme.accent : "rgba(162,177,211,0.15)"}
        strokeWidth={selected ? 1.2 : 0.7}
        strokeDasharray={selected ? "none" : "3 2"}
      />

      {/* Card background */}
      <rect x={lx - W / 2} y={ly} width={W} height={H} rx={R}
        fill="rgba(7,11,20,0.94)"
        stroke={selected ? theme.accent : "rgba(162,177,211,0.16)"}
        strokeWidth={selected ? 1.8 : 0.9} />

      {/* Glass sheen on card */}
      <rect x={lx - W / 2 + 1} y={ly + 1} width={W - 2} height={H / 2 - 1} rx={R - 1}
        fill="rgba(255,255,255,0.03)" />

      {/* Left accent bar */}
      <rect x={lx - W / 2} y={ly + R} width={2.5} height={H - R * 2} rx={1.2}
        fill={theme.accent} opacity={selected ? 0.9 : 0.45} />

      {/* Type badge */}
      <rect x={lx - W / 2 + 10} y={ly + 8} width={48} height={14} rx={4}
        fill={selected ? theme.accent + "2a" : "rgba(49,196,255,0.08)"}
        stroke={selected ? theme.accent + "88" : "rgba(49,196,255,0.28)"}
        strokeWidth={0.8} />
      <text x={lx - W / 2 + 34} y={ly + 18.5}
        textAnchor="middle" fontSize={8} fontWeight={600}
        fill={selected ? theme.accent : "rgba(49,196,255,0.85)"}
        fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.07em">
        {typeShort}
      </text>

      {/* IP address */}
      <text x={lx + W / 2 - 10} y={ly + 19}
        textAnchor="end" fontSize={8}
        fill="rgba(70,80,106,1)"
        fontFamily="'IBM Plex Mono',monospace">
        {pod.device_ip}
      </text>

      {/* Pod name */}
      <text x={lx - W / 2 + 12} y={ly + 37}
        fontSize={11.5} fontWeight={700}
        fill={selected ? "#f5f8ff" : "#c7d4ef"}
        fontFamily="'Space Grotesk',sans-serif">
        {pod.pod_name.length > 18 ? pod.pod_name.slice(0, 16) + "…" : pod.pod_name}
      </text>

      {/* Status / lock text */}
      {locked && (
        <text x={lx + W / 2 - 10} y={ly + H - 9}
          textAnchor="end" fontSize={8} fontWeight={700}
          fill="#ffc043" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.08em">
          LOCKED
        </text>
      )}
      {!locked && status === "offline" && (
        <text x={lx + W / 2 - 10} y={ly + H - 9}
          textAnchor="end" fontSize={8} fontWeight={700}
          fill="#ff6f85" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.06em">
          OFFLINE
        </text>
      )}
      {selected && (
        <text x={lx + W / 2 - 10} y={ly + H - 9}
          textAnchor="end" fontSize={7.5} fontWeight={600}
          fill={theme.accent} fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.06em">
          SELECTED ›
        </text>
      )}
    </g>
  );
}

// ── Ground grid ───────────────────────────────────────────────────────────
function GroundGrid({ rows, cols }: { rows: number; cols: number }) {
  const lines: React.ReactNode[] = [];
  for (let r = 0; r <= rows; r++) {
    const s = isoPos(0,    r); const e = isoPos(cols, r);
    lines.push(<line key={`r${r}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y}
      stroke="rgba(49,196,255,0.06)" strokeWidth={0.8} />);
  }
  for (let c = 0; c <= cols; c++) {
    const s = isoPos(c, 0); const e = isoPos(c, rows);
    lines.push(<line key={`c${c}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y}
      stroke="rgba(49,196,255,0.06)" strokeWidth={0.8} />);
  }
  // Tile floor dots at intersections
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const p = isoPos(c, r);
      lines.push(<circle key={`d${c}-${r}`} cx={p.x} cy={p.y} r={1.5}
        fill="rgba(49,196,255,0.18)" />);
    }
  }
  return <g opacity={0.9}>{lines}</g>;
}

// ── Main component ─────────────────────────────────────────────────────────
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
    [pods, selectedPodId, statusByPodId, lockedPodIds]
  );

  const statusCounts = useMemo(() => {
    const c: Record<PodCampusStatus, number> = { online: 0, offline: 0, pending: 0, locked: 0 };
    for (const d of devices) c[d.status] += 1;
    return c;
  }, [devices]);

  // Build hub-and-spoke connections (device[0] is the core switch/hub)
  const hub = devices[0];
  const connections = devices.slice(1).map((dev, i) => ({
    dev, portIdx: i, dur: 2.6 + i * 0.38,
  }));

  return (
    <div className="relative h-full min-h-[680px] overflow-hidden rounded-[28px] border border-edge-subtle bg-[#020509] shadow-[0_28px_90px_rgba(0,0,0,0.78)]">

      {/* Animated grid background inside the campus */}
      <div className="pointer-events-none absolute inset-0 bg-grid-animated opacity-40" />

      {/* Atmospheric depth gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_62%_42%_at_52%_20%,rgba(49,196,255,0.10),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_44%_34%_at_26%_80%,rgba(45,230,170,0.07),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_38%_28%_at_82%_74%,rgba(133,148,255,0.07),transparent)]" />

      {/* ── SVG scene ─────────────────────────────────────────────────── */}
      <svg
        viewBox="0 0 1400 800"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Ground grid */}
        <GroundGrid cols={COLS} rows={rows} />

        {/* Ambient ground glow */}
        <ellipse cx={700} cy={450} rx={440} ry={110}
          fill="rgba(49,196,255,0.05)" style={{ filter: "blur(22px)" }} />

        {/* Network cables — drawn before boxes so boxes sit on top */}
        {hub && connections.map(({ dev, portIdx, dur }) => (
          <Cable key={`cable-${dev.pod.id}`}
            fromItem={hub} toItem={dev}
            portIdx={portIdx} animDur={dur} />
        ))}

        {/* Device boxes — back-to-front */}
        {devices.map((item) => (
          <DeviceBox key={item.pod.id} item={item} onSelect={onSelectPod} />
        ))}

        {/* Labels — always on top */}
        {devices.map((item) => (
          <DeviceLabel key={`lbl-${item.pod.id}`} item={item} onSelect={onSelectPod} />
        ))}
      </svg>

      {/* Empty state */}
      {pods.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="max-w-sm rounded-2xl border border-edge-subtle bg-surface/92 p-6 text-center shadow-card backdrop-blur-md">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-edge-glow bg-cyan-glow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(49,196,255,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="7" height="5" rx="1" /><rect x="15" y="3" width="7" height="5" rx="1" />
                <rect x="8.5" y="16" width="7" height="5" rx="1" />
                <line x1="5.5" y1="8" x2="5.5" y2="12" /><line x1="18.5" y1="8" x2="18.5" y2="12" />
                <line x1="5.5" y1="12" x2="12" y2="12" /><line x1="18.5" y1="12" x2="12" y2="12" />
                <line x1="12" y1="12" x2="12" y2="16" />
              </svg>
            </div>
            <p className="text-2xs font-mono uppercase tracking-widest text-cyan-300">no hardware devices registered</p>
            <p className="mt-2 text-sm font-semibold text-ink-bright">Add real network devices via Manage Nodes to begin</p>
            <p className="mt-1 text-xs text-ink-muted">Each node represents a physical device on your lab network</p>
          </div>
        </div>
      )}

      {/* ── Footer HUD ──────────────────────────────────────────────── */}
      <div className="absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] glass-nav px-4 py-2.5">
        <div className="flex items-center gap-2 text-2xs font-mono text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-matrix animate-pulse" />
          Network Lab Campus · {pods.length} {pods.length === 1 ? "hardware device" : "hardware devices"}
        </div>
        <div className="flex items-center gap-4 text-2xs font-mono">
          <span className="flex items-center gap-1 text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-matrix" />{statusCounts.online} online
          </span>
          <span className="flex items-center gap-1 text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-crimson" />{statusCounts.offline} offline
          </span>
          {statusCounts.locked > 0 && (
            <span className="flex items-center gap-1 text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />{statusCounts.locked} locked
            </span>
          )}
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
