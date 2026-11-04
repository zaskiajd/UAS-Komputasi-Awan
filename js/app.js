/* ==========================================================================
   CampusCare UNSIL — Application Controller
   Satu file JavaScript untuk seluruh alur:
   - Autentikasi & registrasi (demo)
   - Router tampilan (auth / mahasiswa / admin)
   - Navigasi panel tiap dashboard
   - Data pengaduan, filter, pencarian, disposisi
   - Modal, toast, menu akun
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     1. Util
     ------------------------------------------------------------------------ */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const byId = (id) => document.getElementById(id);

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const nowLabel = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `Hari ini, ${hh}:${mm} WIB`;
  };

  /* ------------------------------------------------------------------------
     2. State & Data
     ------------------------------------------------------------------------ */
  const state = {
    view: "auth",
    role: "student",
    authTab: "login",
    studentTab: "dashboard",
    adminTab: "dashboard",
    studentFilter: "all",
    adminFilter: "all",
    studentQuery: "",
    adminQuery: "",
    reports: [],
  };

  let reportSequence = 916;

  const CATEGORY_META = {
    ac: { icon: "mode_fan", badge: "bg-tertiary-fixed text-tertiary", label: "Kelistrikan & AC" },
    projector: { icon: "videocam_off", badge: "bg-primary-fixed text-primary", label: "Proyektor & Audio" },
    network: { icon: "wifi_off", badge: "bg-sky-100 text-sky-700", label: "Jaringan Wi-Fi" },
    sanitation: { icon: "plumbing", badge: "bg-amber-100 text-amber-900", label: "Sanitasi & Sipil" },
    furniture: { icon: "chair", badge: "bg-indigo-100 text-indigo-700", label: "Meubel & Ruang Kuliah" },
    lift: { icon: "elevator", badge: "bg-purple-100 text-purple-700", label: "Lift & Akses Gedung" },
    electrical: { icon: "lightbulb", badge: "bg-amber-100 text-amber-900", label: "Kelistrikan" },
  };

  const STATUS_META = {
    review: {
      label: "Butuh Verifikasi & Disposisi",
      chip: "bg-primary-fixed text-on-primary-fixed",
      dot: "bg-primary",
      pulse: true,
    },
    progress: {
      label: "Sedang Dikerjakan",
      chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
      dot: "bg-tertiary",
      pulse: false,
    },
    waiting: {
      label: "Menunggu Suku Cadang",
      chip: "bg-amber-100 text-amber-900",
      dot: "bg-amber-500",
      pulse: false,
    },
    done: {
      label: "Selesai & Valid",
      chip: "bg-emerald-100 text-emerald-800",
      dot: "bg-emerald-500",
      pulse: false,
    },
  };

  const seedReports = () => [
    {
      id: "#CC-2024-0915",
      title: "Lift Rektorat Macet dengan Penumpang di Lt. 2",
      reporter: "Rina Kartika (Tendik BAKPK)",
      location: "Gedung Rektorat • Lift Utama",
      cat: "lift",
      status: "review",
      urgent: true,
      date: "Hari ini, 09:05 WIB",
      team: null,
      progress: 0,
    },
    {
      id: "#CC-2024-0912",
      title: "AC Bocor & Air Menetes di Lab Komputer 3 Gedung F",
      reporter: "Ahmad Fauzi (Mhs • 217006045)",
      location: "Dekanat FT Lt. 2 (Lab Komp 3)",
      cat: "ac",
      status: "review",
      urgent: true,
      date: "Hari ini, 08:42 WIB",
      team: null,
      progress: 0,
    },
    {
      id: "#CC-2024-0908",
      title: "Proyektor Mati Total Ruang Kuliah R.204 GKB",
      reporter: "Dr. Budiarto (Dosen Faperta)",
      location: "GKB R.204 Lt. 2",
      cat: "projector",
      status: "progress",
      urgent: false,
      date: "Hari ini, 07:15 WIB",
      team: "Pak Hendra & Tim AV",
      progress: 65,
    },
    {
      id: "#CC-2024-0899",
      title: "Kerusakan Pintu Geser & Saklar Toilet Pria Lt.1 Rektorat",
      reporter: "Siti Rahma (Tendik BAKPK)",
      location: "Gedung Rektorat Lt. 1",
      cat: "sanitation",
      status: "waiting",
      urgent: false,
      date: "Kemarin, 14:10 WIB",
      team: "Pak Dadi (Sipil)",
      progress: 45,
    },
    {
      id: "#CC-2024-0885",
      title: "Lampu Sorot Lapangan Basket Sarpras Olahraga Putus",
      reporter: "BEM Mahasiswa (Ormawa)",
      location: "Sarana Gelanggang Olahraga",
      cat: "electrical",
      status: "done",
      urgent: false,
      date: "24 Apr 2026 • 11:20 WIB",
      team: "Pak Nanang (1.2 Jam)",
      progress: 100,
    },
    {
      id: "#CC-2024-0871",
      title: "Wi-Fi Perpustakaan Lt. 2 Sering Terputus",
      reporter: "Nabila Putri (Mhs • 217008812)",
      location: "Perpustakaan Pusat Lt. 2",
      cat: "network",
      status: "review",
      urgent: false,
      date: "Kemarin, 16:05 WIB",
      team: null,
      progress: 0,
    },
    {
      id: "#CC-2024-0864",
      title: "Kursi Kuliah R.301 Banyak yang Patah",
      reporter: "Dimas Prakoso (Mhs • 217007744)",
      location: "Fakultas Teknik R.301",
      cat: "furniture",
      status: "done",
      urgent: false,
      date: "22 Apr 2026 • 09:10 WIB",
      team: "Pak Iwan (Sipil)",
      progress: 100,
    },
  ];

  /* ------------------------------------------------------------------------
     3. Toast
     ------------------------------------------------------------------------ */
  let toastTimer = null;

  function showToast(title, message, variant = "success") {
    const toast = byId("toast");
    if (!toast) return;

    clearTimeout(toastTimer);

    toast.dataset.variant = variant;
    byId("toast-title").textContent = title || "";
    byId("toast-message").textContent = message || "";

    const icon = byId("toast-icon");
    icon.textContent = variant === "error" ? "error" : variant === "info" ? "info" : "check";

    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  /* ------------------------------------------------------------------------
     4. Modal & Menu
     ------------------------------------------------------------------------ */
  function openModal(modal) {
    if (!modal) return;

    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    document.body.classList.add("cc-modal-open");

    const focusTarget = modal.querySelector("input:not([type='hidden']):not([readonly]), select, textarea");
    if (focusTarget) {
      setTimeout(() => focusTarget.focus({ preventScroll: true }), 120);
    }
  }

  function closeModal(modal) {
    if (!modal) return;

    modal.classList.remove("is-open");
    setTimeout(() => {
      modal.hidden = true;
      if (!document.querySelector(".cc-modal.is-open")) {
        document.body.classList.remove("cc-modal-open");
      }
    }, 220);
  }

  function closeAllModals() {
    $$(".cc-modal").forEach((modal) => closeModal(modal));
    document.body.classList.remove("cc-modal-open");
  }

  function closeMenus(exceptMenu) {
    $$(".cc-menu").forEach((menu) => {
      if (menu !== exceptMenu) menu.hidden = true;
    });
    $$("[data-action='toggle-menu']").forEach((button) => {
      const target = byId(button.dataset.menu);
      button.setAttribute("aria-expanded", target && !target.hidden ? "true" : "false");
    });
  }

  /* ------------------------------------------------------------------------
     5. Router Tampilan
     ------------------------------------------------------------------------ */
  function setView(view) {
    state.view = view;
    document.body.dataset.view = view;

    ["auth", "student", "admin"].forEach((name) => {
      const section = byId(`view-${name}`);
      if (!section) return;
      section.classList.toggle("is-active", name === view);
    });

    syncHash(view);
    closeMenus();
    closeAllModals();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function syncHash(view) {
    try {
      const base = window.location.pathname + window.location.search;
      const next = view === "auth" ? base : `${base}#${view}`;
      window.history.replaceState(null, "", next);
    } catch (error) {
      /* file:// atau lingkungan tanpa History API — abaikan */
    }
  }

  function loginAs(role, options = {}) {
    state.role = role;

    if (role === "admin") {
      setAdminTab("dashboard");
      setView("admin");
      showToast(
        "Portal Admin Sarpras Aktif",
        "Selamat bertugas, Ir. Hendrawan. 9 tiket menunggu verifikasi.",
        "success"
      );
    } else {
      setStudentTab("dashboard");
      setView("student");
      showToast(
        "Portal Mahasiswa Aktif",
        options.name
          ? `Selamat datang, ${options.name}. Pantau laporan fasilitas Anda di sini.`
          : "Selamat datang kembali. Pantau laporan fasilitas Anda di sini.",
        "success"
      );
    }
  }

  function logout() {
    setView("auth");
    setAuthTab("login");
    state.studentFilter = "all";
    state.adminFilter = "all";
    state.studentQuery = "";
    state.adminQuery = "";
    const studentSearch = byId("student-search");
    const adminSearch = byId("admin-search");
    if (studentSearch) studentSearch.value = "";
    if (adminSearch) adminSearch.value = "";
    renderReports();

    const loginEmail = byId("login-email");
    if (loginEmail) loginEmail.value = "";
    const loginPassword = byId("login-password");
    if (loginPassword) loginPassword.value = "";

    showToast("Sesi Diakhiri", "Anda telah keluar dari portal CampusCare secara aman.", "info");
  }

  /* ------------------------------------------------------------------------
     6. Autentikasi
     ------------------------------------------------------------------------ */
  function setAuthTab(tab) {
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

  function setAuthRole(role) {
    state.role = role;
    $$(".auth-role-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.role === role);
    });
  }

  function togglePasswordVisibility(button) {
    const input = byId(button.dataset.target);
    if (!input) return;

    const icon = button.querySelector(".material-symbols-outlined");
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    if (icon) icon.textContent = willShow ? "visibility_off" : "visibility";
    button.setAttribute("aria-label", willShow ? "Sembunyikan sandi" : "Tampilkan sandi");
  }

  function evaluatePassword(value) {
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

  function showFieldError(input, message) {
    const error = byId("reg-error");
    const errorText = byId("reg-error-text");
    if (errorText) errorText.textContent = message;
    if (error) error.classList.add("is-visible");
    if (input) {
      input.classList.add("input-invalid");
      input.focus();
    }
  }

  function clearFieldError() {
    const error = byId("reg-error");
    if (error) error.classList.remove("is-visible");
    ["reg-password", "reg-confirm"].forEach((id) => {
      const input = byId(id);
      if (input) input.classList.remove("input-invalid");
    });
  }

  /* ------------------------------------------------------------------------
     7. Tab Dashboard
     ------------------------------------------------------------------------ */
  function setStudentTab(tab) {
    state.studentTab = tab;

    $$(".cc-panel[id^='panel-student-']").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `panel-student-${tab}`);
    });

    $$("[data-student-tab]").forEach((button) => {
      const isActive = button.dataset.studentTab === tab;
      button.classList.toggle("is-active", isActive);
      if (button.classList.contains("seg-tab")) {
        button.setAttribute("aria-current", isActive ? "page" : "false");
      }
    });

    if (tab === "complaints") renderStudentReports();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function setAdminTab(tab) {
    state.adminTab = tab;

    $$(".cc-panel[id^='panel-admin-']").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `panel-admin-${tab}`);
    });

    $$("[data-admin-tab]").forEach((button) => {
      const isActive = button.dataset.adminTab === tab;
      button.classList.toggle("is-active", isActive);
      if (button.classList.contains("seg-tab")) {
        button.setAttribute("aria-current", isActive ? "page" : "false");
      }
    });

    if (tab === "dashboard") renderAdminTickets();
    if (tab === "dispatches") renderDispatchList();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ------------------------------------------------------------------------
     8. Render Data Pengaduan
     ------------------------------------------------------------------------ */
  function statusCounts() {
    const reports = state.reports;
    return {
      all: reports.length,
      urgent: reports.filter((report) => report.urgent).length,
      review: reports.filter((report) => report.status === "review").length,
      progress: reports.filter(
        (report) => report.status === "progress" || report.status === "waiting"
      ).length,
      done: reports.filter((report) => report.status === "done").length,
    };
  }

  function updateCounters() {
    const counts = statusCounts();

    $$("[data-admin-count]").forEach((element) => {
      const key = element.dataset.adminCount;
      if (key in counts) element.textContent = String(counts[key]);
    });
    $$("[data-student-count]").forEach((element) => {
      const key = element.dataset.studentCount;
      if (key in counts) element.textContent = String(counts[key]);
    });
  }

  function matchesFilter(report, filter) {
    if (filter === "all") return true;
    if (filter === "urgent") return Boolean(report.urgent);
    if (filter === "review") return report.status === "review";
    if (filter === "progress") {
      return report.status === "progress" || report.status === "waiting";
    }
    if (filter === "done") return report.status === "done";
    return true;
  }

  function matchesQuery(report, query) {
    if (!query) return true;
    const haystack = [
      report.id,
      report.title,
      report.location,
      report.reporter,
      report.team || "",
      CATEGORY_META[report.cat]?.label || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  }

  function emptyState(title) {
    return `
      <div class="cc-empty">
        <span class="material-symbols-outlined text-3xl text-gray-300">search_off</span>
        <p class="font-display text-sm font-bold text-gray-700">${escapeHtml(title)}</p>
        <p class="text-xs text-gray-500">Coba ubah kata kunci atau filter status pengaduan.</p>
      </div>`;
  }

  function reportActions(report, mode) {
    if (mode === "student") {
      return `
        <button type="button" class="h-11 px-5 rounded-full bg-inverse-surface text-white text-xs font-bold hover:bg-black transition-all flex items-center gap-1.5 shadow-sm" data-action="track-report" data-ticket="${escapeHtml(report.id)}">
          <span>Lacak Tiket</span>
          <span class="material-symbols-outlined text-base">arrow_forward</span>
        </button>
        <button type="button" class="h-11 px-4 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-bold transition-all" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
          Detail
        </button>`;
    }

    if (report.status === "review") {
      return `
        <button type="button" class="h-11 px-5 rounded-full bg-primary-container text-white text-xs font-bold hover:brightness-110 shadow-sm transition-all flex items-center gap-1.5" data-action="quick-assign" data-ticket="${escapeHtml(report.id)}">
          <span>Disposisi Sekarang</span>
          <span class="material-symbols-outlined text-base font-bold">arrow_forward</span>
        </button>`;
    }

    if (report.status === "done") {
      return `
        <button type="button" class="h-11 px-5 rounded-full bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-bold transition-all flex items-center gap-1" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
          <span>Review Hasil</span>
          <span class="material-symbols-outlined text-base">verified</span>
        </button>`;
    }

    return `
      <button type="button" class="h-11 px-5 rounded-full bg-inverse-surface text-white text-xs font-bold hover:bg-black transition-all flex items-center gap-1.5 shadow-sm" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
        <span>${report.status === "waiting" ? "Detail Tiket" : "Lihat Progres"}</span>
        <span class="material-symbols-outlined text-base font-bold">arrow_forward</span>
      </button>`;
  }

  function reportCard(report, mode) {
    const category = CATEGORY_META[report.cat] || CATEGORY_META.ac;
    const status = STATUS_META[report.status] || STATUS_META.review;

    const progressLabel =
      report.status === "progress" && report.progress ? ` (${report.progress}%)` : "";

    const teamLine = report.team
      ? `<span class="inline-flex items-center gap-1 font-semibold ${
          report.status === "done" ? "text-emerald-700" : "text-tertiary"
        }">
           <span class="material-symbols-outlined text-base">engineering</span>
           Teknisi: ${escapeHtml(report.team)}
         </span>`
      : `<span class="inline-flex items-center gap-1 font-semibold ${
          report.urgent ? "text-primary" : "text-secondary"
        }">
           <span class="material-symbols-outlined text-base">engineering</span>
           Status: Belum ada teknisi
         </span>`;

    return `
      <article class="ticket-card bg-surface-container-lowest rounded-2xl p-5 sm:p-6 shadow-[0_12px_32px_-4px_rgba(20,23,26,0.05),0_4px_12px_rgba(166,175,189,0.12)] hover:shadow-[0_16px_40px_-4px_rgba(20,23,26,0.08)] border border-[#e2e8f0] transition-all flex flex-col md:flex-row gap-5 justify-between items-start md:items-center" data-id="${escapeHtml(report.id)}" data-status="${escapeHtml(report.status)}">
        <div class="flex items-start gap-4 flex-1 min-w-0">
          <div class="w-12 h-12 rounded-full ${category.badge} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-2xl">${category.icon}</span>
          </div>
          <div class="flex flex-col gap-1.5 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-surface-container text-secondary font-semibold">${escapeHtml(report.id)}</span>
              <span class="inline-flex items-center gap-1 px-3 py-0.5 rounded-full ${status.chip} text-xs font-bold">
                <span class="w-1.5 h-1.5 rounded-full ${status.dot}${status.pulse ? " animate-ping" : ""}"></span>
                ${status.label}${progressLabel}
              </span>
              ${
                report.urgent
                  ? `<span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[11px] font-bold">Urgent</span>`
                  : ""
              }
              <span class="text-xs text-secondary">${escapeHtml(report.date)}</span>
            </div>
            <h3 class="text-base md:text-lg font-bold text-on-surface font-display leading-snug">${escapeHtml(report.title)}</h3>
            <div class="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-secondary">
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-base text-secondary">person</span>
                ${escapeHtml(report.reporter)}
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-base text-secondary">location_on</span>
                ${escapeHtml(report.location)}
              </span>
              ${teamLine}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
          ${reportActions(report, mode)}
        </div>
      </article>`;
  }

  function renderStudentReports() {
    const container = byId("student-report-list");
    if (!container) return;

    const filtered = state.reports.filter(
      (report) =>
        matchesFilter(report, state.studentFilter) && matchesQuery(report, state.studentQuery)
    );

    container.innerHTML = filtered.length
      ? filtered.map((report) => reportCard(report, "student")).join("")
      : emptyState("Tidak ada pengaduan yang cocok");

    updateCounters();
  }

  function renderAdminTickets() {
    const container = byId("admin-ticket-list");
    if (!container) return;

    const filtered = state.reports.filter(
      (report) => matchesFilter(report, state.adminFilter) && matchesQuery(report, state.adminQuery)
    );

    container.innerHTML = filtered.length
      ? filtered.map((report) => reportCard(report, "admin")).join("")
      : emptyState("Tidak ada tiket pada filter ini");

    const countBadge = byId("visible-count");
    if (countBadge) countBadge.textContent = String(filtered.length);

    updateCounters();
  }

  function renderDispatchList() {
    const container = byId("admin-dispatch-list");
    if (!container) return;

    const filtered = state.reports
      .filter((report) => report.status === "review")
      .sort((a, b) => Number(b.urgent) - Number(a.urgent));

    container.innerHTML = filtered.length
      ? filtered.map((report) => reportCard(report, "admin")).join("")
      : emptyState("Antrean disposisi sudah bersih");

    updateCounters();
  }

  function renderReports() {
    renderStudentReports();
    renderAdminTickets();
    renderDispatchList();
    updateCounters();
  }

  /* ------------------------------------------------------------------------
     9. Disposisi
     ------------------------------------------------------------------------ */
  function fillDispatchOptions(selectedId) {
    const select = byId("ticket-select");
    if (!select) return;

    const queue = state.reports.filter((report) => report.status === "review");

    select.innerHTML = queue.length
      ? queue
          .map(
            (report) =>
              `<option value="${escapeHtml(report.id)}">${escapeHtml(report.id)} — ${escapeHtml(
                report.title
              )}${report.urgent ? " (Urgent)" : ""}</option>`
          )
          .join("")
      : `<option value="">Tidak ada tiket yang menunggu disposisi</option>`;

    if (selectedId && queue.some((report) => report.id === selectedId)) {
      select.value = selectedId;
    }
  }

  function openDispatch(ticketId) {
    fillDispatchOptions(ticketId);

    const report = state.reports.find((item) => item.id === ticketId);
    const priority = byId("dispatch-priority");
    if (report && priority) priority.value = report.urgent ? "Tinggi" : "Sedang";

    openModal(byId("modal-dispatch"));
  }

  function handleDispatchSubmit(event) {
    event.preventDefault();

    const select = byId("ticket-select");
    if (!select || !select.value) {
      showToast("Tidak Ada Tiket", "Antrean disposisi sedang kosong.", "error");
      return;
    }

    const report = state.reports.find((item) => item.id === select.value);
    if (!report) return;

    const team = byId("dispatch-team").value;
    const priority = byId("dispatch-priority").value;

    report.status = "progress";
    report.team = `${team} (${priority})`;
    report.progress = report.progress && report.progress > 0 ? report.progress : 35;
    report.urgent = priority === "Tinggi";

    closeModal(byId("modal-dispatch"));
    event.target.reset();
    renderReports();

    showToast(
      "Disposisi Diterbitkan!",
      `Tiket ${report.id} berhasil ditugaskan ke ${team}.`,
      "success"
    );
  }

  /* ------------------------------------------------------------------------
     10. Pengaduan Baru (Mahasiswa)
     ------------------------------------------------------------------------ */
  function handleComplaintSubmit(event) {
    event.preventDefault();

    const title = byId("complaint-title").value.trim();
    const categoryLabel = byId("complaint-category").value;
    const building = byId("complaint-building").value;
    const room = byId("complaint-room").value.trim();
    const priority = byId("complaint-priority").value;
    const description = byId("complaint-desc").value.trim();

    const categoryMap = {
      "Kelistrikan & AC": "ac",
      "Proyektor & Audio": "projector",
      "Jaringan Wi-Fi": "network",
      "Sanitasi / Toilet": "sanitation",
      "Meja / Kursi Kuliah": "furniture",
      "Lift / Akses Gedung": "lift",
    };

    const newReport = {
      id: `#CC-2026-${String(reportSequence++).padStart(4, "0")}`,
      title: title || description.slice(0, 80),
      reporter: "Ahmad Rizki (Mhs • 217006120)",
      location: `${building} • ${room}`,
      cat: categoryMap[categoryLabel] || "ac",
      status: "review",
      urgent: priority === "Tinggi",
      date: nowLabel(),
      team: null,
      progress: 0,
      description,
    };

    state.reports.unshift(newReport);

    closeModal(byId("modal-complaint"));
    event.target.reset();

    state.studentFilter = "all";
    $$("[data-student-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.studentFilter === "all");
    });

    renderReports();
    setStudentTab("complaints");

    showToast(
      "Pengaduan Terkirim!",
      `Tiket ${newReport.id} masuk antrean verifikasi tim Sarpras.`,
      "success"
    );
  }

  /* ------------------------------------------------------------------------
     11. Timeline
     ------------------------------------------------------------------------ */
  function trackReport(ticketId) {
    const report = state.reports.find((item) => item.id === ticketId);
    if (!report) return;

    const idElement = byId("timeline-ticket-id");
    const titleElement = byId("timeline-ticket-title");
    if (idElement) idElement.textContent = report.id;
    if (titleElement) titleElement.textContent = report.title;

    setStudentTab("timeline");
    showToast(
      "Pelacakan Tiket",
      `Menampilkan progres ${report.id} • ${STATUS_META[report.status].label}.`,
      "info"
    );
  }

  /* ------------------------------------------------------------------------
     12. Event Binding
     ------------------------------------------------------------------------ */
  function handleAction(actionElement) {
    const action = actionElement.dataset.action;

    switch (action) {
      case "auth-tab":
        setAuthTab(actionElement.dataset.tab);
        break;

      case "auth-role":
        setAuthRole(actionElement.dataset.role);
        break;

      case "toggle-password":
        togglePasswordVisibility(actionElement);
        break;

      case "toggle-menu": {
        const menu = byId(actionElement.dataset.menu);
        if (!menu) break;
        const willOpen = menu.hidden;
        closeMenus(menu);
        menu.hidden = !willOpen;
        actionElement.setAttribute("aria-expanded", String(willOpen));
        break;
      }

      case "close-modal": {
        const modal = actionElement.closest(".cc-modal");
        if (modal) closeModal(modal);
        break;
      }

      case "open-sso-help":
        closeMenus();
        openModal(byId("modal-sso-help"));
        break;

      case "open-complaint":
        closeMenus();
        openModal(byId("modal-complaint"));
        break;

      case "open-dispatch":
        closeMenus();
        openDispatch();
        break;

      case "quick-assign":
        closeMenus();
        openDispatch(actionElement.dataset.ticket);
        break;

      case "track-report":
        trackReport(actionElement.dataset.ticket);
        break;

      case "open-detail": {
        const report = state.reports.find((item) => item.id === actionElement.dataset.ticket);
        closeMenus();
        if (report) {
          showToast(
            `Detail ${report.id}`,
            `${report.title} • Status: ${STATUS_META[report.status].label}`,
            "info"
          );
        }
        break;
      }

      case "google-login":
        showToast("Google Workspace SSO", "Menghubungkan ke layanan OAuth2 UNSIL...", "info");
        setTimeout(() => {
          if (state.view === "auth") loginAs("student");
        }, 1100);
        break;

      case "export":
        showToast(
          "Menyiapkan Ekspor",
          "Rekap Sarpras UNSIL sedang dibuat dalam format PDF/XLS.",
          "success"
        );
        break;

      case "notify":
        showToast("Notifikasi", actionElement.dataset.note || "Tidak ada notifikasi baru.", "info");
        break;

      case "show-lock-info":
        showToast(
          "Hak Akses Terverifikasi",
          "Sesi Anda terikat SSO UNSIL dengan enkripsi 256-bit.",
          "info"
        );
        break;

      case "switch-role":
        loginAs(actionElement.dataset.role);
        break;

      case "logout":
        logout();
        break;

      case "demo":
        showToast(
          "Mode Prototipe",
          actionElement.dataset.note || "Fitur ini akan terhubung ke backend pada tahap berikutnya.",
          "info"
        );
        break;

      default:
        break;
    }
  }

  function bindEvents() {
    /* Delegasi klik global */
    document.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (actionElement) {
        handleAction(actionElement);
        if (actionElement.dataset.action !== "toggle-menu") closeMenus();
      }

      const studentTabButton = event.target.closest("[data-student-tab]");
      if (studentTabButton) {
        setStudentTab(studentTabButton.dataset.studentTab);
      }

      const adminTabButton = event.target.closest("[data-admin-tab]");
      if (adminTabButton) {
        setAdminTab(adminTabButton.dataset.adminTab);
      }

      const studentFilterButton = event.target.closest("[data-student-filter]");
      if (studentFilterButton) {
        state.studentFilter = studentFilterButton.dataset.studentFilter;
        $$("[data-student-filter]").forEach((button) => {
          button.classList.toggle(
            "is-active",
            button.dataset.studentFilter === state.studentFilter
          );
        });
        renderStudentReports();
      }

      const adminFilterButton = event.target.closest("[data-admin-filter]");
      if (adminFilterButton) {
        state.adminFilter = adminFilterButton.dataset.adminFilter;
        $$("[data-admin-filter]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.adminFilter === state.adminFilter);
        });
        renderAdminTickets();
      }

      /* Tutup menu saat klik di luar */
      if (
        !event.target.closest(".cc-menu") &&
        !event.target.closest("[data-action='toggle-menu']")
      ) {
        closeMenus();
      }
    });

    /* Modal backdrop */
    $$(".cc-modal").forEach((modal) => {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal(modal);
      });
    });

    /* Escape */
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openModals = $$(".cc-modal.is-open");
      if (openModals.length) {
        closeModal(openModals[openModals.length - 1]);
      } else {
        closeMenus();
      }
    });

    /* Pencarian */
    const studentSearch = byId("student-search");
    if (studentSearch) {
      studentSearch.addEventListener("input", (event) => {
        state.studentQuery = event.target.value;
        renderStudentReports();
      });
    }

    const adminSearch = byId("admin-search");
    if (adminSearch) {
      adminSearch.addEventListener("input", (event) => {
        state.adminQuery = event.target.value;
        renderAdminTickets();
      });
    }

    /* Password strength */
    const regPassword = byId("reg-password");
    if (regPassword) {
      regPassword.addEventListener("input", (event) => {
        evaluatePassword(event.target.value);
        clearFieldError();
      });
    }
    const regConfirm = byId("reg-confirm");
    if (regConfirm) {
      regConfirm.addEventListener("input", clearFieldError);
    }

    /* Login */
    const loginForm = byId("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const email = byId("login-email").value.trim();
        loginAs(state.role, { name: email ? email.split("@")[0] : "" });
      });
    }

    /* Registrasi */
    const registerForm = byId("register-form");
    if (registerForm) {
      registerForm.addEventListener("submit", (event) => {
        event.preventDefault();
        clearFieldError();

        const password = byId("reg-password").value;
        const confirm = byId("reg-confirm").value;
        const email = byId("reg-email").value.trim();
        const name = byId("reg-name").value.trim();

        if (password.length < 8) {
          showFieldError(byId("reg-password"), "Kata sandi minimal 8 karakter.");
          return;
        }

        if (password !== confirm) {
          showFieldError(byId("reg-confirm"), "Konfirmasi kata sandi tidak cocok.");
          return;
        }

        const loginEmail = byId("login-email");
        if (loginEmail) loginEmail.value = email;

        registerForm.reset();
        evaluatePassword("");
        setAuthTab("login");
        setAuthRole("student");

        showToast(
          "Pendaftaran Berhasil!",
          `Akun ${name || "mahasiswa"} siap digunakan. Silakan masuk dengan akun SSO Anda.`,
          "success"
        );
      });
    }

    /* Pengaduan */
    const complaintForm = byId("complaint-form");
    if (complaintForm) {
      complaintForm.addEventListener("submit", handleComplaintSubmit);
    }

    /* Disposisi */
    const dispatchForm = byId("dispatch-form");
    if (dispatchForm) {
      dispatchForm.addEventListener("submit", handleDispatchSubmit);
    }

    /* Histogram hover */
    const bars = $$("#histogram-container div");
    bars.forEach((bar) => {
      bar.addEventListener("mouseenter", () => {
        bar.style.opacity = "1";
      });
      bar.addEventListener("mouseleave", () => {
        if (!bar.classList.contains("bg-brand-orange")) {
          bar.style.removeProperty("opacity");
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     13. Inisialisasi
     ------------------------------------------------------------------------ */
  function init() {
    const initialHash = window.location.hash.replace("#", "").toLowerCase();

    state.reports = seedReports();
    reportSequence = 916;

    bindEvents();
    setAuthTab("login");
    setAuthRole("student");
    fillDispatchOptions();
    renderReports();

    setView("auth");

    if (initialHash === "admin") {
      loginAs("admin");
    } else if (initialHash === "student" || initialHash === "mahasiswa") {
      loginAs("student");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
