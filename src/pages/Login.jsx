import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { btn, input } from '../lib/ui'

// Terjemahkan error Supabase yang umum, sisanya tampilkan apa adanya.
function pesanError(error) {
  const m = error.message || ''
  if (/invalid login credentials/i.test(m)) return 'Email atau password salah.'
  if (/email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek inbox, atau aktifkan Auto Confirm di Supabase.'
  if (/failed to fetch|network/i.test(m)) return 'Tidak bisa menghubungi server Supabase. Cek .env / koneksi internet.'
  return m || 'Gagal masuk.'
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(pesanError(error))
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 p-6">
      <h1 className="mb-2 text-2xl font-bold">Latihan SKD</h1>
      <input className={input} type="email" autoComplete="email" placeholder="Email" required
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={input} type="password" autoComplete="current-password" placeholder="Password" required
        value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <button className={btn} disabled={busy}>{busy ? 'Masuk…' : 'Masuk'}</button>
    </form>
  )
}
