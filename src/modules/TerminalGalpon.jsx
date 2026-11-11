import { useMemo, useState } from 'react'
import {
  Truck,
  PackageCheck,
  MapPin,
  User,
  Calendar,
  LogOut,
  Radio,
  Loader2,
  TriangleAlert,
  BellRing,
  HardHat,
  ArrowRight,
  RotateCcw,
  X,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  diasEntreFechas,
  diasEntreHoyY,
  fmtFecha,
  fmtNum,
  FONT,
  hoyISO,
  limpiarInputEntero,
  LOGO_URL,
  NARANJA,
  NEGRO,
  num,
  obtenerPrecioReposicionEquipo,
} from '../utils/formatters'
import { registrarMovimientoKardex } from '../utils/kardex'

const obtenerItemsContrato = (contrato) => {
  const posibles = [
    contrato?.items,
    contrato?.equipos,
    contrato?.detalles,
    contrato?.detalle_equipos,
    contrato?.materiales,
  ]
  for (const val of posibles) {
    if (Array.isArray(val)) return val
    if (typeof val === 'string' && val.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(val)
        if (Array.isArray(parsed)) return parsed
      } catch {
        // Ignorar JSON inválido
      }
    }
  }
  if (contrato?.inventario_id || contrato?.equipo_id) {
    return [
      {
        inventario_id: contrato.inventario_id ?? contrato.equipo_id,
        codigo: contrato.codigo ?? '—',
        material: contrato.material ?? 'Equipo alquilado',
        cantidad: num(contrato.cantidad) || 1,
      },
    ]
  }
  return []
}

const actualizarContratoSeguro = async (id, cambiosIniciales) => {
  let cambios = { ...cambiosIniciales }
  for (let intento = 0; intento < 6; intento++) {
    const res = await supabase
      .from('alquileres')
      .update(cambios)
      .eq('id', id)
      .select('*')
      .single()
    if (!res.error) return res
    const msg = res.error.message || ''
    const match =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "alquileres" does not exist/i)
    if (match && match[1] && match[1] in cambios) {
      const { [match[1]]: _omit, ...resto } = cambios
      cambios = resto
      continue
    }
    return res
  }
  return await supabase.from('alquileres').update(cambios).eq('id', id).select('*').single()
}

export default function TerminalGalpon({
  usuario,
  alquileres,
  inventario,
  clientes,
  enVivo,
  hoy,
  recienLlegadosIds = [],
  ultimoAvisoRealtime,
  onLimpiarAviso,
  onActualizarContratoLocal,
  onLogout,
}) {
  const [procesandoId, setProcesandoId] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [mensajeExito, setMensajeExito] = useState(null)
  const [logoError, setLogoError] = useState(false)

  // Pestaña activa para dispositivos móviles (< lg)
  const [tabMovil, setTabMovil] = useState('salidas') // 'salidas' | 'recepciones'

  // Modal Devolución Parcial o Total en Galpón + Extravíos
  const [modalDevolucionParcial, setModalDevolucionParcial] = useState(null)
  const [devolucionCantidades, setDevolucionCantidades] = useState({})
  const [devolucionFaltantes, setDevolucionFaltantes] = useState({})
  const [fechaDevolucionParcial, setFechaDevolucionParcial] = useState(() => hoyISO())

  const mapaClientes = useMemo(() => {
    const m = new Map()
    clientes.forEach((c) => m.set(String(c.id), c))
    return m
  }, [clientes])

  // Columna Izquierda: Contratos activos con estado_despacho === 'Pendiente por Cargar'
  const pedidosPorCargar = useMemo(() => {
    return alquileres.filter((c) => {
      const estGeneral = String(c.estado ?? 'Activo').toLowerCase()
      const yaCerrado =
        estGeneral.includes('devuelt') ||
        estGeneral.includes('finaliz') ||
        estGeneral.includes('cancel')
      if (yaCerrado) return false

      const estDespacho = String(c.estado_despacho ?? 'Pendiente por Cargar').trim()
      return estDespacho === 'Pendiente por Cargar'
    })
  }, [alquileres])

  // Columna Derecha: Contratos con estado_despacho en obra
  const recepcionDevoluciones = useMemo(() => {
    return alquileres.filter((c) => {
      const estGeneral = String(c.estado ?? 'Activo').toLowerCase()
      const yaCerrado =
        estGeneral.includes('devuelt') ||
        estGeneral.includes('finaliz') ||
        estGeneral.includes('cancel')
      if (yaCerrado) return false

      const estDespacho = String(c.estado_despacho ?? '').trim()
      return (
        estDespacho === 'En Obra (Despachado)' ||
        estDespacho === 'En Obra (Devolución Parcial)' ||
        estDespacho.toLowerCase().includes('en obra')
      )
    })
  }, [alquileres])

  // Acción Columna Izquierda: [✓ Marcar como Cargado y Despachado]
  const marcarComoCargadoYDespachado = async (contrato) => {
    setProcesandoId(contrato.id)
    setErrorMsg(null)
    setMensajeExito(null)

    const items = obtenerItemsContrato(contrato)
    const cli = mapaClientes.get(String(contrato.cliente_id))
    const nombreCliente =
      contrato.cliente_nombre || cli?.nombre_razon_social || 'Cliente de Obra'
    const refContrato =
      contrato.codigo_contrato ||
      contrato.numero_contrato ||
      `CT-${String(contrato.id ?? '').padStart(4, '0')}`

    const { data, error } = await actualizarContratoSeguro(contrato.id, {
      estado_despacho: 'En Obra (Despachado)',
      estado: 'Activo',
    })

    if (error) {
      setProcesandoId(null)
      setErrorMsg(`No se pudo actualizar el pedido ${refContrato}: ${error.message}`)
      return
    }

    if (data && onActualizarContratoLocal) {
      onActualizarContratoLocal(data)
    }

    // Registrar la salida física en `movimientos_inventario`
    for (const it of items) {
      const eqActual = inventario.find(
        (i) =>
          String(i.id) === String(it.inventario_id) ||
          (it.codigo && i.codigo === it.codigo),
      )
      const cant = num(it.cantidad) || 1
      const stockResultante = eqActual ? num(eqActual.stock_propio_disponible) : 0

      await registrarMovimientoKardex({
        inventario_id: eqActual?.id ?? it.inventario_id ?? null,
        codigo: eqActual?.codigo ?? it.codigo ?? '—',
        material: eqActual?.material ?? it.material ?? 'Equipo despachado',
        tipo_movimiento: 'SALIDA (Despacho de Galpón)',
        cantidad: cant,
        stock_resultante: stockResultante,
        referencia_documento: refContrato,
        cliente_nombre: nombreCliente,
        observaciones: `Cargado y despachado en galpón por ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
      })
    }

    setProcesandoId(null)
    setMensajeExito(
      `Pedido ${refContrato} (${nombreCliente}) marcado como CARGADO Y DESPACHADO.`,
    )
  }

  // Acción Columna Derecha: [✓ Confirmar Recepción y Regreso a Galpón]
  // Abre el modal de Devolución con el 100% de las piezas activas prellenadas,
  // permitiendo también reportar piezas faltantes / extraviadas / dañadas.
  const confirmarRecepcionYRegreso = (contrato) => {
    abrirDevolucionParcial(contrato, true)
  }

  // Devolución Parcial o Total en Terminal de Galpón
  const abrirDevolucionParcial = (c, prellenarTotal = false) => {
    setModalDevolucionParcial(c)
    setFechaDevolucionParcial(hoyISO())
    const items = obtenerItemsContrato(c)
    const initCant = {}
    const initFalt = {}
    items.forEach((it, idx) => {
      const idKey = it.inventario_id ? String(it.inventario_id) : `${it.codigo || 'eq'}_${idx}`
      const cantActiva = Math.max(0, num(it.cantidad) - num(it.cantidad_devuelta || 0))
      initCant[idKey] = !it.devuelto && prellenarTotal && cantActiva > 0 ? String(cantActiva) : ''
      initFalt[idKey] = ''
    })
    setDevolucionCantidades(initCant)
    setDevolucionFaltantes(initFalt)
    setErrorMsg(null)
  }

  const confirmarDevolucionParcialGalpon = async (e) => {
    e.preventDefault()
    if (!modalDevolucionParcial) return

    const contrato = modalDevolucionParcial
    const items = obtenerItemsContrato(contrato)
    const fechaDev = fechaDevolucionParcial || hoyISO()
    const diasUso = diasEntreFechas(contrato.fecha_inicio, fechaDev)

    // Validar cantidades devueltas y faltantes
    let totalDevolviendo = 0
    let totalFaltantes = 0
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]
      if (it.devuelto) continue
      const idKey = it.inventario_id ? String(it.inventario_id) : `${it.codigo || 'eq'}_${idx}`
      const cantADevolver = Number(devolucionCantidades[idKey] || 0)
      const cantFaltante = Number(devolucionFaltantes[idKey] || 0)
      const cantActiva = Math.max(0, num(it.cantidad) - num(it.cantidad_devuelta || 0))
      if (cantADevolver + cantFaltante > cantActiva) {
        setErrorMsg(
          `La suma de unidades devueltas (${cantADevolver}) + faltantes/extraviadas (${cantFaltante}) supera las unidades en obra (${cantActiva}) para ${it.material}.`,
        )
        return
      }
      totalDevolviendo += cantADevolver
      totalFaltantes += cantFaltante
    }

    if (totalDevolviendo + totalFaltantes <= 0) {
      setErrorMsg(
        'Indica la cantidad a devolver o las piezas faltantes/extraviadas de al menos un equipo.',
      )
      return
    }

    setProcesandoId(contrato.id)
    setErrorMsg(null)
    setMensajeExito(null)

    const cli = mapaClientes.get(String(contrato.cliente_id))
    const nombreCliente =
      contrato.cliente_nombre || cli?.nombre_razon_social || 'Cliente de Obra'
    const refContrato =
      contrato.codigo_contrato ||
      contrato.numero_contrato ||
      `CT-${String(contrato.id ?? '').padStart(4, '0')}`

    const nuevosItems = []
    let todasDevueltas = true

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]
      const idKey = it.inventario_id ? String(it.inventario_id) : `${it.codigo || 'eq'}_${idx}`
      const cantADevolver = Number(devolucionCantidades[idKey] || 0)
      const cantFaltante = Number(devolucionFaltantes[idKey] || 0)
      const cantProcesada = cantADevolver + cantFaltante
      const cantActual = Math.max(0, num(it.cantidad) - num(it.cantidad_devuelta || 0))
      const precioDia = num(
        it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
      )

      const eqActual = inventario.find(
        (i) =>
          String(i.id) === String(it.inventario_id) ||
          (it.codigo && i.codigo === it.codigo),
      )
      const precioRepUnit = obtenerPrecioReposicionEquipo(eqActual || it)
      const cargoExtravioItem = Number((cantFaltante * precioRepUnit).toFixed(2))

      if (it.devuelto) {
        nuevosItems.push(it)
        continue
      }

      if (cantProcesada <= 0) {
        nuevosItems.push(it)
        todasDevueltas = false
      } else {
        if (cantADevolver > 0) {
          const subtotalEfectivo = Number((cantADevolver * precioDia * diasUso).toFixed(2))
          nuevosItems.push({
            ...it,
            cantidad: cantADevolver,
            devuelto: true,
            fecha_devolucion: fechaDev,
            dias_efectivos: diasUso,
            subtotal_item_usd: subtotalEfectivo,
            estado: cantProcesada === cantActual ? 'Devuelto a Galpón' : 'Devuelto Parcial',
          })
        }

        if (cantFaltante > 0) {
          const subtotalAlquilerFaltante = Number((cantFaltante * precioDia * diasUso).toFixed(2))
          const subtotalConIndemnizacion = Number(
            (subtotalAlquilerFaltante + cargoExtravioItem).toFixed(2),
          )
          nuevosItems.push({
            ...it,
            cantidad: cantFaltante,
            devuelto: true,
            extraviado: true,
            cantidad_extraviada: cantFaltante,
            precio_reposicion_usd: precioRepUnit,
            cargo_reposicion_usd: cargoExtravioItem,
            fecha_devolucion: fechaDev,
            dias_efectivos: diasUso,
            subtotal_item_usd: subtotalConIndemnizacion,
            estado: 'EXTRAVÍO / NO DEVUELTO EN OBRA',
          })
        }

        const cantRestante = cantActual - cantProcesada
        if (cantRestante > 0) {
          todasDevueltas = false
          nuevosItems.push({
            ...it,
            cantidad: cantRestante,
            devuelto: false,
          })
        }
      }

      if (eqActual && (cantADevolver > 0 || cantFaltante > 0)) {
        const dispActual = num(eqActual.stock_propio_disponible)
        const alqActual = num(eqActual.stock_propio_alquilado)
        const totalPropioActual = num(eqActual.stock_propio_total)

        const excesoSobreAlquilado = Math.max(0, cantProcesada - alqActual)
        const nuevoDisp = Math.max(0, dispActual + cantADevolver - excesoSobreAlquilado)
        const nuevoAlq = Math.max(0, alqActual - cantProcesada)
        const nuevoTotalPropio = Math.max(0, totalPropioActual - cantFaltante)

        await supabase
          .from('inventario')
          .update({
            stock_propio_total: nuevoTotalPropio,
            stock_propio_disponible: nuevoDisp,
            stock_propio_alquilado: nuevoAlq,
          })
          .eq('id', eqActual.id)

        if (cantADevolver > 0) {
          await registrarMovimientoKardex({
            inventario_id: eqActual.id,
            codigo: eqActual.codigo,
            material: eqActual.material,
            tipo_movimiento: todasDevueltas
              ? 'ENTRADA (Devolución a Galpón)'
              : 'ENTRADA (Devolución Parcial de Galpón)',
            cantidad: cantADevolver,
            stock_resultante: nuevoDisp,
            referencia_documento: refContrato,
            cliente_nombre: nombreCliente,
            observaciones: `Devolución recibida en galpón (${cantADevolver} und. tras ${diasUso} días de uso). Operador: ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
          })
        }

        if (cantFaltante > 0) {
          await registrarMovimientoKardex({
            inventario_id: eqActual.id,
            codigo: eqActual.codigo,
            material: eqActual.material,
            tipo_movimiento: 'EXTRAVÍO / NO DEVUELTO EN OBRA',
            cantidad: cantFaltante,
            stock_resultante: nuevoDisp,
            referencia_documento: refContrato,
            cliente_nombre: nombreCliente,
            observaciones: `EXTRAVÍO / NO DEVUELTO EN OBRA (${cantFaltante} pza(s) faltantes/dañadas). Reportado en galpón por ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
          })
        }
      }
    }

    const flete = contrato.requiere_flete ? num(contrato.costo_flete_usd) : 0
    const diasContrato = num(contrato.dias_alquiler) || 1
    const nuevoSubtotalEquipos = nuevosItems.reduce((acc, it) => {
      const precio = num(
        it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
      )
      if (it.devuelto) {
        return (
          acc +
          (it.subtotal_item_usd !== undefined
            ? num(it.subtotal_item_usd)
            : num(it.cantidad) * precio * (num(it.dias_efectivos) || diasUso))
        )
      }
      return acc + num(it.cantidad) * precio * diasContrato
    }, 0)

    const nuevoTotalContrato = Number((nuevoSubtotalEquipos + flete).toFixed(2))
    const totalAnterior = num(contrato.total_contrato_usd)
    const diferenciaTotal = Number((nuevoTotalContrato - totalAnterior).toFixed(2))

    const pagado = num(contrato.monto_pagado_usd)
    const nuevoRestante = Math.max(0, Number((nuevoTotalContrato - pagado).toFixed(2)))
    const nuevoEstadoPago =
      nuevoRestante <= 0.009 ? 'Pagado' : pagado > 0 ? 'Abono Parcial' : 'Pendiente'

    const estadoDespacho = todasDevueltas ? 'Devuelto a Galpón' : 'En Obra (Devolución Parcial)'
    const estadoGeneral = todasDevueltas ? 'Devuelto a Galpón' : 'Activo'

    const cambiosContrato = {
      items: nuevosItems,
      subtotal_equipos_usd: Number(nuevoSubtotalEquipos.toFixed(2)),
      total_contrato_usd: nuevoTotalContrato,
      saldo_pendiente_usd: nuevoRestante,
      estado_pago: nuevoEstadoPago,
      estado_despacho: estadoDespacho,
      estado: estadoGeneral,
    }

    const { data: contratoActualizado, error: errAct } = await actualizarContratoSeguro(
      contrato.id,
      cambiosContrato,
    )

    if (errAct) {
      setProcesandoId(null)
      setErrorMsg(`Error al registrar devolución: ${errAct.message}`)
      return
    }

    if (cli && Math.abs(diferenciaTotal) > 0.009) {
      const nuevoSaldoCliente = Math.max(
        0,
        Number((num(cli.saldo_pendiente_usd) + diferenciaTotal).toFixed(2)),
      )
      await supabase
        .from('clientes')
        .update({ saldo_pendiente_usd: nuevoSaldoCliente })
        .eq('id', cli.id)
    }

    if (contratoActualizado && onActualizarContratoLocal) {
      onActualizarContratoLocal(contratoActualizado)
    }

    setProcesandoId(null)
    setModalDevolucionParcial(null)
    setMensajeExito(
      todasDevueltas
        ? `Recepción completada para ${refContrato} (${nombreCliente}). Stock de galpón actualizado.`
        : `Entrada parcial registrada para ${refContrato} (${nombreCliente}). Stock disponible actualizado en galpón.`,
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-[#161616] text-white"
      style={{ fontFamily: FONT }}
    >
      {/* ENCABEZADO EXCLUSIVO DE TERMINAL DE GALPÓN */}
      <header
        className="border-b border-neutral-800 px-4 py-3.5 shadow-lg sm:px-6"
        style={{ background: NEGRO, borderBottom: `4px solid ${NARANJA}` }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          {/* Identidad Corporativa + Título */}
          <div className="flex items-center gap-3.5">
            {!logoError ? (
              <div
                className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-black p-1 shadow"
                style={{ borderColor: NARANJA }}
              >
                <img
                  src={LOGO_URL}
                  alt="ServiAlquiler DV, C.A."
                  onError={() => setLogoError(true)}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-md text-base font-bold text-white"
                style={{ background: NARANJA }}
              >
                SDV
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                  style={{ background: NARANJA }}
                >
                  <HardHat size={12} />
                  MODO OPERATIVO EXCLUSIVO
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                  style={
                    enVivo
                      ? {
                          borderColor: 'rgba(16,185,129,0.5)',
                          background: 'rgba(16,185,129,0.14)',
                          color: '#34d399',
                        }
                      : {
                          borderColor: 'rgba(245,158,11,0.5)',
                          background: 'rgba(245,158,11,0.14)',
                          color: '#fbbf24',
                        }
                  }
                >
                  <Radio size={11} className={enVivo ? 'animate-pulse' : ''} />
                  {enVivo ? 'CONECTADO EN VIVO (SIN RECARGAR)' : 'CONECTANDO...'}
                </span>
              </div>

              <h1 className="mt-1 text-lg font-bold tracking-wide text-white sm:text-xl">
                Terminal Operativa de Galpón —{' '}
                <span style={{ color: NARANJA }}>ServiAlquiler DV</span>
              </h1>
              <p className="text-xs text-neutral-400 capitalize">{hoy}</p>
            </div>
          </div>

          {/* Resumen rápido de colas + Operador + Cerrar Sesión */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-[#1c1c1c] px-3 py-2 font-mono text-xs">
              <span className="text-neutral-400">Por Cargar:</span>
              <span
                className="rounded px-2 py-0.5 text-sm font-bold text-white"
                style={{ background: NARANJA }}
              >
                {pedidosPorCargar.length}
              </span>
              <span className="mx-1 text-neutral-700">|</span>
              <span className="text-neutral-400">En Obra / Por Recibir:</span>
              <span className="rounded bg-emerald-600 px-2 py-0.5 text-sm font-bold text-white">
                {recepcionDevoluciones.length}
              </span>
            </div>

            <div className="flex items-center gap-3 rounded-md border border-neutral-800 bg-[#1c1c1c] px-3.5 py-2">
              <div className="text-right leading-tight">
                <div className="text-xs font-bold text-white">
                  {usuario?.nombre_completo || usuario?.username}
                </div>
                <div
                  className="font-mono text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: NARANJA }}
                >
                  Operador de Galpón
                </div>
              </div>

              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-neutral-200 transition-colors hover:border-red-500 hover:bg-red-950/50 hover:text-red-200"
                title="Cerrar sesión de la terminal de galpón"
              >
                <LogOut size={14} />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL: 2 COLUMNAS EN VIVO */}
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        {/* Alerta en vivo cuando entra un nuevo pedido desde Administración */}
        {ultimoAvisoRealtime && (
          <div
            className="flex animate-pulse items-center justify-between gap-3 rounded-md border-2 px-4 py-3 text-white shadow-lg"
            style={{
              background: '#2a1004',
              borderColor: NARANJA,
            }}
          >
            <div className="flex items-center gap-2.5 text-sm font-bold">
              <BellRing size={20} color={NARANJA} />
              <span>{ultimoAvisoRealtime}</span>
            </div>
            {onLimpiarAviso && (
              <button
                onClick={onLimpiarAviso}
                className="rounded border border-orange-500/40 bg-black/40 px-2.5 py-1 text-xs font-bold text-orange-200 hover:bg-black"
              >
                Entendido
              </button>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2.5 rounded-md border border-red-500 bg-red-950/60 p-3.5 text-sm font-bold text-red-200">
            <TriangleAlert size={18} className="shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {mensajeExito && (
          <div className="flex items-center justify-between gap-2.5 rounded-md border border-emerald-500 bg-emerald-950/60 p-3.5 text-sm font-bold text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
              <span>{mensajeExito}</span>
            </div>
            <button
              onClick={() => setMensajeExito(null)}
              className="rounded bg-emerald-900/60 px-2.5 py-1 text-xs text-emerald-100 hover:bg-emerald-800"
            >
              OK
            </button>
          </div>
        )}

        {/* SELECTOR DE PESTAÑAS MÓVILES (Exclusivo pantallas < lg para uso cómodo con el pulgar) */}
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setTabMovil('salidas')}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-bold transition-all active:scale-[0.98] ${
              tabMovil === 'salidas'
                ? 'text-white shadow-lg ring-2 ring-orange-500'
                : 'border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            style={{
              background: tabMovil === 'salidas' ? NARANJA : undefined,
            }}
          >
            <Truck size={20} className={tabMovil === 'salidas' ? 'text-white' : 'text-neutral-400'} />
            <div className="text-left leading-tight">
              <span className="block text-xs uppercase tracking-wider">Por Despachar</span>
              <span className="text-[11px] font-mono opacity-90">({pedidosPorCargar.length} salidas)</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTabMovil('recepciones')}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-bold transition-all active:scale-[0.98] ${
              tabMovil === 'recepciones'
                ? 'bg-emerald-600 text-white shadow-lg ring-2 ring-emerald-400'
                : 'border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
          >
            <PackageCheck size={20} className={tabMovil === 'recepciones' ? 'text-white' : 'text-neutral-400'} />
            <div className="text-left leading-tight">
              <span className="block text-xs uppercase tracking-wider">En Obra</span>
              <span className="text-[11px] font-mono opacity-90">({recepcionDevoluciones.length} retornos)</span>
            </div>
          </button>
        </div>

        {/* GRILLA DE 2 COLUMNAS OPERATIVAS (En móvil muestra la pestaña activa; en escritorio muestra ambas) */}
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ===============================================================
              COLUMNA IZQUIERDA: PEDIDOS POR CARGAR (Salidas)
             =============================================================== */}
          <section
            className={`flex flex-col overflow-hidden rounded-md border border-neutral-800 bg-[#1e1e1e] shadow-xl ${
              tabMovil === 'salidas' ? 'flex' : 'hidden lg:flex'
            }`}
            style={{ borderTop: `4px solid ${NARANJA}` }}
          >
            <div
              className="flex items-center justify-between border-b border-neutral-800 px-5 py-4"
              style={{ background: NEGRO }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md text-white"
                  style={{ background: NARANJA }}
                >
                  <Truck size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold uppercase tracking-wider text-white">
                    PEDIDOS POR CARGAR (Salidas)
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Órdenes enviadas por Administración listas para preparar y despachar
                  </p>
                </div>
              </div>

              <span
                className="rounded-md px-3 py-1 font-mono text-base font-bold text-white"
                style={{ background: NARANJA }}
              >
                {pedidosPorCargar.length}
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {pedidosPorCargar.length === 0 ? (
                <div className="flex h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-700 bg-[#181818] p-6 text-center">
                  <Truck size={40} className="mb-3 text-neutral-600" />
                  <p className="text-base font-bold text-neutral-300">
                    No hay pedidos pendientes por cargar en este momento
                  </p>
                  <p className="mt-1 max-w-md text-xs text-neutral-500">
                    Cuando Administración emita un nuevo contrato, aparecerá aquí automáticamente sin tocar ningún botón.
                  </p>
                </div>
              ) : (
                pedidosPorCargar.map((c) => {
                  const cli = mapaClientes.get(String(c.cliente_id))
                  const items = obtenerItemsContrato(c)
                  const nro =
                    c.codigo_contrato ||
                    c.numero_contrato ||
                    `CT-${String(c.id ?? '').padStart(4, '0')}`
                  const nombreCliente =
                    c.cliente_nombre || cli?.nombre_razon_social || 'Cliente registrado'
                  const direccionObra =
                    c.direccion_obra ||
                    cli?.direccion_obra ||
                    'Retiro directo en Galpón / Sin dirección especificada'
                  const esRecienLlegado = recienLlegadosIds.includes(c.id)
                  const estaProcesando = procesandoId === c.id
                  const totalPiezas = items.reduce((s, it) => s + (num(it.cantidad) || 1), 0)

                  return (
                    <article
                      key={c.id}
                      className={`rounded-md border bg-[#252525] p-5 shadow-md transition-all ${
                        esRecienLlegado
                          ? 'ring-2 ring-[#FF5500] animate-pulse'
                          : 'border-neutral-700'
                      }`}
                      style={{ borderLeft: `6px solid ${NARANJA}` }}
                    >
                      {/* Cabecera de la tarjeta */}
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-700 pb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="rounded px-2.5 py-1 font-mono text-sm font-bold text-white"
                              style={{ background: NARANJA }}
                            >
                              {nro}
                            </span>
                            <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-mono text-xs font-bold uppercase text-amber-300">
                              Pendiente por Cargar
                            </span>
                            {c.requiere_flete && (
                              <span className="inline-flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 font-mono text-xs font-bold uppercase text-sky-300">
                                <Truck size={12} />
                                Incluye Transporte / Flete
                              </span>
                            )}
                            {esRecienLlegado && (
                              <span className="rounded bg-red-600 px-2 py-0.5 font-mono text-[11px] font-bold uppercase text-white">
                                ¡NUEVA ORDEN!
                              </span>
                            )}
                          </div>

                          <div className="mt-2.5 flex items-center gap-2 text-lg font-bold text-white">
                            <User size={18} color={NARANJA} className="shrink-0" />
                            <span>{nombreCliente}</span>
                          </div>
                        </div>

                        <div className="text-right font-mono text-xs text-neutral-400">
                          <div>Salida: {fmtFecha(c.fecha_inicio)}</div>
                          <div>Regreso: {fmtFecha(c.fecha_vencimiento)}</div>
                        </div>
                      </div>

                      {/* Dirección de Obra */}
                      <div className="mt-3 flex items-start gap-2 rounded border border-neutral-700 bg-[#1a1a1a] p-3 text-sm">
                        <MapPin size={18} color={NARANJA} className="mt-0.5 shrink-0" />
                        <div>
                          <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                            Dirección de Obra / Destino:
                          </span>
                          <span className="font-bold text-neutral-100">{direccionObra}</span>
                        </div>
                      </div>

                      {/* Lista detallada de equipos y cantidades a entregar (SIN PRECIOS) */}
                      <div className="mt-3.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-neutral-300">
                            Equipos y Cantidades a Entregar:
                          </span>
                          <span className="font-mono text-xs font-bold" style={{ color: NARANJA }}>
                            Total: {fmtNum(totalPiezas)} pieza(s)
                          </span>
                        </div>

                        <div className="divide-y divide-neutral-800 overflow-hidden rounded border border-neutral-700 bg-[#141414]">
                          {items.length === 0 ? (
                            <p className="p-3 text-xs text-neutral-400">
                              Sin detalle de equipos en la orden.
                            </p>
                          ) : (
                            items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs font-bold text-neutral-300">
                                    {it.codigo || 'EQ'}
                                  </span>
                                  <span className="text-sm font-bold text-white">
                                    {it.material}
                                  </span>
                                </div>

                                <span
                                  className="rounded px-3 py-1 font-mono text-sm font-bold text-white"
                                  style={{ background: NARANJA }}
                                >
                                  {fmtNum(it.cantidad)} und.
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Botón de Acción Principal (Alto mínimo 48px para uso cómodo en almacén) */}
                      <button
                        type="button"
                        disabled={estaProcesando}
                        onClick={() => marcarComoCargadoYDespachado(c)}
                        className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-transform active:scale-[0.99] disabled:opacity-50"
                        style={{ background: NARANJA }}
                      >
                        {estaProcesando ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <ArrowRight size={18} />
                        )}
                        <span>Marcar como Cargado y Despachado</span>
                      </button>
                    </article>
                  )
                })
              )}
            </div>
          </section>

          {/* ===============================================================
              COLUMNA DERECHA: RECEPCIÓN DE DEVOLUCIONES (Entradas)
             =============================================================== */}
          <section
            className={`flex flex-col overflow-hidden rounded-md border border-neutral-800 bg-[#1e1e1e] shadow-xl ${
              tabMovil === 'recepciones' ? 'flex' : 'hidden lg:flex'
            }`}
            style={{ borderTop: '4px solid #10b981' }}
          >
            <div
              className="flex items-center justify-between border-b border-neutral-800 px-5 py-4"
              style={{ background: NEGRO }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-600 text-white">
                  <PackageCheck size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold uppercase tracking-wider text-white">
                    RECEPCIÓN DE DEVOLUCIONES (Entradas)
                  </h2>
                  <p className="text-xs text-neutral-400">
                    Contratos actualmente en obra que deben regresar al galpón
                  </p>
                </div>
              </div>

              <span className="rounded-md bg-emerald-600 px-3 py-1 font-mono text-base font-bold text-white">
                {recepcionDevoluciones.length}
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              {recepcionDevoluciones.length === 0 ? (
                <div className="flex h-72 flex-col items-center justify-center rounded-md border border-dashed border-neutral-700 bg-[#181818] p-6 text-center">
                  <PackageCheck size={40} className="mb-3 text-neutral-600" />
                  <p className="text-base font-bold text-neutral-300">
                    No hay despachos pendientes de retorno en este momento
                  </p>
                  <p className="mt-1 max-w-md text-xs text-neutral-500">
                    Los pedidos que marques como despachados en la columna izquierda pasarán inmediatamente a esta lista para esperar su devolución.
                  </p>
                </div>
              ) : (
                recepcionDevoluciones.map((c) => {
                  const cli = mapaClientes.get(String(c.cliente_id))
                  const items = obtenerItemsContrato(c)
                  const nro =
                    c.codigo_contrato ||
                    c.numero_contrato ||
                    `CT-${String(c.id ?? '').padStart(4, '0')}`
                  const nombreCliente =
                    c.cliente_nombre || cli?.nombre_razon_social || 'Cliente registrado'
                  const direccionObra =
                    c.direccion_obra ||
                    cli?.direccion_obra ||
                    'Obra del cliente'
                  const diasRest = diasEntreHoyY(c.fecha_vencimiento)
                  const estaProcesando = procesandoId === c.id
                  const totalPiezas = items.reduce((s, it) => s + (num(it.cantidad) || 1), 0)

                  return (
                    <article
                      key={c.id}
                      className="rounded-md border border-neutral-700 bg-[#252525] p-5 shadow-md"
                      style={{ borderLeft: '6px solid #10b981' }}
                    >
                      {/* Cabecera de la tarjeta */}
                      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-700 pb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-emerald-600 px-2.5 py-1 font-mono text-sm font-bold text-white">
                              {nro}
                            </span>
                            <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-bold uppercase text-emerald-300">
                              En Obra (Despachado)
                            </span>
                            {diasRest !== null && (
                              <span
                                className="rounded px-2 py-0.5 font-mono text-xs font-bold uppercase"
                                style={
                                  diasRest < 0
                                    ? { background: 'rgba(220,38,38,0.25)', color: '#fca5a5' }
                                    : diasRest <= 2
                                      ? { background: 'rgba(245,158,11,0.25)', color: '#fcd34d' }
                                      : { background: 'rgba(255,255,255,0.08)', color: '#d4d4d4' }
                                }
                              >
                                {diasRest < 0
                                  ? `Vencido hace ${Math.abs(diasRest)} día(s)`
                                  : diasRest === 0
                                    ? 'Regresa HOY'
                                    : `Regresa en ${diasRest} día(s)`}
                              </span>
                            )}
                          </div>

                          <div className="mt-2.5 flex items-center gap-2 text-lg font-bold text-white">
                            <User size={18} className="shrink-0 text-emerald-400" />
                            <span>{nombreCliente}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 rounded border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1 font-mono text-xs text-neutral-300">
                          <Calendar size={13} className="text-emerald-400" />
                          <span>Fecha Retorno: {fmtFecha(c.fecha_vencimiento)}</span>
                        </div>
                      </div>

                      {/* Dirección de procedencia */}
                      <div className="mt-3 flex items-start gap-2 rounded border border-neutral-700 bg-[#1a1a1a] p-3 text-sm">
                        <MapPin size={18} className="mt-0.5 shrink-0 text-emerald-400" />
                        <div>
                          <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                            Obra de donde regresan los equipos:
                          </span>
                          <span className="font-bold text-neutral-100">{direccionObra}</span>
                        </div>
                      </div>

                      {/* Equipos que deben ingresar a Galpón */}
                      <div className="mt-3.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-xs font-bold uppercase tracking-wider text-neutral-300">
                            Equipos que deben ingresar a Galpón:
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            Total a recibir: {fmtNum(totalPiezas)} pieza(s)
                          </span>
                        </div>

                        <div className="divide-y divide-neutral-800 overflow-hidden rounded border border-neutral-700 bg-[#141414]">
                          {items.length === 0 ? (
                            <p className="p-3 text-xs text-neutral-400">
                              Sin detalle de equipos registrado.
                            </p>
                          ) : (
                            items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs font-bold text-neutral-300">
                                    {it.codigo || 'EQ'}
                                  </span>
                                  <span className="text-sm font-bold text-white">
                                    {it.material}
                                  </span>
                                </div>

                                <span className="rounded bg-emerald-700 px-3 py-1 font-mono text-sm font-bold text-white">
                                  Recibir {fmtNum(it.cantidad)} und.
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Botones de Recepción: Parcial o Total (Alto mínimo 48px para uso táctil con guantes o en obra) */}
                      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={estaProcesando}
                          onClick={() => abrirDevolucionParcial(c)}
                          className="flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-purple-500 bg-purple-950/40 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider text-purple-300 transition-colors hover:bg-purple-900/60 active:scale-[0.99] disabled:opacity-50"
                        >
                          <PackageCheck size={18} />
                          <span>Devolución Parcial</span>
                        </button>

                        <button
                          type="button"
                          disabled={estaProcesando}
                          onClick={() => confirmarRecepcionYRegreso(c)}
                          className="flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-emerald-600 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
                        >
                          {estaProcesando ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <RotateCcw size={18} />
                          )}
                          <span>Confirmar Recepción</span>
                        </button>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </section>
        </div>
      </main>

      {/* =================================================================
          MODAL DEVOLUCIÓN (PARCIAL O TOTAL) Y EXTRAVÍOS EN TERMINAL DE GALPÓN
         ================================================================= */}
      {modalDevolucionParcial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-md border border-neutral-700 bg-[#1e1e1e] text-white shadow-2xl">
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
            >
              <div className="flex items-center gap-2">
                <PackageCheck size={18} color={NARANJA} />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Recepción de Devolución (Parcial o Total) y Extravíos
                </h3>
              </div>
              <button
                onClick={() => setModalDevolucionParcial(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={confirmarDevolucionParcialGalpon} className="space-y-4 p-5 text-xs">
              {errorMsg && (
                <div className="flex items-center gap-2 rounded border border-red-500/50 bg-red-950/50 p-2.5 text-xs text-red-200">
                  <TriangleAlert size={15} className="shrink-0 text-red-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="rounded border border-neutral-700 bg-[#141414] p-3 font-mono">
                <p className="text-sm font-bold text-white">
                  Contrato:{' '}
                  {modalDevolucionParcial.codigo_contrato ||
                    modalDevolucionParcial.numero_contrato ||
                    `CT-${modalDevolucionParcial.id}`}
                </p>
                <p className="text-neutral-300">
                  Cliente:{' '}
                  <b className="text-white">
                    {modalDevolucionParcial.cliente_nombre || 'Cliente de Obra'}
                  </b>
                </p>
                {modalDevolucionParcial.direccion_obra && (
                  <p className="text-[11px] text-neutral-400">
                    Obra: {modalDevolucionParcial.direccion_obra}
                  </p>
                )}
                <p className="text-[11px] text-neutral-400">
                  Salida: {fmtFecha(modalDevolucionParcial.fecha_inicio)} · Días pactados:{' '}
                  {modalDevolucionParcial.dias_alquiler}d
                </p>
              </div>

              <div>
                <label className="mb-1 block font-bold uppercase tracking-wider text-neutral-300">
                  Fecha de Entrada a Galpón *
                </label>
                <input
                  type="date"
                  required
                  value={fechaDevolucionParcial}
                  onChange={(e) => setFechaDevolucionParcial(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-[#111111] px-3 py-2 font-mono text-xs font-bold text-white outline-none focus:border-[#FF5500]"
                />
                <p className="mt-1 text-[11px] text-neutral-400">
                  Días calculados para los equipos que regresan:{' '}
                  <b className="text-[#FF5500]">
                    {diasEntreFechas(
                      modalDevolucionParcial.fecha_inicio,
                      fechaDevolucionParcial,
                    )}{' '}
                    día(s) de uso
                  </b>
                  .
                </p>
              </div>

              <div>
                <label className="mb-1.5 block font-bold uppercase tracking-wider text-neutral-300">
                  Indica unidades que ingresan a galpón y piezas faltantes / extraviadas / dañadas:
                </label>
                <div className="max-h-64 divide-y divide-neutral-800 overflow-y-auto rounded border border-neutral-700 bg-[#141414]">
                  {obtenerItemsContrato(modalDevolucionParcial).map((it, idx) => {
                    const idKey = it.inventario_id
                      ? String(it.inventario_id)
                      : `${it.codigo || 'eq'}_${idx}`
                    const cantActiva = Math.max(
                      0,
                      num(it.cantidad) - num(it.cantidad_devuelta || 0),
                    )
                    const yaDevuelto = Boolean(it.devuelto)

                    return (
                      <div key={idKey} className="space-y-2.5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white">{it.material}</p>
                            <p className="font-mono text-[11px] text-neutral-400">
                              {it.codigo} · Activas en obra:{' '}
                              <b className="text-neutral-200">{cantActiva} und.</b>
                              {yaDevuelto && (
                                <span className="ml-2 font-bold text-emerald-400">
                                  [Lote ya procesado: {it.extraviado ? 'Extravío' : 'Devuelto'}]
                                </span>
                              )}
                            </p>
                          </div>

                          {!yaDevuelto && (
                            <button
                              type="button"
                              onClick={() => {
                                const falt = Number(devolucionFaltantes[idKey] || 0)
                                setDevolucionCantidades((prev) => ({
                                  ...prev,
                                  [idKey]: String(Math.max(0, cantActiva - falt)),
                                }))
                              }}
                              className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[10px] font-bold text-neutral-300 hover:border-[#FF5500] hover:text-white"
                              title="Devolver todo este ítem"
                            >
                              Todo ({cantActiva})
                            </button>
                          )}
                        </div>

                        {!yaDevuelto && (
                          <div className="grid gap-2.5 rounded border border-neutral-800 bg-[#0d0d0d] p-2.5 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase text-emerald-400">
                                Piezas Devueltas (Sanas)
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={devolucionCantidades[idKey] || ''}
                                onChange={(e) => {
                                  const val = limpiarInputEntero(e.target.value)
                                  setDevolucionCantidades((prev) => ({
                                    ...prev,
                                    [idKey]: val,
                                  }))
                                }}
                                className="w-full rounded border border-neutral-700 bg-[#181818] px-2.5 py-1.5 text-center font-mono text-xs font-bold text-white outline-none focus:border-[#FF5500]"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase text-red-400">
                                Piezas Faltantes / Extraviadas / Dañadas
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="0"
                                value={devolucionFaltantes[idKey] || ''}
                                onChange={(e) => {
                                  const val = limpiarInputEntero(e.target.value)
                                  const faltNum = Number(val || 0)
                                  setDevolucionFaltantes((prev) => ({
                                    ...prev,
                                    [idKey]: val,
                                  }))
                                  const devActual = Number(devolucionCantidades[idKey] || 0)
                                  if (devActual + faltNum > cantActiva) {
                                    setDevolucionCantidades((prev) => ({
                                      ...prev,
                                      [idKey]: String(Math.max(0, cantActiva - faltNum)),
                                    }))
                                  }
                                }}
                                className="w-full rounded border border-red-800 bg-[#181818] px-2.5 py-1.5 text-center font-mono text-xs font-bold text-red-300 outline-none focus:border-red-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalDevolucionParcial(null)}
                  className="flex min-h-[44px] items-center justify-center rounded border border-neutral-700 px-4 py-2 text-xs font-bold text-neutral-300 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(procesandoId)}
                  className="flex min-h-[48px] items-center justify-center gap-1.5 rounded px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow"
                  style={{ background: NARANJA }}
                >
                  {procesandoId && <Loader2 size={14} className="animate-spin" />}
                  <span>Confirmar Entrada a Galpón</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

