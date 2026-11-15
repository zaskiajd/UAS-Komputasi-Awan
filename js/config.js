/* ==========================================================================
   config.js — Konfigurasi Frontend CampusCare
   ========================================================================== */

/**
 * Menentukan alamat API bawaan bila tidak di-override.
 *
 * - Production (Docker + Nginx): frontend dan API berada di domain yang sama,
 *   Nginx meneruskan /api ke backend. Cukup pakai "/api" (same-origin, tanpa CORS).
 * - Pengembangan lokal: frontend dibuka dari dev server (mis. `npm start` =
 *   python di port 8000, atau Live Server di 5500) sementara backend berjalan
 *   terpisah di port 3000 (`npm run dev` di backend/). Karena itu, bila halaman
 *   dibuka dari localhost/127.0.0.1 dengan port SELAIN 80/443/8080, API diarahkan
 *   ke http://localhost:3000/api seperti sebelumnya.
 *   Port 80/443/8080 dianggap sudah lewat Nginx (mis. menguji container Docker
 *   di laptop: http://localhost:8080), jadi tetap memakai "/api".
 */
function defaultApiUrl() {
  const { hostname, port } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  // port "" berarti port bawaan protokol (80 untuk http, 443 untuk https).
  const viaNginx = port === "" || port === "80" || port === "443" || port === "8080";
  return isLocalHost && !viaNginx ? "http://localhost:3000/api" : "/api";
}

export const CONFIG = {
  /**
   * Base URL API Express/PostgreSQL.
   * Bisa di-override tanpa mengubah kode, sebelum main.js dimuat:
   *   <script>window.CAMPUSCARE_API = "https://contoh.domain/api";</script>
   */
  API_URL:
    window.CAMPUSCARE_API ||
    window.CC_API_URL ||
    defaultApiUrl(),

  /**
   * Google OAuth 2.0 Client ID dari Google Cloud Console.
   * Dapat diisi langsung di sini atau melalui window.CAMPUSCARE_GOOGLE_CLIENT_ID
   */
  GOOGLE_CLIENT_ID:
    window.CAMPUSCARE_GOOGLE_CLIENT_ID ||
    window.GOOGLE_CLIENT_ID ||
    "115872308169-omq6c2lknlem7cp494tmc4afl1r96rf3.apps.googleusercontent.com",
};
