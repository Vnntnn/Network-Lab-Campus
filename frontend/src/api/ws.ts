export function buildWsUrl(path: string): string {
  const configuredBase = import.meta.env.VITE_WS_BASE_URL?.trim();
  if (configuredBase) {
    const base = configuredBase.endsWith("/") ? configuredBase.slice(0, -1) : configuredBase;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}://${window.location.host}${normalizedPath}`;
}
