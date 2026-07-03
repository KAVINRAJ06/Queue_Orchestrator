const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const TOKEN_KEY = "scheduler.token";

export type ApiUser = { id: string; email: string; name: string; role: string };

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const authApi = {
  login: (email: string, password: string) => api<{ token: string; user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }),
  signup: (email: string, password: string, name?: string) => api<{ token: string; user: ApiUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  }),
  me: () => api<{ user: ApiUser }>("/auth/me"),
};
