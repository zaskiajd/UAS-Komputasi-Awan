/* ========================================================================
   features/timeline.js — Detail progres pengaduan mahasiswa
   Menampilkan gauge progres besar + tahapan yang bisa diklik.
   ======================================================================== */

import { byId, escapeHtml } from "../core/dom.js";
import { state } from "../core/state.js";
import { STATUS_META } from "../data/reports.js";
import { setStudentTab } from "../views/student.js";

const STAGE_ICONS = ["inbox", "fact_check", "engineering", "task_alt"];

/** Status visual satu tahap terhadap tahap aktif tiket. */
function stageState(index, currentStep, isDone) {
  if (isDone) return "done";
  if (index < currentStep) return "done";
  if (index === currentStep) return "current";
  return "pending";
}

function stageStateLabel(stageStatus, isDone) {
  if (stageStatus === "done") return isDone ? "Selesai" : "Tercapai";
  if (stageStatus === "current") return "Berjalan";
  return "Menunggu";
}

function stageBadgeClass(stageStatus) {
  if (stageStatus === "done") return "bg-emerald-100 text-emerald-800";
  if (stageStatus === "current") return "bg-primary-fixed text-on-primary-fixed";
  return "bg-surface-container-high text-secondary";
}

function buildStages(report, progress, isDone) {
  const waitingNote =
    report.status === "waiting" ? " Saat ini perbaikan menunggu suku cadang." : "";

  return [
    {
      title: "Laporan diterima",
      description: `Laporan ${report.id} tercatat pada ${report.date} dan masuk ke antrean Biro Sarpras.`,
      meta: report.date,
    },
    {
      title: "Verifikasi & disposisi",
      description: report.team
        ? `Laporan telah diverifikasi dan didisposisikan kepada ${report.team}.`
        : "Laporan sedang diverifikasi. Tim Sarpras akan segera menugaskan teknisi.",
      meta: report.team ? `Teknisi: ${report.team}` : "Belum ada teknisi",
    },
    {
      title: "Penanganan teknisi",
      description: report.team
        ? `${report.team} menangani perbaikan dengan progres ${progress}%.${waitingNote}`
        : "Penanganan teknisi belum dimulai karena laporan masih menunggu disposisi.",
      meta: progress > 0 ? `Progres ${progress}%` : "Belum dimulai",
    },
    {
      title: "Selesai",
      description: isDone
        ? "Pekerjaan selesai dan sudah divalidasi oleh Biro Sarpras."
        : "Hasil perbaikan akan divalidasi oleh Biro Sarpras setelah pekerjaan selesai.",
      meta: isDone ? "Tervalidasi" : "Validasi Sarpras",
    },
  ];
}

function stageDetailMarkup(stage, stageStatus, isDone) {
  return `
    <div class="cc-stage-detail__inner flex items-start gap-3">
      <span class="cc-stage-detail__icon">
        <span class="material-symbols-outlined text-xl">${stage.icon}</span>
      </span>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-bold text-on-surface font-display">${escapeHtml(stage.title)}</p>
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${stageBadgeClass(stageStatus)}">
            ${stageStateLabel(stageStatus, isDone)}
          </span>
        </div>
        <p class="text-xs text-secondary leading-relaxed mt-1">${escapeHtml(stage.description)}</p>
      </div>
    </div>`;
}

export function trackReport(ticketId) {
  const report = state.reports.find((item) => item.id === ticketId);
  const detail = byId("student-detail-card");
  if (!report || !detail || report.owner !== state.student?.nim) return;

  const status = STATUS_META[report.status] || STATUS_META.review;
  const isDone = report.status === "done";
  const currentStep = isDone ? 3 : report.status === "review" ? 1 : 2;
  const progress = isDone
    ? 100
    : report.status === "review"
      ? 0
      : Math.max(0, Math.min(100, Number(report.progress) || 0));

  const stages = buildStages(report, progress, isDone).map((stage, index) => ({
    ...stage,
    icon: STAGE_ICONS[index],
    status: stageState(index, currentStep, isDone),
  }));

  const ringRadius = 58;
  const circumference = 2 * Math.PI * ringRadius;

  detail.dataset.ticket = report.id;
  state.selectedTicket = report.id;

  detail.innerHTML = `
    <section class="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-surface-container-high shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wider text-secondary">Detail pengaduan</p>
          <h2 class="text-lg font-bold text-on-surface font-display mt-1">${escapeHtml(report.title)}</h2>
          <p class="text-xs text-secondary mt-1">${escapeHtml(report.id)} · ${escapeHtml(report.date)}</p>
        </div>
        <button type="button" class="w-9 h-9 rounded-full bg-surface-container hover:bg-surface-container-high text-secondary" data-action="close-ticket-detail" aria-label="Tutup detail"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-4">
        <span class="px-3 py-1 rounded-full ${status.chip} text-xs font-bold">${escapeHtml(status.label)}</span>
        <span class="inline-flex items-center gap-1 text-xs text-secondary"><span class="material-symbols-outlined text-base">location_on</span>${escapeHtml(report.location)}</span>
        ${
          report.urgent
            ? '<span class="px-2.5 py-1 rounded-full bg-error-container text-on-error-container text-[10px] font-bold">Prioritas tinggi</span>'
            : ""
        }
      </div>

      <p class="text-sm text-on-surface leading-relaxed mt-4">${escapeHtml(report.description)}</p>

      <div class="mt-5 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-gradient-to-br from-white via-white to-[#fff4ee]">
        <div class="flex flex-col lg:flex-row">
          <!-- Gauge statistik besar -->
          <div class="flex flex-col items-center gap-3 border-b border-[#e2e8f0] bg-white/60 px-5 py-6 lg:w-80 lg:border-b-0 lg:border-r">
            <div class="cc-progress-dial" data-progress-dial>
              <svg viewBox="0 0 140 140" class="cc-progress-dial__svg" aria-hidden="true">
                <defs>
                  <linearGradient id="ccProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#ff9a62" />
                    <stop offset="100%" stop-color="#ff661f" />
                  </linearGradient>
                </defs>
                <circle class="cc-progress-dial__track" cx="70" cy="70" r="${ringRadius}" />
                <circle class="cc-progress-dial__ring" data-progress-ring cx="70" cy="70" r="${ringRadius}" />
              </svg>
              <div class="cc-progress-dial__center">
                <span class="cc-progress-dial__value"><span data-progress-value>0</span><span class="cc-progress-dial__unit">%</span></span>
                <span class="cc-progress-dial__label">${escapeHtml(status.label)}</span>
              </div>
            </div>

            <div class="text-center">
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Progres penanganan</p>
              <p class="mt-0.5 text-xs font-semibold text-on-surface">Tahap ${Math.min(currentStep + 1, 4)} dari 4</p>
            </div>

            <div class="grid w-full grid-cols-2 gap-2">
              <div class="cc-progress-metric">
                <span class="cc-progress-metric__label">Teknisi</span>
                <span class="cc-progress-metric__value" title="${escapeHtml(report.team || "Belum ditugaskan")}">${escapeHtml(report.team || "Belum ada")}</span>
              </div>
              <div class="cc-progress-metric">
                <span class="cc-progress-metric__label">Prioritas</span>
                <span class="cc-progress-metric__value">${report.urgent ? "Tinggi" : "Normal"}</span>
              </div>
            </div>
          </div>

          <!-- Tahapan interaktif -->
          <div class="flex-1 p-5 sm:p-6">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-secondary">Statistik proses</p>
                <p class="text-sm font-bold text-on-surface font-display mt-0.5">Tahapan penanganan tiket</p>
              </div>
              <span class="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-semibold text-secondary">
                <span class="material-symbols-outlined text-sm">touch_app</span>
                Klik tahap untuk detail
              </span>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Tahapan penanganan">
              ${stages
                .map(
                  (stage, index) => `
                <button type="button" class="cc-stage-step" data-stage="${index}" data-status="${stage.status}" role="tab" aria-selected="${index === currentStep}">
                  <span class="cc-stage-step__head">
                    <span class="cc-stage-step__index">${
                      stage.status === "done"
                        ? '<span class="material-symbols-outlined text-sm">check</span>'
                        : index + 1
                    }</span>
                    <span class="cc-stage-step__status">${stageStateLabel(stage.status, isDone)}</span>
                  </span>
                  <span class="cc-stage-step__title">${escapeHtml(stage.title)}</span>
                  <span class="cc-stage-step__meta">${escapeHtml(stage.meta)}</span>
                </button>`
                )
                .join("")}
            </div>

            <div class="cc-stage-detail mt-3" id="cc-stage-detail" data-stage-detail aria-live="polite"></div>
          </div>
        </div>
      </div>
    </section>`;

  detail.hidden = false;
  setStudentTab("complaints");

  /* Animasi gauge: mulai kosong lalu terisi sesuai progres tiket. */
  const ring = detail.querySelector("[data-progress-ring]");
  if (ring) {
    ring.style.strokeDasharray = String(circumference);
    ring.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(circumference * (1 - progress / 100));
      });
    });
  }

  /* Angka persentase berhitung naik agar terasa seperti statistik live. */
  const valueElement = detail.querySelector("[data-progress-value]");
  if (valueElement) {
    const duration = 950;
    const startedAt = performance.now();

    const countUp = (now) => {
      const ratio = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      valueElement.textContent = String(Math.round(eased * progress));
      if (ratio < 1) requestAnimationFrame(countUp);
    };

    requestAnimationFrame(countUp);
  }

  /* Klik tahap memperbarui panel detail tahapan. */
  const stageButtons = Array.from(detail.querySelectorAll("[data-stage]"));
  const stageDetail = detail.querySelector("[data-stage-detail]");

  const activateStage = (selectedIndex) => {
    stageButtons.forEach((button) => {
      const isActive = Number(button.dataset.stage) === selectedIndex;
      button.classList.toggle("is-focused", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    const stage = stages[selectedIndex];
    if (stageDetail && stage) {
      stageDetail.innerHTML = stageDetailMarkup(stage, stage.status, isDone);
    }
  };

  stageButtons.forEach((button) => {
    button.addEventListener("click", () => activateStage(Number(button.dataset.stage)));
  });

  activateStage(currentStep);

  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}
