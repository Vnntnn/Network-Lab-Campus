import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy, Check, Terminal, ShieldCheck, FileText,
  RefreshCw, Loader2, AlertCircle,
} from "lucide-react";
import { useRunShow } from "@/api/queries";
import { VerifyPanel } from "./VerifyPanel";
import { type Feature } from "./verifyCommands";
import { cn } from "@/components/ui/cn";

interface TerminalPaneProps {
  podId:         number;
  hostname:      string;
  deviceType:    string;
  commands:      string[];
  pushOutput:    string | null;
  isPushing:     boolean;
  elapsedMs?:    number;
  activeFeature: Feature;
}

// ── Config-context suffix shown in the prompt ──────────────────────────────
function getConfigContext(feature: Feature, deviceType: string): string {
  switch (feature) {
    case "interface":
    case "portchannel": return "config-if";
    case "ospf":
    case "eigrp":
    case "bgp":         return "config-router";
    case "vlan":        return "config-vlan";
    case "routemap":    return "config-route-map";
    case "pbr":         return "config-route-map";
    case "qos":         return "config-pmap";
    case "dhcp":        return deviceType === "arista_eos" ? "config" : "dhcp-config";
    case "acl":         return "config-nacl";
    default:            return "config";
  }
}

interface PromptLine {
  prompt: string;
  cmd:    string;
  type:   "setup" | "config" | "comment" | "sub";
}

function buildPromptChain(
  hostname: string,
  deviceType: string,
  feature: Feature,
  commands: string[]
): PromptLine[] {
  const h   = hostname || "router";
  const ctx = getConfigContext(feature, deviceType);
  const lines: PromptLine[] = [];

  lines.push({ prompt: `${h}>`,  cmd: "enable",             type: "setup" });
  lines.push({ prompt: `${h}#`,  cmd: "configure terminal", type: "setup" });

  let currentCtx = "config";
  for (const cmd of commands) {
    if (!cmd.trim() || cmd === "!") {
      lines.push({ prompt: `${h}(${currentCtx})#`, cmd: "!", type: "comment" });
      continue;
    }
    const isSubCmd = /^\s/.test(cmd);
    if (isSubCmd) {
      lines.push({ prompt: `${h}(${ctx})#`, cmd: cmd.trimStart(), type: "sub" });
    } else {
      if      (/^interface\s/i.test(cmd) || /^port-channel\s/i.test(cmd)) currentCtx = "config-if";
      else if (/^router\s/i.test(cmd))                                     currentCtx = "config-router";
      else if (/^vlan\s/i.test(cmd))                                       currentCtx = "config-vlan";
      else if (/^ip dhcp pool/i.test(cmd))                                 currentCtx = deviceType === "arista_eos" ? "config" : "dhcp-config";
      else if (/^ip access-list/i.test(cmd))                               currentCtx = "config-nacl";
      else                                                                  currentCtx = "config";
      lines.push({ prompt: `${h}(${currentCtx})#`, cmd, type: "config" });
    }
  }
  return lines;
}

function useClipboard(text: string, duration = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), duration);
  };
  return { copied, copy };
}

// ── Show Running-Config syntax coloring ───────────────────────────────────────
function colorizeRunningConfig(line: string): React.ReactNode {
  if (!line.trim()) return <span>{"\n"}</span>;

  // Comment / section separator
  if (/^!/.test(line)) return <span className="text-ink-muted opacity-50">{line}</span>;

  // Top-level section headers
  if (/^(interface|router|ip route|ip access-list|route-map|vlan|vrf|policy-map|class-map|line)\s/i.test(line)) {
    return <span className="text-cyan-300 font-semibold">{line}</span>;
  }
  if (/^(hostname|version|boot|service|logging|aaa|ntp|snmp|banner)\s/i.test(line)) {
    return <span className="text-indigo-300">{line}</span>;
  }

  // Sub-commands (indented)
  if (/^\s/.test(line)) {
    const m = line.match(/^(\s+)(\S+)(.*)$/);
    if (m) return (
      <>
        <span className="text-ink-muted">{m[1]}</span>
        <span className="text-matrix">{m[2]}</span>
        <span className="text-ink-secondary">{m[3]}</span>
      </>
    );
  }

  // Top-level command
  const m = line.match(/^(\S+)(.*)$/);
  if (m) return (
    <>
      <span className="text-pulse font-medium">{m[1]}</span>
      <span className="text-ink">{m[2]}</span>
    </>
  );
  return <span className="text-ink">{line}</span>;
}

type RunningSectionTone = "cyan" | "indigo" | "matrix" | "pulse";

interface RunningSection {
  id: string;
  title: string;
  lineIndex: number;
  tone: RunningSectionTone;
}

function buildRunningConfigSections(text: string): RunningSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: RunningSection[] = [{ id: "top", title: "Top of Config", lineIndex: 0, tone: "cyan" }];

  let blockStart = true;
  let blockCounter = 1;
  let staticRouteSectionSeen = false;

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("!")) {
      blockStart = true;
      continue;
    }

    const interfaceMatch = trimmed.match(/^interface\s+(.+)$/i);
    if (interfaceMatch) {
      sections.push({
        id: `if-${index}`,
        title: `Interface ${interfaceMatch[1]}`,
        lineIndex: index,
        tone: "cyan",
      });
      blockStart = false;
      continue;
    }

    const routerMatch = trimmed.match(/^router\s+(.+)$/i);
    if (routerMatch) {
      sections.push({
        id: `router-${index}`,
        title: `Routing ${routerMatch[1]}`,
        lineIndex: index,
        tone: "indigo",
      });
      blockStart = false;
      continue;
    }

    if (/^ip route\s+/i.test(trimmed) && !staticRouteSectionSeen) {
      sections.push({
        id: `route-${index}`,
        title: "Static Routes",
        lineIndex: index,
        tone: "matrix",
      });
      staticRouteSectionSeen = true;
      blockStart = false;
      continue;
    }

    const aclMatch = trimmed.match(/^ip access-list\s+(.+)$/i);
    if (aclMatch) {
      sections.push({
        id: `acl-${index}`,
        title: `ACL ${aclMatch[1]}`,
        lineIndex: index,
        tone: "pulse",
      });
      blockStart = false;
      continue;
    }

    const routeMapMatch = trimmed.match(/^route-map\s+(.+)$/i);
    if (routeMapMatch) {
      sections.push({
        id: `rmap-${index}`,
        title: `Route-map ${routeMapMatch[1]}`,
        lineIndex: index,
        tone: "indigo",
      });
      blockStart = false;
      continue;
    }

    const policyMatch = trimmed.match(/^(policy-map|class-map|vlan|vrf|line)\s+(.+)$/i);
    if (policyMatch) {
      sections.push({
        id: `policy-${index}`,
        title: `${policyMatch[1]} ${policyMatch[2]}`,
        lineIndex: index,
        tone: "matrix",
      });
      blockStart = false;
      continue;
    }

    if (blockStart) {
      sections.push({
        id: `block-${index}`,
        title: `Block ${blockCounter}`,
        lineIndex: index,
        tone: "cyan",
      });
      blockCounter += 1;
    }

    blockStart = false;
  }

  return sections.slice(0, 120);
}

// ── Show Running-Config panel ─────────────────────────────────────────────────
function ShowRunPanel({ podId, deviceType }: { podId: number; deviceType: string }) {
  const { mutate: runShow, isPending, data, error, reset } = useRunShow();
  const outputRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [activeSectionId, setActiveSectionId] = useState("top");

  const showCmd = deviceType === "cisco_iosxr"
    ? "show running-config"
    : "show running-config";           // same across platforms; kept explicit for clarity

  const handleFetch = () => {
    reset();
    setFetchedAt(new Date());
    setActiveSectionId("top");
    lineRefs.current = {};
    runShow({ pod_id: podId, commands: [showCmd] });
  };

  useEffect(() => {
    if (data && outputRef.current) {
      outputRef.current.scrollTop = 0;
    }
  }, [data]);

  const configText = data?.results[0]?.output ?? "";
  const normalizedConfigText = configText.replace(/\r\n/g, "\n");
  const configLines = useMemo(() => normalizedConfigText.split("\n"), [normalizedConfigText]);
  const sections = useMemo(() => buildRunningConfigSections(normalizedConfigText), [normalizedConfigText]);
  const { copied, copy } = useClipboard(normalizedConfigText);

  const jumpToSection = (section: RunningSection) => {
    setActiveSectionId(section.id);

    if (section.lineIndex <= 0 && outputRef.current) {
      outputRef.current.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = lineRefs.current[section.lineIndex];
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetch}
            disabled={isPending}
            className="btn-primary text-xs py-1.5 px-3"
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Fetch Running Config</>}
          </button>
          <code className="text-2xs font-mono text-ink-muted">{showCmd}</code>
        </div>

        {fetchedAt && (
          <span className="text-2xs font-mono text-ink-muted flex-shrink-0">
            fetched {fetchedAt.toLocaleTimeString()}
            {data && ` · ${data.elapsed_ms.toFixed(0)} ms`}
          </span>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-crimson/25 bg-crimson/8 p-3 text-xs font-mono text-crimson">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error.message}
        </div>
      )}

      {/* ── Config output ── */}
      {data && (
        <div className="terminal-block flex min-h-0 flex-1 flex-col overflow-hidden animate-fade-up">
          {/* Terminal chrome */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-edge-subtle px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-crimson/60" />
                <span className="h-3 w-3 rounded-full bg-pulse/60" />
                <span className="h-3 w-3 rounded-full bg-matrix/60" />
              </div>
              <span className="text-2xs font-mono text-ink-muted ml-1">
                running-config · {configLines.length} lines
              </span>
            </div>
            <button
              onClick={copy}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-2xs font-mono transition-all",
                copied
                  ? "border-matrix/30 bg-matrix/10 text-matrix"
                  : "border-transparent text-ink-muted hover:border-edge-subtle hover:bg-surface-raised hover:text-ink-secondary"
              )}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Config lines + section outline */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="w-56 flex-shrink-0 border-r border-edge-subtle bg-depth/70 p-2">
              <div className="mb-2 px-1 text-2xs font-mono uppercase tracking-[0.14em] text-cyan-300">
                section outline
              </div>
              <div className="max-h-full space-y-1 overflow-y-auto pr-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => jumpToSection(section)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-2xs font-mono transition-colors",
                      activeSectionId === section.id
                        ? "border-edge-glow bg-cyan-glow/20 text-ink-bright"
                        : "border-transparent text-ink-muted hover:border-edge-subtle hover:bg-surface-raised hover:text-ink-secondary"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full flex-shrink-0",
                        section.tone === "cyan"
                          ? "bg-cyan-300"
                          : section.tone === "indigo"
                            ? "bg-indigo-300"
                            : section.tone === "matrix"
                              ? "bg-matrix"
                              : "bg-pulse"
                      )}
                    />
                    <span className="truncate">{section.title}</span>
                  </button>
                ))}
              </div>
            </aside>

            <div ref={outputRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              <pre className="text-xs font-mono leading-[1.6] whitespace-pre-wrap">
                {configLines.map((line, i) => (
                  <div
                    key={i}
                    ref={(element) => {
                      lineRefs.current[i] = element;
                    }}
                    className="animate-fade-up"
                    style={{ animationDelay: `${Math.min(i * 5, 300)}ms` }}
                  >
                    {colorizeRunningConfig(line)}
                    {"\n"}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!data && !error && !isPending && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-edge-subtle bg-depth/40">
          <FileText className="h-6 w-6 text-ink-muted opacity-30" />
          <div className="text-center">
            <p className="text-xs font-mono text-ink-muted">No config fetched yet</p>
            <p className="mt-1 text-2xs font-mono text-ink-muted opacity-60">
              Click "Fetch Running Config" to pull the current device state
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type PaneTab = "preview" | "verify" | "showrun";

export function TerminalPane({
  podId,
  hostname,
  deviceType,
  commands,
  pushOutput,
  isPushing,
  elapsedMs,
  activeFeature,
}: TerminalPaneProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useClipboard(commands.join("\n"));
  const [tab,         setTab]         = useState<PaneTab>("preview");
  const [showContext, setShowContext] = useState(true);

  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [pushOutput]);

  const promptLines = buildPromptChain(hostname, deviceType, activeFeature, commands);

  return (
    <div className="flex h-full flex-col gap-0">
      {/* ── Tab bar ────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-shrink-0 items-center gap-1">
        {(
          [
            { id: "preview",  Icon: Terminal,    label: "Preview" },
            { id: "verify",   Icon: ShieldCheck, label: "Verify"  },
            { id: "showrun",  Icon: FileText,    label: "Show Run"},
          ] as const
        ).map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
              tab === id
                ? "border border-edge-subtle bg-surface text-ink-bright"
                : "text-ink-muted hover:text-ink-secondary"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}

        {tab === "preview" && (
          <>
            <button
              onClick={() => setShowContext((v) => !v)}
              className="ml-auto px-2 text-2xs font-mono text-ink-muted transition-colors hover:text-cyan-400"
            >
              {showContext ? "hide ctx" : "show ctx"}
            </button>
            <span className="text-2xs font-mono text-ink-muted">
              {commands.filter((l) => l !== "!").length} lines
            </span>
          </>
        )}
      </div>

      {/* ── Preview tab ────────────────────────────────────────────────── */}
      {tab === "preview" && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="terminal-block flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Chrome bar */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-edge-subtle px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-crimson/60" />
                  <span className="h-3 w-3 rounded-full bg-pulse/60" />
                  <span className="h-3 w-3 rounded-full bg-matrix/60" />
                </div>
                <span className="ml-1 text-2xs font-mono text-ink-muted">
                  {hostname || "router"}.cli
                </span>
              </div>
              <button
                onClick={copy}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-2xs font-mono transition-all duration-150",
                  copied
                    ? "border-matrix/30 bg-matrix/10 text-matrix"
                    : "border-transparent text-ink-muted hover:border-edge-subtle hover:bg-surface-raised hover:text-ink-secondary"
                )}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            {/* Commands */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {commands.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-muted">
                  <Terminal className="h-5 w-5 opacity-40" />
                  <span className="text-xs font-mono">Fill the form to see CLI…</span>
                </div>
              ) : showContext ? (
                <pre className="whitespace-pre-wrap text-xs font-mono leading-5">
                  {promptLines.map((line, i) => (
                    <div key={i} className="prompt-line" style={{ animationDelay: `${i * 15}ms` }}>
                      {line.type === "comment" ? (
                        <span className="opacity-40 text-ink-muted">!</span>
                      ) : (
                        <>
                          <span className={cn(
                            "prompt-symbol flex-shrink-0 select-none",
                            line.type === "setup" ? "text-ink-muted" : "text-cyan-400"
                          )}>
                            {line.prompt}
                          </span>
                          <span className={cn(
                            line.type === "setup" ? "text-ink-muted"
                            : line.type === "sub"  ? "pl-4 text-indigo-300"
                            :                        "text-ink-bright"
                          )}>
                            {line.cmd}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  <span className="ml-1 inline-block h-3.5 w-2 animate-blink-cursor bg-cyan-400 align-middle" />
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-mono leading-6">
                  {commands.map((line, i) => (
                    <div key={i} className="animate-fade-up" style={{ animationDelay: `${i * 20}ms` }}>
                      {colorizeCli(line)}{"\n"}
                    </div>
                  ))}
                  <span className="inline-block h-4 w-2 animate-blink-cursor bg-cyan-400 align-middle" />
                </pre>
              )}
            </div>
          </div>

          {/* Push output */}
          {(pushOutput !== null || isPushing) && (
            <div className="terminal-block flex max-h-44 flex-shrink-0 animate-fade-up flex-col overflow-hidden">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-edge-subtle px-4 py-2">
                <span className="text-2xs font-mono text-ink-muted">device output</span>
                {elapsedMs !== undefined && (
                  <span className="text-2xs font-mono text-matrix">{elapsedMs.toFixed(0)} ms</span>
                )}
              </div>
              <div ref={outputRef} className="flex-1 overflow-y-auto p-4">
                {isPushing ? (
                  <div className="flex items-center gap-2 text-xs font-mono text-pulse">
                    <span className="animate-pulse">▶</span> Pushing to device…
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-xs font-mono leading-5 text-ink-secondary">
                    {pushOutput}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Verify tab ─────────────────────────────────────────────────── */}
      {tab === "verify" && (
        <div className="min-h-0 flex-1">
          <VerifyPanel podId={podId} activeFeature={activeFeature} />
        </div>
      )}

      {/* ── Show Run tab ───────────────────────────────────────────────── */}
      {tab === "showrun" && (
        <div className="min-h-0 flex-1">
          <ShowRunPanel podId={podId} deviceType={deviceType} />
        </div>
      )}
    </div>
  );
}

// ── CLI colorizer (preview tab) ────────────────────────────────────────────
function colorizeCli(line: string): React.ReactNode {
  if (line.startsWith("!")) return <span className="text-ink-muted">{line}</span>;
  if (/^\s/.test(line)) {
    const parts = line.match(/^(\s+)(\S+)(.*)$/);
    if (parts)
      return (
        <>
          <span>{parts[1]}</span>
          <span className="text-indigo-300">{parts[2]}</span>
          <span className="text-cyan-200">{parts[3]}</span>
        </>
      );
  }
  const parts = line.match(/^(\S+)(.*)$/);
  if (parts)
    return (
      <>
        <span className="font-semibold text-cyan-400">{parts[1]}</span>
        <span className="text-ink">{parts[2]}</span>
      </>
    );
  return <span className="text-ink">{line}</span>;
}
