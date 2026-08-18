# SNT 10 Kupang - Sistem Presensi & Jurnal Pembelajaran Terintegrasi

Aplikasi web modern berbasis Next.js 15 App Router, TypeScript, dan Google Sheets API untuk pengelolaan presensi harian siswa, agenda jurnal mengajar guru, data master kurikulum, dan rekapitulasi laporan siap cetak format resmi Kemendikdasmen (hemat tinta/toner).

---

## 🌟 Fitur Utama

- **🔐 Autentikasi Cepat & Presisi**:
  - Login instan menggunakan `user_id` atau `username`.
  - Hirarki peran: **Admin**, **Kepala Sekolah / Guru**, dan **Ketua Kelas / Sekertaris Kelas (PIC)**.
  - Sesi aman terenkripsi JWT HttpOnly cookie.

- **📋 Presensi Harian Siswa**:
  - Perekaman status Hadir (H), Sakit (S), Izin (I), dan Alpa (A) dengan catatan keterangan.
  - Tombol cepat *Tandai Semua Hadir*.
  - Penyortiran & filter kehadiran lengkap (A-Z, Z-A, Tidak Hadir di atas, Hadir di atas).
  - Penghitungan statistik live real-time.

- **📝 Jurnal Agenda Mengajar Guru**:
  - Pencatatan agenda pembelajaran per minggu (Minggu 1 - 52) dan materi pokok.
  - Klasifikasi kurikulum: Intrakurikuler, Kokurikuler (Observasi, Native Speaker, Proyek), dan Ekstrakurikuler.
  - Riwayat linimasa agenda dengan fitur pencarian, filter mapel/guru, dan pengurutan tanggal/minggu.

- **📊 Rekapitulasi & Cetak Laporan PDF (Ink-Saver)**:
  - 3 template dokumen:
    1. Rekapitulasi Presensi Siswa Bulanan / Semester.
    2. Jurnal Mengajar Per Guru & Mapel.
    3. Jurnal Mengajar Seluruh Guru & Mapel.
  - Kop Surat Resmi Kementerian Pendidikan Dasar dan Menengah & SNT 10 Kupang.
  - Desain *Ink/Toner Saver*: Garis presisi tipis, latar putih murni tanpa blok warna berat.
  - Lembar pengesahan tanda tangan Guru Pengajar dan Kepala Sekolah.

- **🔄 Auto-Fetch & Sinkronisasi Real-time**:
  - Sinkronisasi dinamis membaca langsung kolom `class_name` dari lembar kerja Google Sheets `Students`.
  - Auto-refresh di latar belakang setiap 5 menit.
  - Tombol manual sinkronisasi (*Sync Button*) di setiap halaman.

- **🎓 Master Data Induk & Kurikulum**:
  - Manajemen akun pengguna, data siswa, dan master mata pelajaran/kegiatan.
  - Hak akses penambahan, pengeditan, dan penghapusan data untuk Admin dan Guru.

---

## 🚀 Panduan Instalasi & Menjalankan Aplikasi

### 1. Kloning Repositori
```bash
git clone https://github.com/AntonRedfield/SNT10K_Attentd-Journal.git
cd SNT10K_Attentd-Journal
```

### 2. Pasang Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment Variables
Salin berkas `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```
Lalu isi kredensial Google Service Account dan JWT Secret:
```env
GOOGLE_SHEET_ID="your_google_sheet_id"
GOOGLE_SERVICE_ACCOUNT_EMAIL="your_service_account@project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
JWT_SECRET="your_secure_jwt_secret"
```

### 4. Jalankan Server Pengembangan
```bash
npm run dev
```
Buka browser di [http://localhost:3000](http://localhost:3000).

---

## 🛠️ Teknologi yang Digunakan
- **Framework**: Next.js 15 (App Router) & React 19
- **Language**: TypeScript
- **Styling**: Vanilla CSS kustom (Glassmorphism, Responsif, Print CSS)
- **Database & Storage**: Google Sheets API v4 via Service Account
- **Authentication**: JWT (JSON Web Tokens) with jose & bcryptjs
- **Icons**: Vektor SVG Monoline kustom
