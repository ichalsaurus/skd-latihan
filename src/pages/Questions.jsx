import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import { btn, btn2 } from '../lib/ui'

export default function Questions() {
  const [cat, setCat] = useState('')
  const [limit, setLimit] = useState(50)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState('')

  async function load() {
    let q = supabase.from('questions').select('id, category, topic, subtopic, body', { count: 'exact' })
    if (cat) q = q.eq('category', cat)
    const { data, count, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) return setErr(error.message)
    setErr('')
    setRows(data)
    setTotal(count ?? 0)
  }
  useEffect(() => { load() }, [cat, limit])

  async function remove(id) {
    if (!confirm('Hapus soal ini? Riwayat jawaban untuk soal ini ikut terhapus.')) return
    const { error } = await supabase.from('questions').delete().eq('id', id)
    if (error) setErr(error.message)
    else load()
  }

  const chip = (on) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Bank soal ({total})</h1>
        <div className="flex gap-2">
          <Link to="/soal/impor" className={btn2}>Impor</Link>
          <Link to="/soal/baru" className={btn}>Tambah soal</Link>
        </div>
      </div>

      <div className="flex gap-2">
        {['', ...CATEGORIES].map((c) => (
          <button key={c} className={chip(cat === c)} onClick={() => { setCat(c); setLimit(50) }}>
            {c || 'Semua'}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}
      {!err && rows.length === 0 && <p className="text-stone-500">Belum ada soal. Tambah soal pertamamu.</p>}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="mb-1 text-xs text-stone-500">
              {r.category}, {r.topic}{r.subtopic ? ` / ${r.subtopic}` : ''}
            </div>
            <p className="line-clamp-2 whitespace-pre-wrap break-words">{r.body}</p>
            <div className="mt-2 flex gap-2">
              <Link to={`/soal/${r.id}`} className={`${btn2} px-3 py-1 text-sm`}>Edit</Link>
              <button onClick={() => remove(r.id)} className={`${btn2} px-3 py-1 text-sm text-red-700`}>Hapus</button>
            </div>
          </li>
        ))}
      </ul>

      {rows.length < total && (
        <button className={`${btn2} w-full`} onClick={() => setLimit(limit + 50)}>Muat lebih banyak</button>
      )}
    </div>
  )
}
