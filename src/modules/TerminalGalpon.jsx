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
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  diasEntreHoyY,
  fmtFecha,
  fmtNum,
  FONT,
  LOGO_URL,
  NARANJA,
  NEGRO,
  num,
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

  // Columna Derecha: Contratos con estado_despacho === 'En Obra (Despachado)'
  const recepcionDevoluciones = useMemo(() => {
    return alquileres.filter((c) => {
      const estGeneral = String(c.estado ?? 'Activo').toLowerCase()
      const yaCerrado =
        estGeneral.includes('devuelt') ||
        estGeneral.includes('finaliz') ||
        estGeneral.includes('cancel')
      if (yaCerrado) return false

      const estDespacho = String(c.estado_despacho ?? '').trim()
      return estDespacho === 'En Obra (Despachado)'
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
      `✓ Pedido ${refContrato} (${nombreCliente}) marcado como CARGADO Y DESPACHADO.`,
    )
  }

  // Acción Columna Derecha: [✓ Confirmar Recepción y Regreso a Galpón]
  const confirmarRecepcionYRegreso = async (contrato) => {
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

    // 1. Reintegrar stock_propio_disponible y descontar stock_propio_alquilado en `inventario`,
    //    y registrar la entrada en `movimientos_inventario`
    for (const it of items) {
      const eqActual = inventario.find(
        (i) =>
          String(i.id) === String(it.inventario_id) ||
          (it.codigo && i.codigo === it.codigo),
      )
      const cant = num(it.cantidad) || 1

      if (eqActual) {
        const nuevoDisp = num(eqActual.stock_propio_disponible) + cant
        const nuevoAlq = Math.max(0, num(eqActual.stock_propio_alquilado) - cant)

        await supabase
          .from('inventario')
          .update({
            stock_propio_disponible: nuevoDisp,
            stock_propio_alquilado: nuevoAlq,
          })
          .eq('id', eqActual.id)

        await registrarMovimientoKardex({
          inventario_id: eqActual.id,
          codigo: eqActual.codigo,
          material: eqActual.material,
          tipo_movimiento: 'ENTRADA (Devolución a Galpón)',
          cantidad: cant,
          stock_resultante: nuevoDisp,
          referencia_documento: refContrato,
          cliente_nombre: nombreCliente,
          observaciones: `Recibido en galpón por ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
        })
      } else {
        await registrarMovimientoKardex({
          inventario_id: it.inventario_id ?? null,
          codigo: it.codigo ?? '—',
          material: it.material ?? 'Equipo devuelto',
          tipo_movimiento: 'ENTRADA (Devolución a Galpón)',
          cantidad: cant,
          stock_resultante: 0,
          referencia_documento: refContrato,
          cliente_nombre: nombreCliente,
          observaciones: `Recibido en galpón por ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
        })
      }
    }

    // 2. Actualizar el estado del contrato a 'Devuelto a Galpón'
    const { data, error } = await actualizarContratoSeguro(contrato.id, {
      estado_despacho: 'Devuelto a Galpón',
      estado: 'Devuelto a Galpón',
    })

    if (error) {
      setProcesandoId(null)
      setErrorMsg(`Error al cerrar recepción de ${refContrato}: ${error.message}`)
      return
    }

    if (data && onActualizarContratoLocal) {
      onActualizarContratoLocal(data)
    }

    setProcesandoId(null)
    setMensajeExito(
      `✓ Equipos del contrato ${refContrato} (${nombreCliente}) recibidos y sumados nuevamente al stock disponible en galpón.`,
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
            <span>{mensajeExito}</span>
            <button
              onClick={() => setMensajeExito(null)}
              className="rounded bg-emerald-900/60 px-2.5 py-1 text-xs text-emerald-100"
            >
              OK
            </button>
          </div>
        )}

        {/* GRILLA DE 2 COLUMNAS OPERATIVAS */}
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ===============================================================
              COLUMNA IZQUIERDA: PEDIDOS POR CARGAR (Salidas)
             =============================================================== */}
          <section
            className="flex flex-col overflow-hidden rounded-md border border-neutral-800 bg-[#1e1e1e] shadow-xl"
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

                      {/* Botón de Acción Principal */}
                      <button
                        type="button"
                        disabled={estaProcesando}
                        onClick={() => marcarComoCargadoYDespachado(c)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-transform active:scale-[0.99] disabled:opacity-50"
                        style={{ background: NARANJA }}
                      >
                        {estaProcesando ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <ArrowRight size={18} />
                        )}
                        <span>✓ Marcar como Cargado y Despachado</span>
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
            className="flex flex-col overflow-hidden rounded-md border border-neutral-800 bg-[#1e1e1e] shadow-xl"
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

                      {/* Botón de Confirmar Recepción y Regreso a Galpón */}
                      <button
                        type="button"
                        disabled={estaProcesando}
                        onClick={() => confirmarRecepcionYRegreso(c)}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 py-3.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
                      >
                        {estaProcesando ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <RotateCcw size={18} />
                        )}
                        <span>✓ Confirmar Recepción y Regreso a Galpón</span>
                      </button>
                    </article>
                  )
                })
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

