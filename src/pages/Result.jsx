import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES, LETTERS, MODES, QUESTION_COUNT, THRESHOLD_DEFAULT } from '../lib/constants'
import { btn, btn2 } from '../lib/ui'
import Rich from '../components/Rich'

const dur = (ms) => {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} mnt ${s % 60} dtk` : `${s} dtk`
}
// TIU/TWK: perlu ditinjau kalau tidak benar. TKP: kalau skornya belum 5.
const needsReview = (x) => x.score !== 5

export default function Result() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [onlyReview, setOnlyReview] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('sessions').select('mode, started_at, finished_at, ends_at').eq('id', id).single(),
      supabase
        .from('session_answers')
        .select('seq, option_order, selected_option_id, score, flagged, time_spent_ms, questions(category, topic, body, explanation, question_options(id, body, score))')
        .eq('session_id', id)
        .order('seq'),
      supabase.from('settings').select('threshold_twk, threshold_tiu, threshold_tkp').maybeSingle(),
    ]).then(([s, a, t]) => {
      if (!alive) return
      if (s.error || a.error) return setErr('Hasil tidak ditemukan.')
      if (!s.data.finished_at) return nav(`/sesi/${id}`, { replace: true })
      const th = {
        TWK: t.data?.threshold_twk ?? THRESHOLD_DEFAULT.TWK,
        TIU: t.data?.threshold_tiu ?? THRESHOLD_DEFAULT.TIU,
        TKP: t.data?.threshold_tkp ?? THRESHOLD_DEFAULT.TKP,
      }
      const counter = {}
      const items = a.data.map((r) => {
        const q = r.questions
        const byId = Object.fromEntries(q.question_options.map((o) => [o.id, o]))
        counter[q.category] = (counter[q.category] ?? 0) + 1
        return {
          key: r.seq,
          num: counter[q.category],
          category: q.category,
          topic: q.topic,
          body: q.body,
          explanation: q.explanation,
          options: r.option_order.map((oid) => byId[oid]).filter(Boolean),
          selected: r.selected_option_id,
          score: r.score,
          flagged: r.flagged,
          time: r.time_spent_ms,
        }
      })
      setData({ s: s.data, items, th })
    })
    return () => { alive = false }
  }, [id])

  if (err) return <p className="text-red-700">{err}</p>
  if (!data) return <p className="text-stone-500">Memuat…</p>

  const { s, items, th } = data
  const groups = CATEGORIES.map((c) => {
    const xs = items.filter((x) => x.category === c)
    if (!xs.length) return null
    const score = xs.reduce((a, x) => a + x.score, 0)
    return {
      c, n: xs.length, score, max: xs.length * 5, th: th[c],
      diff: score - th[c], pass: score >= th[c],
      answered: xs.filter((x) => x.selected).length,
      correct: xs.filter((x) => x.score === 5).length,
    }
  }).filter(Boolean)

  const full = groups.length === CATEGORIES.length
  const allPass = full && groups.every((g) => g.pass)
  const timedOut = s.ends_at && Date.parse(s.finished_at) >= Date.parse(s.ends_at) - 1000
  const minutes = Math.max(1, Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000))
  const shown = items.filter((x) => !onlyReview || needsReview(x))
  const modeName = MODES.find((m) => m.id === s.mode)?.label ?? s.mode

  const chip = (on) =>
    `rounded-full border px-3 py-1 text-sm ${on ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white'}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Hasil sesi</h1>
        <p className="text-sm text-stone-500">
          {modeName}, {minutes} menit{timedOut ? ', selesai karena waktu habis' : ''}
        </p>
      </div>

      {full ? (
        <div className={`rounded-lg border p-4 ${allPass ? 'border-teal-700 bg-teal-50' : 'border-red-300 bg-red-50'}`}>
          <div className={`text-lg font-bold ${allPass ? 'text-teal-800' : 'text-red-800'}`}>
            {allPass ? 'Lulus' : 'Belum lulus'}
          </div>
          <div className="text-sm">
            {allPass
              ? 'Ketiga subtes memenuhi ambang batas.'
              : `Belum memenuhi ambang batas: ${groups.filter((g) => !g.pass).map((g) => g.c).join(', ')}.`}
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-500">
          Status lulus keseluruhan hanya ditampilkan untuk sesi yang berisi ketiga subtes.
        </p>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.c} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{g.c}</div>
                <div className="text-sm text-stone-500">
                  {g.answered} dari {g.n} soal dijawab{g.c !== 'TKP' ? `, ${g.correct} benar` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">
                  {g.score}<span className="text-sm font-normal text-stone-400"> dari {g.max}</span>
                </div>
                <div className={`text-sm font-medium ${g.pass ? 'text-teal-800' : 'text-red-700'}`}>
                  {g.pass ? 'Lulus' : 'Belum lulus'}
                </div>
              </div>
            </div>
            <div className="mt-2 text-sm text-stone-600">
              Ambang batas {g.th}.{' '}
              {g.diff === 0 ? 'Tepat di ambang batas.' : g.diff > 0 ? `Lebih ${g.diff} poin.` : `Kurang ${-g.diff} poin.`}
            </div>
            {g.n < QUESTION_COUNT[g.c] && (
              <div className="mt-1 text-xs text-stone-500">
                Soal hanya {g.n} dari {QUESTION_COUNT[g.c]} karena bank soal kurang, jadi skor maksimal {g.max}.
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Pembahasan</h2>
          <div className="flex gap-2">
            <button className={chip(!onlyReview)} onClick={() => setOnlyReview(false)}>Semua</button>
            <button className={chip(onlyReview)} onClick={() => setOnlyReview(true)}>Perlu ditinjau</button>
          </div>
        </div>
        {shown.length === 0 && <p className="text-stone-500">Semua jawabanmu sudah benar.</p>}

        {shown.map((x) => {
          const tkp = x.category === 'TKP'
          const status = !x.selected ? 'Kosong' : tkp ? `Skor ${x.score} dari 5` : x.score === 5 ? 'Benar' : 'Salah'
          const good = tkp ? x.score === 5 : x.score === 5
          return (
            <div key={x.key} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">{x.category}, soal {x.num}</span>
                <span className={`font-medium ${good ? 'text-teal-800' : 'text-red-700'}`}>{status}</span>
              </div>
              <div className="mb-1 text-xs text-stone-500">
                {x.topic}{x.flagged ? ', kamu tandai ragu-ragu' : ''}, waktu {dur(x.time)}
              </div>
              <Rich text={x.body} />

              <div className="mt-3 space-y-2">
                {x.options.map((o, k) => {
                  const mine = x.selected === o.id
                  const key = !tkp && o.score === 5
                  const tone = key
                    ? 'border-teal-700 bg-teal-50'
                    : mine && !tkp
                      ? 'border-red-400 bg-red-50'
                      : mine
                        ? 'border-teal-700 bg-teal-50'
                        : 'border-stone-200 bg-white'
                  return (
                    <div key={o.id} className={`flex gap-3 rounded-lg border p-3 text-sm ${tone}`}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold">
                        {LETTERS[k]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Rich text={o.body} />
                        <div className="mt-1 text-xs font-medium text-stone-600">
                          {[mine && 'Jawabanmu', key && 'Jawaban benar', tkp && `Skor ${o.score}`].filter(Boolean).join(', ')}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 rounded-lg bg-stone-100 p-3 text-sm">
                <div className="mb-1 font-medium">Pembahasan</div>
                {x.explanation ? <Rich text={x.explanation} /> : <span className="text-stone-500">Belum ada pembahasan untuk soal ini.</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Link to="/" className={`${btn} flex-1 text-center`}>Latihan lagi</Link>
        <Link to="/soal" className={`${btn2} flex-1 text-center`}>Bank soal</Link>
      </div>
    </div>
  )
}
