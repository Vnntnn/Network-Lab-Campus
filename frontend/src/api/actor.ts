const ACTOR_STORAGE_KEY = "ncmp-actor-id";
const FALLBACK_ACTOR_ID = "default";
const VALID_ACTOR = /^[A-Za-z0-9_.-]{1,64}$/;

function normalizeActorId(candidate: string | null | undefined): string {
  const value = (candidate ?? "").trim();
  if (!value) return "";

  const safe = value
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 64);

  return VALID_ACTOR.test(safe) ? safe : "";
}

export function resolveActorId(): string {
  if (typeof window === "undefined") return FALLBACK_ACTOR_ID;

  const stored = normalizeActorId(window.localStorage.getItem(ACTOR_STORAGE_KEY));
  if (stored) return stored;

  const configured = normalizeActorId(import.meta.env.VITE_ACTOR_ID);
  const uuid =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
  const generated = normalizeActorId(`user-${uuid.slice(0, 12)}`);
  const actorId = configured || generated || FALLBACK_ACTOR_ID;

  window.localStorage.setItem(ACTOR_STORAGE_KEY, actorId);
  return actorId;
}
