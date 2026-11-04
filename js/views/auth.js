/* ==========================================================================
   views/auth.js — Tab login/registrasi, peran, sandi, dan validasi form
   ========================================================================== */

import { $$, byId } from "../core/dom.js";
import { state } from "../core/state.js";

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

  byId("portal-title").textContent =
    tab === "login" ? "Masuk ke Akun Kampus" : "Registrasi Mahasiswa Baru";
  byId("portal-subtitle").textContent =
    tab === "login"
      ? "Gunakan akun resmi Universitas Siliwangi untuk mengakses sistem preservasi dan pemantauan sarana kampus."
      : "Lengkapi data kemahasiswaan aktif Anda untuk mulai mengajukan & memantau laporan sarana kampus.";
}

export function setAuthRole(role) {
  state.role = role;
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
  ["reg-password", "reg-confirm"].forEach((id) => {
    const input = byId(id);
    if (input) input.classList.remove("input-invalid");
  });
}
