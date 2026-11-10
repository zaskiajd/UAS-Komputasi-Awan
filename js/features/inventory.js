/* ==========================================================================
   features/inventory.js — Inventaris aset sarpras
   ========================================================================== */

import { byId, escapeHtml, formatDate } from "../core/dom.js";
import { state } from "../core/state.js";
import { ASSET_CONDITION, assetCondition, nextAssetId } from "../data/assets.js";
import { CATEGORY_META } from "../data/reports.js";
import { TEAMS, TEAM_BY_ID } from "../data/technicians.js";
import { closeModal, openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderAnalytics } from "./analytics.js";

const ADMIN_NAME = "Ir. Hendrawan";

/** Aksi arsip/hapus yang menunggu konfirmasi pada modal. */
let pendingAssetAction = null;

function matchesAssetQuery(asset, query) {
  if (!query) return true;
  const team = TEAM_BY_ID[asset.teamId];
  return [asset.id, asset.name, asset.location, asset.zone, team?.name || "", asset.note]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

function matchesAssetStatus(asset, status) {
  if (status === "archived") return Boolean(asset.archived);
  if (status === "all") return true;
  return !asset.archived;
}

function assetRow(asset) {
  const condition = assetCondition(asset.condition);
  const team = TEAM_BY_ID[asset.teamId];
  const archived = Boolean(asset.archived);
  return `
    <tr class="hover:bg-surface-container-low transition${archived ? " opacity-70" : ""}">
      <td class="py-3.5 px-5 font-bold text-on-surface whitespace-nowrap">${escapeHtml(asset.id)}</td>
      <td class="py-3.5 px-5 text-on-surface">
        <span class="flex flex-wrap items-center gap-1.5">
          <span class="font-semibold">${escapeHtml(asset.name)}</span>
          ${
            archived
              ? `<span class="px-2 py-0.5 rounded-full bg-surface-container-high text-secondary text-[9px] font-bold uppercase tracking-wider">Diarsipkan</span>`
              : ""
          }
        </span>
        <span class="block text-[10px] text-secondary mt-0.5">${escapeHtml(team?.name || "Tanpa tim")}</span>
      </td>
      <td class="py-3.5 px-5 text-secondary">${escapeHtml(asset.location)}</td>
      <td class="py-3.5 px-5">
        <span class="px-2.5 py-1 rounded-full ${condition.chip} font-bold text-[10px] whitespace-nowrap">${escapeHtml(condition.label.toUpperCase())}</span>
      </td>
      <td class="py-3.5 px-5 text-secondary whitespace-nowrap">${escapeHtml(formatDate(asset.lastServiceAt))}</td>
      <td class="py-3.5 px-5 text-right whitespace-nowrap">
        <div class="inline-flex items-center gap-2">
          <button type="button" class="px-3 py-1.5 rounded-full bg-surface-container text-primary font-bold hover:bg-surface-container-high transition" data-action="asset-detail" data-asset="${escapeHtml(asset.id)}">Detail</button>
          ${
            archived
              ? `<button type="button" class="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-bold hover:bg-emerald-200 transition" data-action="asset-restore" data-asset="${escapeHtml(asset.id)}">Pulihkan</button>`
              : `<button type="button" class="px-3 py-1.5 rounded-full bg-tertiary-fixed text-tertiary font-bold hover:brightness-95 transition" data-action="edit-asset" data-asset="${escapeHtml(asset.id)}">Edit</button>`
          }
        </div>
      </td>
    </tr>`;
}

export function filteredAssets() {
  const status = state.assetStatusFilter || "active";
  return state.assets.filter((asset) => {
    if (!matchesAssetStatus(asset, status)) return false;
    if (state.inventoryFilter !== "all" && asset.condition !== state.inventoryFilter) {
      return false;
    }
    return matchesAssetQuery(asset, state.inventoryQuery);
  });
}

export function renderInventory() {
  const body = byId("asset-table-body");
  if (!body) return;

  const assets = filteredAssets();
  const status = state.assetStatusFilter || "active";
  const scoped = state.assets.filter((asset) => matchesAssetStatus(asset, status));

  body.innerHTML = assets.length
    ? assets.map(assetRow).join("")
    : `<tr><td colspan="6" class="py-10 px-5 text-center text-secondary text-xs">Tidak ada aset yang cocok dengan pencarian atau filter.</td></tr>`;

  const counts = {
    total: scoped.length,
    good: scoped.filter((asset) => asset.condition === "good").length,
    service: scoped.filter((asset) => asset.condition === "service").length,
    broken: scoped.filter((asset) => asset.condition === "broken").length,
    disrupted: scoped.filter((asset) => asset.condition === "disrupted").length,
  };

  document.querySelectorAll("[data-asset-count]").forEach((element) => {
    const key = element.dataset.assetCount;
    if (key in counts) element.textContent = String(counts[key]);
  });

  const visible = byId("asset-visible-count");
  if (visible) visible.textContent = String(assets.length);

  const summary = byId("asset-summary-label");
  if (summary) {
    const attention = counts.service + counts.broken + counts.disrupted;
    summary.textContent =
      status === "archived"
        ? `${counts.total} aset diarsipkan • dapat dipulihkan`
        : `${counts.total} aset ${status === "active" ? "aktif " : ""}terpantau • ${attention} perlu perhatian`;
  }

  renderAnalytics();
}

function relatedTickets(asset) {
  return state.reports
    .filter((report) => report.cat === asset.cat && report.status !== "done")
    .slice(0, 3);
}

/** Hapus permanen hanya untuk aset terarsip tanpa riwayat servis & tiket aktif. */
function canDeleteAssetPermanently(asset) {
  return Boolean(asset.archived) && !asset.lastServiceAt && relatedTickets(asset).length === 0;
}

function assetDetailMarkup(asset) {
  const condition = assetCondition(asset.condition);
  const team = TEAM_BY_ID[asset.teamId];
  const tickets = relatedTickets(asset);
  const archived = Boolean(asset.archived);

  const footerActions = archived
    ? `
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="h-10 px-4 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold hover:bg-emerald-200 transition" data-action="asset-restore" data-asset="${escapeHtml(asset.id)}">Pulihkan Aset</button>
        ${
          canDeleteAssetPermanently(asset)
            ? `<button type="button" class="h-10 px-4 rounded-full bg-[#b91c1c] text-white text-xs font-bold hover:bg-[#991b1b] transition" data-action="asset-delete" data-asset="${escapeHtml(asset.id)}">Hapus Permanen</button>`
            : `<span class="max-w-[240px] text-[10px] text-secondary leading-relaxed">Hapus permanen terkunci: aset memiliki riwayat servis atau tiket aktif.</span>`
        }
      </div>`
    : `
      <div class="flex flex-wrap items-center gap-2">
        ${
          asset.condition !== "good"
            ? `<button type="button" class="h-10 px-4 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold hover:bg-emerald-200 transition" data-action="asset-service" data-asset="${escapeHtml(asset.id)}">Tandai Selesai Servis</button>`
            : `<span class="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><span class="material-symbols-outlined text-base">verified</span>Aset dalam kondisi baik</span>`
        }
        <button type="button" class="h-10 px-4 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition" data-action="edit-asset" data-asset="${escapeHtml(asset.id)}">Edit Data</button>
        <button type="button" class="h-10 px-4 rounded-full bg-amber-100 text-amber-800 text-xs font-bold hover:bg-amber-200 transition" data-action="asset-archive" data-asset="${escapeHtml(asset.id)}">Arsipkan</button>
      </div>`;

  return `
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-wider text-secondary">${escapeHtml(asset.id)}</p>
        <h3 class="text-lg font-bold text-on-surface font-display mt-1">${escapeHtml(asset.name)}</h3>
        <p class="text-xs text-secondary mt-1 flex items-center gap-1">
          <span class="material-symbols-outlined text-base">location_on</span>
          ${escapeHtml(asset.location)}
        </p>
      </div>
      <div class="flex flex-col items-end gap-1.5">
        <span class="px-3 py-1 rounded-full ${condition.chip} font-bold text-[10px] whitespace-nowrap">${escapeHtml(condition.label.toUpperCase())}</span>
        ${
          archived
            ? `<span class="px-2.5 py-1 rounded-full bg-surface-container-high text-secondary font-bold text-[10px] whitespace-nowrap">DIARSIPKAN</span>`
            : ""
        }
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-xs">
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Zona</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(asset.zone)}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Tim penanggung jawab</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(team?.name || "-")}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Servis terakhir</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(formatDate(asset.lastServiceAt))}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Kategori</p>
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(CATEGORY_META[asset.cat]?.label || asset.cat.toUpperCase())}</p>
      </div>
      <div class="rounded-xl bg-surface-container-low p-3 sm:col-span-2">
        <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Status inventaris</p>
        <p class="font-semibold ${archived ? "text-secondary" : "text-emerald-700"} mt-1">${
          archived
            ? `Diarsipkan${asset.archivedAt ? ` • ${escapeHtml(formatDate(asset.archivedAt))}` : ""}`
            : "Aktif"
        }</p>
      </div>
    </div>

    <div class="mt-4 rounded-xl bg-surface-container-low p-3 text-xs">
      <p class="text-[10px] uppercase tracking-wider text-secondary font-bold">Catatan kondisi</p>
      <p class="text-on-surface leading-relaxed mt-1">${escapeHtml(asset.note || "Tidak ada catatan.")}</p>
    </div>

    <div class="mt-4">
      <p class="text-xs font-bold text-on-surface">Riwayat Perawatan</p>
      <div class="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1">
        ${
          (asset.history || []).length
            ? asset.history
                .slice()
                .sort((a, b) => new Date(b.at) - new Date(a.at))
                .map(
                  (entry) => `
              <div class="rounded-xl border border-surface-container-high p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[11px] font-bold text-on-surface">${escapeHtml(entry.label)}</span>
                  <span class="text-[10px] text-secondary">${escapeHtml(formatDate(entry.at))}</span>
                </div>
                <p class="text-[11px] text-secondary mt-0.5">${escapeHtml(entry.actor || "Sistem")} • ${escapeHtml(entry.note || "")}</p>
              </div>`
                )
                .join("")
            : `<p class="text-xs text-secondary">Belum ada riwayat perawatan.</p>`
        }
      </div>
    </div>

    <div class="mt-4">
      <p class="text-xs font-bold text-on-surface">Tiket Terkait</p>
      <div class="mt-2 space-y-2">
        ${
          tickets.length
            ? tickets
                .map(
                  (report) => `
              <button type="button" class="w-full text-left rounded-xl border border-surface-container-high p-3 hover:bg-surface-container-low transition" data-action="open-detail" data-ticket="${escapeHtml(report.id)}">
                <span class="text-[10px] font-bold text-primary">${escapeHtml(report.id)}</span>
                <p class="text-xs font-semibold text-on-surface truncate mt-0.5">${escapeHtml(report.title)}</p>
              </button>`
                )
                .join("")
            : `<p class="text-xs text-secondary">Tidak ada tiket aktif untuk kategori ini.</p>`
        }
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 mt-5 pt-4 border-t border-surface-container-high">
      ${footerActions}
      <button type="button" class="h-10 px-4 rounded-full bg-surface-container text-on-surface text-xs font-bold hover:bg-surface-container-high transition" data-action="close-modal">Tutup</button>
    </div>`;
}

export function openAssetDetail(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  const body = byId("asset-detail-body");
  const modal = byId("modal-asset-detail");
  if (!asset || !body || !modal) return;

  body.dataset.asset = asset.id;
  body.innerHTML = assetDetailMarkup(asset);
  openModal(modal);
}

function fillAssetFormOptions() {
  const categorySelect = byId("asset-form-cat");
  if (categorySelect) {
    categorySelect.innerHTML = Object.entries(CATEGORY_META)
      .map(
        ([key, meta]) =>
          `<option value="${escapeHtml(key)}">${escapeHtml(meta.label)}</option>`
      )
      .join("");
  }

  const teamSelect = byId("asset-form-team");
  if (teamSelect) {
    teamSelect.innerHTML = TEAMS.map(
      (team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`
    ).join("");
  }

  const conditionSelect = byId("asset-form-condition");
  if (conditionSelect) {
    conditionSelect.innerHTML = Object.entries(ASSET_CONDITION)
      .map(
        ([key, meta]) =>
          `<option value="${escapeHtml(key)}">${escapeHtml(meta.label)}</option>`
      )
      .join("");
  }
}

export function openAssetForm(assetId) {
  const form = byId("asset-form");
  const modal = byId("modal-asset-form");
  if (!form || !modal) return;

  const asset = assetId
    ? state.assets.find((item) => item.id === assetId)
    : null;

  if (asset?.archived) {
    showToast(
      "Aset Diarsipkan",
      "Pulihkan aset terlebih dahulu sebelum mengubah datanya.",
      "error"
    );
    return;
  }

  form.reset();
  fillAssetFormOptions();

  const categorySelect = byId("asset-form-cat");
  const teamSelect = byId("asset-form-team");
  const conditionSelect = byId("asset-form-condition");

  byId("asset-form-id").value = asset?.id || "";
  byId("asset-form-name").value = asset?.name || "";
  byId("asset-form-location").value = asset?.location || "";
  byId("asset-form-zone").value = asset?.zone || "";
  byId("asset-form-note").value = asset?.note || "";
  if (categorySelect) categorySelect.value = asset?.cat || "ac";
  if (teamSelect) teamSelect.value = asset?.teamId || TEAMS[0].id;
  if (conditionSelect) conditionSelect.value = asset?.condition || "good";

  byId("asset-form-title").textContent = asset ? "Edit Aset" : "Tambah Aset";
  byId("asset-form-subtitle").textContent = asset
    ? `Perbarui data ${asset.name}. Kode aset ${asset.id} tidak berubah.`
    : "Lengkapi data aset baru. Kode aset dibuat otomatis.";
  byId("asset-form-submit").textContent = asset ? "Simpan Perubahan" : "Tambah Aset";

  const detail = byId("modal-asset-detail");
  if (detail && !detail.hidden) closeModal(detail);
  openModal(modal);
}

export function handleAssetFormSubmit(event) {
  event.preventDefault();

  const id = byId("asset-form-id").value.trim();
  const name = byId("asset-form-name").value.trim();
  const cat = byId("asset-form-cat").value;
  const location = byId("asset-form-location").value.trim();
  const zone = byId("asset-form-zone").value.trim();
  const teamId = byId("asset-form-team").value;
  const condition = byId("asset-form-condition").value;
  const note = byId("asset-form-note").value.trim();
  const team = TEAM_BY_ID[teamId];

  if (!name) {
    showToast("Nama Aset Wajib Diisi", "Masukkan nama fasilitas terlebih dahulu.", "error");
    return;
  }
  if (!location) {
    showToast("Lokasi Wajib Diisi", "Tuliskan lokasi atau ruang aset.", "error");
    return;
  }
  if (!zone) {
    showToast("Zona Wajib Diisi", "Tentukan zona kampus aset, mis. FT atau GKB.", "error");
    return;
  }
  if (!CATEGORY_META[cat]) {
    showToast("Kategori Tidak Valid", "Pilih kategori aset yang tersedia.", "error");
    return;
  }
  if (!team) {
    showToast("Tim Tidak Valid", "Pilih tim penanggung jawab aset.", "error");
    return;
  }
  if (!ASSET_CONDITION[condition]) {
    showToast("Kondisi Tidak Valid", "Pilih kondisi aset yang tersedia.", "error");
    return;
  }

  const existing = id
    ? state.assets.find((asset) => asset.id === id)
    : null;

  if (id && !existing) {
    showToast("Aset Tidak Ditemukan", "Data aset sudah berubah. Muat ulang halaman.", "error");
    return;
  }
  if (existing?.archived) {
    showToast(
      "Aset Diarsipkan",
      "Pulihkan aset terlebih dahulu sebelum mengubah datanya.",
      "error"
    );
    return;
  }

  const now = new Date().toISOString();
  const asset =
    existing ||
    ({
      id: nextAssetId(cat, state.assets),
      archived: false,
      lastServiceAt: null,
      history: [],
    });

  const previous = existing
    ? {
        name: existing.name,
        cat: existing.cat,
        location: existing.location,
        zone: existing.zone,
        teamId: existing.teamId,
        condition: existing.condition,
      }
    : null;

  asset.name = name;
  asset.cat = cat;
  asset.location = location;
  asset.zone = zone;
  asset.teamId = team.id;
  asset.condition = condition;
  asset.note = note || "Tidak ada catatan.";
  asset.history = asset.history || [];

  if (!existing) {
    asset.history.push({
      at: now,
      label: "Aset terdaftar",
      actor: ADMIN_NAME,
      note: "Aset baru ditambahkan ke inventaris Sarpras.",
    });
    state.assets.push(asset);

    // Pastikan aset baru langsung terlihat pada daftar aktif.
    state.assetStatusFilter = "active";
    const statusFilter = byId("asset-status-filter");
    if (statusFilter) statusFilter.value = "active";
  } else {
    const changes = [];
    if (previous.name !== name) changes.push(`nama: ${previous.name} → ${name}`);
    if (previous.cat !== cat) {
      changes.push(
        `kategori: ${CATEGORY_META[previous.cat]?.label || previous.cat} → ${CATEGORY_META[cat].label}`
      );
    }
    if (previous.location !== location) {
      changes.push(`lokasi: ${previous.location} → ${location}`);
    }
    if (previous.zone !== zone) changes.push(`zona: ${previous.zone} → ${zone}`);
    if (previous.teamId !== team.id) {
      changes.push(
        `tim: ${TEAM_BY_ID[previous.teamId]?.name || previous.teamId} → ${team.name}`
      );
    }
    if (previous.condition !== condition) {
      changes.push(
        `kondisi: ${assetCondition(previous.condition).label} → ${assetCondition(condition).label}`
      );
    }

    asset.history.push({
      at: now,
      label: "Data aset diperbarui",
      actor: ADMIN_NAME,
      note: changes.length
        ? changes.join("; ")
        : "Detail aset diperbarui tanpa perubahan kondisi.",
    });
  }

  closeModal(byId("modal-asset-form"));
  renderInventory();

  showToast(
    existing ? "Aset Diperbarui" : "Aset Ditambahkan",
    existing
      ? `${asset.id} berhasil diperbarui.`
      : `${asset.id} ditambahkan ke inventaris aktif.`,
    "success"
  );
}

export function markAssetServiced(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  if (asset.archived) {
    showToast(
      "Aset Diarsipkan",
      "Pulihkan aset terlebih dahulu sebelum mencatat servis.",
      "error"
    );
    return;
  }

  const now = new Date().toISOString();
  asset.condition = "good";
  asset.lastServiceAt = now;
  asset.note = "Servis selesai dan aset dinyatakan kembali dalam kondisi baik.";
  asset.history = asset.history || [];
  asset.history.push({
    at: now,
    label: "Servis selesai",
    actor: ADMIN_NAME,
    note: "Kondisi aset divalidasi dan dikembalikan ke status baik.",
  });

  renderInventory();

  const body = byId("asset-detail-body");
  if (body && body.dataset.asset === asset.id) {
    body.innerHTML = assetDetailMarkup(asset);
  }

  showToast("Aset Diperbarui", `${asset.id} ditandai selesai servis.`, "success");
}

function openAssetConfirm(mode, asset) {
  pendingAssetAction = { mode, id: asset.id };

  const modal = byId("modal-asset-confirm");
  const title = byId("asset-confirm-title");
  const text = byId("asset-confirm-text");
  const submit = byId("asset-confirm-submit");
  if (!modal || !title || !text || !submit) return;

  if (mode === "delete") {
    title.textContent = "Hapus Permanen?";
    text.textContent = `${asset.name} (${asset.id}) akan dihapus permanen dari inventaris. Tindakan ini tidak dapat dibatalkan.`;
    submit.textContent = "Hapus Permanen";
    submit.className =
      "px-5 py-2.5 rounded-full text-xs font-bold bg-[#b91c1c] text-white hover:bg-[#991b1b] transition";
  } else {
    title.textContent = "Arsipkan Aset?";
    text.textContent = `${asset.name} (${asset.id}) akan disembunyikan dari daftar aktif. Riwayat perawatan tetap tersimpan dan aset dapat dipulihkan kapan saja.`;
    submit.textContent = "Arsipkan Aset";
    submit.className =
      "px-5 py-2.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition";
  }

  openModal(modal);
}

export function requestAssetArchive(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || asset.archived) return;
  openAssetConfirm("archive", asset);
}

export function requestAssetDelete(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || !asset.archived) return;

  if (!canDeleteAssetPermanently(asset)) {
    showToast(
      "Hapus Permanen Terkunci",
      "Aset memiliki riwayat servis atau tiket aktif. Gunakan arsip agar histori tetap utuh.",
      "error"
    );
    return;
  }

  openAssetConfirm("delete", asset);
}

export function confirmAssetAction() {
  if (!pendingAssetAction) return;

  const { mode, id } = pendingAssetAction;
  pendingAssetAction = null;

  const asset = state.assets.find((item) => item.id === id);
  const confirmModal = byId("modal-asset-confirm");
  if (confirmModal) closeModal(confirmModal);
  if (!asset) return;

  const now = new Date().toISOString();
  const detail = byId("modal-asset-detail");

  if (mode === "archive") {
    asset.archived = true;
    asset.archivedAt = now;
    asset.history = asset.history || [];
    asset.history.push({
      at: now,
      label: "Aset diarsipkan",
      actor: ADMIN_NAME,
      note: "Aset dikeluarkan dari daftar aktif tanpa menghapus riwayat.",
    });

    if (detail && !detail.hidden) closeModal(detail);
    renderInventory();
    showToast(
      "Aset Diarsipkan",
      `${asset.id} dipindahkan ke arsip dan dapat dipulihkan.`,
      "success"
    );
    return;
  }

  if (mode === "delete") {
    if (!canDeleteAssetPermanently(asset)) {
      showToast(
        "Hapus Permanen Terkunci",
        "Aset memiliki riwayat servis atau tiket aktif.",
        "error"
      );
      return;
    }

    state.assets = state.assets.filter((item) => item.id !== asset.id);
    if (detail && !detail.hidden) closeModal(detail);
    renderInventory();
    showToast(
      "Aset Dihapus Permanen",
      `${asset.id} telah dihapus dari inventaris.`,
      "success"
    );
  }
}

export function restoreAsset(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset || !asset.archived) return;

  const now = new Date().toISOString();
  asset.archived = false;
  delete asset.archivedAt;
  asset.history = asset.history || [];
  asset.history.push({
    at: now,
    label: "Aset dipulihkan",
    actor: ADMIN_NAME,
    note: "Aset dikembalikan ke daftar inventaris aktif.",
  });

  // Kembali ke tampilan aktif agar aset yang dipulihkan langsung terlihat.
  state.assetStatusFilter = "active";
  const statusFilter = byId("asset-status-filter");
  if (statusFilter) statusFilter.value = "active";

  renderInventory();

  const body = byId("asset-detail-body");
  if (body && body.dataset.asset === asset.id) {
    body.innerHTML = assetDetailMarkup(asset);
  }

  showToast(
    "Aset Dipulihkan",
    `${asset.id} kembali ke daftar inventaris aktif.`,
    "success"
  );
}
