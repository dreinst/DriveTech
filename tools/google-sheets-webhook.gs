/**
 * =============================================================================
 * Drive Tech — Webhook Google Sheets (Apps Script)
 * =============================================================================
 * Menerima POST JSON dari aplikasi (src/lib/sheets.ts) lalu meng-upsert satu
 * baris per entitas ke sheet: Bookings, Payments, Purchases, Leasing.
 *
 * Bentuk payload yang dikirim aplikasi:
 *   { "entity": "booking" | "payment" | "purchase" | "leasing",
 *     "sentAt": "2026-08-27T09:00:00.000Z",
 *     "data": { ...pasangan kunci-nilai, kunci PERTAMA = kode/id unik... } }
 *
 * Perilaku:
 *   - Sheet dibuat otomatis kalau belum ada (satu sheet per entity).
 *   - Header dibuat otomatis dari keys `data` saat sheet masih kosong,
 *     ditambah kolom "updated_at" di paling kanan.
 *   - Upsert berdasarkan KOLOM PERTAMA (kode/id): kalau nilainya sudah ada,
 *     baris itu di-update (hanya kolom yang dikirim); kalau belum, di-append.
 *   - Kolom "updated_at" selalu diisi waktu saat baris ditulis.
 *   - Key baru yang belum punya kolom otomatis ditambahkan sebagai kolom baru
 *     (disisipkan sebelum "updated_at").
 *
 * -----------------------------------------------------------------------------
 * LANGKAH PASANG (sekali saja, +- 3 menit):
 * -----------------------------------------------------------------------------
 * 1. Buka spreadsheet tujuan:
 *    https://docs.google.com/spreadsheets/d/1Ov8JwanwXF-9lNwszkdccQTK0w2BQ2s0S0Orrx-Igz8/
 *    (skrip ini memakai SpreadsheetApp.getActiveSpreadsheet(), jadi WAJIB
 *    dipasang DI spreadsheet itu — bukan sebagai project Apps Script lepas).
 * 2. Menu Extensions -> Apps Script.
 * 3. Hapus isi editor, tempel SELURUH isi file ini, lalu simpan (Ctrl/Cmd+S).
 * 4. Klik "Deploy" -> "New deployment" -> jenis "Web app":
 *      - Description : bebas, mis. "webhook drive tech"
 *      - Execute as  : Me (akun Anda)
 *      - Who has access: Anyone
 *    Klik "Deploy", izinkan akses saat diminta.
 * 5. Salin "Web app URL" (berakhiran /exec), lalu isi di .env.local aplikasi:
 *      SHEETS_WEBHOOK_URL=...
 * 6. Selesai. Uji cepat dari terminal:
 *      curl -X POST "$SHEETS_WEBHOOK_URL" -H "Content-Type: application/json" \
 *        -d '{"entity":"booking","sentAt":"2026-08-27T00:00:00Z","data":{"bookingCode":"BK-TEST01","status":"pending_payment"}}'
 *    Baris BK-TEST01 harus muncul di sheet "Bookings".
 * CATATAN: setiap kali kode di editor diubah, buat deployment BARU
 * (Deploy -> Manage deployments -> edit -> New version) agar URL memakai kode terbaru.
 * =============================================================================
 */

/** Nama sheet per entity. Entity tak dikenal masuk ke sheet "Lainnya". */
var SHEET_BY_ENTITY = {
  booking: "Bookings",
  payment: "Payments",
  purchase: "Purchases",
  leasing: "Leasing",
  vehicle: "Katalog",
};

var UPDATED_AT_HEADER = "updated_at";

/**
 * Kunci aksi reset via GET (?action=reset&key=...). Sheet hanyalah cermin
 * sinkronisasi (sumber kebenaran tetap Supabase), jadi risiko terburuk
 * penyalahgunaan kunci ini hanyalah sheet dibuat ulang kosong.
 */
var RESET_KEY = "dt-reset-c9k4x7wq21";

/** Sheet yang boleh dihapus oleh aksi reset (dibuat ulang otomatis saat sync). */
var SHEET_RESETTABLE = ["Bookings", "Payments", "Purchases", "Leasing", "Katalog", "Lainnya"];

/**
 * Hapus seluruh sheet entity supaya dibuat ulang bersih (header baru) pada
 * sinkronisasi berikutnya. Bisa dijalankan manual dari editor (Run) atau
 * lewat GET ?action=reset&key=RESET_KEY.
 */
function resetSheetUji() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dihapus = [];
  for (var i = 0; i < SHEET_RESETTABLE.length; i++) {
    var sheet = ss.getSheetByName(SHEET_RESETTABLE[i]);
    if (!sheet) continue;
    if (ss.getSheets().length === 1) {
      sheet.clear(); // spreadsheet wajib punya minimal satu sheet
    } else {
      ss.deleteSheet(sheet);
    }
    dihapus.push(SHEET_RESETTABLE[i]);
  }
  return dihapus;
}

/**
 * Entry point Web App untuk request POST.
 * Selalu membalas JSON: { ok: true, ... } atau { ok: false, error: "..." }.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ ok: false, error: "Body kosong." });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOutput_({ ok: false, error: "Body bukan JSON yang valid." });
    }

    var entity = String(payload.entity || "").toLowerCase();
    var data = payload.data;
    if (!entity || !data || typeof data !== "object" || Array.isArray(data)) {
      return jsonOutput_({
        ok: false,
        error: 'Payload harus berbentuk { entity, sentAt, data: {...} }.',
      });
    }

    var sheetName = SHEET_BY_ENTITY[entity] || "Lainnya";
    var sheet = getOrCreateSheet_(sheetName);
    var result = upsertRow_(sheet, data);

    return jsonOutput_({
      ok: true,
      entity: entity,
      sheet: sheetName,
      action: result.action,
      row: result.row,
      key: result.key,
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * GET: cek hidup (tanpa parameter) atau aksi reset
 * (?action=reset&key=RESET_KEY) untuk membersihkan sheet uji dari jarak jauh.
 */
function doGet(e) {
  var action = e && e.parameter ? String(e.parameter.action || "") : "";
  if (action === "reset") {
    var key = e.parameter.key ? String(e.parameter.key) : "";
    if (key !== RESET_KEY) {
      return jsonOutput_({ ok: false, error: "Kunci reset salah." });
    }
    return jsonOutput_({ ok: true, action: "reset", dihapus: resetSheetUji() });
  }
  return jsonOutput_({
    ok: true,
    message: "Webhook Google Sheets Drive Tech aktif. Kirim data lewat POST JSON.",
    versi: "2026-08-28-reset",
  });
}

/** Ambil sheet berdasarkan nama; buat baru kalau belum ada. */
function getOrCreateSheet_(name) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  return sheet;
}

/**
 * Upsert satu baris `data` ke `sheet`.
 * Kunci = nilai key PERTAMA pada objek data, dicocokkan ke KOLOM PERTAMA sheet.
 */
function upsertRow_(sheet, data) {
  var keys = Object.keys(data);
  if (keys.length === 0) {
    throw new Error("data kosong — tidak ada yang bisa ditulis.");
  }

  // 1. Siapkan header. Sheet kosong -> header = keys data + updated_at.
  var lastColumn = sheet.getLastColumn();
  var headers;
  if (sheet.getLastRow() === 0 || lastColumn === 0) {
    headers = keys.concat([UPDATED_AT_HEADER]);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  }

  // 2. Pastikan kolom updated_at ada (di paling kanan).
  if (headers.indexOf(UPDATED_AT_HEADER) === -1) {
    headers.push(UPDATED_AT_HEADER);
    sheet.getRange(1, headers.length).setValue(UPDATED_AT_HEADER);
  }

  // 3. Tambahkan kolom untuk key baru yang belum ada di header
  //    (disisipkan sebelum updated_at supaya updated_at tetap paling kanan).
  for (var i = 0; i < keys.length; i++) {
    if (headers.indexOf(keys[i]) === -1) {
      var posisiUpdatedAt = headers.indexOf(UPDATED_AT_HEADER) + 1; // 1-based
      sheet.insertColumnBefore(posisiUpdatedAt);
      sheet.getRange(1, posisiUpdatedAt).setValue(keys[i]);
      headers.splice(posisiUpdatedAt - 1, 0, keys[i]);
    }
  }

  // 4. Cari baris berdasarkan kolom pertama (kode/id unik).
  var keyValue = String(data[keys[0]]);
  var targetRow = -1;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var kolomKunci = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < kolomKunci.length; r++) {
      if (String(kolomKunci[r][0]) === keyValue) {
        targetRow = r + 2; // +2: mulai baris 2 (1-based, lewati header)
        break;
      }
    }
  }

  var action = targetRow === -1 ? "append" : "update";
  if (targetRow === -1) {
    targetRow = lastRow + 1;
  }

  // 5. Tulis nilai per kolom (hanya kolom yang dikirim + updated_at).
  for (var c = 0; c < headers.length; c++) {
    var header = headers[c];
    if (header === UPDATED_AT_HEADER) {
      sheet.getRange(targetRow, c + 1).setValue(new Date());
    } else if (Object.prototype.hasOwnProperty.call(data, header)) {
      var value = data[header];
      if (value !== null && typeof value === "object") {
        value = JSON.stringify(value);
      }
      sheet.getRange(targetRow, c + 1).setValue(value);
    }
  }

  return { action: action, row: targetRow, key: keyValue };
}

/** Balas JSON. */
function jsonOutput_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}
