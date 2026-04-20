import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import type { LabPod } from "@/api/queries";

export type PodCampusStatus = "online" | "offline" | "pending" | "locked";

// ── Isometric geometry ────────────────────────────────────────────────────────
const TW = 200;          // tile full width
const TH = 100;          // tile full height (TW/2 for 2:1 ratio)
const HW = TW / 2;       // 100
const HH = TH / 2;       // 50
const ORIGIN = { x: 700, y: 190 } as const;
const COLS = 4;

function isoPos(col: number, row: number) {
  return {
    x: ORIGIN.x + (col - row) * HW,
    y: ORIGIN.y + (col + row) * HH,
  };
}

/** SVG path strings + key anchor points for a 3D isometric box */
function buildBox(col: number, row: number, h: number) {
  const { x: px, y: py } = isoPos(col, row);

  // Top face vertices (shifted up by h)
  const TN = [px,       py - h       ] as const;
  const TE = [px + HW,  py + HH - h  ] as const;
  const TS = [px,       py + TH - h  ] as const;
  const TW_ = [px - HW, py + HH - h  ] as const;

  // Base vertices at ground level
  const BS = [px,       py + TH      ] as const;
  const BE = [px + HW,  py + HH      ] as const;
  const BW = [px - HW,  py + HH      ] as const;

  const pt = ([x, y]: readonly [number, number]) => `${x},${y}`;

  return {
    top:         `M ${pt(TN)} L ${pt(TE)} L ${pt(TS)} L ${pt(TW_)} Z`,
    left:        `M ${pt(TW_)} L ${pt(TS)} L ${pt(BS)} L ${pt(BW)} Z`,
    right:       `M ${pt(TE)} L ${pt(TS)} L ${pt(BS)} L ${pt(BE)} Z`,
    // Anchor points for glow / label
    gndFront:    { x: BS[0], y: BS[1] },
    topCenter:   { x: px,    y: py + HH - h },
    topFront:    { x: TS[0], y: TS[1] },
    gndCenter:   { x: px,    y: py + HH },
  };
}

// ── Device themes ─────────────────────────────────────────────────────────────
type Theme = {
  typeLabel: string;
  topA: string;
  topB: string;
  left: string;
  right: string;
  accent: string;
  glow: string;
  badge: "cyan" | "default" | "pulse";
};

const THEMES: Record<string, Theme> = {
  arista_eos: {
    typeLabel: "Arista EOS",
    topA: "#1a5c3c", topB: "#0c3424",
    left: "#0a2c1c", right: "#061810",
    accent: "#2de6aa", glow: "rgba(45,230,170,0.50)",
    badge: "default",
  },
  cisco_iosxe: {
    typeLabel: "Cisco IOS-XE",
    topA: "#163a5e", topB: "#0c2440",
    left: "#0a1e38", right: "#060f20",
    accent: "#31c4ff", glow: "rgba(49,196,255,0.50)",
    badge: "cyan",
  },
  cisco_iosxr: {
    typeLabel: "Cisco IOS-XR",
    topA: "#20145a", topB: "#140c3a",
    left: "#120a32", right: "#08061a",
    accent: "#8594ff", glow: "rgba(133,148,255,0.50)",
    badge: "pulse",
  },
};

const FALLBACK_THEME = THEMES.cisco_iosxe;

// ── Layout helpers ────────────────────────────────────────────────────────────
type DeviceItem = {
  pod: LabPod;
  col: number;
  row: number;
  theme: Theme;
  height: number;
  selected: boolean;
  status: PodCampusStatus;
  locked: boolean;
  /** col + row = depth; higher = closer to viewer */
  depth: number;
};

function layoutDevices(
  pods: LabPod[],
  selectedId: number | null,
  statusByPodId?: Partial<Record<number, PodCampusStatus>>,
  lockedPodIds?: Set<number>
): DeviceItem[] {
  return pods.map((pod, i) => ({
    locked: lockedPodIds?.has(pod.id) ?? false,
    status: lockedPodIds?.has(pod.id) ? "locked" : (statusByPodId?.[pod.id] ?? "pending"),
    pod,
    col: i % COLS,
    row: Math.floor(i / COLS),
    theme: THEMES[pod.device_type] ?? FALLBACK_THEME,
    height: 62 + (i % 3) * 14,       // 62 | 76 | 90 px
    selected: pod.id === selectedId,
    depth: (i % COLS) + Math.floor(i / COLS),
  }));
}

// ── SVG sub-components ────────────────────────────────────────────────────────

/** Animated connection cable between two grid positions */
function Cable({
  fromCol, fromRow, toCol, toRow, accent, glow, animDur,
  label,
}: {
  fromCol: number; fromRow: number;
  toCol: number;   toRow: number;
  accent: string;  glow: string;  animDur: number;
  label: string;
}) {
  const f = isoPos(fromCol, fromRow);
  const t = isoPos(toCol,   toRow);
  // Route along ground-center of each tile
  const fx = f.x; const fy = f.y + HH;
  const tx = t.x; const ty = t.y + HH;
  const mx = (fx + tx) / 2;
  const my = (fy + ty) / 2;
  const path = `M ${fx} ${fy} L ${tx} ${ty}`;

  return (
    <g>
      {/* glow halo */}
      <path d={path} stroke={glow} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.35} />
      {/* dashed animated cable */}
      <path d={path} stroke={accent} strokeWidth={1.4} fill="none"
        strokeDasharray="9 7" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" values="32;0" dur={`${animDur}s`} repeatCount="indefinite" />
      </path>
      {/* moving data packet */}
      <circle r={2.8} fill={accent} opacity={0.95}>
        <animateMotion path={path} dur={`${animDur + 0.7}s`} repeatCount="indefinite" />
      </circle>
      {/* port label */}
      <g transform={`translate(${mx - 42},${my - 9})`}>
        <rect width={84} height={16} rx={5} fill="rgba(3,5,11,0.88)"
          stroke={accent} strokeWidth={0.7} opacity={0.95} />
        <text x={42} y={11} textAnchor="middle" fontSize={8}
          fill={accent} fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.05em">
          {label}
        </text>
      </g>
    </g>
  );
}

/** Isometric 3D box for one device */
function DeviceBox({
  item, onSelect,
}: {
  item: DeviceItem;
  onSelect: (pod: LabPod) => void;
}) {
  const { col, row, theme, height, selected, pod, status, locked } = item;
  const box  = buildBox(col, row, height);
  const { x: px, y: py } = isoPos(col, row);
  const gradId = `g-top-${pod.id}`;
  const statusColor = status === "online"
    ? "#2de6aa"
    : status === "offline"
      ? "#ff6f85"
      : status === "locked"
        ? "#ffc043"
        : "#8ea0c9";

  return (
    <motion.g
      onClick={() => {
        if (locked) return;
        onSelect(pod);
      }}
      style={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.75 : 1 }}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 340, damping: 22 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor={theme.topA} />
          <stop offset="100%" stopColor={theme.topB} />
        </linearGradient>
      </defs>

      {/* Ground glow shadow */}
      <ellipse
        cx={px} cy={py + TH - 4}
        rx={HW * 0.55} ry={HH * 0.30}
        fill={theme.glow}
        opacity={selected ? 0.55 : 0.22}
        style={{ filter: "blur(10px)" }}
      />

      {/* Left face — darkest */}
      <path d={box.left} fill={theme.left}
        stroke={selected ? theme.accent : "rgba(255,255,255,0.06)"}
        strokeWidth={selected ? 1.2 : 0.5} />

      {/* Right face — dark */}
      <path d={box.right} fill={theme.right}
        stroke={selected ? theme.accent : "rgba(255,255,255,0.05)"}
        strokeWidth={selected ? 1.2 : 0.5} />

      {/* Top face — lighter gradient */}
      <path d={box.top} fill={`url(#${gradId})`}
        stroke={selected ? theme.accent : "rgba(255,255,255,0.13)"}
        strokeWidth={selected ? 1.8 : 0.9} />

      {/* Port bank on top face */}
      {Array.from({ length: 6 }).map((_, i) => (
        <rect
          key={i}
          x={px - 30 + i * 10}
          y={py + HH - height - 3}
          width={7} height={4} rx={1}
          fill={i < 4 ? theme.accent : "rgba(255,255,255,0.08)"}
          opacity={i < 4 ? 0.75 : 0.35}
        />
      ))}

      {/* Brand stripe on top face */}
      <line
        x1={px - HW * 0.38} y1={py + HH - height}
        x2={px + HW * 0.38} y2={py + HH - height}
        stroke={theme.accent} strokeWidth={selected ? 1.8 : 0.9}
        opacity={0.55} strokeLinecap="round"
      />

      {/* Status LED (top-right of top face) */}
      <circle cx={px + HW - 16} cy={py + HH - height} r={4}
        fill={statusColor} opacity={selected ? 1 : 0.75} />
      {(selected || status === "pending" || status === "locked") && (
        <circle cx={px + HW - 16} cy={py + HH - height} r={9}
          fill={statusColor} opacity={0.22} />
      )}

      {/* Rack-unit lines on left face */}
      {[0.33, 0.6].map((t, i) => (
        <line key={i}
          x1={box.gndFront.x - HW * t}      y1={box.gndFront.y - height * 0.3 - i * 12}
          x2={box.gndFront.x}                y2={box.gndFront.y - height * 0.15 - i * 10}
          stroke="rgba(255,255,255,0.06)" strokeWidth={0.7}
        />
      ))}
    </motion.g>
  );
}

/** SVG-native label card below each device */
function DeviceLabel({
  item, onSelect,
}: {
  item: DeviceItem;
  onSelect: (pod: LabPod) => void;
}) {
  const { col, row, height, theme, selected, pod, locked, status } = item;
  const box = buildBox(col, row, height);
  const lx  = box.gndFront.x;
  const ly  = box.gndFront.y + 10;
  const W = 154, H = 46, R = 8;
  const typeShort = pod.device_type.includes("arista") ? "EOS"
    : pod.device_type.includes("xr") ? "IOS-XR" : "IOS-XE";

  return (
    <g
      onClick={() => {
        if (locked) return;
        onSelect(pod);
      }}
      style={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.78 : 1 }}
    >
      {/* Card bg */}
      <rect x={lx - W / 2} y={ly} width={W} height={H} rx={R}
        fill="rgba(7,11,20,0.93)"
        stroke={selected ? theme.accent : "rgba(162,177,211,0.18)"}
        strokeWidth={selected ? 1.6 : 0.9} />

      {/* Type badge */}
      <rect x={lx - W / 2 + 8} y={ly + 7} width={46} height={14} rx={4}
        fill={selected ? theme.accent + "2a" : "rgba(49,196,255,0.08)"}
        stroke={selected ? theme.accent + "80" : "rgba(49,196,255,0.28)"}
        strokeWidth={0.8} />
      <text x={lx - W / 2 + 31} y={ly + 18}
        textAnchor="middle" fontSize={8} fontWeight={600}
        fill={selected ? theme.accent : "rgba(49,196,255,0.85)"}
        fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.07em">
        {typeShort}
      </text>

      {/* IP */}
      <text x={lx + W / 2 - 8} y={ly + 18}
        textAnchor="end" fontSize={8}
        fill="rgba(70,80,106,1)"
        fontFamily="'IBM Plex Mono',monospace">
        {pod.device_ip}
      </text>

      {/* Pod name */}
      <text x={lx - W / 2 + 8} y={ly + 35}
        fontSize={11} fontWeight={700}
        fill={selected ? "#f5f8ff" : "#c7d4ef"}
        fontFamily="'Space Grotesk',sans-serif">
        {pod.pod_name.length > 17 ? pod.pod_name.slice(0, 15) + "…" : pod.pod_name}
      </text>

      {/* Selection indicator */}
      {selected && (
        <circle cx={lx + W / 2 - 10} cy={ly + 8} r={3.5}
          fill={theme.accent} opacity={0.9} />
      )}

      {locked && (
        <text x={lx + W / 2 - 10} y={ly + H - 8}
          textAnchor="end" fontSize={8} fontWeight={700}
          fill="#ffc043"
          fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.08em">
          LOCKED
        </text>
      )}

      {!locked && status === "offline" && (
        <text x={lx + W / 2 - 10} y={ly + H - 8}
          textAnchor="end" fontSize={8} fontWeight={700}
          fill="#ff6f85"
          fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.06em">
          OFFLINE
        </text>
      )}
    </g>
  );
}

// ── SVG ground grid ───────────────────────────────────────────────────────────
function GroundGrid({ rows, cols }: { rows: number; cols: number }) {
  const lines: React.ReactNode[] = [];

  // Draw iso row lines (following the col direction for each row value)
  for (let r = 0; r <= rows; r++) {
    const start = isoPos(0,    r);
    const end   = isoPos(cols, r);
    lines.push(
      <line key={`row-${r}`}
        x1={start.x} y1={start.y} x2={end.x} y2={end.y}
        stroke="rgba(49,196,255,0.07)" strokeWidth={0.8} />
    );
  }
  // Draw iso col lines (following the row direction for each col value)
  for (let c = 0; c <= cols; c++) {
    const start = isoPos(c, 0);
    const end   = isoPos(c, rows);
    lines.push(
      <line key={`col-${c}`}
        x1={start.x} y1={start.y} x2={end.x} y2={end.y}
        stroke="rgba(49,196,255,0.07)" strokeWidth={0.8} />
    );
  }
  return <g opacity={0.85}>{lines}</g>;
}

// ── Main component ────────────────────────────────────────────────────────────
function IsometricCampusMapInner({
  pods,
  selectedPodId,
  onSelectPod,
  statusByPodId,
  lockedPodIds,
}: {
  pods: LabPod[];
  selectedPodId: number | null;
  onSelectPod: (pod: LabPod) => void;
  statusByPodId?: Partial<Record<number, PodCampusStatus>>;
  lockedPodIds?: Set<number>;
}) {
  const rows = Math.max(1, Math.ceil(pods.length / COLS));
  const devices = useMemo(
    () =>
      layoutDevices(pods, selectedPodId, statusByPodId, lockedPodIds)
        .sort((a, b) => a.depth - b.depth || a.col - b.col),
    [pods, selectedPodId, statusByPodId, lockedPodIds]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<PodCampusStatus, number> = { online: 0, offline: 0, pending: 0, locked: 0 };
    for (const device of devices) counts[device.status] += 1;
    return counts;
  }, [devices]);

  // Build hub-to-spoke connections (first device is hub)
  const hub = devices[0];
  const connections = devices.slice(1).map((dev, i) => ({
    dev,
    label: `Gi0/${i + 1} ↔ Gi0/${(i + 2) % 8 + 1}`,
    dur: 2.8 + i * 0.35,
  }));

  return (
    <div className="relative h-full min-h-[680px] overflow-hidden rounded-[28px] border border-edge-subtle bg-[#03060e] shadow-[0_28px_90px_rgba(0,0,0,0.70)]">
      {/* Atmospheric gradients */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_38%_at_52%_22%,rgba(49,196,255,0.09),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_28%_78%,rgba(45,230,170,0.06),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_35%_25%_at_80%_72%,rgba(133,148,255,0.06),transparent)]" />

      {/* ── SVG Scene ───────────────────────────────────────────────────── */}
      <svg
        viewBox="0 0 1400 760"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Ground grid */}
        <GroundGrid cols={COLS} rows={rows} />

        {/* Ambient ground glow */}
        <ellipse cx={700} cy={430} rx={420} ry={100}
          fill="rgba(49,196,255,0.04)"
          style={{ filter: "blur(18px)" }} />

        {/* Cables — drawn before boxes so boxes sit on top */}
        {hub && connections.map(({ dev, label, dur }) => (
          <Cable
            key={`cable-${dev.pod.id}`}
            fromCol={hub.col} fromRow={hub.row}
            toCol={dev.col}   toRow={dev.row}
            accent={dev.theme.accent}
            glow={dev.theme.glow}
            animDur={dur}
            label={label}
          />
        ))}

        {/* Device boxes — back-to-front (painter's algorithm) */}
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
            <p className="text-2xs font-mono uppercase tracking-widest text-cyan-300">no devices seeded</p>
            <p className="mt-2 text-sm font-semibold text-ink-bright">
              Deploy the containerlab sample and run <code className="text-xs text-matrix">backend/seed.py</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Footer HUD ─────────────────────────────────────────────────── */}
      <div className="absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge-subtle bg-surface/82 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2 text-2xs font-mono text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-matrix animate-pulse" />
          SVG isometric campus · {pods.length} {pods.length === 1 ? "node" : "nodes"}
        </div>
        <div className="flex items-center gap-4 text-2xs font-mono">
          <span className="flex items-center gap-1 text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-matrix" />{statusCounts.online} online
          </span>
          <span className="flex items-center gap-1 text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-crimson" />{statusCounts.offline} offline
          </span>
          <span className="flex items-center gap-1 text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />{statusCounts.locked} locked
          </span>
          {(["arista_eos", "cisco_iosxe", "cisco_iosxr"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-ink-muted">
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
