/*
 * A sessão fica num cookie httpOnly definido pelo servidor: este código nunca vê nem guarda o token.
 * O navegador envia o cookie sozinho em toda chamada para /api (mesma origem).
 */

// Limpa o token antigo que versões anteriores guardavam no localStorage.
try {
  localStorage.removeItem("pedscribe.token");
} catch {
  /* armazenamento indisponível: nada a limpar */
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Avisado quando o servidor encerra a sessão (expirou, foi revogada ou a pessoa foi desativada). */
let onSessionEnded: (() => void) | null = null;
export function setSessionEndedHandler(handler: (() => void) | null) {
  onSessionEnded = handler;
}

// Nessas rotas, 401 é uma resposta esperada e não significa "sessão caiu".
const AUTH_PROBES = ["/auth/me", "/auth/login", "/auth/register"];

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const binary = body instanceof ArrayBuffer || ArrayBuffer.isView(body);
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers:
      body === undefined ? undefined : { "Content-Type": binary ? "application/octet-stream" : "application/json" },
    body: body === undefined ? undefined : binary ? (body as BodyInit) : JSON.stringify(body),
  });
  if (res.status === 401 && !AUTH_PROBES.includes(path)) onSessionEnded?.();
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Erro inesperado");
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  /** Envia dados binários crus (ex.: trecho de áudio PCM). */
  postBinary: <T>(path: string, data: ArrayBufferView<ArrayBuffer>) => request<T>("POST", path, data),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
