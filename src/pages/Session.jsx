import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES, LETTERS } from '../lib/constants'
import { btn, btn2 } from '../lib/ui'
import Rich from '../components/Rich'

const clock = (s) => {
  const t = Math.max(0, s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export default function Session() {
  const { id } = useParams()
  const nav = useNavigate()
  const [items, setItems] = useState(null)
  const [cur, setCur] = useState(0)
  const [left, setLeft] = useState(null) // sisa detik; null = sesi tanpa timer
  const [err, setErr] = useState('')

  // Semua ini di ref supaya aman dipakai dari timer/event listener tanpa data basi.
  const t0 = useRef(Date.now()) // kapan soal aktif mulai dilihat
  const spent = useRef({}) // total ms per baris jawaban
  const live = useRef({})
  const pending = useRef(new Set()) // penyimpanan yang belum selesai
  const deadline = useRef(null) // batas waktu (ms epoch), disinkronkan dari jam server
  const finishing = useRef(false)
  live.current = { items, cur }

  // Jalankan penyimpanan dan catat, supaya saat selesai kita menunggu semuanya masuk dulu.
  function save(builder) {
    const p = Promise.resolve(builder)
    pending.current.add(p)
    p.finally(() => pending.current.delete(p))
    return p
  }

  function flush() {
    const { items, cur } = live.current
    if (!items || finishing.current) return
    const now = Date.now()
    const add = now - t0.current
    t0.current = now
    const it = items[cur]
    const total = (spent.current[it.id] ?? it.time) + add
    spent.current[it.id] = total
    save(supabase.from('session_answers').update({ time_spent_ms: Math.round(total) }).eq('id', it.id))
  }

  async function sync() {
    const { data } = await supabase.rpc('session_remaining', { p_id: id })
    if (data != null) deadline.current = Date.now() + data * 1000
  }

  async function finish(auto = false) {
    if (finishing.current) return
    if (!auto) {
      const blank = live.current.items.filter((x) => !x.selected).length
      if (blank && !confirm(`${blank} soal belum dijawab. Selesaikan sesi?`)) return
    }
    flush()
    finishing.current = true
    await Promise.all([...pending.current])
    const { error } = await supabase.rpc('finish_session', { p_id: id })
    if (error) {
      finishing.current = false
      return setErr('Gagal menyelesaikan sesi. Periksa koneksi, mencoba lagi…')
    }
    nav(`/hasil/${id}`, { replace: true })
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('sessions').select('finished_at').eq('id', id).single(),
      supabase
        .from('session_answers')
        .select('id, seq, option_order, selected_option_id, score, flagged, time_spent_ms, questions(category, topic, body, question_options(id, body, score))')
        .eq('session_id', id)
        .order('seq'),
    ]).then(async ([s, a]) => {
      if (!alive) return
      if (s.error || a.error) return setErr('Sesi tidak ditemukan atau gagal dimuat.')
      if (s.data.finished_at) return nav(`/hasil/${id}`, { replace: true })
      await sync()
      if (!alive) return
      const list = a.data.map((r) => {
        const byId = Object.fromEntries(r.questions.question_options.map((o) => [o.id, o]))
        return {
          id: r.id,
          category: r.questions.category,
          topic: r.questions.topic,
          body: r.questions.body,
          options: r.option_order.map((oid) => byId[oid]).filter(Boolean),
          selected: r.selected_option_id,
          score: r.score,
          flagged: r.flagged,
          time: r.time_spent_ms,
        }
      })
      t0.current = Date.now()
      setItems(list)
      setCur(Math.max(0, list.findIndex((x) => !x.selected)))
    })
    return () => { alive = false }
  }, [id])

  // Timer: hitung mundur dari batas waktu server; habis = otomatis selesai.
  const ready = !!items
  useEffect(() => {
    if (!ready || deadline.current == null) return
    const tick = () => {
      const s = Math.ceil((deadline.current - Date.now()) / 1000)
      setLeft(s)
      if (s <= 0) finish(true)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [ready])

  // Saat tab disembunyikan: simpan waktu soal, jangan hitung waktu di luar tab; saat kembali: sinkron jam server.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) flush()
      else {
        t0.current = Date.now()
        sync()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      flush()
    }
  }, [])

  const patch = (i, p) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)))

  function go(n) {
    flush()
    setCur(n)
    window.scrollTo(0, 0)
  }

  function choose(optId) {
    const it = items[cur]
    const next = it.selected === optId ? null : optId // ketuk lagi = batalkan pilihan
    patch(cur, { selected: next, score: next ? it.options.find((o) => o.id === next).score : 0 })
    save(supabase.from('session_answers').update({ selected_option_id: next }).eq('id', it.id))
      .then(({ error }) => error && setErr('Jawaban gagal tersimpan. Periksa koneksi.'))
  }

  function toggleFlag() {
    const it = items[cur]
    patch(cur, { flagged: !it.flagged })
    save(supabase.from('session_answers').update({ flagged: !it.flagged }).eq('id', it.id))
  }

  if (err && !items) return <p className="text-red-700">{err}</p>
  if (!items) return <p className="text-stone-500">Memuat…</p>

  const groups = CATEGORIES.map((c) => ({
    c,
    idx: items.map((x, i) => (x.category === c ? i : -1)).filter((i) => i >= 0),
  })).filter((g) => g.idx.length)

  const it = items[cur]
  const grp = groups.find((g) => g.idx.includes(cur))
  const answered = items.filter((x) => x.selected).length
  const cell = (x, i) => {
    const base = 'h-9 rounded-md border text-sm font-medium'
    if (i === cur) return `${base} border-stone-900 bg-stone-900 text-white`
    if (x.flagged) return `${base} border-amber-400 bg-amber-100`
    if (x.selected) return `${base} border-teal-300 bg-teal-100`
    return `${base} border-stone-300 bg-white`
  }
  const timeTone = left <= 60 ? 'text-red-700' : left <= 300 ? 'text-amber-700' : 'text-stone-900'

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">{it.category}, soal {grp.idx.indexOf(cur) + 1} dari {grp.idx.length}</div>
        <div className="text-sm text-stone-500">{it.topic}</div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <Rich text={it.body} />
      </div>

      <div className="space-y-2">
        {it.options.map((o, k) => {
          const on = it.selected === o.id
          return (
            <button key={o.id} onClick={() => choose(o.id)}
              className={`flex w-full gap-3 rounded-lg border p-3 text-left ${on ? 'border-teal-700 bg-teal-50' : 'border-stone-300 bg-white'}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${on ? 'bg-teal-700 text-white' : 'bg-stone-100'}`}>
                {LETTERS[k]}
              </span>
              <Rich text={o.body} className="pt-0.5" />
            </button>
          )
        })}
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}

      <details className="rounded-lg border border-stone-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">Daftar soal ({answered} dari {items.length} terjawab)</summary>
        <div className="mt-3 space-y-3">
          {groups.map((g) => (
            <div key={g.c}>
              <div className="mb-1 text-sm text-stone-500">{g.c}</div>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
                {g.idx.map((i, k) => (
                  <button key={i} onClick={() => go(i)} className={cell(items[i], i)}>{k + 1}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="text-xs text-stone-500">Kuning = ragu-ragu, hijau = sudah dijawab.</div>
          <button className={`${btn2} w-full`} onClick={() => finish()}>Selesaikan sesi</button>
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-2xl space-y-2 p-3">
          {left !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Sisa waktu</span>
              <span className={`font-semibold tabular-nums ${timeTone}`}>{clock(left)}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button className={btn2} disabled={cur === 0} onClick={() => go(cur - 1)}>Sebelumnya</button>
            <button onClick={toggleFlag}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium ${it.flagged ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-stone-300 bg-white text-stone-700'}`}>
              {it.flagged ? 'Ragu-ragu (dicentang)' : 'Tandai ragu-ragu'}
            </button>
            {cur < items.length - 1
              ? <button className={btn} onClick={() => go(cur + 1)}>Berikutnya</button>
              : <button className={btn} onClick={() => finish()}>Selesai</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
