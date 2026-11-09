/* ==========================================================================
   views/auth.js — Gerbang login, tab login/registrasi, dan validasi form
   ========================================================================== */

import { $$, byId } from "../core/dom.js";
import { state } from "../core/state.js";

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

/** Membuka gerbang login untuk peran tertentu. */
export function openAuth(role = "student", tab = "login") {
  setAuthRole(role);
  setAuthTab(tab);
}

export function showLoginError(message, input) {
  const error = byId("login-error");
  const errorText = byId("login-error-text");
  if (errorText) errorText.textContent = message;
  if (error) error.classList.add("is-visible");
  if (input) {
    input.classList.add("input-invalid");
    input.focus();
  }
}

export function clearLoginError() {
  const error = byId("login-error");
  if (error) error.classList.remove("is-visible");
  const email = byId("login-email");
  const password = byId("login-password");
  if (email) email.classList.remove("input-invalid");
  if (password) password.classList.remove("input-invalid");
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
