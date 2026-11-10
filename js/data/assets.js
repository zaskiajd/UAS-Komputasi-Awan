/* ==========================================================================
   data/assets.js — Aset sarpras kritis & metadata kondisi
   ========================================================================== */

export const ASSET_CONDITION = {
  good: { label: "Baik", chip: "bg-emerald-100 text-emerald-700", weight: 1 },
  service: { label: "Perlu Servis", chip: "bg-amber-100 text-amber-800", weight: 0.75 },
  disrupted: { label: "Gangguan", chip: "bg-orange-100 text-primary", weight: 0.45 },
  broken: { label: "Rusak", chip: "bg-red-100 text-red-700", weight: 0.15 },
};

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

export const seedAssets = () => [
  {
    id: "AST-AC-0312",
    name: "AC Split 2 PK — Lab Komputer 3",
    location: "Gedung F • Lt. 2",
    zone: "FT",
    cat: "ac",
    condition: "service",
    teamId: "electrical",
    lastServiceAt: daysAgo(26),
    note: "Drainase kondensat tersumbat dan unit mengeluarkan tetesan air.",
    history: [
      { at: daysAgo(26), label: "Servis rutin", actor: "Rian", note: "Pembersihan filter dan pengecekan freon." },
      { at: daysAgo(2), label: "Laporan gangguan", actor: "Ahmad Rizki", note: "Air menetes di atas meja komputer." },
    ],
  },
  {
    id: "AST-PRJ-0087",
    name: "Proyektor Laser 5000 Lumens",
    location: "GKB • R.204",
    zone: "GKB",
    cat: "projector",
    condition: "broken",
    teamId: "av",
    lastServiceAt: daysAgo(66),
    note: "Lampu indikator mati total, ballast terindikasi lemah.",
    history: [
      { at: daysAgo(66), label: "Servis terakhir", actor: "Yudi", note: "Pembersihan lensa dan pengecekan kipas." },
      { at: daysAgo(1), label: "Laporan gangguan", actor: "Ahmad Rizki", note: "Proyektor tidak menyala saat mata kuliah pagi." },
    ],
  },
  {
    id: "AST-WIFI-0145",
    name: "Access Point Wi-Fi 6",
    location: "Perpustakaan • Lt. 2",
    zone: "Perpustakaan",
    cat: "network",
    condition: "disrupted",
    teamId: "network",
    lastServiceAt: daysAgo(20),
    note: "Koneksi terputus berkala, perlu audit jalur uplink.",
    history: [
      { at: daysAgo(20), label: "Servis terakhir", actor: "Bayu", note: "Restart perangkat dan pembaruan firmware." },
      { at: daysAgo(0), label: "Laporan gangguan", actor: "Nabila Putri", note: "Wi-Fi terputus setiap beberapa menit." },
    ],
  },
  {
    id: "AST-LFT-0004",
    name: "Lift Penumpang 8 Orang",
    location: "Rektorat • Gedung A",
    zone: "Rektorat",
    cat: "lift",
    condition: "good",
    teamId: "civil",
    lastServiceAt: daysAgo(10),
    note: "Inspeksi bulanan selesai, seluruh sensor berfungsi normal.",
    history: [
      { at: daysAgo(10), label: "Inspeksi bulanan", actor: "Nanang", note: "Uji pintu, sensor beban, dan rem darurat." },
    ],
  },
  {
    id: "AST-MJR-0210",
    name: "Meja Dosen Ergonomis",
    location: "Fakultas Teknik • R.301",
    zone: "FT",
    cat: "furniture",
    condition: "good",
    teamId: "civil",
    lastServiceAt: daysAgo(33),
    note: "Kondisi stabil, tidak ada keluhan aktif.",
    history: [
      { at: daysAgo(33), label: "Pemeriksaan meubel", actor: "Iwan", note: "Pengencangan baut dan pelumasan rel laci." },
    ],
  },
  {
    id: "AST-SAN-0063",
    name: "Pintu Geser Otomatis Toilet",
    location: "Rektorat • Lt. 1",
    zone: "Rektorat",
    cat: "sanitation",
    condition: "service",
    teamId: "civil",
    lastServiceAt: daysAgo(47),
    note: "Engsel pengganti masih dalam pengiriman vendor.",
    history: [
      { at: daysAgo(47), label: "Servis terakhir", actor: "Dadi", note: "Penyetelan rel pintu geser." },
      { at: daysAgo(1), label: "Menunggu suku cadang", actor: "Dadi", note: "Engsel tipe geser dipesan ke vendor." },
    ],
  },
  {
    id: "AST-LMP-0455",
    name: "Lampu Sorot LED 200W",
    location: "Gelanggang Olahraga",
    zone: "GOR",
    cat: "electrical",
    condition: "good",
    teamId: "electrical",
    lastServiceAt: daysAgo(3),
    note: "Penggantian lampu selesai dan lolos uji nyala.",
    history: [
      { at: daysAgo(3), label: "Penggantian lampu", actor: "Agus", note: "Lampu LED 200W diganti dan diuji 30 menit." },
    ],
  },
];

export const assetCondition = (key) => ASSET_CONDITION[key] || ASSET_CONDITION.good;

const ASSET_ID_PREFIX = {
  ac: "AC",
  projector: "PRJ",
  network: "WIFI",
  sanitation: "SAN",
  furniture: "MJR",
  lift: "LFT",
  electrical: "LMP",
};

/** ID unik untuk aset baru, mengikuti pola AST-<prefix>-<nomor>. */
export function nextAssetId(cat, assets = []) {
  const prefix = ASSET_ID_PREFIX[cat] || "AST";
  const pattern = new RegExp(`^AST-${prefix}-(\\d+)$`);
  const highest = assets.reduce((max, asset) => {
    const match = pattern.exec(asset.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `AST-${prefix}-${String(highest + 1).padStart(4, "0")}`;
}
