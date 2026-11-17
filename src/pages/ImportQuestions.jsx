import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import { buildRows, downloadTemplate, norm, readRows } from '../lib/importer'
import { btn, btn2 } from '../lib/ui'

// Semua isi soal yang sudah ada, untuk melewati soal yang dobel
async function existingBodies() {
  const set = new Set()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('questions').select('body').order('id').range(from, from + 999)
    if (error) throw error
    data.forEach((r) => set.add(norm(r.body)))
    if (data.length < 1000) break
  }
  return set
}

export default function ImportQuestions() {
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState(null) // { valid, bad, dup }
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  async function pick(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setErr('')
    setPlan(null)
    setResult(null)
    try {
      const rows = await readRows(file)
      if (rows.length < 2) throw new Error('File kosong atau hanya berisi header.')
      const parsed = buildRows(rows)
      const have = await existingBodies()
      const valid = [], bad = []
      let dup = 0
      for (const p of parsed) {
        if (p.error) { bad.push(p); continue }
        const k = norm(p.body)
        if (have.has(k)) { dup++; continue }
        have.add(k)
        valid.push(p)
      }
      setPlan({ valid, bad, dup })
    } catch (e2) {
      setErr(e2.message)
    }
    setBusy(false)
  }

  async function save() {
    setBusy(true)
    setProgress(0)
    const list = plan.valid
    let next = 0, ok = 0
    const fails = []
    const worker = async () => {
      while (next < list.length) {
        const it = list[next++]
        const { error } = await supabase.rpc('save_question', it.q)
        if (error) fails.push({ rowNum: it.rowNum, error: error.message })
        else ok++
        setProgress(ok + fails.length)
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    setResult({ ok, fails })
    setPlan(null)
    setProgress(null)
    setBusy(false)
  }

  const counts = plan && CATEGORIES.map((c) => [c, plan.valid.filter((p) => p.category === c).length]).filter(([, n]) => n)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Impor soal</h1>
        <Link to="/soal" className="px-2 py-2 text-sm text-stone-500">Kembali</Link>
      </div>

      <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
        <p>Unggah file Excel (.xlsx) atau CSV. Satu baris = satu soal, baris pertama adalah header.</p>
        <p className="text-stone-600">
          Kolom wajib: kategori, topik, soal, opsi1 sampai opsi5, kunci. Kolom opsional: subtopik, pembahasan.
        </p>
        <p className="text-stone-600">
          Kunci TIU/TWK: nomor opsi yang benar (1-5) atau huruf A-E menurut urutan kolom opsi. Kunci TKP: lima skor sesuai urutan opsi, contoh 1,3,5,4,2.
        </p>
        <button className={`${btn2} px-3 py-1`} onClick={downloadTemplate}>Unduh template (.xlsx)</button>
      </div>

      <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={pick}
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-4 file:py-2 file:font-medium file:text-white" />

      {busy && progress === null && <p className="text-sm text-stone-500">Memeriksa file…</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}

      {plan && (
        <div className="space-y-3">
          <div className="space-y-1 rounded-lg border border-stone-200 bg-white p-3 text-sm">
            <div className="font-medium">
              {plan.valid.length} soal siap disimpan{counts.length > 0 && ` (${counts.map(([c, n]) => `${c} ${n}`).join(', ')})`}
            </div>
            {plan.dup > 0 && <div className="text-stone-500">{plan.dup} soal sudah ada di bank atau dobel di file, dilewati.</div>}
            {plan.bad.length > 0 && <div className="text-red-700">{plan.bad.length} baris bermasalah dan tidak ikut disimpan:</div>}
            <ul className="text-red-700">
              {plan.bad.slice(0, 30).map((b) => <li key={b.rowNum}>Baris {b.rowNum}: {b.error}</li>)}
              {plan.bad.length > 30 && <li>dan {plan.bad.length - 30} baris lain.</li>}
            </ul>
          </div>
          <button className={`${btn} w-full py-3`} disabled={busy || !plan.valid.length} onClick={save}>
            {busy ? `Menyimpan ${progress} dari ${plan.valid.length}…` : `Simpan ${plan.valid.length} soal`}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 text-sm">
          <div className="font-medium text-teal-800">{result.ok} soal tersimpan.</div>
          {result.fails.length > 0 && (
            <>
              <div className="text-red-700">{result.fails.length} gagal. Perbaiki lalu unggah file yang sama lagi, soal yang sudah tersimpan akan dilewati.</div>
              <ul className="text-red-700">
                {result.fails.slice(0, 30).map((f) => <li key={f.rowNum}>Baris {f.rowNum}: {f.error}</li>)}
              </ul>
            </>
          )}
          <Link to="/soal" className={`${btn} block text-center`}>Lihat bank soal</Link>
        </div>
      )}
    </div>
  )
}
