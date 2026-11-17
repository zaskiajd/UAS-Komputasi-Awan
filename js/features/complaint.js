/* ==========================================================================
   features/complaint.js — Pengaduan baru dari mahasiswa
   --------------------------------------------------------------------------
   Alur foto: tiket dibuat lebih dulu lewat JSON POST /tickets (kontrak lama),
   lalu foto diunggah terpisah ke POST /tickets/:id/photos. Bila unggahan
   gagal, tiket tetap tersimpan dan mahasiswa mendapat pesan yang jelas.
   ========================================================================== */

import { byId, escapeHtml } from "../core/dom.js";
import { state } from "../core/state.js";
import { ApiError } from "../core/api.js";
import { createTicketRequest, uploadTicketPhotos } from "./tickets-api.js";
import { closeModal } from "../ui/modal.js";
import { showToast } from "../ui/toast.js";
import { renderReports } from "./reports.js";
import { setStudentTab } from "../views/student.js";

const CATEGORY_MAP = {
  "Kelistrikan & AC": "ac",
  "Proyektor & Audio": "projector",
  "Jaringan Wi-Fi": "network",
  "Sanitasi / Toilet": "sanitation",
  "Meja / Kursi Kuliah": "furniture",
  "Lift / Akses Gedung": "lift",
};

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const COMPRESS_THRESHOLD = 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTENSION = /\.(jpe?g|png|webp)$/i;

/** @type {{file: File, url: string}[]} */
let selectedPhotos = [];
let photoEventsBound = false;
let photoAddQueue = Promise.resolve();
/** Foto yang gagal diunggah setelah tiket dibuat: ticketId → File[] (untuk coba ulang). */
const pendingPhotoUploads = new Map();

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function showPhotoError(message) {
  const box = byId("complaint-photo-error");
  if (!box) return;
  box.textContent = message || "";
  box.hidden = !message;
}

function renderPhotoPreviews() {
  const container = byId("complaint-photo-preview");
  const count = byId("complaint-photo-count");
  const label = byId("complaint-photo-picker-label");
  const picker = byId("complaint-photo-picker");

  if (count) count.textContent = `${selectedPhotos.length}/${MAX_PHOTOS}`;
  if (label) {
    label.textContent =
      selectedPhotos.length >= MAX_PHOTOS
        ? "Maksimal 3 foto tercapai"
        : selectedPhotos.length
          ? "Klik untuk menambah foto (maks. 3)"
          : "Klik untuk lampirkan foto fasilitas rusak";
  }
  if (picker) picker.classList.toggle("is-full", selectedPhotos.length >= MAX_PHOTOS);

  if (!container) return;
  container.hidden = selectedPhotos.length === 0;
  container.innerHTML = selectedPhotos
    .map(
      (entry, index) => `
      <figure class="cc-photo-preview">
        <img src="${escapeHtml(entry.url)}" alt="Pratinjau foto ${index + 1}">
        <figcaption>${escapeHtml(formatBytes(entry.file.size))}</figcaption>
        <button type="button" class="cc-photo-preview__remove" data-remove-photo="${index}" aria-label="Hapus foto ${index + 1}">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </figure>`
    )
    .join("");
}

function validatePhoto(file) {
  if (!file || !file.size) return "Berkas foto kosong atau tidak dapat dibaca.";
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSION.test(file.name || "")) {
    return `${file.name || "Berkas"} bukan JPEG, PNG, atau WebP.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name || "Foto"} melebihi batas 3 MB.`;
  }
  return "";
}

/**
 * Pastikan berkas benar-benar bisa didekode sebagai gambar sebelum masuk
 * pratinjau, sehingga satu berkas palsu tidak menggagalkan unggahan lainnya.
 */
async function canDecodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close?.();
      return true;
    } catch (error) {
      return false;
    }
  }
  if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function") {
    return true; // lingkungan tanpa API dekode: biarkan validasi server yang menilai
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(true);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    image.src = url;
  });
}

async function addPhotos(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const errors = [];
  for (const file of files) {
    if (selectedPhotos.length >= MAX_PHOTOS) {
      errors.push(`Maksimal ${MAX_PHOTOS} foto per pengaduan.`);
      break;
    }
    const error = validatePhoto(file);
    if (error) {
      errors.push(error);
      continue;
    }
    const decodable = await canDecodeImage(file);
    if (!decodable) {
      errors.push(`${file.name || "Berkas"} bukan gambar yang valid`);
      continue;
    }
    if (selectedPhotos.length >= MAX_PHOTOS) {
      errors.push(`Maksimal ${MAX_PHOTOS} foto per pengaduan.`);
      break;
    }
    selectedPhotos.push({ file, url: URL.createObjectURL(file) });
    renderPhotoPreviews();
  }

  showPhotoError(errors[0] || "");
  renderPhotoPreviews();
}

function removePhoto(index) {
  const entry = selectedPhotos[index];
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  selectedPhotos.splice(index, 1);
  showPhotoError("");
  renderPhotoPreviews();
}

/** Panggil saat modal dibuka/ditutup agar pratinjau lama tidak tertinggal. */
export function resetComplaintPhotos() {
  selectedPhotos.forEach((entry) => URL.revokeObjectURL(entry.url));
  selectedPhotos = [];
  const input = byId("complaint-photos");
  if (input) input.value = "";
  showPhotoError("");
  renderPhotoPreviews();
}

/** Pasang listener picker & pratinjau (sekali saja). */
export function bindComplaintPhotoEvents() {
  if (photoEventsBound) return;

  const input = byId("complaint-photos");
  const picker = byId("complaint-photo-picker");
  const preview = byId("complaint-photo-preview");
  if (!input || !picker) return;
  photoEventsBound = true;

  picker.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    input.value = ""; // agar berkas yang sama dapat dipilih ulang setelah dihapus
    photoAddQueue = photoAddQueue.then(() => addPhotos(files)).catch(() => {});
  });
  preview?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-photo]");
    if (!button) return;
    removePhoto(Number(button.dataset.removePhoto));
  });

  renderPhotoPreviews();
}

/** Jumlah slot foto yang masih tersedia untuk tiket ini (maks. 3). */
function remainingPhotoSlots(report) {
  const total = Array.isArray(report?.photos) ? report.photos.length : 0;
  return Math.max(0, MAX_PHOTOS - total);
}

/**
 * Tombol "Unggah ulang foto" pada detail tiket mahasiswa. Hanya tampil bila
 * unggahan sebelumnya gagal, tiket belum selesai, dan total foto belum 3.
 */
export function photoRetryMarkup(report) {
  if (!report) return "";
  const files = pendingPhotoUploads.get(report.id);
  if (!files || !files.length) return "";
  if (report.status === "done") return "";

  const remaining = remainingPhotoSlots(report);
  if (remaining <= 0) return "";
  const count = Math.min(files.length, remaining);

  return `
    <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p class="text-[11px] font-bold text-amber-800">${count} foto belum terunggah</p>
      <p class="text-[10px] text-amber-700 mt-0.5 leading-relaxed">Unggahan foto sebelumnya gagal. Coba lagi tanpa membuat tiket baru.</p>
      <button type="button" class="mt-2 h-9 px-4 rounded-full bg-amber-600 text-white text-[11px] font-bold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed" data-action="retry-photos" data-ticket="${escapeHtml(
        report.id
      )}">Unggah ulang foto</button>
    </div>`;
}

/** Coba unggah lagi foto yang tersisa memakai POST /tickets/:id/photos. */
export async function retryTicketPhotos(ticketId) {
  const report = state.reports.find((item) => item.id === ticketId);
  const files = pendingPhotoUploads.get(ticketId);
  if (!report || !files || !files.length) return false;
  if (report.status === "done") {
    pendingPhotoUploads.delete(ticketId);
    return false;
  }

  const remaining = remainingPhotoSlots(report);
  if (remaining <= 0) {
    pendingPhotoUploads.delete(ticketId);
    return false;
  }

  const batch = files.slice(0, remaining);
  try {
    const prepared = await Promise.all(batch.map((file) => compressPhoto(file)));
    const result = await uploadTicketPhotos(report, prepared);
    const photos = Array.isArray(result?.photos) ? result.photos : [];
    report.photos = photos;
    report.photoUrl = result?.photoUrl || photos[0]?.url || report.photoUrl || null;
    report.updatedAt = new Date().toISOString();
    pendingPhotoUploads.delete(ticketId);

    renderReports();
    showToast(
      "Foto Berhasil Diunggah",
      `${batch.length} foto bukti tiket ${report.id} tersimpan.`,
      "success"
    );
    return true;
  } catch (error) {
    showToast(
      "Foto Gagal Diunggah",
      firstApiMessage(error, "Periksa koneksi atau ukuran berkas, lalu coba lagi."),
      "error"
    );
    return false;
  }
}

/**
 * Kompres foto > 1 MB menjadi JPEG maks. 1600 px (kualitas 0.82).
 * Bila API browser tidak tersedia / hasilnya lebih besar, pakai berkas asli.
 */
async function compressPhoto(file) {
  if (
    file.size <= COMPRESS_THRESHOLD ||
    !ALLOWED_TYPES.includes(file.type) ||
    typeof createImageBitmap !== "function" ||
    typeof File !== "function"
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close?.();
      return file;
    }

    // Latar putih agar transparansi PNG tidak menjadi hitam saat dikonversi.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size || blob.size > MAX_PHOTO_BYTES) return file;

    const baseName = (file.name || "foto").replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    return file;
  }
}

function firstApiMessage(error, fallback) {
  if (error instanceof ApiError && error.errors) {
    const first = Object.values(error.errors)[0];
    if (first) return first;
  }
  return error instanceof ApiError ? error.message : fallback;
}

export async function handleComplaintSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.submitting === "true") return;
  form.dataset.submitting = "true";

  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit ? submit.textContent : "";

  const title = byId("complaint-title").value.trim();
  const categoryLabel = byId("complaint-category").value;
  const building = byId("complaint-building").value;
  const room = byId("complaint-room").value.trim();
  const priorityInput = byId("complaint-priority").value;
  const description = byId("complaint-desc").value.trim();
  const priority = priorityInput === "Tinggi" ? "Tinggi" : priorityInput === "Rendah" ? "Rendah" : "Sedang";

  if (submit) submit.disabled = true;

  try {
    let newReport;
    try {
      // Pemilik, status, SLA, dan riwayat awal diisi server dari token.
      newReport = await createTicketRequest({
        title: title || description.slice(0, 80),
        category: CATEGORY_MAP[categoryLabel] || "ac",
        building,
        room,
        priority,
        description,
      });
    } catch (error) {
      showToast(
        "Pengaduan Gagal Dikirim",
        firstApiMessage(error, "Terjadi kesalahan. Coba lagi."),
        "error"
      );
      return;
    }

    // Tiket sudah tersimpan. Unggah foto terpisah; kegagalan tidak membatalkan tiket.
    let photoWarning = "";
    if (selectedPhotos.length > 0) {
      if (submit) submit.textContent = "Mengunggah foto...";
      try {
        const files = await Promise.all(selectedPhotos.map((entry) => compressPhoto(entry.file)));
        const result = await uploadTicketPhotos(newReport, files);
        const photos = Array.isArray(result?.photos) ? result.photos : [];
        newReport.photos = photos;
        newReport.photoUrl = result?.photoUrl || photos[0]?.url || null;
      } catch (error) {
        photoWarning = firstApiMessage(
          error,
          "Foto tidak dapat diunggah. Periksa koneksi atau ukuran berkas."
        );
        // Simpan berkas agar mahasiswa bisa mencoba lagi dari detail tiket.
        pendingPhotoUploads.set(
          newReport.id,
          selectedPhotos.map((entry) => entry.file)
        );
      }
    }

    state.reports.unshift(newReport);

    closeModal(byId("modal-complaint"));
    form.reset();
    resetComplaintPhotos();

    state.studentFilter = "all";
    document.querySelectorAll("[data-student-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.studentFilter === "all");
    });

    renderReports();
    setStudentTab("complaints");

    if (photoWarning) {
      showToast(
        "Pengaduan Tersimpan, Foto Gagal Diunggah",
        `Tiket ${newReport.id} tetap tersimpan, tetapi foto tidak terunggah: ${photoWarning} Buka detail tiket lalu tekan "Unggah ulang foto".`,
        "error"
      );
    } else {
      const photoCount = Array.isArray(newReport.photos) ? newReport.photos.length : 0;
      showToast(
        "Pengaduan Terkirim!",
        `Tiket ${newReport.id} masuk antrean verifikasi tim Sarpras${
          photoCount ? ` dengan ${photoCount} foto bukti` : ""
        }.`,
        "success"
      );
    }
  } finally {
    form.dataset.submitting = "false";
    if (submit) {
      submit.disabled = false;
      submit.textContent = submitLabel || "Kirim Pengaduan";
    }
  }
}
