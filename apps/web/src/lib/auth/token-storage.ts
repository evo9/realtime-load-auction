const COOKIE_NAME = 'auth.token';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function getStoredToken(): string | null {
  if (typeof document === 'undefined') return null;
  return readCookie(COOKIE_NAME);
}

export function setStoredToken(token: string): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearStoredToken(): void {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
