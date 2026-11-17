import { CATEGORIES, DURATION_SEC, QUESTION_COUNT } from './constants.js'

// Semua perhitungan analisis dari data mentah. Hanya sesi yang sudah selesai yang dihitung.
// "Salah" = skor < 5 (TIU/TWK: skor 0; TKP: belum skor penuh).
// Akurasi = poin yang didapat / poin maksimal (TIU/TWK = persen benar; TKP = skor rata-rata dari 5).
export function analyze({ sessions, answers, questions, options }) {
  const done = new Map(sessions.filter((s) => s.finished_at).map((s) => [s.id, s]))
  const qById = new Map(questions.map((q) => [q.id, q]))
  const oById = new Map(options.map((o) => [o.id, o]))
  const keyOf = new Map() // soal -> opsi kunci (TIU/TWK)
  for (const o of options) {
    if (o.score === 5 && qById.get(o.question_id)?.category !== 'TKP') keyOf.set(o.question_id, o)
  }

  const rows = answers
    .filter((a) => done.has(a.session_id) && qById.has(a.question_id))
    .map((a) => ({ ...a, q: qById.get(a.question_id), s: done.get(a.session_id) }))

  // Tren skor per subtes per sesi (20 sesi terakhir)
  const perSession = new Map()
  for (const r of rows) {
    const k = r.session_id + '|' + r.q.category
    const e = perSession.get(k) ?? { at: r.s.finished_at, category: r.q.category, score: 0, n: 0 }
    e.score += r.score
    e.n++
    perSession.set(k, e)
  }
  const trend = Object.fromEntries(
    CATEGORIES.map((c) => [
      c,
      [...perSession.values()]
        .filter((e) => e.category === c)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .slice(-20),
    ])
  )

  // Akurasi + waktu per topik (terlemah di urutan pertama)
  const byTopic = new Map()
  for (const r of rows) {
    const k = r.q.category + '|' + r.q.topic
    const e = byTopic.get(k) ?? { category: r.q.category, topic: r.q.topic, attempts: 0, points: 0, ms: 0, timed: 0 }
    e.attempts++
    e.points += r.score
    if (r.time_spent_ms > 0) { e.ms += r.time_spent_ms; e.timed++ }
    byTopic.set(k, e)
  }
  const topics = [...byTopic.values()]
    .map((e) => ({
      category: e.category,
      topic: e.topic,
      attempts: e.attempts,
      pct: e.points / (5 * e.attempts),
      avgSec: e.timed ? Math.round(e.ms / e.timed / 1000) : null,
    }))
    .sort((a, b) => a.pct - b.pct || b.attempts - a.attempts)

  // Soal paling sering salah
  const byQuestion = new Map()
  for (const r of rows) {
    const e = byQuestion.get(r.question_id) ??
      { id: r.question_id, category: r.q.category, topic: r.q.topic, body: r.q.body, attempts: 0, wrong: 0 }
    e.attempts++
    if (r.score < 5) e.wrong++
    byQuestion.set(r.question_id, e)
  }
  const hardest = [...byQuestion.values()]
    .filter((e) => e.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.attempts - a.wrong / a.attempts)
    .slice(0, 10)

  // Opsi pengecoh yang paling sering dipilih (TIU/TWK saja; TKP tidak punya jawaban salah mutlak)
  const byOption = new Map()
  for (const r of rows) {
    if (r.q.category === 'TKP' || !r.selected_option_id || r.score !== 0) continue
    const o = oById.get(r.selected_option_id)
    if (!o) continue
    const e = byOption.get(o.id) ??
      { optionId: o.id, optionBody: o.body, questionId: r.question_id, questionBody: r.q.body, category: r.q.category, count: 0 }
    e.count++
    byOption.set(o.id, e)
  }
  const distractors = [...byOption.values()]
    .map((e) => ({
      ...e,
      attempts: byQuestion.get(e.questionId).attempts,
      correctBody: keyOf.get(e.questionId)?.body ?? null,
    }))
    .sort((a, b) => b.count - a.count || b.count / b.attempts - a.count / a.attempts)
    .slice(0, 10)

  // Rata-rata waktu per soal per subtes dibanding jatah waktu (durasi / jumlah soal)
  const time = {}
  for (const c of CATEGORIES) {
    const xs = rows.filter((r) => r.q.category === c && r.time_spent_ms > 0)
    time[c] = {
      n: xs.length,
      avgSec: xs.length ? Math.round(xs.reduce((a, r) => a + r.time_spent_ms, 0) / xs.length / 1000) : null,
      budgetSec: Math.round(DURATION_SEC[c] / QUESTION_COUNT[c]),
    }
  }

  return { sessionsCount: done.size, trend, topics, hardest, distractors, time }
}
