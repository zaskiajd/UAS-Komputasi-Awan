/* ==========================================================================
   data/technicians.js — Tim lapangan & personil teknisi Sarpras
   ========================================================================== */

export const TEAMS = [
  {
    id: "electrical",
    name: "Tim Kelistrikan & Tata Udara",
    short: "Kelistrikan & AC",
    icon: "hvac",
    accent: "primary",
    zone: "Rektorat • FT • GKB",
    coordinator: "hendra",
  },
  {
    id: "av",
    name: "Tim Multimedia & AV",
    short: "Multimedia & AV",
    icon: "videocam",
    accent: "tertiary",
    zone: "GKB • Perpustakaan",
    coordinator: "yudi",
  },
  {
    id: "civil",
    name: "Tim Sanitasi & Sipil",
    short: "Sanitasi & Sipil",
    icon: "plumbing",
    accent: "amber",
    zone: "Rektorat • GOR • Taman",
    coordinator: "dadi",
  },
  {
    id: "network",
    name: "Tim Jaringan & IT",
    short: "Jaringan & IT",
    icon: "router",
    accent: "sky",
    zone: "Seluruh kampus",
    coordinator: "rina",
  },
];

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((team) => [team.id, team]));
/* --------------------------------------------------------------------------
   Data personil dummy sudah dihapus: roster teknisi kini dimuat dari
   backend /api/technicians (features/technicians-api.js) setelah admin
   login, sehingga CRUD manajemen teknisi benar-benar tersimpan.
   Tim (TEAMS) tetap data referensi statis untuk label & zona kerja.
   -------------------------------------------------------------------------- */

export const technicianById = (id, technicians = []) =>
  technicians.find((technician) => technician.id === id) || null;

export const teamById = (id) => TEAM_BY_ID[id] || null;
