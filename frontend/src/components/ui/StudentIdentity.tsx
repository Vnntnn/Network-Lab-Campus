import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Check, X } from "lucide-react";
import { useAppStore } from "@/stores/appStore";

const ACTOR_NAME_KEY = "actor_name";

export function StudentIdentity() {
  const view = useAppStore((s) => s.view);

  const [expanded, setExpanded]   = useState(false);
  const [draft,    setDraft]      = useState("");
  const [name,     setStoredName] = useState<string | null>(
    () => localStorage.getItem(ACTOR_NAME_KEY)
  );

  if (view === "selector") return null;

  const openEdit = () => {
    setDraft(name ?? "");
    setExpanded(true);
  };

  const save = () => {
    const trimmed = draft.trim().slice(0, 64);
    if (trimmed) {
      localStorage.setItem(ACTOR_NAME_KEY, trimmed);
      setStoredName(trimmed);
    } else {
      localStorage.removeItem(ACTOR_NAME_KEY);
      setStoredName(null);
    }
    setExpanded(false);
  };

  const cancel = () => setExpanded(false);

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 6 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2 glass-nav rounded-xl border border-edge-dim px-3 py-2 shadow-lg"
          >
            <User className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              className="input-field h-7 text-2xs w-32 py-0 px-2 font-mono"
              placeholder="your name"
              maxLength={64}
            />
            <button
              onClick={save}
              className="flex items-center justify-center w-6 h-6 rounded-md bg-matrix/20 border border-matrix/30 text-matrix hover:bg-matrix/30 transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={cancel}
              className="flex items-center justify-center w-6 h-6 rounded-md btn-ghost text-ink-muted"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.15 }}
            onClick={openEdit}
            className="flex items-center gap-1.5 glass-nav rounded-full border border-edge-dim px-3 py-1.5 text-2xs font-mono text-ink-secondary hover:text-ink hover:border-edge-glow transition-all micro-tap shadow-lg"
          >
            <User className="w-3 h-3 text-cyan-300" />
            <span className="max-w-[8rem] truncate">
              {name || <span className="text-ink-muted italic">Set name</span>}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
