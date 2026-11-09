/* ==========================================================================
   features/inventory.js — Inventaris aset sarpras
   ========================================================================== */

import { byId, escapeHtml, formatDate } from "../core/dom.js";
import { state } from "../core/state.js";
import { assetCondition } from "../data/assets.js";
import { TEAM_BY_ID } from "../data/technicians.js";
import { openModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderAnalytics } from "./analytics.js";

function matchesAssetQuery(asset, query) {
  if (!query) return true;
  const team = TEAM_BY_ID[asset.teamId];
  return [asset.id, asset.name, asset.location, asset.zone, team?.name || "", asset.note]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}

function assetRow(asset) {
  const condition = assetCondition(asset.condition);
  const team = TEAM_BY_ID[asset.teamId];
  return `
    <tr class="hover:bg-surface-container-low transition">
      <td class="py-3.5 px-5 font-bold text-on-surface whitespace-nowrap">${escapeHtml(asset.id)}</td>
      <td class="py-3.5 px-5 text-on-surface">
        <span class="block font-semibold">${escapeHtml(asset.name)}</span>
        <span class="block text-[10px] text-secondary mt-0.5">${escapeHtml(team?.name || "Tanpa tim")}</span>
      </td>
      <td class="py-3.5 px-5 text-secondary">${escapeHtml(asset.location)}</td>
      <td class="py-3.5 px-5">
        <span class="px-2.5 py-1 rounded-full ${condition.chip} font-bold text-[10px] whitespace-nowrap">${escapeHtml(condition.label.toUpperCase())}</span>
      </td>
      <td class="py-3.5 px-5 text-secondary whitespace-nowrap">${escapeHtml(formatDate(asset.lastServiceAt))}</td>
      <td class="py-3.5 px-5 text-right">
        <button type="button" class="text-primary font-bold hover:underline" data-action="asset-detail" data-asset="${escapeHtml(asset.id)}">Detail</button>
      </td>
    </tr>`;
}

export function filteredAssets() {
  return state.assets.filter((asset) => {
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

  body.innerHTML = assets.length
    ? assets.map(assetRow).join("")
    : `<tr><td colspan="6" class="py-10 px-5 text-center text-secondary text-xs">Tidak ada aset yang cocok dengan pencarian atau filter.</td></tr>`;

  const counts = {
    total: state.assets.length,
    good: state.assets.filter((asset) => asset.condition === "good").length,
    service: state.assets.filter((asset) => asset.condition === "service").length,
    broken: state.assets.filter((asset) => asset.condition === "broken").length,
    disrupted: state.assets.filter((asset) => asset.condition === "disrupted").length,
  };

  document.querySelectorAll("[data-asset-count]").forEach((element) => {
    const key = element.dataset.assetCount;
    if (key in counts) element.textContent = String(counts[key]);
  });

  const visible = byId("asset-visible-count");
  if (visible) visible.textContent = String(assets.length);

  const summary = byId("asset-summary-label");
  if (summary) {
    summary.textContent = `${counts.total} aset kritis terpantau • ${counts.service + counts.broken + counts.disrupted} perlu perhatian`;
  }

  renderAnalytics();
}

function relatedTickets(asset) {
  return state.reports
    .filter((report) => report.cat === asset.cat && report.status !== "done")
    .slice(0, 3);
}

function assetDetailMarkup(asset) {
  const condition = assetCondition(asset.condition);
  const team = TEAM_BY_ID[asset.teamId];
  const tickets = relatedTickets(asset);

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
      <span class="px-3 py-1 rounded-full ${condition.chip} font-bold text-[10px] whitespace-nowrap">${escapeHtml(condition.label.toUpperCase())}</span>
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
        <p class="font-semibold text-on-surface mt-1">${escapeHtml(asset.cat.toUpperCase())}</p>
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
      ${
        asset.condition !== "good"
          ? `<button type="button" class="h-10 px-4 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold hover:bg-emerald-200 transition" data-action="asset-service" data-asset="${escapeHtml(asset.id)}">Tandai Selesai Servis</button>`
          : `<span class="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><span class="material-symbols-outlined text-base">verified</span>Aset dalam kondisi baik</span>`
      }
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

export function markAssetServiced(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  const now = new Date().toISOString();
  asset.condition = "good";
  asset.lastServiceAt = now;
  asset.note = "Servis selesai dan aset dinyatakan kembali dalam kondisi baik.";
  asset.history = asset.history || [];
  asset.history.push({
    at: now,
    label: "Servis selesai",
    actor: "Ir. Hendrawan",
    note: "Kondisi aset divalidasi dan dikembalikan ke status baik.",
  });

  renderInventory();

  const body = byId("asset-detail-body");
  if (body && body.dataset.asset === asset.id) {
    body.innerHTML = assetDetailMarkup(asset);
  }

  showToast("Aset Diperbarui", `${asset.id} ditandai selesai servis.`, "success");
}
