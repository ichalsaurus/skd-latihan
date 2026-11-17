import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES, QUESTION_COUNT, THRESHOLD_DEFAULT } from '../lib/constants'
import { analyze } from '../lib/analytics'
import { btn2 } from '../lib/ui'
import Rich from '../components/Rich'
import TrendChart from '../components/TrendChart'

// Ambil semua baris (API membatasi 1000 baris per permintaan)
async function fetchAll(make) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const Section = ({ title, note, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-bold">{title}</h2>
    {note && <p className="text-sm text-stone-500">{note}</p>}
    {children}
  </section>
)

export default function Analysis() {
  const [res, setRes] = useState(null)
  const [th, setTh] = useState(THRESHOLD_DEFAULT)
  const [err, setErr] = useState('')
  const [allTopics, setAllTopics] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [sessions, answers, questions, options, st] = await Promise.all([
          fetchAll((a, b) => supabase.from('sessions').select('id, finished_at').order('id').range(a, b)),
          fetchAll((a, b) => supabase.from('session_answers').select('session_id, question_id, selected_option_id, score, time_spent_ms').order('id').range(a, b)),
          fetchAll((a, b) => supabase.from('questions').select('id, category, topic, body').order('id').range(a, b)),
          fetchAll((a, b) => supabase.from('question_options').select('id, question_id, body, score').order('id').range(a, b)),
          supabase.from('settings').select('threshold_twk, threshold_tiu, threshold_tkp').maybeSingle(),
        ])
        if (!alive) return
        if (st.data) setTh({ TWK: st.data.threshold_twk, TIU: st.data.threshold_tiu, TKP: st.data.threshold_tkp })
        setRes(analyze({ sessions, answers, questions, options }))
      } catch (e) {
        if (alive) setErr('Gagal memuat data analisis: ' + e.message)
      }
    })()
    return () => { alive = false }
  }, [])

  if (err) return <p className="text-red-700">{err}</p>
  if (!res) return <p className="text-stone-500">Memuat…</p>

  if (res.sessionsCount === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">Analisis</h1>
        <p className="text-stone-600">Belum ada sesi yang selesai. Kerjakan dan selesaikan satu sesi dulu, nanti analisisnya muncul di sini.</p>
        <Link to="/" className={`${btn2} inline-block`}>Mulai latihan</Link>
      </div>
    )
  }

  const shownTopics = allTopics ? res.topics : res.topics.slice(0, 12)
  const snippet = (s) => (s.length > 140 ? s.slice(0, 140) + '…' : s)

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Analisis</h1>

      <Section title="Tren skor" note="Garis merah putus-putus adalah ambang batas. Hingga 20 sesi terakhir per subtes.">
        {CATEGORIES.map((c) => {
          const pts = res.trend[c]
          if (!pts.length) return null
          const last = pts[pts.length - 1]
          const recent = pts.slice(-5)
          const avg = Math.round(recent.reduce((a, p) => a + p.score, 0) / recent.length)
          return (
            <div key={c} className="rounded-lg border border-stone-200 bg-white p-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-semibold">{c}</span>
                <span className="text-sm text-stone-600">
                  Terakhir {last.score}, rata-rata {recent.length} sesi terakhir {avg}
                </span>
              </div>
              <TrendChart points={pts} threshold={th[c]} top={QUESTION_COUNT[c] * 5}
                label={`Skor ${c} per sesi: ${pts.map((p) => p.score).join(', ')}. Ambang batas ${th[c]}.`} />
            </div>
          )
        })}
      </Section>

      <Section title="Akurasi per topik"
        note="Yang terlemah di atas. TIU dan TWK dihitung dari persen jawaban benar; TKP dari skor rata-rata terhadap skor maksimal.">
        <ul className="space-y-2">
          {shownTopics.map((t) => (
            <li key={t.category + t.topic} className="rounded-lg border border-stone-200 bg-white p-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium">
                  {t.topic} <span className="font-normal text-stone-500">({t.category})</span>
                </span>
                <span className="font-semibold tabular-nums">{Math.round(t.pct * 100)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-stone-100">
                <div className="h-2 rounded-full bg-teal-700" style={{ width: `${Math.round(t.pct * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-stone-500">
                {t.attempts} kali dikerjakan{t.avgSec != null ? `, rata-rata ${t.avgSec} dtk per soal` : ''}
              </div>
            </li>
          ))}
        </ul>
        {res.topics.length > 12 && (
          <button className={`${btn2} w-full`} onClick={() => setAllTopics(!allTopics)}>
            {allTopics ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${res.topics.length} topik)`}
          </button>
        )}
      </Section>

      <Section title="Soal paling sering salah"
        note="Untuk TKP, dihitung salah kalau skornya kurang dari 5. Soal yang dikosongkan ikut dihitung salah.">
        {res.hardest.length === 0 && <p className="text-stone-500">Belum ada soal yang salah. Mantap.</p>}
        <ul className="space-y-2">
          {res.hardest.map((h) => (
            <li key={h.id} className="rounded-lg border border-stone-200 bg-white p-3">
              <div className="flex justify-between gap-2 text-xs text-stone-500">
                <span>{h.category}, {h.topic}</span>
                <span className="font-medium text-red-700">Salah {h.wrong} dari {h.attempts} kali</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{snippet(h.body)}</p>
              <Link to={`/soal/${h.id}`} className="mt-1 inline-block text-sm text-teal-800 underline">Buka soal</Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Opsi pengecoh yang paling sering dipilih"
        note="Hanya TIU dan TWK, karena TKP tidak punya jawaban salah mutlak.">
        {res.distractors.length === 0 && <p className="text-stone-500">Belum ada jawaban salah yang tercatat.</p>}
        <ul className="space-y-2">
          {res.distractors.map((d) => (
            <li key={d.optionId} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
              <div className="flex justify-between gap-2 text-xs text-stone-500">
                <span>{d.category}</span>
                <span className="font-medium text-red-700">Dipilih {d.count} kali dari {d.attempts} pengerjaan</span>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-stone-600">{d.questionBody}</p>
              <div className="mt-2"><span className="font-medium">Pengecoh: </span><Rich text={d.optionBody} /></div>
              {d.correctBody && <div><span className="font-medium">Jawaban benar: </span><Rich text={d.correctBody} /></div>}
              <Link to={`/soal/${d.questionId}`} className="mt-1 inline-block text-teal-800 underline">Buka soal</Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Waktu per soal"
        note="Jatah = durasi subtes dibagi jumlah soal. Hanya soal yang sempat kamu buka yang dihitung.">
        <ul className="space-y-2">
          {CATEGORIES.map((c) => {
            const t = res.time[c]
            if (t.avgSec == null) return null
            const over = t.avgSec > t.budgetSec
            return (
              <li key={c} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3 text-sm">
                <div>
                  <div className="font-semibold">{c}</div>
                  <div className="text-xs text-stone-500">Jatah {t.budgetSec} dtk per soal, dari {t.n} soal</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums">{t.avgSec} dtk</div>
                  <div className={`text-xs font-medium ${over ? 'text-red-700' : 'text-teal-800'}`}>
                    {over ? `Lebih lambat ${t.avgSec - t.budgetSec} dtk dari jatah` : 'Dalam jatah waktu'}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}
