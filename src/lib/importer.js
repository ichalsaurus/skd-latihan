// Membaca file Excel/CSV menjadi daftar soal siap simpan.
// Format: baris pertama = header, satu baris berikutnya = satu soal.

const ALIAS = {
  kategori: 'category', category: 'category', subtes: 'category',
  topik: 'topic', topic: 'topic',
  subtopik: 'subtopic', subtopic: 'subtopic',
  soal: 'body', pertanyaan: 'body', teks: 'body', body: 'body',
  kunci: 'key', jawaban: 'key', skor: 'key', key: 'key',
  pembahasan: 'explanation', explanation: 'explanation',
}
const REQUIRED = ['category', 'topic', 'body', 'o0', 'o1', 'o2', 'o3', 'o4', 'key']
const LABEL = {
  category: 'kategori', topic: 'topik', body: 'soal', key: 'kunci',
  o0: 'opsi1', o1: 'opsi2', o2: 'opsi3', o3: 'opsi4', o4: 'opsi5',
}

export const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function mapHeader(h) {
  const k = String(h).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (ALIAS[k]) return ALIAS[k]
  const m = k.match(/^(?:opsi)?([a-e1-5])$/)
  if (!m) return null
  return 'o' + ('abcde'.includes(m[1]) ? 'abcde'.indexOf(m[1]) : Number(m[1]) - 1)
}

// CSV: mendukung tanda kutip, baris baru di dalam sel, dan pemisah , ; atau tab
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/, 1)[0]
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export async function readRows(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text())
  const XLSX = await import('xlsx') // dimuat hanya saat halaman impor dipakai
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
}

function parseRow(r, col, rowNum) {
  const get = (k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim())
  const fail = (error) => ({ rowNum, error })
  const category = get('category').toUpperCase()
  const topic = get('topic')
  const body = get('body')
  const texts = [0, 1, 2, 3, 4].map((i) => get('o' + i))

  if (!['TIU', 'TWK', 'TKP'].includes(category)) return fail('kategori harus TIU, TWK, atau TKP')
  if (!topic) return fail('topik kosong')
  if (!body) return fail('teks soal kosong')
  const empty = texts.findIndex((t) => !t)
  if (empty >= 0) return fail(`opsi${empty + 1} kosong`)

  const key = get('key')
  let scores
  if (category === 'TKP') {
    const parts = key.split(/[\s,;/]+/).filter(Boolean)
    scores = parts.map(Number)
    if (parts.length !== 5 || scores.some((n) => !Number.isInteger(n) || n < 1 || n > 5))
      return fail('kunci TKP harus 5 skor 1-5, contoh 1,3,5,4,2')
  } else {
    const k = key.toUpperCase()
    const idx = /^[A-E]$/.test(k) ? 'ABCDE'.indexOf(k) : /^[1-5]$/.test(k) ? Number(k) - 1 : -1
    if (idx < 0) return fail('kunci harus 1-5 atau A-E')
    scores = texts.map((_, i) => (i === idx ? 5 : 0))
  }

  return {
    rowNum, body, category,
    q: {
      p_id: null,
      p_category: category,
      p_topic: topic,
      p_subtopic: get('subtopic'),
      p_body: body,
      p_explanation: get('explanation'),
      p_options: texts.map((t, i) => ({ slot: i + 1, body: t, score: scores[i] })),
    },
  }
}

// rows = array of arrays (baris 1 = header). Mengembalikan [{rowNum, q} atau {rowNum, error}]
export function buildRows(rows) {
  const col = {}
  ;(rows[0] ?? []).forEach((h, i) => {
    const k = mapHeader(h)
    if (k && col[k] === undefined) col[k] = i
  })
  const missing = REQUIRED.filter((k) => col[k] === undefined)
  if (missing.length) throw new Error('Kolom tidak ditemukan: ' + missing.map((k) => LABEL[k]).join(', '))
  return rows
    .slice(1)
    .map((r, i) => ({ r, rowNum: i + 2 }))
    .filter(({ r }) => r.some((c) => String(c).trim() !== ''))
    .map(({ r, rowNum }) => parseRow(r, col, rowNum))
}

export async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const rows = [
    ['kategori', 'topik', 'subtopik', 'soal', 'opsi1', 'opsi2', 'opsi3', 'opsi4', 'opsi5', 'kunci', 'pembahasan'],
    ['TIU', 'Numerik', 'Deret angka', '2, 4, 8, 16, ...', '24', '30', '32', '36', '40', '3', 'Setiap angka dikali 2.'],
    ['TKP', 'Pelayanan publik', '', 'Seorang warga marah di loket karena antrean lama. Sikap Anda?',
      'Membalas dengan nada tinggi', 'Menyuruhnya menunggu', 'Mendengarkan, lalu menjelaskan prosesnya',
      'Memanggil atasan', 'Mengabaikannya', '1,3,5,4,2', ''],
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Soal')
  XLSX.writeFile(wb, 'template-impor-soal.xlsx')
}
