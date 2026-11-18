/* ==========================================================================
   ui/motion.js — Micro-interaction berbasis Motion (motion.dev)
   --------------------------------------------------------------------------
   Sumber: js/vendor/motion.js (bundle UMD self-hosted → window.Motion).
   Prinsip pemakaian (antislop R-19, setiap animasi punya alasan):
     1. Sekuens masuk beranda (hero) — satu momen orkestrasi saat antarmuka
        tampil, mengarahkan mata ke headline dulu (focal point).
     2. Stagger baris (ledger/timeline/kontak) — daftar masuk berurutan saat
        terlihat, mengurutkan bacaan alih-alih fade seragam.
     3. FAQ <details> — animasi kecil saat dibuka/menutup, menunjukkan hasil
        aksi pengguna (motion yang menjawab aksi).
   Bila Motion gagal dimuat atau pengguna memakai prefers-reduced-motion,
   semua fungsi menjadi no-op: halaman tetap berfungsi penuh.
   ========================================================================== */

const M = typeof window !== "undefined" ? window.Motion : null;

const prefersReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Aktif hanya bila library ada DAN pengguna tidak menolak gerakan. */
const enabled = Boolean(M) && !prefersReducedMotion;

const animate = enabled && typeof M.animate === "function" ? M.animate : null;
const inView = enabled && typeof M.inView === "function" ? M.inView : null;
const stagger = enabled && typeof M.stagger === "function" ? M.stagger : null;

const springSoft = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 };

/**
 * Sekuens masuk beranda publik: satu-satunya momen orkestrasi halaman.
 * Elemen hero diberi atribut data-hero-step sesuai urutan narasi:
 * badge → headline → deskripsi → tombol aksi.
 */
export function playPublicHeroIntro() {
  if (!enabled || !animate) return;

  const steps = document.querySelectorAll("#panel-public-overview [data-hero-step]");
  if (!steps.length) return;

  steps.forEach((el, index) => {
    try {
      el.style.opacity = "0";
      animate(
        el,
        { opacity: [0, 1], y: [24, 0] },
        {
          ...springSoft,
          delay: 0.12 * index,
        }
      );
    } catch (error) {
      // Animasi gagal → tampilkan elemen apa adanya, jangan pernah menggagalkan boot.
      el.style.opacity = "1";
    }
  });
}

/**
 * Animasi kecil pada FAQ saat <details> dibuka: konten naik + memudar.
 * Menjawab aksi pengguna, bukan dekorasi. Dipasang sekali via delegasi.
 */
export function bindFaqMotion() {
  if (!enabled || !animate) return;

  document.addEventListener(
    "toggle",
    (event) => {
      const details = event.target;
      // Hanya FAQ panel publik yang dianimasikan (delegasi toggle tidak bubble;
      // listener ini memakai capture sehingga semua toggle terlihat).
      if (!(details instanceof HTMLDetailsElement)) return;
      if (!details.closest("#panel-public-services")) return;
      if (!details.open) return;

      const content = details.querySelector(".faq-body");
      if (!content) return;
      animate(content, { opacity: [0, 1], y: [10, 0] }, { ...springSoft, duration: 0.35 });
    },
    true
  );
}

/**
 * Stagger baris untuk kelompok `[data-stagger]` (ledger kategori, timeline
 * SOP, daftar kontak): anak-anaknya masuk berurutan ketika kelompok mulai
 * terlihat di viewport. Alasan: mengurutkan bacaan daftar panjang — fade
 * seragam membuat mata kehilangan urutan.
 * Aman dipanggil ulang; kelompok yang sudah dipantau tidak dipasang dua kali.
 */
const staggerObserved = new WeakSet();

export function bindRowStagger() {
  if (!enabled || !animate || !inView || !stagger) return;

  document.querySelectorAll("#view-public [data-stagger]").forEach((group) => {
    if (staggerObserved.has(group)) return;
    staggerObserved.add(group);

    const children = group.children;
    if (!children.length) return;

    inView(
      group,
      () => {
        [...children].forEach((el, index) => {
          try {
            el.style.opacity = "0";
            animate(
              el,
              { opacity: [0, 1], y: [20, 0] },
              { ...springSoft, delay: stagger(0.09)(index, children.length) ?? 0.09 * index }
            );
          } catch (error) {
            el.style.opacity = "1";
          }
        });
      },
      { margin: "-10% 0px -10% 0px" }
    );
  });
}
