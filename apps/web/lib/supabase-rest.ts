const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || serviceRoleKey;

export const isSupabaseConfigured = () => Boolean(supabaseUrl && serviceRoleKey);

type SupabaseUserResponse = {
  id?: string;
  email?: string;
};

export async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) {
    return { data: null, error: "Supabase is not configured", status: 503 } as const;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : null;

  if (!response.ok) {
    return { data: null, error: data || text || response.statusText, status: response.status } as const;
  }

  return { data, error: null, status: response.status } as const;
}

async function getAuthenticatedUserId(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token || !supabaseUrl || !anonKey) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) return null;

  const user = (await response.json()) as SupabaseUserResponse;
  return user.id || null;
}

export async function getUserId(request: Request) {
  const authenticatedUserId = await getAuthenticatedUserId(request);
  if (authenticatedUserId) return authenticatedUserId;

  const fallbackUserId = request.headers.get("x-abogadord-user-id");
  return fallbackUserId && /^[0-9a-f-]{36}$/i.test(fallbackUserId) ? fallbackUserId : null;
}
