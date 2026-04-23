import { useState } from "react";
import {
  ArrowLeft, Plus, Server, AlertCircle, Database,
} from "lucide-react";
import { usePods } from "@/api/queries";
import { useAppStore } from "@/stores/appStore";
import { PodRow } from "./PodRow";
import { AddPodForm } from "./AddPodForm";
import { IdentityPanel } from "./IdentityPanel";
import { GlassCard } from "@/components/ui/GlassCard";
import { ViewLoading } from "@/components/ui/ViewLoading";

export function AdminPanel() {
  const setView = useAppStore((s) => s.setView);
  const { data: pods, isLoading, isError, error } = usePods();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="min-h-screen bg-abyss flex flex-col overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-radial-indigo pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-edge-dim backdrop-blur-sm bg-abyss/80">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView("selector")}
            className="flex items-center gap-1.5 text-ink-muted hover:text-ink-secondary transition-colors text-xs font-mono micro-tap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> lab
          </button>
          <div className="w-px h-4 bg-edge-subtle" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-indigo-glow border border-indigo-400/30 flex items-center justify-center">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div>
              <span className="text-sm font-semibold text-ink-bright">Node Management</span>
              <span className="ml-2 text-xs text-ink-muted font-mono">admin</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowAddForm((v) => !v)}
          className={showAddForm ? "btn-ghost text-xs" : "btn-primary text-xs"}
        >
          <Plus className="w-3.5 h-3.5" />
          {showAddForm ? "Cancel" : "Add Node"}
        </button>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">

          {/* Add form */}
          {showAddForm && (
            <AddPodForm onSuccess={() => setShowAddForm(false)} />
          )}

          <IdentityPanel />

          {/* Pod list */}
          <div>
            <div className="section-label mb-4">
              Lab Nodes
              {pods && (
                <span className="tag ml-2">{pods.length}</span>
              )}
            </div>

            {isLoading && (
              <ViewLoading
                compact
                className="py-12"
                title="Loading Node Records"
                subtitle="Fetching node definitions and metadata..."
              />
            )}

            {isError && (
              <GlassCard className="flex items-center gap-3 p-4 border-crimson/25 bg-crimson/5">
                <AlertCircle className="w-5 h-5 text-crimson flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-crimson">Backend unreachable</p>
                  <p className="text-xs text-ink-muted mt-0.5">{(error as Error)?.message}</p>
                </div>
              </GlassCard>
            )}

            {pods && pods.length === 0 && !showAddForm && (
              <GlassCard className="flex flex-col items-center gap-3 py-12 text-center">
                <Server className="w-8 h-8 text-ink-muted opacity-40" />
                <p className="text-sm text-ink-secondary">No nodes configured yet.</p>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="btn-primary text-xs mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add your first node
                </button>
              </GlassCard>
            )}

            {pods && pods.length > 0 && (
              <div className="space-y-3">
                {pods.map((pod, i) => (
                  <PodRow key={pod.id} pod={pod} index={i} />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
