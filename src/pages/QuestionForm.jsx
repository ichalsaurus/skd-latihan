import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import { btn, btn2, input } from '../lib/ui'
import Rich from '../components/Rich'

const emptyOpts = () => Array.from({ length: 5 }, () => ({ body: '', score: '' }))

export default function QuestionForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const [category, setCategory] = useState('TIU')
  const [topic, setTopic] = useState('')
  const [subtopic, setSubtopic] = useState('')
  const [body, setBody] = useState('')
  const [explanation, setExplanation] = useState('')
  const [opts, setOpts] = useState(emptyOpts)
  const [correct, setCorrect] = useState(null) // indeks opsi benar (TIU/TWK)
  const [known, setKnown] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(!!id)

  useEffect(() => {
    supabase.from('questions').select('topic, subtopic').then(({ data }) => setKnown(data ?? []))
  }, [])

  useEffect(() => {
    if (!id) return
    supabase
      .from('questions')
      .select('*, question_options(slot, body, score)')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setMsg({ ok: false, text: 'Soal tidak ditemukan.' })
        } else {
          const o = [...data.question_options].sort((a, b) => a.slot - b.slot)
          const tkp = data.category === 'TKP'
          setCategory(data.category)
          setTopic(data.topic)
          setSubtopic(data.subtopic ?? '')
          setBody(data.body)
          setExplanation(data.explanation ?? '')
          setOpts(o.map((x) => ({ body: x.body, score: tkp ? String(x.score) : '' })))
          const idx = o.findIndex((x) => x.score === 5)
          setCorrect(tkp || idx < 0 ? null : idx)
        }
        setLoading(false)
      })
  }, [id])

  const topics = useMemo(() => [...new Set(known.map((k) => k.topic))].sort(), [known])
  const subs = useMemo(
    () => [...new Set(known.filter((k) => k.topic === topic.trim() && k.subtopic).map((k) => k.subtopic))].sort(),
    [known, topic]
  )

  const setOpt = (i, patch) => setOpts(opts.map((o, j) => (j === i ? { ...o, ...patch } : o)))

  function validate() {
    if (!topic.trim()) return 'Topik wajib diisi.'
    if (!body.trim()) return 'Teks soal wajib diisi.'
    if (opts.some((o) => !o.body.trim())) return 'Kelima opsi wajib diisi.'
    if (category === 'TKP') return opts.some((o) => !o.score) ? 'Beri skor 1-5 untuk setiap opsi.' : null
    return correct === null ? 'Tandai satu opsi sebagai jawaban benar.' : null
  }

  async function save(again) {
    const problem = validate()
    if (problem) return setMsg({ ok: false, text: problem })
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc('save_question', {
      p_id: id ?? null,
      p_category: category,
      p_topic: topic,
      p_subtopic: subtopic,
      p_body: body,
      p_explanation: explanation,
      p_options: opts.map((o, i) => ({
        slot: i + 1,
        body: o.body,
        score: category === 'TKP' ? Number(o.score) : i === correct ? 5 : 0,
      })),
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    if (again) {
      setBody('')
      setExplanation('')
      setOpts(emptyOpts())
      setCorrect(null)
      setMsg({ ok: true, text: 'Tersimpan. Silakan isi soal berikutnya.' })
      window.scrollTo(0, 0)
    } else {
      nav('/soal')
    }
  }

  if (loading) return <p className="text-stone-500">Memuat…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{id ? 'Edit soal' : 'Soal baru'}</h1>
        <Link to="/soal" className="px-2 py-2 text-sm text-stone-500">Batal</Link>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? 'text-teal-800' : 'text-red-700'}`}>{msg.text}</p>}

      <div className="flex gap-2">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`flex-1 rounded-lg border py-2 font-medium ${category === c ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white'}`}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input className={input} list="topics" placeholder="Topik" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <input className={input} list="subs" placeholder="Subtopik (opsional)" value={subtopic} onChange={(e) => setSubtopic(e.target.value)} />
      </div>
      <datalist id="topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
      <datalist id="subs">{subs.map((t) => <option key={t} value={t} />)}</datalist>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="body">Teks soal</label>
        <textarea id="body" rows={5} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="text-xs text-stone-500">
          Rumus: $...$ untuk sebaris, $$...$$ untuk satu blok. Tanda dolar biasa: \$
        </p>
        {body.includes('$') && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white p-3 text-sm">
            <Rich text={body} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">
          {category === 'TKP' ? 'Opsi dan skornya (1-5)' : 'Opsi, tandai satu yang benar'}
        </div>
        {opts.map((o, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
            <div className="flex items-center justify-between text-sm text-stone-600">
              <span>Opsi {i + 1}</span>
              {category === 'TKP' ? (
                <select aria-label={`Skor opsi ${i + 1}`} value={o.score}
                  onChange={(e) => setOpt(i, { score: e.target.value })}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1">
                  <option value="">Skor</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <label className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} />
                  Benar
                </label>
              )}
            </div>
            <textarea rows={2} aria-label={`Teks opsi ${i + 1}`} className={input} value={o.body}
              onChange={(e) => setOpt(i, { body: e.target.value })} />
            {o.body.includes('$') && <div className="text-sm"><Rich text={o.body} /></div>}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="exp">Pembahasan (opsional)</label>
        <textarea id="exp" rows={4} className={input} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <button className={`${btn} flex-1`} disabled={busy} onClick={() => save(false)}>
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
        {!id && (
          <button className={`${btn2} flex-1`} disabled={busy} onClick={() => save(true)}>
            Simpan dan tambah lagi
          </button>
        )}
      </div>
    </div>
  )
}
