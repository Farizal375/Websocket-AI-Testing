# Laporan Pengujian Unit (Unit Test Results)
**Aplikasi:** Real-Time Buzzer Quiz
**Framework Pengujian:** Bun Test

## Ringkasan Hasil Eksekusi
- **Total Test:** 10
- **Berhasil (Passed):** 10
- **Gagal (Failed):** 0
- **Status Akhir:** ✅ **ALL PASS**

## Detail Pengujian

### Suite 1: WebSocket Connection
| ID | Skenario | Status | Waktu |
|---|---|:---:|---|
| TEST-CON-01 | Koneksi berhasil terbuka | ✅ PASS | 6.00ms |
| TEST-CON-02 | Koneksi terdaftar di clients Map | ✅ PASS | 51.00ms |
| TEST-CON-03 | Koneksi dihapus dari clients setelah disconnect | ✅ PASS | 152.00ms |

### Suite 2: Event JOIN
| ID | Skenario | Status | Waktu |
|---|---|:---:|---|
| TEST-JOIN-01 | Username berhasil disimpan setelah JOIN | ✅ PASS | 5.00ms |
| TEST-JOIN-02 | Broadcast STATE_UPDATE dikirim ke semua client setelah JOIN | ✅ PASS | 57.00ms |

### Suite 3: Integritas State & Race Condition
| ID | Skenario | Status | Waktu |
|---|---|:---:|---|
| TEST-RACE-01 | Hanya satu winner dari dua BUZZ bersamaan (Single winner guarantee) | ✅ PASS | 305.00ms |
| TEST-RACE-02 | BUZZ diabaikan jika winner sudah ada | ✅ PASS | 407.00ms |
| TEST-RACE-03 | BUZZ diabaikan jika sesi belum dibuka | ✅ PASS | 106.00ms |

### Suite 4: Kontrol Akses Role
| ID | Skenario | Status | Waktu |
|---|---|:---:|---|
| TEST-AUTH-01 | Non-Host tidak bisa START_SESSION | ✅ PASS | 53.00ms |
| TEST-AUTH-02 | Host berhasil START_SESSION dan semua client menerima broadcast | ✅ PASS | 155.00ms |

---
**Catatan:** Seluruh pengujian berjalan dengan sukses, termasuk skenario *race condition* (TEST-RACE-01) di mana dua payload BUZZ yang datang hampir bersamaan berhasil di-handle dengan baik oleh server tanpa menyebabkan mutasi ganda pada variable `winner`. Validasi dan logic kontrol pada backend telah terbukti deterministik dan stabil.
