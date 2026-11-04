import { useState } from 'react'
import { Lock, User, LogIn, Loader2, TriangleAlert, Eye, EyeOff, Zap, Shield, Warehouse, FileText } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { FONT, LOGO_URL, NARANJA, NEGRO } from '../utils/formatters'

const USUARIOS_RESPALDO = [
  {
    id: 'local-admin',
    username: 'admin',
    passwords: ['admin123', 'admin', '123456'],
    nombre_completo: 'Administrador General',
    rol: 'Administrador',
    activo: true,
  },
  {
    id: 'local-administracion',
    username: 'administracion',
    passwords: ['admin123', 'admin', 'administracion', '123456'],
    nombre_completo: 'Oficina Administración',
    rol: 'Administracion',
    activo: true,
  },
  {
    id: 'local-galpon',
    username: 'galpon',
    passwords: ['galpon123', 'admin123', 'galpon', '123456', 'galpon12'],
    nombre_completo: 'Encargado de Galpón',
    rol: 'Galpon',
    activo: true,
  },
  {
    id: 'local-patio',
    username: 'patio',
    passwords: ['patio123', 'galpon123', 'admin123', 'patio', '123456'],
    nombre_completo: 'Encargado de Galpón',
    rol: 'Galpon',
    activo: true,
  },
]

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const iniciarSesion = async (e) => {
    if (e) e.preventDefault()
    const u = username.trim()
    const p = password.trim()
    if (!u || !p) {
      setError('Ingresa tu usuario y contraseña.')
      return
    }
    setCargando(true)
    setError(null)

    try {
      const { data, error: dbErr } = await supabase
        .from('usuarios_erp')
        .select('id, username, password_hash, nombre_completo, rol, activo')
        .ilike('username', u)
        .limit(1)
        .maybeSingle()

      // Si existe en Supabase y la contraseña coincide (o usa la clave universal admin123 / galpon123)
      if (!dbErr && data) {
        const hashDB = String(data.password_hash ?? '').trim()
        const coincide =
          hashDB === p ||
          p === 'admin123' ||
          (data.rol === 'Galpon' && p === 'galpon123')

        if (coincide) {
          if (data.activo === false) {
            setCargando(false)
            setError('Esta cuenta de usuario se encuentra inactiva. Contacta al Administrador.')
            return
          }
          setCargando(false)
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
      const respaldo = USUARIOS_RESPALDO.find((usr) => {
        if (usr.username.toLowerCase() !== u.toLowerCase()) return false
        return (
          usr.passwords.includes(p) ||
          p === 'admin123' ||
          p === 'galpon123'
        )
      })

      setCargando(false)

      if (respaldo) {
        onLogin(respaldo)
        return
      }

      if (dbErr && !data) {
        setError(`Error al consultar usuarios_erp: ${dbErr.message}`)
        return
      }

      setError('Usuario o contraseña incorrectos. Verifica que no tengas mayúsculas activadas.')
    } catch (err) {
      setCargando(false)
      // Si falla la red, intentar con respaldo local
      const respaldo = USUARIOS_RESPALDO.find(
        (usr) =>
          usr.username.toLowerCase() === u.toLowerCase() &&
          (usr.passwords.includes(p) || p === 'admin123' || p === 'galpon123'),
      )
      if (respaldo) {
        onLogin(respaldo)
        return
      }
      setError(`Error de conexión: ${err.message || 'No se pudo validar el acceso.'}`)
    }
  }

  // Acceso directo con un solo clic
  const entrarDirecto = (index) => {
    const usr = USUARIOS_RESPALDO[index]
    if (usr) {
      onLogin(usr)
    }
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
                placeholder="admin / administracion / galpon"
                className="w-full bg-transparent text-sm text-white placeholder:text-neutral-500 outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setMostrarPassword((prev) => !prev)}
                className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
              >
                {mostrarPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{mostrarPassword ? 'Ocultar' : 'Ver'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2.5 rounded-md border border-neutral-700 bg-[#0d0d0d] px-3.5 py-2.5 focus-within:border-[#FF5500]">
              <Lock size={16} color={NARANJA} />
              <input
                type={mostrarPassword ? 'text' : 'password'}
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

        {/* Botones de Entrada Directa con un Solo Clic */}
        <div className="mt-6 border-t border-neutral-800 pt-4">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            <Zap size={14} color={NARANJA} />
            <span>Acceso Rápido Directo (1 Clic):</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => entrarDirecto(0)}
              className="flex flex-col items-center justify-center rounded border border-neutral-800 bg-[#111111] p-2 text-center transition hover:border-[#FF5500] hover:bg-[#1a1a1a]"
            >
              <div className="flex items-center gap-1 text-xs font-bold text-white">
                <Shield size={13} color={NARANJA} />
                <span>Admin</span>
              </div>
              <span className="text-[10px] text-neutral-400">admin / admin123</span>
            </button>

            <button
              type="button"
              onClick={() => entrarDirecto(1)}
              className="flex flex-col items-center justify-center rounded border border-neutral-800 bg-[#111111] p-2 text-center transition hover:border-[#FF5500] hover:bg-[#1a1a1a]"
            >
              <div className="flex items-center gap-1 text-xs font-bold text-white">
                <FileText size={13} color={NARANJA} />
                <span>Oficina</span>
              </div>
              <span className="text-[10px] text-neutral-400">admin / admin123</span>
            </button>

            <button
              type="button"
              onClick={() => entrarDirecto(2)}
              className="flex flex-col items-center justify-center rounded border border-neutral-800 bg-[#111111] p-2 text-center transition hover:border-[#FF5500] hover:bg-[#1a1a1a]"
            >
              <div className="flex items-center gap-1 text-xs font-bold text-white">
                <Warehouse size={13} color={NARANJA} />
                <span>Galpón</span>
              </div>
              <span className="text-[10px] text-neutral-400">galpon / galpon123</span>
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-neutral-900 pt-3 text-center text-[10px] text-neutral-500">
          PUESTOS AUTORIZADOS: ADMINISTRADOR · ADMINISTRACIÓN · ENCARGADO DE GALPÓN
        </div>
      </div>
    </div>
  )
}
