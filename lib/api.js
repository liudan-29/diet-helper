function configuredApiBase() {
  return String(globalThis.DIET_HELPER_CONFIG?.apiBase || "").replace(/\/+$/, "");
}

export function apiUrl(path) {
  const normalizedPath = `/${String(path || "").replace(/^\/+/, "")}`;
  const apiBase = configuredApiBase();
  if (!apiBase) return normalizedPath;
  return `${apiBase}${normalizedPath.replace(/^\/api(?=\/|$)/, "")}`;
}

export function apiFetch(path, init) {
  return fetch(apiUrl(path), init);
}
