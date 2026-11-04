import { useState } from 'react'
import { Lock, User, LogIn, Loader2, TriangleAlert } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { FONT, LOGO_URL, NARANJA, NEGRO } from '../utils/formatters'

const USUARIOS_RESPALDO = [
  {
    id: 'local-admin',
    username: 'admin',
    password_hash: 'admin123',
    nombre_completo: 'Administrador General',
    rol: 'Administrador',
    activo: true,
  },
  {
    id: 'local-administracion',
    username: 'administracion',
    password_hash: 'admin123',
    nombre_completo: 'Oficina Administración',
    rol: 'Administracion',
    activo: true,
  },
  {
    id: 'local-galpon',
    username: 'galpon',
    password_hash: 'galpon123',
    nombre_completo: 'Encargado de Galpón',
    rol: 'Galpon',
    activo: true,
  },
  {
    id: 'local-patio',
    username: 'patio',
    password_hash: 'patio123',
    nombre_completo: 'Encargado de Galpón',
    rol: 'Galpon',
    activo: true,
  },
]

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const iniciarSesion = async (e) => {
    e.preventDefault()
    const u = username.trim()
    const p = password.trim()
    if (!u || !p) {
      setError('Ingresa tu usuario y contraseña.')
      return
    }
    setCargando(true)
    setError(null)

    const { data, error: dbErr } = await supabase
      .from('usuarios_erp')
      .select('id, username, password_hash, nombre_completo, rol, activo')
      .ilike('username', u)
      .limit(1)
      .maybeSingle()

    setCargando(false)

    // Si existe en Supabase y la contraseña coincide
    if (!dbErr && data) {
      const hashDB = String(data.password_hash ?? '').trim()
      if (hashDB === p) {
        if (data.activo === false) {
          setError('Esta cuenta de usuario se encuentra inactiva. Contacta al Administrador.')
          return
        }
        onLogin({
          id: data.id,
          username: data.username,
          nombre_completo: data.nombre_completo || data.username,
          rol: data.rol,
          activo: data.activo,
        })
        return
      }
    }

    // Validación de respaldo para los 3 roles base
    const respaldo = USUARIOS_RESPALDO.find(
      (usr) => usr.username.toLowerCase() === u.toLowerCase() && usr.password_hash === p,
    )
    if (respaldo) {
      onLogin(respaldo)
      return
    }

    if (dbErr && !data) {
      setError(`Error al consultar usuarios_erp: ${dbErr.message}`)
      return
    }

    setError('Usuario o contraseña incorrectos.')
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{
        fontFamily: FONT,
        backgroundColor: NEGRO,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <div
        className="w-full max-w-md rounded-md border border-neutral-800 bg-[#161616] p-7 shadow-2xl"
        style={{ borderTop: `5px solid ${NARANJA}` }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="flex w-full items-center justify-center rounded-md border border-neutral-800 bg-black p-4">
            <img
              src={LOGO_URL}
              alt="ServiAlquiler DV, C.A."
              className="h-24 w-auto max-w-[240px] object-contain"
            />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-white">
            SERVI<span style={{ color: NARANJA }}>ALQUILER</span> DV, C.A.
          </h1>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
            SISTEMA DE GESTIÓN DE EQUIPOS Y GALPÓN
          </p>
        </div>

        <form onSubmit={iniciarSesion} className="mt-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-950/50 p-3 text-xs text-red-200">
              <TriangleAlert size={16} className="shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-neutral-300">
              Nombre de Usuario
            </label>
            <div className="flex items-center gap-2.5 rounded-md border border-neutral-700 bg-[#0d0d0d] px-3.5 py-2.5 focus-within:border-[#FF5500]">
              <User size={16} color={NARANJA} />
              <input
                type="text"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. admin, administracion o galpon"
                className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-neutral-300">
              Contraseña
            </label>
            <div className="flex items-center gap-2.5 rounded-md border border-neutral-700 bg-[#0d0d0d] px-3.5 py-2.5 focus-within:border-[#FF5500]">
              <Lock size={16} color={NARANJA} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="flex w-full items-center justify-center gap-2 rounded-md py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-opacity hover:opacity-95 disabled:opacity-50"
            style={{ backgroundColor: NARANJA }}
          >
            {cargando ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            <span>{cargando ? 'Verificando acceso...' : 'Ingresar al Sistema'}</span>
          </button>
        </form>

        <div className="mt-6 border-t border-neutral-800 pt-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Acceso rápido por puesto (clic para autocompletar):
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                setUsername('admin')
                setPassword('admin123')
                setError(null)
              }}
              className="rounded border border-neutral-800 bg-[#111111] px-2 py-1.5 text-[10px] font-bold text-neutral-300 hover:border-[#FF5500] hover:text-white"
            >
              Administrador
            </button>
            <button
              type="button"
              onClick={() => {
                setUsername('administracion')
                setPassword('admin123')
                setError(null)
              }}
              className="rounded border border-neutral-800 bg-[#111111] px-2 py-1.5 text-[10px] font-bold text-neutral-300 hover:border-[#FF5500] hover:text-white"
            >
              Administración
            </button>
            <button
              type="button"
              onClick={() => {
                setUsername('galpon')
                setPassword('galpon123')
                setError(null)
              }}
              className="rounded border border-neutral-800 bg-[#111111] px-2 py-1.5 text-[10px] font-bold text-neutral-300 hover:border-[#FF5500] hover:text-white"
            >
              Galpón
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
