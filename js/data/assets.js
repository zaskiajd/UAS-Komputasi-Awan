/* ==========================================================================
   data/assets.js — Metadata kondisi aset untuk tampilan
   --------------------------------------------------------------------------
   Data aset itu sendiri dimuat dari backend (/api/assets) lewat
   js/features/assets-api.js. Berkas ini hanya menyimpan label & warna kondisi.
   ========================================================================== */

export const ASSET_CONDITION = {
  good: { label: "Baik", chip: "bg-emerald-100 text-emerald-700", weight: 1 },
  service: { label: "Perlu Servis", chip: "bg-amber-100 text-amber-800", weight: 0.75 },
  disrupted: { label: "Gangguan", chip: "bg-orange-100 text-primary", weight: 0.45 },
  broken: { label: "Rusak", chip: "bg-red-100 text-red-700", weight: 0.15 },
};

export const assetCondition = (key) => ASSET_CONDITION[key] || ASSET_CONDITION.good;
