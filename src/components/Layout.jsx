import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const link = ({ isActive }) =>
  `rounded-lg px-2.5 py-2 text-sm font-medium ${isActive ? 'bg-teal-700 text-white' : 'text-stone-600'}`

export default function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-stone-200 bg-white px-3 py-2">
        <NavLink to="/" end className={link}>Latihan</NavLink>
        <NavLink to="/soal" className={link}>Bank soal</NavLink>
        <NavLink to="/analisis" className={link}>Analisis</NavLink>
        <button onClick={() => supabase.auth.signOut()} className="ml-auto px-2 py-2 text-sm text-stone-500">
          Keluar
        </button>
      </header>
      <main className="flex-1 p-4 pb-28">
        <Outlet />
      </main>
    </div>
  )
}
