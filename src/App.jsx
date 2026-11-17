import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import Questions from './pages/Questions'
import QuestionForm from './pages/QuestionForm'
import ImportQuestions from './pages/ImportQuestions'
import Session from './pages/Session'
import Result from './pages/Result'
import Analysis from './pages/Analysis'

export default function App() {
  const [auth, setAuth] = useState(undefined) // undefined = masih memeriksa login

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setAuth(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (auth === undefined) return <p className="p-6 text-stone-500">Memuat…</p>
  if (!auth) return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/soal" element={<Questions />} />
          <Route path="/soal/baru" element={<QuestionForm />} />
          <Route path="/soal/impor" element={<ImportQuestions />} />
          <Route path="/soal/:id" element={<QuestionForm />} />
          <Route path="/sesi/:id" element={<Session />} />
          <Route path="/hasil/:id" element={<Result />} />
          <Route path="/analisis" element={<Analysis />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
