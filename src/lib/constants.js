export const CATEGORIES = ['TIU', 'TWK', 'TKP']
export const LETTERS = ['A', 'B', 'C', 'D', 'E']

// Jumlah soal per sesi (dipakai kalau bank soal cukup; kalau kurang, pakai yang ada)
export const QUESTION_COUNT = { TIU: 35, TWK: 30, TKP: 45 }

// Urutan di mode Semua mengikuti urutan cats
export const MODES = [
  { id: 'TIU', label: 'TIU saja', cats: ['TIU'] },
  { id: 'TWK', label: 'TWK saja', cats: ['TWK'] },
  { id: 'TKP', label: 'TKP saja', cats: ['TKP'] },
  { id: 'ALL', label: 'Semua subtes', cats: ['TIU', 'TWK', 'TKP'] },
]

// Durasi per mode (detik). Mode Semua: 100 menit total, bebas pindah antar subtes.
export const DURATION_SEC = { TIU: 45 * 60, TWK: 15 * 60, TKP: 30 * 60, ALL: 100 * 60 }

// Cadangan kalau tabel settings kosong; nilai yang dipakai diambil dari tabel settings.
export const THRESHOLD_DEFAULT = { TWK: 65, TIU: 80, TKP: 166 }
