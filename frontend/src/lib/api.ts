// Where the Spring Boot API (validation and PDF exports) lives.
//   development: VITE_API_BASE_URL in frontend/.env.development (http://localhost:8080)
//   production:  set VITE_API_BASE_URL at build time, or leave it empty to call the same origin
//                (when a reverse proxy serves /api next to the site)

/** Removes trailing slashes so `base + '/api/...'` never doubles them. */
export function normalizeBase(value: string | undefined | null): string {
    return (value ?? '').trim().replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBase(import.meta.env.VITE_API_BASE_URL);

export function apiUrl(path: string, base: string = API_BASE_URL): string {
    return `${normalizeBase(base)}/${path.replace(/^\/+/, '')}`;
}
