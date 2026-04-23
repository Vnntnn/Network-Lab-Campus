import { useState, type FormEvent } from "react";
import { Loader2, KeyRound, Star, Trash2 } from "lucide-react";
import {
  useCreateIdentity,
  useDeleteIdentity,
  useIdentities,
  useSetDefaultIdentity,
  type Identity,
} from "@/api/queries";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/components/ui/cn";

type DraftIdentity = {
  name: string;
  username: string;
  password: string;
  is_default: boolean;
};

const emptyDraft: DraftIdentity = {
  name: "",
  username: "",
  password: "",
  is_default: false,
};

function IdentityRow({
  identity,
  onSetDefault,
  onDelete,
  settingDefault,
  deleting,
}: {
  identity: Identity;
  onSetDefault: () => void;
  onDelete: () => void;
  settingDefault: boolean;
  deleting: boolean;
}) {
  return (
    <div className="rounded-xl border border-edge-dim bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink-bright truncate">{identity.name}</p>
            {identity.is_default && (
              <span className="telemetry-chip border-matrix/35 text-matrix px-2 py-0.5 text-2xs">
                default
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-muted font-mono truncate">{identity.username}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={cn(
              "btn-ghost text-2xs py-1.5 px-2.5",
              identity.is_default && "border-matrix/35 text-matrix"
            )}
            onClick={onSetDefault}
            disabled={identity.is_default || settingDefault}
            title="Set as default identity"
          >
            {settingDefault
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Star className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            className="btn-ghost text-2xs py-1.5 px-2.5 hover:border-crimson/40 hover:text-crimson"
            onClick={onDelete}
            disabled={deleting}
            title="Delete identity"
          >
            {deleting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IdentityPanel() {
  const { data: identities, isLoading, error } = useIdentities();
  const { mutate: createIdentity, isPending: creating } = useCreateIdentity();
  const { mutate: setDefaultIdentity, isPending: settingDefault } = useSetDefaultIdentity();
  const { mutate: deleteIdentity, isPending: deleting } = useDeleteIdentity();

  const [draft, setDraft] = useState<DraftIdentity>(emptyDraft);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    const name = draft.name.trim();
    const username = draft.username.trim();
    const password = draft.password.trim();
    if (!name || !username || !password) {
      return;
    }

    createIdentity(
      {
        name,
        username,
        password,
        is_default: draft.is_default,
      },
      {
        onSuccess: () => setDraft(emptyDraft),
      }
    );
  };

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-bright">Credential Identities</h3>
          <p className="text-xs text-ink-muted mt-0.5">Reusable credentials for SSH pods and default fallback.</p>
        </div>
        <div className="w-8 h-8 rounded-lg border border-edge-subtle bg-depth flex items-center justify-center">
          <KeyRound className="w-4 h-4 text-cyan-300" />
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2.5">
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          className="input-field text-xs"
          placeholder="identity name"
          maxLength={64}
        />
        <input
          value={draft.username}
          onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
          className="input-field text-xs"
          placeholder="username"
          maxLength={64}
        />
        <input
          value={draft.password}
          onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
          className="input-field text-xs"
          placeholder="password"
          type="password"
          maxLength={128}
        />
        <button type="submit" className="btn-primary text-xs" disabled={creating}>
          {creating
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            : "Add"}
        </button>
      </form>

      <label className="inline-flex items-center gap-2 text-2xs font-mono text-ink-secondary">
        <input
          type="checkbox"
          checked={draft.is_default}
          onChange={(event) => setDraft((current) => ({ ...current, is_default: event.target.checked }))}
          className="accent-cyan-400"
        />
        Set as default identity
      </label>

      {error && (
        <p className="text-xs text-crimson font-mono bg-crimson/10 border border-crimson/25 rounded-lg px-3 py-2">
          {error.message}
        </p>
      )}

      <div className="space-y-2">
        {isLoading && (
          <div className="rounded-xl border border-edge-dim bg-surface p-3 text-xs text-ink-muted font-mono">
            Loading identities...
          </div>
        )}

        {!isLoading && (identities?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-edge-dim bg-surface p-3 text-xs text-ink-muted">
            No identities yet. Add one to reuse credentials across pods.
          </div>
        )}

        {(identities ?? []).map((identity) => (
          <IdentityRow
            key={identity.id}
            identity={identity}
            settingDefault={settingDefault}
            deleting={deleting}
            onSetDefault={() => setDefaultIdentity(identity.id)}
            onDelete={() => deleteIdentity(identity.id)}
          />
        ))}
      </div>
    </GlassCard>
  );
}
