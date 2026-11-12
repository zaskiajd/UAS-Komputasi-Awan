/* ==========================================================================
   core/api.js — Klien API CampusCare (base URL, token JWT, penanganan error)
   --------------------------------------------------------------------------
   Base URL bisa diganti tanpa mengubah kode:
     - di js/config.js
     - atau sebelum main.js dimuat: <script>window.CAMPUSCARE_API = "...";</script>
   ========================================================================== */

import { CONFIG } from "../config.js";

export const API_BASE = (
  window.CAMPUSCARE_API ||
  window.CC_API_URL ||
  CONFIG.API_URL ||
  "http://localhost:3000/api"
).replace(/\/+$/, "");

const TOKEN_KEY = "cc-token";
let memoryToken = null; // cadangan bila localStorage tidak tersedia (private mode)

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch (error) {
    return memoryToken;
  }
}

export function setToken(token) {
  memoryToken = token || null;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    /* localStorage diblokir — token hanya disimpan di memori */
  }
}

export const clearToken = () => setToken(null);

/** Error terstruktur dari API; `errors` berisi detail validasi per field bila ada. */
export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors || null;
  }
}

let unauthorizedHandler = null;

/** Dipanggil saat endpoint yang butuh login menjawab 401 (token habis/tidak valid). */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

/**
 * Helper request utama ke backend API.
 * Menambahkan Authorization Bearer jika auth=true & token ada.
 * Mem-parse format respons { success, data, message, errors }.
 * Melempar ApiError terstruktur bila status non-2xx atau success=false.
 *
 * @param {string} path contoh "/auth/login"
 * @param {{method?: string, body?: object, auth?: boolean}} [options]
 */
export async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new ApiError(0, "Tidak dapat terhubung ke server backend. Pastikan server aktif.");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    /* respons bukan JSON valid */
  }

  if (!response.ok || (payload && payload.success === false)) {
    // 401 pada endpoint terlindungi: bersihkan token dan delegasikan ke unauthorizedHandler
    if (response.status === 401 && auth) {
      clearToken();
      if (unauthorizedHandler) {
        unauthorizedHandler(payload && payload.message);
      }
    }
    throw new ApiError(
      response.status,
      (payload && payload.message) || `Permintaan gagal (${response.status}).`,
      payload && payload.errors
    );
  }

  return payload ? payload.data : null;
}

/** Alias untuk backward-compatibility */
export const apiRequest = request;

/* ---- Endpoint Autentikasi ------------------------------------------------ */

/**
 * Login akun lokal (email + sandi)
 */
export async function loginRequest({ email, password, role }) {
  const data = await request("/auth/login", {
    method: "POST",
    body: { email, password, ...(role ? { role } : {}) },
    auth: false,
  });
  setToken(data.token);
  return data.user;
}

/**
 * Registrasi akun mahasiswa baru
 */
export const registerRequest = (payload) =>
  request("/auth/register", { method: "POST", body: payload, auth: false });

/**
 * Autentikasi lewat ID token Google OAuth
 */
export async function googleAuthRequest(credential) {
  const data = await request("/auth/google", {
    method: "POST",
    body: { credential },
    auth: false,
  });
  setToken(data.token);
  return data.user;
}

/**
 * Ambil profil pengguna yang sedang login dari token JWT
 */
export const fetchMe = () => request("/auth/me");
