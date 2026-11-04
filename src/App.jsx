import { useCallback, useEffect, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { supabase } from './supabaseClient'
import LoginScreen from './components/LoginScreen'
import { Sidebar, TopHeader } from './components/Layout'
import DashboardModule from './modules/DashboardModule'
import InventarioModule from './modules/InventarioModule'
import AlquileresModule from './modules/AlquileresModule'
import PrestamosModule from './modules/PrestamosModule'
import ClientesModule from './modules/ClientesModule'
import ReportesModule from './modules/ReportesModule'
import UsuariosModule from './modules/UsuariosModule'
import TerminalGalpon from './modules/TerminalGalpon'
import {
  FONT,
  num,
  obtenerMetodosPago,
  ordenarPorCodigo,
  permisosPorRol,
} from './utils/formatters'

function App() {
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
    if (!err && data) setConfig(data)
  }, [])

  const cargarInventario = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('inventario')
      .select(
        'id, codigo, material, categoria, stock_propio_total, stock_propio_disponible, stock_propio_alquilado, stock_propio_prestado, stock_externo_prestado, precio_alquiler_dia_usd',
      )
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
            setUltimoAvisoRealtime(
              `¡NUEVO PEDIDO RECIBIDO EN VIVO: ${payload.new.codigo_contrato || 'Contrato'} — Cliente: ${payload.new.cliente_nombre || 'Nuevo despacho'}!`,
            )
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
        () => {
          cargarMovimientos()
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
    if (!permisos.puedeEditarTasa && !permisos.esAdmin) {
      return 'Solo el Administrador o Administración puede gestionar las categorías.'
    }
    if (!config) return 'Configuración general no cargada.'

    // Intento de actualización en Supabase
    const { data, error: err } = await supabase
      .from('configuracion_general')
      .update({ categorias_inventario: nuevaLista, updated_at: new Date().toISOString() })
      .eq('id', config.id)
      .select('*')
      .single()

    if (err) {
      // Si la columna no existiera en Supabase aún, guardar en memoria/localStorage de contingencia
      try {
        localStorage.setItem('servialquiler_categorias_inventario', JSON.stringify(nuevaLista))
      } catch {
        // Ignorar
      }
      setConfig((prev) => ({ ...prev, categorias_inventario: nuevaLista }))
      return null
    }

    setConfig(data)
    return null
  }

  // ---- Manejo de Login y Módulo Inicial según Rol --------------------------
  const manejarLogin = (userLogueado) => {
    const p = permisosPorRol(userLogueado.rol)
    try {
      localStorage.setItem('servialquiler_sesion_usuario', JSON.stringify(userLogueado))
    } catch {
      // Ignorar
    }
    setUsuario(userLogueado)
    setModuloActivo(p.modulosPermitidos[0] || 'inventario')
  }

  const manejarLogout = () => {
    try {
      localStorage.removeItem('servialquiler_sesion_usuario')
      localStorage.removeItem('servialquiler_modulo_activo')
    } catch {
      // Ignorar
    }
    setUsuario(null)
  }

  if (!usuario) {
    return <LoginScreen onLogin={manejarLogin} />
  }

  // Vista restringida exclusiva a pantalla completa para el rol Galpón
  if (permisos.esGalpon) {
    return (
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
            />
          )}

          {moduloSeguro === 'inventario' && (
            <InventarioModule
              inventario={inventario}
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
    </div>
  )
}

export default App
