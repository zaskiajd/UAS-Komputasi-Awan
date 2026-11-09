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

/** 15 personil tersebar di 4 tim. `active: false` berarti sedang standby. */
export const seedTechnicians = () => [
  { id: "hendra", name: "Hendra", title: "Pak Hendra", role: "Koordinator", teamId: "electrical", active: true, phone: "+62 812-1100-001", skills: ["AC", "Panel listrik", "Genset"] },
  { id: "rian", name: "Rian", title: "Rian", role: "Teknisi", teamId: "electrical", active: true, phone: "+62 812-1100-002", skills: ["AC split", "Kelistrikan"] },
  { id: "agus", name: "Agus", title: "Agus", role: "Teknisi", teamId: "electrical", active: true, phone: "+62 812-1100-003", skills: ["Lampu", "Instalasi daya"] },
  { id: "dedi", name: "Dedi", title: "Dedi", role: "Teknisi", teamId: "electrical", active: true, phone: "+62 812-1100-004", skills: ["AC sentral", "Cold storage"] },
  { id: "wawan", name: "Wawan", title: "Wawan", role: "Teknisi", teamId: "electrical", active: false, phone: "+62 812-1100-005", skills: ["Kelistrikan", "Genset"] },

  { id: "yudi", name: "Yudi", title: "Pak Yudi", role: "Koordinator", teamId: "av", active: true, phone: "+62 812-2200-001", skills: ["Proyektor", "Sound system"] },
  { id: "fajar", name: "Fajar", title: "Fajar", role: "Teknisi", teamId: "av", active: true, phone: "+62 812-2200-002", skills: ["Proyektor", "Kabel HDMI"] },
  { id: "gilang", name: "Gilang", title: "Gilang", role: "Teknisi", teamId: "av", active: false, phone: "+62 812-2200-003", skills: ["Audio", "Live streaming"] },

  { id: "dadi", name: "Dadi", title: "Pak Dadi", role: "Koordinator", teamId: "civil", active: true, phone: "+62 812-3300-001", skills: ["Sipil", "Sanitasi"] },
  { id: "nanang", name: "Nanang", title: "Pak Nanang", role: "Teknisi", teamId: "civil", active: true, phone: "+62 812-3300-002", skills: ["Lift", "Struktur"] },
  { id: "iwan", name: "Iwan", title: "Pak Iwan", role: "Teknisi", teamId: "civil", active: true, phone: "+62 812-3300-003", skills: ["Meubel", "Kayu"] },
  { id: "asep", name: "Asep", title: "Asep", role: "Teknisi", teamId: "civil", active: false, phone: "+62 812-3300-004", skills: ["Drainase", "Batu"] },

  { id: "rina", name: "Rina", title: "Bu Rina", role: "Koordinator", teamId: "network", active: true, phone: "+62 812-4400-001", skills: ["Jaringan", "Wi-Fi"] },
  { id: "bayu", name: "Bayu", title: "Bayu", role: "Teknisi", teamId: "network", active: true, phone: "+62 812-4400-002", skills: ["Access point", "Fiber optik"] },
  { id: "tegar", name: "Tegar", title: "Tegar", role: "Teknisi", teamId: "network", active: true, phone: "+62 812-4400-003", skills: ["Router", "Kabel LAN"] },
];

export const technicianById = (id, technicians = []) =>
  technicians.find((technician) => technician.id === id) || null;

export const teamById = (id) => TEAM_BY_ID[id] || null;

const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** ID unik untuk teknisi baru, diturunkan dari nama pendek. */
export function nextTechnicianId(name, technicians = []) {
  const base = slugify(name) || `tech-${Date.now().toString(36)}`;
  let candidate = base;
  let counter = 2;
  while (technicians.some((technician) => technician.id === candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}
