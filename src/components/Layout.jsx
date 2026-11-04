import { useState } from 'react'
import {
  LayoutDashboard,
  Package,
  FileSpreadsheet,
  Handshake,
  Users,
  BarChart3,
  ShieldCheck,
  DollarSign,
  Pencil,
  Check,
  X,
  Wifi,
  WifiOff,
  LogOut,
  Loader2,
  UserCheck,
  HelpCircle,
  CreditCard,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  etiquetaRol,
  fmtVES,
  limpiarInputDecimal,
  LOGO_URL,
  NARANJA,
  NEGRO,
} from '../utils/formatters'

const DEFINICION_MODULOS = [
  {
    id: 'dashboard',
    nombre: 'Resumen del Negocio',
    subtitulo: 'Estado del galpón y caja',
    icono: LayoutDashboard,
  },
  {
    id: 'inventario',
    nombre: 'Inventario en Galpón',
    subtitulo: 'Equipos, precios y cantidades',
    icono: Package,
  },
  {
    id: 'alquileres',
    nombre: 'Alquileres y Facturación',
    subtitulo: 'Despachos, fletes y devoluciones',
    icono: FileSpreadsheet,
  },
  {
    id: 'prestamos',
    nombre: 'Préstamos con Aliados',
    subtitulo: 'Equipos pedidos o prestados',
    icono: Handshake,
  },
  {
    id: 'clientes',
    nombre: 'Cartera de Clientes',
    subtitulo: 'Datos de clientes y obras',
    icono: Users,
  },
  {
    id: 'reportes',
    nombre: 'Reportes e Historial',
    subtitulo: 'Cierre de ventas y entradas/salidas',
    icono: BarChart3,
  },
  {
    id: 'usuarios',
    nombre: 'Usuarios y Permisos',
    subtitulo: 'Cuentas del personal',
    icono: ShieldCheck,
  },
]

export function Sidebar({ moduloActivo, setModuloActivo, permisos }) {
  const modulosVisibles = DEFINICION_MODULOS.filter((m) =>
    permisos.modulosPermitidos.includes(m.id),
  )

  return (
    <aside
      className="flex w-full shrink-0 flex-col justify-between lg:w-64 lg:min-h-screen"
      style={{ background: NEGRO, borderRight: '1px solid #262626' }}
    >
      <div>
        {/* Contenedor Limpio con Logo Destacado */}
        <div
          className="px-4 py-4"
          style={{ borderBottom: `3px solid ${NARANJA}`, background: '#0b0b0b' }}
        >
          <div
            className="flex items-center justify-center rounded-md border border-neutral-800 bg-black p-2.5 shadow-inner"
            style={{ borderLeft: `4px solid ${NARANJA}` }}
          >
            <img
              src={LOGO_URL}
              alt="ServiAlquiler DV, C.A."
              className="h-16 w-full object-contain"
            />
          </div>
          <div className="mt-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Servi<span style={{ color: NARANJA }}>Alquiler</span> DV, C.A.
            </h2>
            <p className="text-[11px] text-neutral-400">
              Sistema de Alquiler y Control de Galpón
            </p>
          </div>
        </div>

        {/* Navegación Amigable */}
        <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
          Menú Principal
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col">
          {modulosVisibles.map((m) => {
            const Icono = m.icono
            const activo = moduloActivo === m.id
            return (
              <button
                key={m.id}
                onClick={() => setModuloActivo(m.id)}
                className="flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left transition-colors"
                style={{
                  background: activo ? '#1f1f1f' : 'transparent',
                  color: activo ? '#ffffff' : '#b3b3b3',
                  borderLeft: activo ? `4px solid ${NARANJA}` : '4px solid transparent',
                }}
              >
                <div className="shrink-0 rounded bg-black/40 p-1">
                  <Icono size={16} color={activo ? NARANJA : '#888'} />
                </div>
                <div className="min-w-0 leading-tight text-left">
                  <p className="truncate text-xs font-bold text-white">{m.nombre}</p>
                  <p className="truncate text-[10px] text-neutral-400">{m.subtitulo}</p>
                </div>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="hidden border-t border-neutral-800 bg-[#0c0c0c] px-4 py-3 text-[11px] text-neutral-400 lg:block">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Tu Puesto / Rol:
          </span>
          <span className="font-bold uppercase text-white">{etiquetaRol(permisos.rol)}</span>
        </div>
      </div>
    </aside>
  )
}

function TasaDelDia({ tasa, actualizada, puedeEditar, onGuardar }) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorTasa, setErrorTasa] = useState(null)

  const guardar = async () => {
    const valor = Number(borrador || 0)
    if (!Number.isFinite(valor) || valor <= 0) {
      setErrorTasa('Ingresa una Tasa del Día válida mayor a 0')
      return
    }
    setGuardando(true)
    const err = await onGuardar(valor)
    setGuardando(false)
    if (err) setErrorTasa(err)
    else {
      setErrorTasa(null)
      setEditando(false)
    }
  }

  return (
    <div className="flex flex-col items-end">
      <div
        className="flex items-center gap-2.5 rounded-md border border-neutral-700 bg-[#181818] px-3 py-1"
        style={{ borderLeft: `4px solid ${NARANJA}` }}
      >
        <DollarSign size={16} color={NARANJA} />
        <div className="leading-tight">
          <div className="flex items-center gap-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              TASA DEL DÍA USD/VES
            </p>
            <span
              title="Tasa del Día utilizada por la empresa. Al actualizarla, todos los precios y cobros en Bolívares se calculan automáticamente."
              className="cursor-help text-neutral-500 hover:text-white"
            >
              <HelpCircle size={10} />
            </span>
          </div>
          {editando ? (
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="Ej. 50.00"
              value={borrador}
              disabled={guardando}
              onChange={(e) => setBorrador(limpiarInputDecimal(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardar()
                if (e.key === 'Escape') setEditando(false)
              }}
              className="w-24 rounded border border-[#FF5500] bg-black px-1.5 py-0.5 font-mono text-sm font-bold text-white placeholder:text-neutral-500 outline-none"
            />
          ) : (
            <p className="font-mono text-sm font-bold text-white">
              {tasa === null ? '—' : fmtVES(tasa)}
            </p>
          )}
        </div>
        {puedeEditar &&
          (editando ? (
            <div className="flex gap-1">
              <button
                onClick={guardar}
                disabled={guardando}
                className="rounded p-1 hover:bg-white/10"
                title="Guardar nueva Tasa del Día"
              >
                {guardando ? (
                  <Loader2 size={14} color={NARANJA} className="animate-spin" />
                ) : (
                  <Check size={14} color={NARANJA} />
                )}
              </button>
              <button
                onClick={() => {
                  setEditando(false)
                  setErrorTasa(null)
                }}
                disabled={guardando}
                className="rounded p-1 hover:bg-white/10"
                title="Cancelar edición"
              >
                <X size={14} color="#aaa" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setBorrador(tasa ? String(tasa) : '')
                setEditando(true)
              }}
              disabled={tasa === null}
              className="rounded p-1 hover:bg-white/10 disabled:opacity-40"
              title="Actualizar la Tasa del Día USD/VES"
            >
              <Pencil size={13} color={NARANJA} />
            </button>
          ))}
      </div>
      {errorTasa ? (
        <p className="mt-0.5 text-[10px] text-red-400">{errorTasa}</p>
      ) : (
        actualizada && (
          <p className="mt-0.5 font-mono text-[9px] text-neutral-500">
            Último cambio: {new Date(actualizada).toLocaleString('es-VE')}
          </p>
        )
      )}
    </div>
  )
}

function ModalMetodosPago({ metodosPago = [], onGuardar, onCerrar }) {
  const [lista, setLista] = useState(() => [...metodosPago])
  const [nuevoMetodo, setNuevoMetodo] = useState('')
  const [editandoIdx, setEditandoIdx] = useState(null)
  const [textoEditando, setTextoEditando] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  const agregarMetodo = (e) => {
    e.preventDefault()
    const limpio = nuevoMetodo.trim()
    if (!limpio) return
    if (lista.some((m) => m.toLowerCase() === limpio.toLowerCase())) {
      setError('Ese método de pago ya existe en la lista.')
      return
    }
    setError(null)
    setLista((prev) => [...prev, limpio])
    setNuevoMetodo('')
  }

  const confirmarEdicion = (idx) => {
    const limpio = textoEditando.trim()
    if (!limpio) return
    setLista((prev) => prev.map((m, i) => (i === idx ? limpio : m)))
    setEditandoIdx(null)
    setTextoEditando('')
  }

  const eliminarMetodo = (idx) => {
    if (lista.length <= 1) {
      setError('Debe existir al menos un método de pago activo.')
      return
    }
    setError(null)
    setLista((prev) => prev.filter((_, i) => i !== idx))
  }

  const guardarEnSupabase = async () => {
    setGuardando(true)
    setError(null)
    const err = await onGuardar(lista)
    setGuardando(false)
    if (err) {
      setError(err)
      return
    }
    onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
        <div
          className="flex items-center justify-between px-5 py-3.5 text-white"
          style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
        >
          <div className="flex items-center gap-2">
            <CreditCard size={17} color={NARANJA} />
            <h3 className="text-sm font-bold uppercase tracking-wider">
              Gestor de Métodos de Pago
            </h3>
          </div>
          <button onClick={onCerrar} className="text-neutral-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs text-neutral-800">
          <p className="text-neutral-600">
            Agrega, edita o elimina las formas de pago disponibles al facturar y registrar abonos en todo el sistema.
          </p>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 p-2.5 text-xs font-bold text-red-700">
              {error}
            </div>
          )}

          {/* Formulario para agregar nuevo método */}
          <form onSubmit={agregarMetodo} className="flex gap-2">
            <input
              type="text"
              value={nuevoMetodo}
              onChange={(e) => setNuevoMetodo(e.target.value)}
              placeholder="Ej. Binance, Banesco Panamá, Biopago..."
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-xs placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded px-3.5 py-2 text-xs font-bold text-white"
              style={{ background: NARANJA }}
            >
              <Plus size={14} />
              <span>Agregar</span>
            </button>
          </form>

          {/* Lista de métodos actuales */}
          <div className="max-h-60 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-300 bg-neutral-50">
            {lista.map((metodo, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2">
                {editandoIdx === idx ? (
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={textoEditando}
                      onChange={(e) => setTextoEditando(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmarEdicion(idx)
                        if (e.key === 'Escape') setEditandoIdx(null)
                      }}
                      className="flex-1 rounded border border-[#FF5500] bg-white px-2 py-1 text-xs font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => confirmarEdicion(idx)}
                      className="rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700"
                      title="Confirmar nombre"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoIdx(null)}
                      className="rounded bg-neutral-200 p-1 text-neutral-700"
                      title="Cancelar"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-bold text-neutral-900">{metodo}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoIdx(idx)
                          setTextoEditando(metodo)
                        }}
                        className="rounded border border-neutral-300 bg-white p-1 text-neutral-700 hover:border-[#FF5500]"
                        title="Editar nombre del método de pago"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarMetodo(idx)}
                        className="rounded border border-red-200 bg-red-50 p-1 text-red-600 hover:bg-red-100"
                        title="Eliminar método de pago"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={guardarEnSupabase}
              className="flex items-center gap-1.5 rounded px-5 py-2 text-xs font-bold text-white"
              style={{ background: NARANJA }}
            >
              {guardando && <Loader2 size={14} className="animate-spin" />}
              <span>Guardar Métodos de Pago</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TopHeader({
  usuario,
  permisos,
  tasa,
  actualizada,
  onGuardarTasa,
  metodosPago = [],
  onGuardarMetodosPago,
  enVivo,
  hoy,
  onLogout,
}) {
  const [modalMetodos, setModalMetodos] = useState(false)

  return (
    <header style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <img
            src={LOGO_URL}
            alt="Logo ServiAlquiler"
            className="h-10 w-14 rounded border border-neutral-700 bg-black object-contain p-0.5 lg:hidden"
          />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold uppercase tracking-wider text-white sm:text-base">
                Servi<span style={{ color: NARANJA }}>Alquiler</span> DV, C.A.
              </h1>
              <span
                className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                style={{
                  borderColor: enVivo ? '#166534' : '#404040',
                  background: enVivo ? 'rgba(22,101,52,0.25)' : '#1f1f1f',
                  color: enVivo ? '#4ade80' : '#9ca3af',
                }}
                title={
                  enVivo
                    ? 'Conectado en vivo: cualquier cambio se refleja al instante en todas las computadoras'
                    : 'Sin conexión en tiempo real'
                }
              >
                {enVivo ? <Wifi size={11} /> : <WifiOff size={11} />}
                {enVivo ? 'EN VIVO' : 'SIN CONEXIÓN'}
              </span>
            </div>
            <p className="text-[11px] capitalize text-neutral-400">{hoy}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tasa del Día */}
          <TasaDelDia
            tasa={tasa}
            actualizada={actualizada}
            puedeEditar={permisos.puedeEditarTasa}
            onGuardar={onGuardarTasa}
          />

          {/* Botón Gestor de Métodos de Pago (Visible para Administrador) */}
          {permisos.esAdmin && (
            <button
              type="button"
              onClick={() => setModalMetodos(true)}
              className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-[#181818] px-3 py-2 text-xs font-bold text-white transition-colors hover:border-[#FF5500]"
              style={{ borderLeft: `4px solid ${NARANJA}` }}
              title="Agregar, editar o eliminar formas de pago del sistema"
            >
              <CreditCard size={15} color={NARANJA} />
              <span>💳 Métodos de Pago</span>
            </button>
          )}

          {/* Usuario activo y rol */}
          <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-[#181818] px-3 py-1.5">
            <UserCheck size={15} color={NARANJA} />
            <div className="leading-tight">
              <p className="text-xs font-bold text-white">{usuario.nombre_completo}</p>
              <span className="inline-block text-[10px] font-bold" style={{ color: NARANJA }}>
                {etiquetaRol(usuario.rol)}
              </span>
            </div>
          </div>

          {/* Botón Cerrar Sesión */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-md border border-red-800/60 bg-red-950/40 px-2.5 py-2 text-xs font-bold text-red-300 transition-colors hover:bg-red-900/50"
            title="Cerrar tu sesión de forma segura"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {modalMetodos && (
        <ModalMetodosPago
          metodosPago={metodosPago}
          onGuardar={onGuardarMetodosPago}
          onCerrar={() => setModalMetodos(false)}
        />
      )}
    </header>
  )
}
