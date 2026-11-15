/* ==========================================================================
   features/assets-api.js — Sinkronisasi inventaris aset dengan backend
   --------------------------------------------------------------------------
   Backend (/api/assets) adalah sumber data. state.assets hanya salinan di
   memori yang diisi dari API setelah admin login.
   ========================================================================== */

import { apiRequest } from "../core/api.js";
import { state } from "../core/state.js";
import { showToast } from "../ui/toast.js";

const refOf = (asset) =>
  asset.id !== undefined && asset.id !== null
    ? encodeURIComponent(asset.id)
    : encodeURIComponent(asset);

/** Menyamakan objek aset dari API dengan bentuk yang dipakai renderer frontend. */
export function normalizeAsset(asset) {
  return {
    archived: false,
    archivedAt: null,
    lastServiceAt: null,
    note: "",
    history: [],
    ...asset,
    cat: asset.cat || asset.category?.code,
  };
}

/** Ambil seluruh aset (aktif + arsip) ke state.assets. Pemanggil yang merender ulang. */
export async function loadAssets() {
  const items = await apiRequest("/assets?status=all&limit=500");
  state.assets = (items || []).map(normalizeAsset);
}

/** Muat aset; kegagalan ditampilkan sebagai toast dan tidak menghentikan login. */
export async function loadAssetsSafely() {
  try {
    await loadAssets();
  } catch (error) {
    showToast("Gagal Memuat Inventaris", error.message || "Data aset tidak dapat dimuat.", "error");
  }
}

export async function createAssetRequest(payload) {
  const asset = await apiRequest("/assets", { method: "POST", body: payload });
  return normalizeAsset(asset);
}

export async function updateAssetRequest(asset, payload) {
  const updated = await apiRequest(`/assets/${refOf(asset)}`, { method: "PATCH", body: payload });
  return normalizeAsset(updated);
}

export async function serviceAssetRequest(asset) {
  const updated = await apiRequest(`/assets/${refOf(asset)}/service`, { method: "POST" });
  return normalizeAsset(updated);
}

export async function archiveAssetRequest(asset) {
  const updated = await apiRequest(`/assets/${refOf(asset)}/archive`, { method: "POST" });
  return normalizeAsset(updated);
}

export async function restoreAssetRequest(asset) {
  const updated = await apiRequest(`/assets/${refOf(asset)}/restore`, { method: "POST" });
  return normalizeAsset(updated);
}

export function deleteAssetRequest(asset) {
  return apiRequest(`/assets/${refOf(asset)}`, { method: "DELETE" });
}
