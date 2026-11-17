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

const COPY = {
  student: {
    badge: "Gerbang login mahasiswa",
    title: "Masuk sebagai Mahasiswa",
    subtitle:
      "Masuk dengan akun kampus untuk mengirim dan memantau pengaduan fasilitas Anda.",
    submit: "Masuk sebagai Mahasiswa",
    hint: "Format: NIM@student.unsil.ac.id",
    placeholder: "217006120@student.unsil.ac.id",
  },
  admin: {
    badge: "Gerbang login admin",
    title: "Masuk sebagai Admin Sarpras",
    subtitle:
      "Masuk sebagai pengelola Biro Sarana & Prasarana untuk memverifikasi dan mendisposisikan tiket.",
    submit: "Masuk sebagai Admin Sarpras",
    hint: "Format: nama@unsil.ac.id (bukan akun mahasiswa)",
    placeholder: "admin@sarpras.unsil.ac.id",
  },
};

const REGISTER_COPY = {
  badge: "Registrasi mahasiswa baru",
  title: "Daftar Akun Mahasiswa",
  subtitle:
    "Lengkapi data kemahasiswaan aktif Anda untuk mulai mengajukan laporan sarana kampus.",
};

function syncAuthCopy() {
  const role = state.authRole;
  const tab = state.authTab;
  const badge = byId("portal-badge");
  const title = byId("portal-title");
  const subtitle = byId("portal-subtitle");
  const submit = byId("login-submit-label");
  const hint = byId("login-email-hint");
  const email = byId("login-email");

  if (tab === "register" && role === "student") {
    if (badge) badge.textContent = REGISTER_COPY.badge;
    if (title) title.textContent = REGISTER_COPY.title;
    if (subtitle) subtitle.textContent = REGISTER_COPY.subtitle;
    return;
  }

  const copy = COPY[role] || COPY.student;
  if (badge) badge.textContent = copy.badge;
  if (title) title.textContent = copy.title;
  if (subtitle) subtitle.textContent = copy.subtitle;
  if (submit) submit.textContent = copy.submit;
  if (hint) hint.textContent = copy.hint;
  if (email) email.placeholder = copy.placeholder;
}

export function setAuthTab(tab) {
  state.authTab = tab;

  const loginView = byId("view-login");
  const registerView = byId("view-register");
  const loginBtn = byId("tab-btn-login");
  const registerBtn = byId("tab-btn-register");

  if (!loginView || !registerView) return;

  const isRegister = tab === "register" && state.authRole === "student";
  loginView.classList.toggle("hidden", isRegister);
  registerView.classList.toggle("hidden", !isRegister);

  loginBtn.classList.toggle("is-active", !isRegister);
  registerBtn.classList.toggle("is-active", isRegister);
  loginBtn.setAttribute("aria-selected", String(!isRegister));
  registerBtn.setAttribute("aria-selected", String(isRegister));

  clearLoginError();
  syncAuthCopy();
}

export function setAuthRole(role) {
  state.role = role;
  state.authRole = role;
  $$(".auth-role-chip").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.role === role);
  });

  const tabs = byId("auth-tabs");
  if (tabs) tabs.hidden = role === "admin";

  if (role === "admin" && state.authTab === "register") {
    state.authTab = "login";
  }

  setAuthTab(state.authTab);
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
  ["reg-name", "reg-nim", "reg-fakultas", "reg-email", "reg-password", "reg-confirm"].forEach(
    (id) => {
      const input = byId(id);
      if (input) input.classList.remove("input-invalid");
    }
  );
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
  if (window.google?.accounts?.id) {
    try {
      if (!gisInitialized) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        gisInitialized = true;
      }

      const container = byId("google-btn-container");
      if (container && !container.dataset.gisRendered) {
        const manualBtn = byId("google-login-btn");
        const containerWidth = Math.min(
          container.clientWidth || container.offsetWidth || 360,
          400
        );
        window.google.accounts.id.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: containerWidth,
        });
        container.dataset.gisRendered = "true";
        if (manualBtn) {
          manualBtn.classList.add("hidden");
          manualBtn.hidden = true;
          manualBtn.style.display = "none";
        }
      }
    } catch (err) {
      console.warn("[CampusCare] Gagal menginisialisasi GIS:", err);
    }
  } else if (gisRetryCount < 5) {
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
    initGoogleAuth();
    return;
  }

  const ssoModal = byId("modal-sso-help");
  if (ssoModal) openModal(ssoModal);
  showToast(
    "Google SSO",
    "Layanan Google Identity Services belum termuat. Silakan coba sesaat lagi atau cek panduan bantuan.",
    "info"
  );
}
