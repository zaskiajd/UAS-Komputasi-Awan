/* ==========================================================================
   core/debug.js — Mode debug & diagnosa mandiri CampusCare
   Aktif lewat ?debug=1, Ctrl+Shift+D, atau localStorage "cc-debug" = "1".
   Panel menampilkan log boot, error runtime, dan hasil cek kesehatan UI.
   ========================================================================== */

const MAX_ENTRIES = 400;
const entries = [];
let panel = null;
let logList = null;
let healthBox = null;
let fab = null;
let lastDiagnosis = null;
let enabled = readFlag();
let errorCount = 0;
let warning = null;

function readFlag() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "1" || params.get("debug") === "true") return true;
    if (window.location.hash.replace("#", "").split("?")[0] === "debug") return true;
    return window.localStorage.getItem("cc-debug") === "1";
  } catch (error) {
    return false;
  }
}

function rememberFlag(value) {
  try {
    if (value) window.localStorage.setItem("cc-debug", "1");
    else window.localStorage.removeItem("cc-debug");
  } catch (error) {
    /* localStorage bisa diblokir di mode privat — abaikan */
  }
}

const stamp = () => {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
};

/* --------------------------------------------------------------------------
   Log
   -------------------------------------------------------------------------- */

export function log(level, message, detail) {
  const entry = { level, message: String(message), detail: detail == null ? "" : detail, time: stamp() };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  if (level === "error") {
    errorCount += 1;
    console.error("[CampusCare]", message, detail || "");
  } else if (level === "warn") {
    console.warn("[CampusCare]", message, detail || "");
  } else if (enabled) {
    // Log informasi hanya dicetak saat mode debug aktif agar console tetap bersih.
    console.log("[CampusCare]", message, detail || "");
  }

  if (enabled) {
    ensurePanel();
    appendEntry(entry);
    refreshChips();
  }
}

export const info = (message, detail) => log("info", message, detail);
export const warn = (message, detail) => log("warn", message, detail);
export const error = (message, detail) => log("error", message, detail);

/* --------------------------------------------------------------------------
   Panel
   -------------------------------------------------------------------------- */

function ensurePanel() {
  if (panel || !document.body) return;

  panel = document.createElement("section");
  panel.id = "cc-debug";
  panel.className = "cc-debug";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Panel debug CampusCare");
  panel.hidden = true;

  panel.innerHTML = `
    <header class="cc-debug__bar">
      <span class="cc-debug__dot" aria-hidden="true"></span>
      <strong class="cc-debug__title">CampusCare Debug</strong>
      <span class="cc-debug__chip" data-debug-chip="view">auth</span>
      <span class="cc-debug__chip" data-debug-chip="count">0 log</span>
      <span class="cc-debug__spacer"></span>
      <button type="button" class="cc-debug__btn cc-debug__btn--accent" data-debug-action="diagnose">Diagnosa</button>
      <button type="button" class="cc-debug__btn" data-debug-action="copy">Salin</button>
      <button type="button" class="cc-debug__btn" data-debug-action="clear">Bersihkan</button>
      <button type="button" class="cc-debug__btn" data-debug-action="close" aria-label="Tutup panel debug">×</button>
    </header>
    <div class="cc-debug__body">
      <div class="cc-debug__health" data-debug-health hidden></div>
      <ol class="cc-debug__log" data-debug-log></ol>
    </div>
    <footer class="cc-debug__hint">
      ?debug=1 · Ctrl+Shift+D · <code>ccDiagnose()</code> di console
    </footer>`;

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-debug-action]");
    if (!button) return;
    const action = button.dataset.debugAction;
    if (action === "diagnose") diagnose();
    if (action === "copy") copyReport();
    if (action === "clear") clearEntries();
    if (action === "close") setEnabled(false);
  });

  logList = panel.querySelector("[data-debug-log]");
  healthBox = panel.querySelector("[data-debug-health]");
  document.body.appendChild(panel);

  ensureFab();
}

function ensureFab() {
  if (fab) return;
  fab = document.createElement("button");
  fab.type = "button";
  fab.id = "cc-debug-fab";
  fab.className = "cc-debug-fab";
  fab.title = "Buka mode debug (Ctrl+Shift+D)";
  fab.setAttribute("aria-label", "Buka panel debug");
  fab.textContent = "DEBUG";
  fab.addEventListener("click", () => openPanel());
  document.body.appendChild(fab);
  fab.hidden = !enabled;
}

function openPanel() {
  ensurePanel();
  renderEntries();
  panel.hidden = false;
  if (fab) fab.hidden = true;
  refreshChips();
}

function closePanel() {
  if (panel) panel.hidden = true;
  if (fab && enabled) fab.hidden = false;
}

export function setEnabled(value) {
  enabled = Boolean(value);
  rememberFlag(enabled);
  ensurePanel();

  if (enabled) {
    openPanel();
    info("Mode debug diaktifkan", "Tekan Ctrl+Shift+D untuk menutup panel.");
  } else {
    closePanel();
    if (fab) fab.hidden = true;
  }
}

export function toggle() {
  setEnabled(!enabled);
}

function refreshChips() {
  if (!panel) return;
  const view = document.body.dataset.view || "?";
  const viewChip = panel.querySelector('[data-debug-chip="view"]');
  const countChip = panel.querySelector('[data-debug-chip="count"]');
  if (viewChip) viewChip.textContent = view;
  if (countChip) {
    countChip.textContent = `${entries.length} log${errorCount ? ` · ${errorCount} error` : ""}`;
    countChip.classList.toggle("cc-debug__chip--error", errorCount > 0);
  }
}

function appendEntry(entry) {
  if (!logList) return;
  const item = document.createElement("li");
  item.className = `cc-debug__entry cc-debug__entry--${entry.level}`;

  const head = document.createElement("div");
  head.className = "cc-debug__entry-head";

  const time = document.createElement("span");
  time.className = "cc-debug__time";
  time.textContent = entry.time;

  const level = document.createElement("span");
  level.className = "cc-debug__level";
  level.textContent = entry.level.toUpperCase();

  const message = document.createElement("span");
  message.className = "cc-debug__message";
  message.textContent = entry.message;

  head.append(time, level, message);
  item.appendChild(head);

  if (entry.detail) {
    const detail = document.createElement("pre");
    detail.className = "cc-debug__detail";
    detail.textContent = String(entry.detail);
    item.appendChild(detail);
  }

  logList.appendChild(item);
  logList.scrollTop = logList.scrollHeight;
}

function renderEntries() {
  if (!logList) return;
  logList.textContent = "";
  entries.forEach(appendEntry);
}

function clearEntries() {
  entries.length = 0;
  errorCount = 0;
  renderEntries();
  refreshChips();
}

/* --------------------------------------------------------------------------
   Diagnosa
   -------------------------------------------------------------------------- */

const EXPECTED = {
  "view-auth": 1,
  "view-student": 3,
  "view-admin": 6,
};

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function panelCount(view) {
  return qsa(`#view-${view} .cc-panel`).length;
}

function tailwindProbe() {
  const probe = document.createElement("div");
  probe.className = "bg-brand-orange px-3 hidden";
  document.body.appendChild(probe);
  const style = window.getComputedStyle(probe);
  const result = { background: style.backgroundColor, padding: style.paddingLeft };
  probe.remove();
  return result;
}

function duplicateIds() {
  const seen = new Set();
  const duplicates = new Set();
  qsa("[id]").forEach((element) => {
    if (seen.has(element.id)) duplicates.add(element.id);
    else seen.add(element.id);
  });
  return Array.from(duplicates);
}

function brokenImages() {
  return qsa("img")
    .filter((img) => img.complete && img.naturalWidth === 0)
    .map((img) => img.getAttribute("src") || "(tanpa src)");
}

function simulateTabs(view, checks) {
  const config =
    view === "student"
      ? { tabs: ["summary", "complaints", "help"], selector: "[data-student-tab]", key: "studentTab" }
      : { tabs: ["dashboard", "dispatches", "techs", "inventory", "sla", "damage"], selector: "#sidebar-drawer [data-admin-tab]", key: "adminTab" };

  const buttons = qsa(config.selector);
  const currentPanel = document.querySelector(`#view-${view} .cc-panel.is-active`);
  const original = currentPanel ? currentPanel.id.split("-").pop() : config.tabs[0];

  try {
    config.tabs.forEach((tab) => {
      const button = buttons.find((item) => item.dataset[config.key] === tab && !item.dataset.studentFilter && !item.dataset.adminFilter);
      const panelEl = document.getElementById(`panel-${view}-${tab}`);
      if (!button) {
        checks.push({ name: `Tab ${view}: ${tab}`, ok: false, detail: "Tombol navigasi tidak ditemukan" });
        return;
      }
      button.click();
      const box = panelEl ? panelEl.getBoundingClientRect() : null;
      const visible = Boolean(panelEl && panelEl.classList.contains("is-active") && box && box.height > 20);
      checks.push({
        name: `Tab ${view}: ${tab}`,
        ok: visible,
        detail: visible ? `panel ${Math.round(box.height)}px` : "Panel tidak aktif/kosong setelah diklik",
      });
    });
  } finally {
    const restore = buttons.find((item) => item.dataset[config.key] === original && !item.dataset.studentFilter && !item.dataset.adminFilter);
    if (restore) restore.click();
  }
}

export function diagnose(options = {}) {
  const simulate = options.simulate !== false;
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: String(detail) });

  const protocol = window.location.protocol;
  add("Protokol halaman", protocol === "http:" || protocol === "https:", protocol);

  const remaining = qsa("[data-include]").length;
  add("Semua partial termuat", remaining === 0, remaining ? `${remaining} placeholder tersisa` : "0 placeholder");

  const styles = qsa('link[rel="stylesheet"]').map((link) => link.getAttribute("href") || "");
  ["css/tokens.css", "css/base.css", "css/components.css", "css/student.css", "css/admin.css", "css/tailwind.css", "css/debug.css"].forEach((file) => {
    add(`Stylesheet ${file}`, styles.some((href) => href.includes(file)), styles.find((href) => href.includes(file)) || "tidak tertaut");
  });

  const probe = tailwindProbe();
  add("Utilitas Tailwind aktif", probe.background === "rgb(255, 102, 31)" && probe.padding === "12px", `bg=${probe.background}, padding=${probe.padding}`);

  const token = window.getComputedStyle(document.documentElement).getPropertyValue("--cc-orange").trim();
  add("Design token terbaca", token.toLowerCase() === "#ff661f", token || "kosong");

  const loadedFaces = Array.from(document.fonts || []).filter((face) => face.status === "loaded");
  const hasFace = (family) => loadedFaces.some((face) => face.family.replace(/["']/g, "").toLowerCase() === family.toLowerCase());
  add("Font Space Grotesk", hasFace("Space Grotesk"), hasFace("Space Grotesk") ? "termuat" : "belum termuat / diblokir");
  add("Font Plus Jakarta Sans", hasFace("Plus Jakarta Sans"), hasFace("Plus Jakarta Sans") ? "termuat" : "belum termuat / diblokir");
  add("Font Material Symbols", hasFace("Material Symbols Outlined"), hasFace("Material Symbols Outlined") ? "termuat" : "ikon bisa tampil sebagai teks");

  const view = document.body.dataset.view || "";
  add("Body memiliki data-view", Boolean(view), view || "kosong");

  Object.entries(EXPECTED).forEach(([id, expectedPanels]) => {
    const section = document.getElementById(id);
    add(`View #${id}`, Boolean(section), section ? "ada" : "tidak ditemukan");
    if (!section) return;
    if (expectedPanels > 1) {
      const count = panelCount(id.replace("view-", ""));
      add(`Panel #${id}`, count === expectedPanels, `${count}/${expectedPanels} panel`);
    }
  });

  ["modal-complaint", "modal-dispatch", "modal-sso-help", "modal-ticket-detail", "modal-technician", "modal-asset-detail", "modal-asset-form", "modal-asset-confirm"].forEach((id) => {
    add(`Modal #${id}`, Boolean(document.getElementById(id)), document.getElementById(id) ? "ada" : "tidak ditemukan");
  });

  const duplicates = duplicateIds();
  add("ID unik", duplicates.length === 0, duplicates.length ? `duplikat: ${duplicates.join(", ")}` : "semua unik");

  ["student", "admin"].forEach((name) => {
    const list = document.getElementById(`${name}-report-list`) || document.getElementById(`${name}-ticket-list`);
    const cards = list ? qsa(".ticket-card", list).length : 0;
    add(`Daftar tiket ${name}`, cards > 0, `${cards} kartu`);
  });

  const broken = brokenImages();
  add("Gambar termuat", broken.length === 0, broken.length ? `${broken.length} gagal: ${broken.slice(0, 2).join(", ")}` : "semua termuat");

  const activePanel = document.querySelector(".app-view.is-active .cc-panel.is-active");
  if (view !== "auth") {
    const box = activePanel ? activePanel.getBoundingClientRect() : null;
    add("Panel aktif terlihat", Boolean(box && box.height > 20), box ? `${Math.round(box.height)}px` : "tidak ada panel aktif");
  }

  if (simulate && (view === "student" || view === "admin")) simulateTabs(view, checks);

  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.length - passed;
  lastDiagnosis = { time: new Date().toISOString(), view, checks, passed, failed };

  ensurePanel();
  renderHealth(lastDiagnosis);
  openPanel();

  log(failed ? "warn" : "info", `Diagnosa selesai: ${passed}/${checks.length} lolos`, failed ? `${failed} masalah ditemukan` : "tidak ada masalah terdeteksi");
  return lastDiagnosis;
}

function renderHealth(result) {
  if (!healthBox) return;
  healthBox.hidden = false;
  healthBox.textContent = "";

  const summary = document.createElement("p");
  summary.className = "cc-debug__health-summary";
  summary.textContent = `Diagnosa ${result.view || "-"} · ${result.passed}/${result.checks.length} lolos`;
  healthBox.appendChild(summary);

  result.checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = `cc-debug__check ${check.ok ? "is-ok" : "is-fail"}`;

    const mark = document.createElement("span");
    mark.className = "cc-debug__check-mark";
    mark.textContent = check.ok ? "✓" : "✕";

    const name = document.createElement("span");
    name.className = "cc-debug__check-name";
    name.textContent = check.name;

    const detail = document.createElement("span");
    detail.className = "cc-debug__check-detail";
    detail.textContent = check.detail;

    row.append(mark, name, detail);
    healthBox.appendChild(row);
  });
}

/* --------------------------------------------------------------------------
   Peringatan tampilan kosong
   -------------------------------------------------------------------------- */

function removeWarning() {
  if (warning && warning.parentNode) warning.remove();
  warning = null;
}

function showWarning(view, detail) {
  if (warning) {
    const detailNode = warning.querySelector("[data-debug-warning-detail]");
    if (detailNode) detailNode.textContent = detail;
    return;
  }

  warning = document.createElement("div");
  warning.id = "cc-view-warning";
  warning.className = "cc-view-warning";
  warning.setAttribute("role", "alert");
  warning.innerHTML = `
    <span class="cc-view-warning__icon" aria-hidden="true">!</span>
    <div class="cc-view-warning__text">
      <strong>Tampilan ${view} terlihat kosong.</strong>
      <span data-debug-warning-detail></span>
    </div>
    <button type="button" class="cc-view-warning__btn" data-debug-warning-action="diagnose">Diagnosa</button>
    <button type="button" class="cc-view-warning__btn cc-view-warning__btn--ghost" data-debug-warning-action="close" aria-label="Tutup peringatan">×</button>`;

  warning.querySelector("[data-debug-warning-detail]").textContent = detail;
  warning.addEventListener("click", (event) => {
    const button = event.target.closest("[data-debug-warning-action]");
    if (!button) return;
    if (button.dataset.debugWarningAction === "diagnose") diagnose();
    if (button.dataset.debugWarningAction === "close") removeWarning();
  });

  document.body.appendChild(warning);
}

export function auditView(view = document.body.dataset.view) {
  if (view === "auth") {
    removeWarning();
    return true;
  }

  // Abaikan audit untuk view yang sudah tidak aktif (mis. pengguna berpindah cepat).
  if (document.body.dataset.view && document.body.dataset.view !== view) return true;

  const section = document.getElementById(`view-${view}`);
  if (!section) {
    log("error", `View #view-${view} tidak ditemukan.`, "Periksa partial views/ dan proses boot.");
    showWarning(view, "Elemen view tidak ditemukan di halaman.");
    return false;
  }

  const panels = section.querySelectorAll(".cc-panel");
  const activePanel = section.querySelector(".cc-panel.is-active");
  const sectionBox = section.getBoundingClientRect();
  const panelBox = activePanel ? activePanel.getBoundingClientRect() : null;

  const sectionTooSmall = sectionBox.height < 40;
  const noPanel = panels.length === 0;
  const noActivePanel = !noPanel && !activePanel;
  const panelHidden = Boolean(activePanel && (!panelBox || panelBox.height < 20));

  if (sectionTooSmall || noPanel || noActivePanel || panelHidden) {
    log("error", `Tampilan ${view} aktif tetapi kontennya tidak terlihat.`, {
      sectionHeight: Math.round(sectionBox.height),
      panels: panels.length,
      panel: activePanel ? activePanel.id : null,
      panelHeight: panelBox ? Math.round(panelBox.height) : 0,
    });

    let detail = "Panel konten tidak terlihat — kemungkinan CSS gagal dimuat.";
    if (noPanel) detail = "Panel konten tidak ditemukan — kemungkinan partial gagal dimuat.";
    else if (noActivePanel) detail = "Tidak ada panel aktif — navigasi panel belum dijalankan.";
    else if (sectionTooSmall) detail = "Area view tidak punya tinggi — periksa CSS layout.";

    showWarning(view, detail);
    return false;
  }

  removeWarning();
  return true;
}

/* --------------------------------------------------------------------------
   Salin laporan
   -------------------------------------------------------------------------- */

function buildReport() {
  const lines = [
    "CampusCare — laporan debug",
    `Waktu    : ${new Date().toLocaleString("id-ID")}`,
    `URL      : ${window.location.href}`,
    `Protokol : ${window.location.protocol}`,
    `Viewport : ${window.innerWidth}x${window.innerHeight}`,
    `Peramban : ${navigator.userAgent}`,
    ""
  ];

  if (lastDiagnosis) {
    lines.push(`Diagnosa: ${lastDiagnosis.passed}/${lastDiagnosis.checks.length} lolos`);
    lastDiagnosis.checks.forEach((check) => {
      lines.push(`${check.ok ? "OK  " : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
    });
    lines.push("");
  }

  lines.push("Log:");
  entries.forEach((entry) => {
    lines.push(`[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`);
    if (entry.detail) lines.push(`    ${String(entry.detail).replace(/\n/g, "\n    ")}`);
  });

  return lines.join("\n");
}

async function copyReport() {
  const text = buildReport();
  try {
    await navigator.clipboard.writeText(text);
    info("Laporan debug disalin ke clipboard.");
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "cc-debug__clipboard";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand && document.execCommand("copy");
    area.remove();
    if (ok) info("Laporan debug disalin ke clipboard.");
    else warn("Gagal menyalin otomatis. Buka console lalu jalankan ccDebug.report().");
  }
}

/* --------------------------------------------------------------------------
   Inisialisasi
   -------------------------------------------------------------------------- */

function installGlobalHandlers() {
  window.addEventListener(
    "error",
    (event) => {
      if (event.target && event.target !== window && event.target.tagName) {
        const tag = event.target.tagName.toLowerCase();
        if (tag === "img" || tag === "link" || tag === "script") {
          log("warn", `Gagal memuat ${tag}`, event.target.src || event.target.href || "");
        }
        return;
      }
      log("error", event.message || "Kesalahan JavaScript", `${event.filename || "?"}:${event.lineno || 0}:${event.colno || 0}`);
    },
    true
  );

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    log("error", "Promise ditolak tanpa penanganan", reason && reason.stack ? reason.stack : String(reason));
  });

  document.addEventListener("keydown", (event) => {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d";
    if (!isShortcut) return;
    event.preventDefault();
    toggle();
  });
}

function installBootErrorActions() {
  const actions = document.getElementById("boot-error-actions");
  /* Bila handler inline di index.html sudah aktif, jangan pasang handler ganda. */
  if (!actions || actions.dataset.bound) return;
  actions.dataset.bound = "debug";

  actions.querySelector('[data-boot-action="debug"]')?.addEventListener("click", () => {
    setEnabled(true);
    diagnose();
  });
  actions.querySelector('[data-boot-action="reload"]')?.addEventListener("click", () => window.location.reload());
}

function init() {
  installGlobalHandlers();
  installBootErrorActions();
  ensurePanel();
  renderEntries();
  refreshChips();

  if (enabled) {
    openPanel();
    info("Mode debug aktif", "Panel ini mencatat boot, error, dan hasil diagnosa.");
  }

  window.ccDebug = {
    log,
    diagnose,
    audit: auditView,
    open: () => setEnabled(true),
    close: () => setEnabled(false),
    toggle,
    report: buildReport,
  };
  window.ccDiagnose = diagnose;

  info("Modul debug siap", "Tekan Ctrl+Shift+D untuk membuka panel.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
