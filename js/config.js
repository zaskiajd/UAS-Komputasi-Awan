/* ==========================================================================
   config.js — Konfigurasi Frontend CampusCare
   ========================================================================== */

export const CONFIG = {
  /** Base URL API Express/PostgreSQL */
  API_URL:
    window.CAMPUSCARE_API ||
    window.CC_API_URL ||
    "http://localhost:3000/api",

  /**
   * Google OAuth 2.0 Client ID dari Google Cloud Console.
   * Dapat diisi langsung di sini atau melalui window.CAMPUSCARE_GOOGLE_CLIENT_ID
   */
  GOOGLE_CLIENT_ID:
    window.CAMPUSCARE_GOOGLE_CLIENT_ID ||
    window.GOOGLE_CLIENT_ID ||
    "115872308169-omq6c2lknlem7cp494tmc4afl1r96rf3.apps.googleusercontent.com",
};
