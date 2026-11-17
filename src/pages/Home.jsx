import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES, DURATION_SEC, MODES, QUESTION_COUNT } from '../lib/constants'
import { shuffle } from '../lib/shuffle'
import { btn } from '../lib/ui'

// Ambil soal, acak urutan opsi tiap soal (Fisher-Yates), lalu simpan sesi + urutannya.
async function createSession(mode) {
  const items = []
  for (const cat of mode.cats) {
    const { data, error } = await supabase.rpc('pick_questions', {
      p_category: cat,
      p_limit: QUESTION_COUNT[cat],
    })
    if (error) throw error
    // urutan hasil pemilihan berbobot tidak boleh bocor ke urutan soal, jadi diacak lagi
    items.push(...shuffle(data.map((r) => r.id)).map((qid) => ({ question_id: qid })))
  }
  if (!items.length) throw new Error('Bank soal untuk mode ini masih kosong.')

  const { data: opts, error: e1 } = await supabase
    .from('question_options')
    .select('id, question_id')
    .in('question_id', items.map((i) => i.question_id))
  if (e1) throw e1

  const byQuestion = {}
  for (const o of opts) (byQuestion[o.question_id] ??= []).push(o.id)
  for (const it of items) it.option_order = shuffle(byQuestion[it.question_id])

  const { data: sid, error: e2 } = await supabase.rpc('create_session', {
    p_mode: mode.id,
    p_items: items,
    p_duration_sec: DURATION_SEC[mode.id],
  })
  if (e2) throw e2
  return sid
}

const modeLabel = (id) => MODES.find((m) => m.id === id)?.label ?? id
const when = (iso) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Home() {
  const nav = useNavigate()
  const [modeId, setModeId] = useState('TIU')
  const [bank, setBank] = useState(null)
  const [openSession, setOpenSession] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all(
      CATEGORIES.map((c) =>
        supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('category', c)
          .then((r) => [c, r.count ?? 0])
      )
    ).then((r) => setBank(Object.fromEntries(r)))

    supabase
      .from('sessions')
      .select('id, mode')
      .is('finished_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setOpenSession(data?.[0] ?? null))

    supabase
      .from('sessions')
      .select('id, mode, finished_at')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setHistory(data ?? []))
  }, [])

  const mode = MODES.find((m) => m.id === modeId)
  const available = (m) => (bank ? m.cats.reduce((n, c) => n + Math.min(bank[c], QUESTION_COUNT[c]), 0) : null)

  async function start() {
    setBusy(true)
    setErr('')
    try {
      nav(`/sesi/${await createSession(mode)}`)
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Latihan</h1>

      {openSession && (
        <Link to={`/sesi/${openSession.id}`}
          className="block rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm">
          Ada sesi {modeLabel(openSession.mode)} yang belum selesai. Lanjutkan.
        </Link>
      )}

      <div className="space-y-2">
        {MODES.map((m) => {
          const on = m.id === modeId
          return (
            <button key={m.id} onClick={() => setModeId(m.id)}
              className={`w-full rounded-lg border p-3 text-left ${on ? 'border-teal-700 bg-teal-50' : 'border-stone-300 bg-white'}`}>
              <div className="flex justify-between">
                <span className="font-medium">{m.label}</span>
                <span className="text-sm text-stone-500">{DURATION_SEC[m.id] / 60} menit</span>
              </div>
              {bank && (
                <div className="text-sm text-stone-500">
                  {available(m)} soal dari bank ({m.cats.map((c) => `${c} ${Math.min(bank[c], QUESTION_COUNT[c])} dari ${QUESTION_COUNT[c]}`).join(', ')})
                </div>
              )}
            </button>
          )
        })}
      </div>

      {err && <p className="text-sm text-red-700">{err}</p>}
      <button className={`${btn} w-full py-3`} onClick={start} disabled={busy || !available(mode)}>
        {busy ? 'Menyiapkan…' : 'Mulai latihan'}
      </button>
      {bank && !available(mode) && (
        <p className="text-sm text-stone-500">
          Bank soal untuk mode ini kosong. <Link to="/soal/baru" className="underline">Tambah soal</Link>
        </p>
      )}

      {history.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="font-semibold">Riwayat</h2>
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.id}>
                <Link to={`/hasil/${h.id}`}
                  className="flex justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                  <span>{modeLabel(h.mode)}</span>
                  <span className="text-stone-500">{when(h.finished_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
