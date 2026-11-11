import { useCallback, useEffect, useMemo, useState } from 'react'
import { TriangleAlert, BellRing, X, PackageCheck, Truck } from 'lucide-react'
import { supabase } from './supabaseClient'
import LoginScreen from './components/LoginScreen'
import { Sidebar, TopHeader } from './components/Layout'
import DashboardModule from './modules/DashboardModule'
import InventarioModule from './modules/InventarioModule'
import AlquileresModule from './modules/AlquileresModule'
import PrestamosModule from './modules/PrestamosModule'
import ClientesModule from './modules/ClientesModule'
import ReportesModule from './modules/ReportesModule'
import NominaModule from './modules/NominaModule'
import UsuariosModule from './modules/UsuariosModule'
import TerminalGalpon from './modules/TerminalGalpon'
import {
  CATEGORIAS_INVENTARIO_DEFAULT,
  FONT,
  guardarCategoriasLocalStorage,
  leerCategoriasLocalStorage,
  num,
  obtenerMetodosPago,
  ordenarPorCodigo,
  permisosPorRol,
} from './utils/formatters'
import {
  reproducirDobleTimbre,
  solicitarPermisoNotificaciones,
  dispararNotificacionNativa,
} from './utils/notificaciones'

const TIEMPO_INACTIVIDAD_MS = 30 * 60 * 1000 // 30 minutos

function App() {
  const [avisoInactividad, setAvisoInactividad] = useState(null)
  const [usuario, setUsuario] = useState(() => {
    try {
      const guardado = localStorage.getItem('servialquiler_sesion_usuario')
      if (guardado) return JSON.parse(guardado)
    } catch {
      // Ignorar errores de parseo
    }
    return null
  })
  const [moduloActivo, setModuloActivoState] = useState(() => {
    try {
      const guardadoMod = localStorage.getItem('servialquiler_modulo_activo')
      if (guardadoMod) return guardadoMod
      const guardado = localStorage.getItem('servialquiler_sesion_usuario')
      if (guardado) {
        const u = JSON.parse(guardado)
        const p = permisosPorRol(u?.rol)
        return p.modulosPermitidos[0] || 'dashboard'
      }
    } catch {
      // Ignorar
    }
    return 'dashboard'
  })

  const setModuloActivo = (mod) => {
    try {
      localStorage.setItem('servialquiler_modulo_activo', mod)
    } catch {
      // Ignorar
    }
    setModuloActivoState(mod)
  }

  // Estados de las tablas de Supabase
  const [config, setConfig] = useState(null)
  const [inventario, setInventario] = useState([])
  const [alquileres, setAlquileres] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [clientes, setClientes] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [usuarios, setUsuarios] = useState([])

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [enVivo, setEnVivo] = useState(false)
  const [recienLlegadosIds, setRecienLlegadosIds] = useState([])
  const [ultimoAvisoRealtime, setUltimoAvisoRealtime] = useState(null)
  const [toastNotificacion, setToastNotificacion] = useState(null)

  // Solicitar permiso de notificaciones nativas del navegador al iniciar sesión
  useEffect(() => {
    if (usuario) {
      solicitarPermisoNotificaciones()
    }
  }, [usuario])

  // Desvanecimiento automático del toast tras 6 segundos
  useEffect(() => {
    if (!toastNotificacion) return
    const t = setTimeout(() => setToastNotificacion(null), 6000)
    return () => clearTimeout(t)
  }, [toastNotificacion])

  const [{ hoy, anio }] = useState(() => {
    const d = new Date()
    return {
      hoy: d.toLocaleDateString('es-VE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      anio: d.getFullYear(),
    }
  })

  const permisos = useMemo(() => permisosPorRol(usuario?.rol), [usuario])
  const tasa = config ? num(config.tasa_bcv) : null
  const metodosPago = useMemo(() => obtenerMetodosPago(config), [config])

  // ---- Funciones de lectura ------------------------------------------------
  const cargarConfiguracion = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('configuracion_general')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    const respaldoLocal = leerCategoriasLocalStorage()
    if (!err && data) {
      const cats =
        Array.isArray(data.categorias_inventario) && data.categorias_inventario.length > 0
          ? data.categorias_inventario
          : respaldoLocal.length > 0
            ? respaldoLocal
            : CATEGORIAS_INVENTARIO_DEFAULT
      setConfig({ ...data, categorias_inventario: cats })
    } else {
      setConfig((prev) => ({
        ...(prev || {}),
        categorias_inventario:
          respaldoLocal.length > 0 ? respaldoLocal : CATEGORIAS_INVENTARIO_DEFAULT,
      }))
    }
  }, [])

  const cargarInventario = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('inventario')
      .select('*')
      .order('codigo', { ascending: true })
    if (err) setError(err.message)
    else {
      setError(null)
      setInventario(data ?? [])
    }
    setCargando(false)
  }, [])

  const cargarAlquileres = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('alquileres')
      .select('*')
      .order('id', { ascending: false })
    if (!err) setAlquileres(data ?? [])
  }, [])

  const cargarPrestamos = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('prestamos_interempresas')
      .select('*')
      .order('id', { ascending: false })
    if (!err) setPrestamos(data ?? [])
  }, [])

  const cargarClientes = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('clientes')
      .select('id, rif_cedula, nombre_razon_social, telefono, direccion_obra, saldo_pendiente_usd')
      .order('nombre_razon_social', { ascending: true })
    if (!err) setClientes(data ?? [])
  }, [])

  const cargarMovimientos = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('movimientos_inventario')
      .select('*')
      .order('id', { ascending: false })
      .limit(400)
    if (!err) setMovimientos(data ?? [])
  }, [])

  const cargarUsuarios = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('usuarios_erp')
      .select('id, username, password_hash, nombre_completo, rol, activo')
      .order('id', { ascending: true })
    if (!err) setUsuarios(data ?? [])
  }, [])

  const recargarTodo = useCallback(() => {
    cargarConfiguracion()
    cargarInventario()
    cargarAlquileres()
    cargarPrestamos()
    cargarClientes()
    cargarMovimientos()
    cargarUsuarios()
  }, [
    cargarConfiguracion,
    cargarInventario,
    cargarAlquileres,
    cargarPrestamos,
    cargarClientes,
    cargarMovimientos,
    cargarUsuarios,
  ])

  // ---- Suscripción Realtime a todas las tablas -----------------------------
  useEffect(() => {
    if (!usuario) return

    const timer = setTimeout(() => {
      recargarTodo()
    }, 0)

    const canal = supabase
      .channel('erp-servialquiler-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'configuracion_general' },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          setConfig((prev) =>
            !prev || prev.id === payload.new.id ? { ...prev, ...payload.new } : prev,
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventario' },
        (payload) => {
          setInventario((prev) => {
            if (payload.eventType === 'INSERT') return ordenarPorCodigo([...prev, payload.new])
            if (payload.eventType === 'UPDATE')
              return prev.map((f) => (f.id === payload.new.id ? { ...f, ...payload.new } : f))
            if (payload.eventType === 'DELETE') return prev.filter((f) => f.id !== payload.old.id)
            return prev
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alquileres' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            setAlquileres((prev) => {
              const existe = prev.some((c) => c.id === payload.new.id)
              if (existe) return prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c))
              return [payload.new, ...prev]
            })
            setRecienLlegadosIds((prev) => [payload.new.id, ...prev.filter((id) => id !== payload.new.id)])
            const titulo = '¡NUEVO PEDIDO RECIBIDO EN VIVO!'
            const msj = `${payload.new.codigo_contrato || 'Contrato'} — Cliente: ${payload.new.cliente_nombre || 'Nuevo despacho'}`
            setUltimoAvisoRealtime(`${titulo}: ${msj}`)

            // Disparar sonido doble timbre y notificación push del navegador
            reproducirDobleTimbre()
            dispararNotificacionNativa({
              titulo,
              cuerpo: msj,
              tag: `alquiler-${payload.new.id || Date.now()}`,
            })
            setToastNotificacion({
              id: Date.now(),
              tipo: 'alquiler',
              titulo,
              mensaje: msj,
            })
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setAlquileres((prev) =>
              prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c)),
            )
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setAlquileres((prev) => prev.filter((c) => c.id !== payload.old.id))
          } else {
            cargarAlquileres()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prestamos_interempresas' },
        () => {
          cargarPrestamos()
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        cargarClientes()
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'movimientos_inventario' },
        (payload) => {
          cargarMovimientos()
          if (payload.eventType === 'INSERT' && payload.new) {
            reproducirDobleTimbre()
            const titulo = `Movimiento de Galpón: ${payload.new.tipo_movimiento || 'Kardex'}`
            const msj = `${payload.new.material || 'Material'} (${payload.new.cantidad || 0} und) — ${payload.new.cliente_nombre || payload.new.observaciones || 'Registrado'}`
            dispararNotificacionNativa({
              titulo,
              cuerpo: msj,
              tag: `kardex-${payload.new.id || Date.now()}`,
            })
            setToastNotificacion({
              id: Date.now(),
              tipo: 'galpon',
              titulo,
              mensaje: msj,
            })
          }
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios_erp' }, () => {
        cargarUsuarios()
      })
      .subscribe((status) => setEnVivo(status === 'SUBSCRIBED'))

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(canal)
    }
  }, [
    usuario,
    recargarTodo,
    cargarAlquileres,
    cargarPrestamos,
    cargarClientes,
    cargarMovimientos,
    cargarUsuarios,
  ])

  // ---- Guardar Tasa del Día y Métodos de Pago en `configuracion_general` ----
  const guardarTasa = async (valor) => {
    if (!permisos.puedeEditarTasa) return 'Solo el Administrador puede editar la Tasa del Día.'
    if (!config) return 'Configuración general no cargada.'
    const { data, error: err } = await supabase
      .from('configuracion_general')
      .update({ tasa_bcv: valor, updated_at: new Date().toISOString() })
      .eq('id', config.id)
      .select('id, tasa_bcv, metodos_pago, updated_at')
      .single()
    if (err) return err.message
    setConfig(data)
    return null
  }

  const guardarMetodosPago = async (nuevaLista) => {
    if (!permisos.esAdmin) return 'Solo el Administrador puede gestionar los métodos de pago.'
    if (!config) return 'Configuración general no cargada.'
    const { data, error: err } = await supabase
      .from('configuracion_general')
      .update({ metodos_pago: nuevaLista, updated_at: new Date().toISOString() })
      .eq('id', config.id)
      .select('*')
      .single()
    if (err) return err.message
    setConfig(data)
    return null
  }

  const guardarCategoriasInventario = async (nuevaLista) => {
    // Guardar de inmediato en localStorage y estado local como respaldo garantizado
    guardarCategoriasLocalStorage(nuevaLista)
    setConfig((prev) => ({ ...(prev || {}), categorias_inventario: nuevaLista }))

    try {
      let targetId = config?.id
      if (!targetId) {
        const { data: existente } = await supabase
          .from('configuracion_general')
          .select('id')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (existente?.id) targetId = existente.id
      }

      if (targetId) {
        const { data, error: errUpsert } = await supabase
          .from('configuracion_general')
          .upsert(
            {
              id: targetId,
              categorias_inventario: nuevaLista,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          )
          .select('*')
          .maybeSingle()

        if (!errUpsert && data) {
          setConfig({ ...data, categorias_inventario: nuevaLista })
          return null
        }

        const { data: dataUpd, error: errUpd } = await supabase
          .from('configuracion_general')
          .update({ categorias_inventario: nuevaLista, updated_at: new Date().toISOString() })
          .eq('id', targetId)
          .select('*')
          .maybeSingle()

        if (!errUpd && dataUpd) {
          setConfig({ ...dataUpd, categorias_inventario: nuevaLista })
        }
      } else {
        const { data: dataIns, error: errIns } = await supabase
          .from('configuracion_general')
          .insert([
            {
              tasa_bcv: tasa || 50,
              categorias_inventario: nuevaLista,
              updated_at: new Date().toISOString(),
            },
          ])
          .select('*')
          .maybeSingle()

        if (!errIns && dataIns) {
          setConfig({ ...dataIns, categorias_inventario: nuevaLista })
        }
      }
    } catch {
      // Respaldo en localStorage ya fue aplicado
    }

    return null
  }

  // ---- Manejo de Login, Logout y Cierre por Inactividad (30 min) ------------
  const manejarLogin = (userLogueado) => {
    const p = permisosPorRol(userLogueado.rol)
    try {
      localStorage.setItem('servialquiler_sesion_usuario', JSON.stringify(userLogueado))
    } catch {
      // Ignorar
    }
    setAvisoInactividad(null)
    setUsuario(userLogueado)
    setModuloActivo(p.modulosPermitidos[0] || 'inventario')
  }

  const manejarLogout = useCallback((motivoAviso = null) => {
    try {
      localStorage.removeItem('servialquiler_sesion_usuario')
      localStorage.removeItem('servialquiler_modulo_activo')
    } catch {
      // Ignorar
    }
    if (typeof motivoAviso === 'string' && motivoAviso) {
      setAvisoInactividad(motivoAviso)
    }
    setUsuario(null)
  }, [])

  // Temporizador de inactividad: 30 minutos para admin y facturacion.
  // Si el usuario es galpon, NUNCA se cierra su sesión por inactividad.
  useEffect(() => {
    if (!usuario) return
    const uname = String(usuario.username ?? '').trim().toLowerCase()
    if (permisos.esGalpon || uname === 'galpon') {
      return
    }

    let timeoutId = null

    const reiniciarTemporizador = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        manejarLogout(
          'Tu sesión se cerró automáticamente tras 30 minutos de inactividad por seguridad.',
        )
      }, TIEMPO_INACTIVIDAD_MS)
    }

    const eventosActividad = ['mousemove', 'keydown', 'click', 'touchstart']
    eventosActividad.forEach((ev) =>
      window.addEventListener(ev, reiniciarTemporizador, { passive: true }),
    )
    reiniciarTemporizador()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      eventosActividad.forEach((ev) => window.removeEventListener(ev, reiniciarTemporizador))
    }
  }, [usuario, permisos.esGalpon, manejarLogout])

  if (!usuario) {
    return (
      <LoginScreen
        onLogin={manejarLogin}
        avisoSesion={avisoInactividad}
        onLimpiarAvisoSesion={() => setAvisoInactividad(null)}
      />
    )
  }

  const renderToast = () => {
    if (!toastNotificacion) return null
    return (
      <div
        className="fixed bottom-5 right-5 z-[9999] flex max-w-sm items-start gap-3 rounded-md border p-3.5 shadow-2xl transition-all"
        style={{
          background: '#111111',
          borderColor: '#FF5500',
          color: '#ffffff',
          fontFamily: FONT,
        }}
      >
        <div className="rounded-full bg-[#FF5500]/20 p-2 text-[#FF5500] shrink-0">
          {toastNotificacion.tipo === 'alquiler' ? (
            <Truck size={20} color="#FF5500" />
          ) : (
            <PackageCheck size={20} color="#FF5500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-[#FF5500]">
            <BellRing size={13} />
            <span>{toastNotificacion.titulo}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-200 break-words leading-relaxed">
            {toastNotificacion.mensaje}
          </p>
        </div>
        <button
          onClick={() => setToastNotificacion(null)}
          className="text-neutral-400 hover:text-white shrink-0"
          title="Cerrar notificación"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  // Vista restringida exclusiva a pantalla completa para el rol Galpón
  if (permisos.esGalpon) {
    return (
      <>
        <TerminalGalpon
          usuario={usuario}
          alquileres={alquileres}
          inventario={inventario}
          clientes={clientes}
          enVivo={enVivo}
          hoy={hoy}
          recienLlegadosIds={recienLlegadosIds}
          ultimoAvisoRealtime={ultimoAvisoRealtime}
          onLimpiarAviso={() => {
            setUltimoAvisoRealtime(null)
            setRecienLlegadosIds([])
          }}
          onActualizarContratoLocal={(contratoActualizado) => {
            setAlquileres((prev) =>
              prev.map((c) =>
                c.id === contratoActualizado.id ? { ...c, ...contratoActualizado } : c,
              ),
            )
          }}
          onLogout={manejarLogout}
        />
        {renderToast()}
      </>
    )
  }

  const moduloSeguro = permisos.modulosPermitidos.includes(moduloActivo)
    ? moduloActivo
    : permisos.modulosPermitidos[0]

  return (
    <div className="flex min-h-screen flex-col bg-[#e9eaec] lg:flex-row" style={{ fontFamily: FONT }}>
      <Sidebar
        moduloActivo={moduloSeguro}
        setModuloActivo={setModuloActivo}
        permisos={permisos}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <TopHeader
          usuario={usuario}
          permisos={permisos}
          tasa={tasa}
          actualizada={config?.updated_at}
          onGuardarTasa={guardarTasa}
          metodosPago={metodosPago}
          onGuardarMetodosPago={guardarMetodosPago}
          enVivo={enVivo}
          hoy={hoy}
          onLogout={manejarLogout}
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-4 px-3 py-4 sm:px-5">
          {error && (
            <div className="flex items-center gap-2.5 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
              <TriangleAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {moduloSeguro === 'dashboard' && (
            <DashboardModule
              inventario={inventario}
              alquileres={alquileres}
              movimientos={movimientos}
              clientes={clientes}
              tasa={tasa}
              permisos={permisos}
              onIrModulo={setModuloActivo}
              onRecargar={recargarTodo}
            />
          )}

          {moduloSeguro === 'inventario' && (
            <InventarioModule
              inventario={inventario}
              alquileres={alquileres}
              tasa={tasa}
              permisos={permisos}
              config={config}
              onGuardarCategorias={guardarCategoriasInventario}
              cargando={cargando}
              onRecargar={recargarTodo}
            />
          )}

          {moduloSeguro === 'alquileres' && (
            <AlquileresModule
              alquileres={alquileres}
              inventario={inventario}
              clientes={clientes}
              config={config}
              metodosPago={metodosPago}
              tasa={tasa}
              permisos={permisos}
              usuario={usuario}
              onRecargarTodo={recargarTodo}
              onIrModulo={setModuloActivo}
            />
          )}

          {moduloSeguro === 'prestamos' && (
            <PrestamosModule
              prestamos={prestamos}
              inventario={inventario}
              onRecargarTodo={recargarTodo}
            />
          )}

          {moduloSeguro === 'clientes' && (
            <ClientesModule
              clientes={clientes}
              tasa={tasa}
              permisos={permisos}
              onRecargar={cargarClientes}
            />
          )}

          {moduloSeguro === 'reportes' && (
            <ReportesModule
              alquileres={alquileres}
              movimientos={movimientos}
              clientes={clientes}
              inventario={inventario}
              tasa={tasa}
              permisos={permisos}
            />
          )}

          {moduloSeguro === 'nomina' && permisos.puedeGestionarNomina && (
            <NominaModule
              tasa={tasa}
              permisos={permisos}
            />
          )}

          {moduloSeguro === 'usuarios' && permisos.puedeGestionarUsuarios && (
            <UsuariosModule
              usuarios={usuarios}
              usuarioActual={usuario}
              onRecargar={cargarUsuarios}
            />
          )}
        </main>

        <footer className="border-t border-neutral-300 bg-white/60 py-3 text-center font-mono text-[11px] text-neutral-500">
          © {anio} SERVIALQUILER DV, C.A. · CONTROL DE GALPÓN, ALQUILERES Y FACTURACIÓN
        </footer>
      </div>
      {renderToast()}
    </div>
  )
}

export default App
