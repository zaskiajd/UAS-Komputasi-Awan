/* ==========================================================================
   views/auth.js — Tab login/registrasi, peran, sandi, Google OAuth & validasi form
   ========================================================================== */

import { $$, byId } from "../core/dom.js";
import { state } from "../core/state.js";
import { CONFIG } from "../config.js";
import { googleAuthRequest, ApiError } from "../core/api.js";
import { showToast } from "../ui/toast.js";
import { openModal } from "../ui/modal.js";

let onAuthSuccessCallback = null;

/** Mendaftarkan callback saat autentikasi (mis. Google OAuth) berhasil */
export function setOnAuthSuccess(callback) {
  onAuthSuccessCallback = callback;
}

export function setAuthTab(tab) {
  state.authTab = tab;

  const loginView = byId("view-login");
  const registerView = byId("view-register");
  const loginBtn = byId("tab-btn-login");
  const registerBtn = byId("tab-btn-register");

  if (!loginView || !registerView) return;

  loginView.classList.toggle("hidden", tab !== "login");
  registerView.classList.toggle("hidden", tab !== "register");

  loginBtn.classList.toggle("is-active", tab === "login");
  registerBtn.classList.toggle("is-active", tab === "register");
  loginBtn.setAttribute("aria-selected", String(tab === "login"));
  registerBtn.setAttribute("aria-selected", String(tab === "register"));

  const portalTitle = byId("portal-title");
  const portalSubtitle = byId("portal-subtitle");
  if (portalTitle) {
    portalTitle.textContent =
      tab === "login" ? "Masuk ke Akun Kampus" : "Registrasi Mahasiswa Baru";
  }
  if (portalSubtitle) {
    portalSubtitle.textContent =
      tab === "login"
        ? "Gunakan akun resmi Universitas Siliwangi untuk mengakses sistem preservasi dan pemantauan sarana kampus."
        : "Lengkapi data kemahasiswaan aktif Anda untuk mulai mengajukan & memantau laporan sarana kampus.";
  }
}

export function setAuthRole(role) {
  state.role = role;
  state.authRole = role;
  $$(".auth-role-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.role === role);
  });
}

export function togglePasswordVisibility(button) {
  const input = byId(button.dataset.target);
  if (!input) return;

  const icon = button.querySelector(".material-symbols-outlined");
  const willShow = input.type === "password";
  input.type = willShow ? "text" : "password";
  if (icon) icon.textContent = willShow ? "visibility_off" : "visibility";
  button.setAttribute("aria-label", willShow ? "Sembunyikan sandi" : "Tampilkan sandi");
}

export function evaluatePassword(value) {
  const meter = byId("pw-meter");
  const label = byId("strength-text");
  if (!meter || !label) return;

  let level = 0;
  let text = "Belum Diisi";
  let className = "text-gray-600";

  if (value.length > 0) {
    const hasLetter = /[a-zA-Z]/.test(value);
    const hasNumber = /\d/.test(value);

    if (value.length < 6) {
      level = 1;
      text = "Lemah";
      className = "text-red-500 font-bold";
    } else if (value.length < 9 || !hasLetter || !hasNumber) {
      level = 2;
      text = "Sedang";
      className = "text-primary-container font-bold";
    } else {
      level = 3;
      text = "Sangat Kuat";
      className = "text-emerald-600 font-bold";
    }
  }

  meter.dataset.level = String(level);
  label.textContent = text;
  label.className = className;
}

/* ---- Validasi & Notifikasi Form Error ---- */

export function showFieldError(input, message) {
  const error = byId("reg-error");
  const errorText = byId("reg-error-text");
  if (errorText) errorText.textContent = message;
  if (error) error.classList.add("is-visible");
  if (input) {
    input.classList.add("input-invalid");
    input.focus();
  }
}

export function clearFieldError() {
  const error = byId("reg-error");
  if (error) error.classList.remove("is-visible");
  ["reg-name", "reg-nim", "reg-fakultas", "reg-email", "reg-password", "reg-confirm"].forEach((id) => {
    const input = byId(id);
    if (input) input.classList.remove("input-invalid");
  });
}

export function showLoginError(message) {
  const error = byId("login-error");
  const errorText = byId("login-error-text");
  if (errorText) errorText.textContent = message;
  if (error) error.classList.add("is-visible");
}

export function clearLoginError() {
  const error = byId("login-error");
  if (error) error.classList.remove("is-visible");
  ["login-email", "login-password"].forEach((id) => {
    const input = byId(id);
    if (input) input.classList.remove("input-invalid");
  });
}

/** Mengatur state loading dan teks pada tombol */
export function setButtonLoading(button, isLoading, loadingText = "Memproses...", defaultText = "") {
  if (!button) return;
  button.disabled = isLoading;
  const label = button.querySelector("span:not(.material-symbols-outlined)");
  if (label) {
    if (isLoading) {
      if (!button.dataset.defaultText) button.dataset.defaultText = label.textContent;
      label.textContent = loadingText;
    } else {
      label.textContent = defaultText || button.dataset.defaultText || label.textContent;
    }
  }
}

/* ---- Google Identity Services (OAuth 2.0) ---- */

let gisInitialized = false;
let gisRetryCount = 0;

export function getGoogleClientId() {
  return (
    window.CAMPUSCARE_GOOGLE_CLIENT_ID ||
    window.GOOGLE_CLIENT_ID ||
    CONFIG.GOOGLE_CLIENT_ID ||
    ""
  ).trim();
}

/**
 * Tangani ID token credential dari Google Identity Services
 */
export async function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) {
    showToast("Google SSO", "Tidak menerima kredensial dari Google.", "error");
    return;
  }

  const loginSubmit = byId("login-submit-btn");
  setButtonLoading(loginSubmit, true, "Memverifikasi Google...");

  try {
    const user = await googleAuthRequest(response.credential);
    if (onAuthSuccessCallback) {
      await onAuthSuccessCallback(user);
    }
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Gagal masuk dengan Google.";
    showLoginError(message);
    showToast("Login Google Gagal", message, "error");
  } finally {
    setButtonLoading(loginSubmit, false, "Masuk ke Portal CampusCare");
  }
}

/**
 * Inisialisasi Google Identity Services button dan prompt
 */
export function initGoogleAuth() {
  const clientId = getGoogleClientId();
  const googleSection = byId("google-login-section");

  // Pastikan tombol Google tetap tampil di antarmuka
  if (googleSection) googleSection.classList.remove("hidden");

  if (!clientId) {
    // Belum diset: tombol tetap tampil dan akan mengarahkan ke bantuan SSO bila diklik
    return;
  }

  // Jika library Google Identity Services sudah termuat
  if (window.google?.accounts?.id && !gisInitialized) {
    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gisInitialized = true;
    } catch (err) {
      console.warn("[CampusCare] Gagal menginisialisasi GIS:", err);
    }
  } else if (!window.google?.accounts?.id && gisRetryCount < 5) {
    gisRetryCount += 1;
    window.setTimeout(initGoogleAuth, 1000);
  }
}

/**
 * Dipanggil saat tombol Google diklik manual
 */
export function triggerGoogleLogin() {
  const clientId = getGoogleClientId();
  if (!clientId) {
    // Bila belum diset, buka petunjuk di modal sso-help
    const ssoModal = byId("modal-sso-help");
    if (ssoModal) openModal(ssoModal);
    showToast(
      "Konfigurasi Google Belum Diset",
      "GOOGLE_CLIENT_ID belum diisi di js/config.js. Buka panduan bantuan untuk langkah pengisian.",
      "warning"
    );
    return;
  }

  if (window.google?.accounts?.id) {
    if (!gisInitialized) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      gisInitialized = true;
    }
    window.google.accounts.id.prompt();
  } else {
    showToast("Google SSO", "Memuat Google Identity Services, silakan coba sesaat lagi.", "info");
  }
}
