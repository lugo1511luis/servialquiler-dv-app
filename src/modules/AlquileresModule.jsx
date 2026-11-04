import { useMemo, useState } from 'react'
import {
  Plus,
  Truck,
  CalendarPlus,
  RotateCcw,
  FileText,
  Trash2,
  X,
  Loader2,
  TriangleAlert,
  Search,
  ArrowLeft,
  UserPlus,
  Handshake,
  ShieldAlert,
  CheckCircle2,
  Banknote,
  PackageCheck,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  diasEntreFechas,
  diasEntreHoyY,
  fmtFecha,
  fmtNum,
  fmtUSD,
  fmtVES,
  hoyISO,
  limpiarInputDecimal,
  limpiarInputEntero,
  METODOS_PAGO_DEFAULT,
  NARANJA,
  NEGRO,
  num,
  sumarDiasISO,
} from '../utils/formatters'
import { generarFacturaContratoPDF } from '../utils/exportadores'
import { registrarMovimientoKardex } from '../utils/kardex'
import GuiaRapida from '../components/GuiaRapida'

const CLAVE_ABONOS_RESPALDO = 'servialquiler_abonos_contratos_v1'

const leerMapaAbonosRespaldo = () => {
  try {
    const raw = localStorage.getItem(CLAVE_ABONOS_RESPALDO)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const guardarAbonoRespaldo = (contratoId, datosAbono) => {
  if (!contratoId) return
  try {
    const actual = leerMapaAbonosRespaldo()
    actual[String(contratoId)] = {
      ...(actual[String(contratoId)] || {}),
      ...datosAbono,
    }
    localStorage.setItem(CLAVE_ABONOS_RESPALDO, JSON.stringify(actual))
  } catch {
    // Ignorar errores de almacenamiento
  }
}

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
        precio_alquiler_dia_usd: num(contrato.precio_alquiler_dia_usd),
      },
    ]
  }
  return []
}

const insertarContratoSeguro = async (payloadInicial) => {
  let payload = { ...payloadInicial }
  for (let intento = 0; intento < 10; intento++) {
    const res = await supabase.from('alquileres').insert([payload]).select('*').single()
    if (!res.error) return res
    const msg = res.error.message || ''
    const match =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "alquileres" does not exist/i)
    if (match && match[1] && match[1] in payload) {
      const { [match[1]]: _omit, ...resto } = payload
      payload = resto
      continue
    }
    return res
  }
  return await supabase.from('alquileres').insert([payload]).select('*').single()
}

const actualizarContratoSeguro = async (id, cambiosIniciales) => {
  let cambios = { ...cambiosIniciales }
  for (let intento = 0; intento < 10; intento++) {
    const res = await supabase.from('alquileres').update(cambios).eq('id', id)
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
  return await supabase.from('alquileres').update(cambios).eq('id', id)
}

const calcularEstadoPago = (pagado, restante) => {
  if (restante <= 0.009) return 'Pagado'
  if (pagado > 0.009) return 'Abono Parcial'
  return 'Pendiente'
}

export default function AlquileresModule({
  alquileres,
  inventario,
  clientes,
  metodosPago = METODOS_PAGO_DEFAULT,
  tasa,
  permisos,
  onRecargarTodo,
  onIrModulo,
}) {
  const [vistaFacturador, setVistaFacturador] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS')

  // Modales: Postergar Días y Registrar Abono
  const [modalProrroga, setModalProrroga] = useState(null)
  const [diasExtra, setDiasExtra] = useState('')
  const [abonoProrrogaUsd, setAbonoProrrogaUsd] = useState('')
  const [metodoPagoProrroga, setMetodoPagoProrroga] = useState(
    () => metodosPago[0] || 'Efectivo USD',
  )

  const [modalAbono, setModalAbono] = useState(null)
  const [montoNuevoAbonoUsd, setMontoNuevoAbonoUsd] = useState('')
  const [metodoPagoAbono, setMetodoPagoAbono] = useState(
    () => metodosPago[0] || 'Efectivo USD',
  )
  const [pagoMixtoAbono, setPagoMixtoAbono] = useState(false)
  const [metodoPagoAbono1, setMetodoPagoAbono1] = useState(
    () => metodosPago[0] || 'Efectivo USD',
  )
  const [montoMetodoAbono1Usd, setMontoMetodoAbono1Usd] = useState('')
  const [metodoPagoAbono2, setMetodoPagoAbono2] = useState(
    () => metodosPago[1] || 'Pago Móvil / Transferencia Bs.',
  )
  const [montoMetodoAbono2Usd, setMontoMetodoAbono2Usd] = useState('')

  // Modal Devolución Parcial
  const [modalDevolucionParcial, setModalDevolucionParcial] = useState(null)
  const [devolucionCantidades, setDevolucionCantidades] = useState({})
  const [fechaDevolucionParcial, setFechaDevolucionParcial] = useState(() => hoyISO())

  const [procesando, setProcesando] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const [avisoAliado, setAvisoAliado] = useState(null)
  const [versionRespaldo, setVersionRespaldo] = useState(0)

  // Formulario de despacho (Campos numéricos limpios en blanco '' por defecto)
  const [clienteId, setClienteId] = useState('')
  const [fechaInicio, setFechaInicio] = useState(() => hoyISO())
  const [diasAlquiler, setDiasAlquiler] = useState('3')
  const [requiereFlete, setRequiereFlete] = useState(false)
  const [costoFleteUsd, setCostoFleteUsd] = useState('')
  const [depositoGarantiaUsd, setDepositoGarantiaUsd] = useState('')
  const [montoAbonadoHoyUsd, setMontoAbonadoHoyUsd] = useState('')
  const [metodoPago, setMetodoPago] = useState(() => metodosPago[0] || 'Efectivo USD')
  const [pagoMixto, setPagoMixto] = useState(false)
  const [metodoPago1, setMetodoPago1] = useState(() => metodosPago[0] || 'Efectivo USD')
  const [montoMetodo1Usd, setMontoMetodo1Usd] = useState('')
  const [metodoPago2, setMetodoPago2] = useState(
    () => metodosPago[1] || 'Pago Móvil / Transferencia Bs.',
  )
  const [montoMetodo2Usd, setMontoMetodo2Usd] = useState('')
  const [lineas, setLineas] = useState([])

  // Creación rápida de cliente
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({
    rif_cedula: '',
    nombre_razon_social: '',
    telefono: '',
    direccion_obra: '',
  })
  const [guardandoCliente, setGuardandoCliente] = useState(false)

  const mapaClientes = useMemo(() => {
    const m = new Map()
    clientes.forEach((c) => m.set(String(c.id), c))
    return m
  }, [clientes])

  // Obtiene datos de pago del contrato combinando columnas de Supabase con respaldo local
  const obtenerDatosPagoContrato = (contrato) => {
    const respaldo = leerMapaAbonosRespaldo()[String(contrato?.id)]
    const total = num(contrato?.total_contrato_usd)

    const tienePagadoBD =
      contrato?.monto_pagado_usd !== undefined && contrato?.monto_pagado_usd !== null
    const tieneSaldoBD =
      contrato?.saldo_pendiente_usd !== undefined && contrato?.saldo_pendiente_usd !== null

    let pagado = tienePagadoBD
      ? num(contrato.monto_pagado_usd)
      : respaldo?.monto_pagado_usd !== undefined
        ? num(respaldo.monto_pagado_usd)
        : total

    let restante = tieneSaldoBD
      ? Math.max(0, num(contrato.saldo_pendiente_usd))
      : respaldo?.saldo_pendiente_usd !== undefined
        ? Math.max(0, num(respaldo.saldo_pendiente_usd))
        : Math.max(0, Number((total - pagado).toFixed(2)))

    const estadoPago =
      contrato?.estado_pago ||
      respaldo?.estado_pago ||
      calcularEstadoPago(pagado, restante)

    return {
      total,
      pagado: Number(pagado.toFixed(2)),
      restante: Number(restante.toFixed(2)),
      estadoPago,
    }
  }

  const categoriasCatalogo = useMemo(() => {
    const s = new Set(['TODAS'])
    inventario.forEach((i) => {
      if (i.categoria) s.add(i.categoria)
    })
    return Array.from(s)
  }, [inventario])

  const catalogoFiltrado = useMemo(() => {
    const q = busquedaCatalogo.trim().toLowerCase()
    return inventario.filter((f) => {
      if (categoriaFiltro !== 'TODAS' && f.categoria !== categoriaFiltro) return false
      if (!q) return true
      return [f.codigo, f.material, f.categoria].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      )
    })
  }, [inventario, busquedaCatalogo, categoriaFiltro])

  const diasCalculo = Math.max(1, Number(diasAlquiler || 1))

  const fechaVencimientoCalculada = useMemo(
    () => sumarDiasISO(fechaInicio, diasCalculo),
    [fechaInicio, diasCalculo],
  )

  const subtotalEquiposUSD = useMemo(() => {
    return lineas.reduce(
      (s, l) => s + Number(l.cantidad || 0) * num(l.precio_alquiler_dia_usd) * diasCalculo,
      0,
    )
  }, [lineas, diasCalculo])

  const fleteUSD = requiereFlete ? Number(costoFleteUsd || 0) : 0
  const garantiaUSD = Number(depositoGarantiaUsd || 0)
  const totalContratoUSD = Number((subtotalEquiposUSD + fleteUSD).toFixed(2))
  const totalConGarantiaUSD = Number((totalContratoUSD + garantiaUSD).toFixed(2))

  // Cálculos de Abono Directo y Restante por Cobrar en tiempo real
  const abonoHoyNum = useMemo(() => {
    const escrito = Number(montoAbonadoHoyUsd || 0)
    return Math.min(totalContratoUSD, Math.max(0, Number(escrito.toFixed(2))))
  }, [montoAbonadoHoyUsd, totalContratoUSD])

  const restantePorCobrarHoyUSD = useMemo(
    () => Math.max(0, Number((totalContratoUSD - abonoHoyNum).toFixed(2))),
    [totalContratoUSD, abonoHoyNum],
  )

  const estadoPagoHoy = useMemo(
    () => calcularEstadoPago(abonoHoyNum, restantePorCobrarHoyUSD),
    [abonoHoyNum, restantePorCobrarHoyUSD],
  )

  const agregarAlDespacho = (eq) => {
    const dispPropio = num(eq.stock_propio_disponible)
    const dispExterno = num(eq.stock_externo_prestado)
    const yaEnLista = lineas
      .filter((l) => String(l.inventario_id) === String(eq.id))
      .reduce((s, l) => s + Number(l.cantidad || 0), 0)

    if (yaEnLista + 1 > dispPropio) {
      setAvisoAliado({
        equipo: eq,
        requerido: yaEnLista + 1,
        disponiblePropio: dispPropio,
        disponibleExterno: dispExterno,
      })
      return
    }

    setAvisoAliado(null)
    setErrorMsg(null)
    setLineas((prev) => {
      const existe = prev.find((l) => String(l.inventario_id) === String(eq.id))
      if (existe) {
        return prev.map((l) =>
          String(l.inventario_id) === String(eq.id)
            ? { ...l, cantidad: String(Number(l.cantidad || 0) + 1) }
            : l,
        )
      }
      return [
        ...prev,
        {
          inventario_id: eq.id,
          codigo: eq.codigo,
          material: eq.material,
          cantidad: '1',
          precio_alquiler_dia_usd: num(eq.precio_alquiler_dia_usd),
        },
      ]
    })
  }

  // Permite borrar el número a '' mientras escribe sin bloquearse en 0
  const cambiarCantidadLinea = (invId, valorTexto) => {
    const limpio = limpiarInputEntero(valorTexto)
    if (limpio === '') {
      setLineas((prev) =>
        prev.map((l) => (String(l.inventario_id) === String(invId) ? { ...l, cantidad: '' } : l)),
      )
      return
    }

    const eq = inventario.find((i) => String(i.id) === String(invId))
    if (!eq) return
    const cant = Number(limpio)
    const dispPropio = num(eq.stock_propio_disponible)

    if (cant > dispPropio) {
      setAvisoAliado({
        equipo: eq,
        requerido: cant,
        disponiblePropio: dispPropio,
        disponibleExterno: num(eq.stock_externo_prestado),
      })
      return
    }

    setAvisoAliado(null)
    setLineas((prev) =>
      prev.map((l) =>
        String(l.inventario_id) === String(invId) ? { ...l, cantidad: limpio } : l,
      ),
    )
  }

  const quitarLinea = (invId) => {
    setLineas((prev) => prev.filter((l) => String(l.inventario_id) !== String(invId)))
  }

  const guardarClienteRapido = async (e) => {
    e.preventDefault()
    if (!nuevoCliente.rif_cedula.trim() || !nuevoCliente.nombre_razon_social.trim()) {
      setErrorMsg('Completa RIF/Cédula y Nombre o Razón Social del nuevo cliente.')
      return
    }
    setGuardandoCliente(true)
    const { data, error } = await supabase
      .from('clientes')
      .insert([
        {
          rif_cedula: nuevoCliente.rif_cedula.trim(),
          nombre_razon_social: nuevoCliente.nombre_razon_social.trim(),
          telefono: nuevoCliente.telefono.trim(),
          direccion_obra: nuevoCliente.direccion_obra.trim(),
          saldo_pendiente_usd: 0,
        },
      ])
      .select('*')
      .single()

    setGuardandoCliente(false)
    if (error) {
      setErrorMsg(`Error al registrar cliente: ${error.message}`)
      return
    }
    await onRecargarTodo()
    if (data?.id) setClienteId(String(data.id))
    setMostrarFormCliente(false)
    setNuevoCliente({ rif_cedula: '', nombre_razon_social: '', telefono: '', direccion_obra: '' })
  }

  const emitirContratoYDespachar = async (e) => {
    e.preventDefault()
    if (!clienteId) {
      setErrorMsg('Selecciona un cliente para emitir el contrato de alquiler.')
      return
    }
    const lineasValidas = lineas
      .map((l) => ({ ...l, cantidad: Number(l.cantidad || 0) }))
      .filter((l) => l.cantidad > 0)

    if (lineasValidas.length === 0) {
      setErrorMsg('Selecciona al menos un equipo con cantidad mayor a 0 para despachar.')
      return
    }

    if (pagoMixto && abonoHoyNum > 0) {
      const m1 = num(montoMetodo1Usd)
      const m2 = num(montoMetodo2Usd)
      if (Math.abs(m1 + m2 - abonoHoyNum) > 0.01) {
        setErrorMsg(
          `La suma de los métodos de pago mixtos ($${m1.toFixed(2)} + $${m2.toFixed(2)} = $${(m1 + m2).toFixed(2)}) debe ser exactamente igual al monto abonado hoy ($${abonoHoyNum.toFixed(2)}).`,
        )
        return
      }
    }

    setProcesando(true)
    setErrorMsg(null)

    const cli = mapaClientes.get(String(clienteId))
    const codigoGenerado = `CT-${String(alquileres.length + 1).padStart(4, '0')}`

    const metodoFinal =
      pagoMixto && abonoHoyNum > 0
        ? `Mixto: ${metodoPago1} ($${num(montoMetodo1Usd).toFixed(2)}) + ${metodoPago2} ($${num(montoMetodo2Usd).toFixed(2)})`
        : metodoPago

    const desgloseFinal =
      pagoMixto && abonoHoyNum > 0
        ? {
            mixto: true,
            metodo1: metodoPago1,
            monto1_usd: num(montoMetodo1Usd),
            metodo2: metodoPago2,
            monto2_usd: num(montoMetodo2Usd),
          }
        : null

    const payload = {
      codigo_contrato: codigoGenerado,
      cliente_id: cli?.id ?? clienteId,
      cliente_nombre: cli?.nombre_razon_social ?? '',
      cliente_rif: cli?.rif_cedula ?? '',
      direccion_obra: cli?.direccion_obra ?? '',
      fecha_inicio: fechaInicio,
      fecha_vencimiento: fechaVencimientoCalculada,
      dias_alquiler: diasCalculo,
      requiere_flete: Boolean(requiereFlete),
      costo_flete_usd: fleteUSD,
      subtotal_equipos_usd: Number(subtotalEquiposUSD.toFixed(2)),
      deposito_garantia_usd: garantiaUSD,
      total_contrato_usd: totalContratoUSD,
      monto_pagado_usd: abonoHoyNum,
      saldo_pendiente_usd: restantePorCobrarHoyUSD,
      estado_pago: estadoPagoHoy,
      tasa_aplicada_bcv: num(tasa),
      metodo_pago: metodoFinal,
      desglose_pago: desgloseFinal,
      prorrogas_aplicadas: 0,
      estado: 'Activo',
      estado_despacho: 'Pendiente por Cargar',
      items: lineasValidas,
    }

    const { data: nuevoContrato, error: errInsert } = await insertarContratoSeguro(payload)
    if (errInsert) {
      setProcesando(false)
      setErrorMsg(`Error al registrar contrato: ${errInsert.message}`)
      return
    }

    // Guardar respaldo de abonos e items
    if (nuevoContrato?.id) {
      guardarAbonoRespaldo(nuevoContrato.id, {
        monto_pagado_usd: abonoHoyNum,
        saldo_pendiente_usd: restantePorCobrarHoyUSD,
        estado_pago: estadoPagoHoy,
      })
      setVersionRespaldo((v) => v + 1)
      try {
        sessionStorage.setItem(`contrato_items_${nuevoContrato.id}`, JSON.stringify(lineasValidas))
      } catch {
        // Ignorar
      }
    }

    // Si queda deuda pendiente (restantePorCobrarHoyUSD > 0), sumarla al saldo_pendiente_usd del cliente
    if (cli && restantePorCobrarHoyUSD > 0) {
      const nuevoSaldoCliente = Number(
        (num(cli.saldo_pendiente_usd) + restantePorCobrarHoyUSD).toFixed(2),
      )
      await supabase
        .from('clientes')
        .update({ saldo_pendiente_usd: nuevoSaldoCliente })
        .eq('id', cli.id)
    }

    const refContrato =
      nuevoContrato?.codigo_contrato ||
      nuevoContrato?.numero_contrato ||
      codigoGenerado

    // Descontar del Galpón y anotar en el Historial de Movimientos
    for (const l of lineasValidas) {
      const eqActual = inventario.find((i) => String(i.id) === String(l.inventario_id))
      if (eqActual) {
        const cant = num(l.cantidad)
        const nuevoDisp = Math.max(0, num(eqActual.stock_propio_disponible) - cant)
        const nuevoAlq = num(eqActual.stock_propio_alquilado) + cant

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
          tipo_movimiento: 'SALIDA (Alquiler a Obra)',
          cantidad: cant,
          stock_resultante: nuevoDisp,
          referencia_documento: refContrato,
          cliente_nombre: cli?.nombre_razon_social || 'Cliente de Obra',
        })
      }
    }

    setProcesando(false)
    setVistaFacturador(false)
    setLineas([])
    setDiasAlquiler('3')
    setRequiereFlete(false)
    setCostoFleteUsd('')
    setDepositoGarantiaUsd('')
    setMontoAbonadoHoyUsd('')
    setPagoMixto(false)
    setMontoMetodo1Usd('')
    setMontoMetodo2Usd('')
    setAvisoAliado(null)
    onRecargarTodo()
  }

  const obtenerItemsConRespaldo = (contrato) => {
    const deTabla = obtenerItemsContrato(contrato)
    if (deTabla.length > 0) return deTabla
    try {
      const raw = sessionStorage.getItem(`contrato_items_${contrato.id}`)
      if (raw) return JSON.parse(raw)
    } catch {
      // Ignorar
    }
    return []
  }

  // ---- Modal 1: Registrar Abono sobre un contrato activo --------------------
  const confirmarRegistroAbono = async (e) => {
    e.preventDefault()
    if (!modalAbono) return
    const abono = Number(montoNuevoAbonoUsd || 0)
    if (abono <= 0) {
      setErrorMsg('Escribe un monto de abono en USD mayor a 0.')
      return
    }

    const datosPago = obtenerDatosPagoContrato(modalAbono)
    const abonoEfectivo = Math.min(datosPago.restante, Number(abono.toFixed(2)))

    let metodoFinal = metodoPagoAbono || modalAbono.metodo_pago
    let desgloseFinal = null

    if (pagoMixtoAbono) {
      const m1 = num(montoMetodoAbono1Usd)
      const m2 = num(montoMetodoAbono2Usd)
      if (Math.abs(m1 + m2 - abonoEfectivo) > 0.01) {
        setErrorMsg(
          `La suma de los métodos mixtos ($${m1.toFixed(2)} + $${m2.toFixed(2)} = $${(m1 + m2).toFixed(2)}) debe coincidir exactamente con el abono ($${abonoEfectivo.toFixed(2)}).`,
        )
        return
      }
      metodoFinal = `Mixto: ${metodoPagoAbono1} ($${m1.toFixed(2)}) + ${metodoPagoAbono2} ($${m2.toFixed(2)})`
      desgloseFinal = {
        mixto: true,
        metodo1: metodoPagoAbono1,
        monto1_usd: m1,
        metodo2: metodoPagoAbono2,
        monto2_usd: m2,
      }
    }

    const nuevoPagado = Number((datosPago.pagado + abonoEfectivo).toFixed(2))
    const nuevoRestante = Math.max(0, Number((datosPago.total - nuevoPagado).toFixed(2)))
    const nuevoEstadoPago = calcularEstadoPago(nuevoPagado, nuevoRestante)

    setProcesando(true)
    setErrorMsg(null)

    const { error } = await actualizarContratoSeguro(modalAbono.id, {
      monto_pagado_usd: nuevoPagado,
      saldo_pendiente_usd: nuevoRestante,
      estado_pago: nuevoEstadoPago,
      metodo_pago: metodoFinal,
      desglose_pago: desgloseFinal,
    })

    if (error) {
      setProcesando(false)
      setErrorMsg(`Error al registrar abono: ${error.message}`)
      return
    }

    guardarAbonoRespaldo(modalAbono.id, {
      monto_pagado_usd: nuevoPagado,
      saldo_pendiente_usd: nuevoRestante,
      estado_pago: nuevoEstadoPago,
    })
    setVersionRespaldo((v) => v + 1)

    // Descontar del saldo_pendiente_usd del cliente en `clientes`
    const cli = mapaClientes.get(String(modalAbono.cliente_id))
    if (cli && abonoEfectivo > 0) {
      const nuevoSaldoCliente = Math.max(
        0,
        Number((num(cli.saldo_pendiente_usd) - abonoEfectivo).toFixed(2)),
      )
      await supabase
        .from('clientes')
        .update({ saldo_pendiente_usd: nuevoSaldoCliente })
        .eq('id', cli.id)
    }

    setProcesando(false)
    setModalAbono(null)
    setMontoNuevoAbonoUsd('')
    onRecargarTodo()
  }

  // ---- Modal 2: Postergar / Extender Días de Alquiler -----------------------
  const calculosProrroga = useMemo(() => {
    if (!modalProrroga) return { extraDias: 0, tarifaDiaria: 0, montoExtraUSD: 0, nuevaFecha: '' }
    const extraDias = Math.max(0, Number(diasExtra || 0))
    const items = obtenerItemsContrato(modalProrroga)
    const tarifaDiaria =
      items.length > 0
        ? items.reduce(
            (s, it) => s + num(it.cantidad) * num(it.precio_alquiler_dia_usd),
            0,
          )
        : num(modalProrroga.total_contrato_usd) /
          Math.max(1, num(modalProrroga.dias_alquiler) || 1)
    const montoExtraUSD = Number((tarifaDiaria * extraDias).toFixed(2))
    const nuevaFecha = sumarDiasISO(modalProrroga.fecha_vencimiento || hoyISO(), extraDias)
    const abonoExt = Math.min(montoExtraUSD, Math.max(0, Number(abonoProrrogaUsd || 0)))
    const deudaExtra = Math.max(0, Number((montoExtraUSD - abonoExt).toFixed(2)))

    return {
      extraDias,
      tarifaDiaria,
      montoExtraUSD,
      nuevaFecha,
      abonoExt,
      deudaExtra,
    }
  }, [modalProrroga, diasExtra, abonoProrrogaUsd])

  const confirmarProrroga = async (e) => {
    e.preventDefault()
    if (!modalProrroga) return
    const extra = Math.max(0, Number(diasExtra || 0))
    if (extra <= 0) {
      setErrorMsg('Indica al menos 1 día adicional para postergar el alquiler.')
      return
    }
    setProcesando(true)
    setErrorMsg(null)

    const datosPagoActual = obtenerDatosPagoContrato(modalProrroga)
    const { montoExtraUSD, nuevaFecha, abonoExt, deudaExtra } = calculosProrroga

    const nuevasProrrogas = num(modalProrroga.prorrogas_aplicadas) + extra
    const nuevoTotal = Number((datosPagoActual.total + montoExtraUSD).toFixed(2))
    const nuevoPagado = Number((datosPagoActual.pagado + abonoExt).toFixed(2))
    const nuevoRestante = Math.max(0, Number((datosPagoActual.restante + deudaExtra).toFixed(2)))
    const nuevoEstadoPago = calcularEstadoPago(nuevoPagado, nuevoRestante)

    const { error } = await actualizarContratoSeguro(modalProrroga.id, {
      prorrogas_aplicadas: nuevasProrrogas,
      fecha_vencimiento: nuevaFecha,
      total_contrato_usd: nuevoTotal,
      dias_alquiler: (num(modalProrroga.dias_alquiler) || 1) + extra,
      monto_pagado_usd: nuevoPagado,
      saldo_pendiente_usd: nuevoRestante,
      estado_pago: nuevoEstadoPago,
      metodo_pago: abonoExt > 0 ? metodoPagoProrroga : modalProrroga.metodo_pago,
    })

    if (error) {
      setProcesando(false)
      setErrorMsg(`Error al postergar días: ${error.message}`)
      return
    }

    guardarAbonoRespaldo(modalProrroga.id, {
      monto_pagado_usd: nuevoPagado,
      saldo_pendiente_usd: nuevoRestante,
      estado_pago: nuevoEstadoPago,
    })
    setVersionRespaldo((v) => v + 1)

    // Si quedó saldo pendiente de esta extensión, sumarlo al saldo_pendiente_usd del cliente
    const cli = mapaClientes.get(String(modalProrroga.cliente_id))
    if (cli && deudaExtra > 0) {
      const nuevoSaldoCliente = Number((num(cli.saldo_pendiente_usd) + deudaExtra).toFixed(2))
      await supabase
        .from('clientes')
        .update({ saldo_pendiente_usd: nuevoSaldoCliente })
        .eq('id', cli.id)
    }

    setProcesando(false)
    setModalProrroga(null)
    setDiasExtra('')
    setAbonoProrrogaUsd('')
    onRecargarTodo()
  }

  // Devolver a Galpón
  const finalizarContrato = async (contrato) => {
    const items = obtenerItemsConRespaldo(contrato)
    const cli = mapaClientes.get(String(contrato.cliente_id))
    const refContrato =
      contrato.codigo_contrato ||
      contrato.numero_contrato ||
      `CT-${String(contrato.id ?? '').slice(0, 6).toUpperCase()}`

    const ok = window.confirm(
      `¿Confirmar que el cliente regresó todos los equipos al galpón para el contrato ${refContrato}?`,
    )
    if (!ok) return

    setProcesando(true)
    for (const l of items) {
      const eqActual = inventario.find(
        (i) =>
          String(i.id) === String(l.inventario_id) ||
          (l.codigo && i.codigo === l.codigo),
      )
      if (eqActual) {
        const cant = num(l.cantidad)
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
          cliente_nombre:
            cli?.nombre_razon_social || contrato.cliente_nombre || 'Cliente de Obra',
        })
      }
    }

    await actualizarContratoSeguro(contrato.id, {
      estado: 'Devuelto a Galpón',
      estado_despacho: 'Devuelto a Galpón',
    })
    setProcesando(false)
    onRecargarTodo()
  }

  // ---- Devolución Parcial de Equipos de Obra --------------------------------
  const abrirDevolucionParcial = (c) => {
    setModalDevolucionParcial(c)
    setFechaDevolucionParcial(hoyISO())
    const items = obtenerItemsConRespaldo(c)
    const initCant = {}
    items.forEach((it, idx) => {
      const idKey = it.inventario_id ? String(it.inventario_id) : `${it.codigo || 'eq'}_${idx}`
      initCant[idKey] = ''
    })
    setDevolucionCantidades(initCant)
    setErrorMsg(null)
  }

  const confirmarDevolucionParcial = async (e) => {
    e.preventDefault()
    if (!modalDevolucionParcial) return

    const contrato = modalDevolucionParcial
    const items = obtenerItemsConRespaldo(contrato)
    const fechaDev = fechaDevolucionParcial || hoyISO()
    const diasUso = diasEntreFechas(contrato.fecha_inicio, fechaDev)

    // Validar cantidades a devolver
    let totalDevolviendo = 0
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx]
      if (it.devuelto) continue
      const idKey = it.inventario_id ? String(it.inventario_id) : `${it.codigo || 'eq'}_${idx}`
      const cantADevolver = Number(devolucionCantidades[idKey] || 0)
      const cantActiva = Number(it.cantidad || 0)
      if (cantADevolver > cantActiva) {
        setErrorMsg(
          `No puedes devolver más unidades (${cantADevolver}) de las que están en obra (${cantActiva}) para ${it.material}.`,
        )
        return
      }
      totalDevolviendo += cantADevolver
    }

    if (totalDevolviendo <= 0) {
      setErrorMsg('Indica la cantidad a devolver de al menos un equipo.')
      return
    }

    setProcesando(true)
    setErrorMsg(null)

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
      const cantActual = Number(it.cantidad || 0)
      const precioDia = num(
        it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
      )

      if (it.devuelto) {
        nuevosItems.push(it)
        continue
      }

      if (cantADevolver <= 0) {
        nuevosItems.push(it)
        todasDevueltas = false
      } else if (cantADevolver === cantActual) {
        // Se devuelve la totalidad de esta línea
        const subtotalEfectivo = Number((cantActual * precioDia * diasUso).toFixed(2))
        nuevosItems.push({
          ...it,
          devuelto: true,
          fecha_devolucion: fechaDev,
          dias_efectivos: diasUso,
          subtotal_item_usd: subtotalEfectivo,
          estado: 'Devuelto Parcial',
        })
      } else {
        // Se devuelve una parte (se divide la línea en devuelta y activa)
        todasDevueltas = false
        const cantRestante = cantActual - cantADevolver
        const subtotalEfectivo = Number((cantADevolver * precioDia * diasUso).toFixed(2))

        // Línea devuelta
        nuevosItems.push({
          ...it,
          cantidad: cantADevolver,
          devuelto: true,
          fecha_devolucion: fechaDev,
          dias_efectivos: diasUso,
          subtotal_item_usd: subtotalEfectivo,
          estado: 'Devuelto Parcial',
        })

        // Línea que sigue en obra
        nuevosItems.push({
          ...it,
          cantidad: cantRestante,
          devuelto: false,
        })
      }

      // Reintegrar stock a inventario y registrar kardex
      if (cantADevolver > 0) {
        const eqActual = inventario.find(
          (i) =>
            String(i.id) === String(it.inventario_id) ||
            (it.codigo && i.codigo === it.codigo),
        )
        if (eqActual) {
          const nuevoDisp = num(eqActual.stock_propio_disponible) + cantADevolver
          const nuevoAlq = Math.max(0, num(eqActual.stock_propio_alquilado) - cantADevolver)

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
            tipo_movimiento: 'ENTRADA (Devolución Parcial de Galpón)',
            cantidad: cantADevolver,
            stock_resultante: nuevoDisp,
            referencia_documento: refContrato,
            cliente_nombre: nombreCliente,
            observaciones: `Devolución parcial de obra (${cantADevolver} und. recibidas tras ${diasUso} días de uso). Recibido por ${usuarioActual?.nombre_completo || usuarioActual?.username || 'Operador'}`,
          })
        }
      }
    }

    // Recalcular montos del contrato
    const flete = contrato.requiere_flete ? num(contrato.costo_flete_usd) : 0
    const diasContrato = num(contrato.dias_alquiler) || 1
    const nuevoSubtotalEquipos = nuevosItems.reduce((acc, it) => {
      const precio = num(
        it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
      )
      if (it.devuelto) {
        return (
          acc +
          (num(it.subtotal_item_usd) ||
            num(it.cantidad) * precio * (num(it.dias_efectivos) || diasUso))
        )
      }
      return acc + num(it.cantidad) * precio * diasContrato
    }, 0)

    const nuevoTotalContrato = Number((nuevoSubtotalEquipos + flete).toFixed(2))
    const totalAnterior = num(contrato.total_contrato_usd)
    const reduccionTotal = Math.max(0, Number((totalAnterior - nuevoTotalContrato).toFixed(2)))

    const datosPago = obtenerDatosPagoContrato(contrato)
    const nuevoRestante = Math.max(0, Number((nuevoTotalContrato - datosPago.pagado).toFixed(2)))
    const nuevoEstadoPago = calcularEstadoPago(datosPago.pagado, nuevoRestante)

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

    await actualizarContratoSeguro(contrato.id, cambiosContrato)

    guardarAbonoRespaldo(contrato.id, {
      monto_pagado_usd: datosPago.pagado,
      saldo_pendiente_usd: nuevoRestante,
      estado_pago: nuevoEstadoPago,
    })
    try {
      sessionStorage.setItem(`contrato_items_${contrato.id}`, JSON.stringify(nuevosItems))
    } catch {
      // Ignorar
    }
    setVersionRespaldo((v) => v + 1)

    // Ajustar deuda del cliente en clientes si se redujo el total
    if (cli && reduccionTotal > 0) {
      const nuevoSaldoCliente = Math.max(
        0,
        Number((num(cli.saldo_pendiente_usd) - reduccionTotal).toFixed(2)),
      )
      await supabase
        .from('clientes')
        .update({ saldo_pendiente_usd: nuevoSaldoCliente })
        .eq('id', cli.id)
    }

    setProcesando(false)
    setModalDevolucionParcial(null)
    onRecargarTodo()
  }

  const filtrados = useMemo(() => {
    void versionRespaldo
    const q = busqueda.trim().toLowerCase()
    if (!q) return alquileres
    return alquileres.filter((a) => {
      const cli = mapaClientes.get(String(a.cliente_id))
      return [
        a.id,
        a.codigo_contrato,
        cli?.nombre_razon_social,
        cli?.rif_cedula,
        a.metodo_pago,
        a.estado,
      ].some((v) => String(v ?? '').toLowerCase().includes(q))
    })
  }, [alquileres, busqueda, mapaClientes, versionRespaldo])

  const tipsAlquileres = [
    'Pulsa "+ Nuevo Despacho" para abrir el facturador. Todos los campos de montos inician limpios para que escribas directo.',
    'Abonos directos: Al crear un contrato puedes anotar cuántos dólares abonó el cliente hoy y el sistema calcula el Restante por Cobrar.',
    '💵 Registrar Abono: Si un cliente dejó saldo pendiente, usa este botón para registrar pagos parciales o el pago final.',
    '📅 Postergar Días: Extiende los días de alquiler, suma el monto extra al contrato y refleja todo en la Nota de Entrega PDF.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  // ===========================================================================
  // VISTA FACTURADOR Y SALIDA DE EQUIPOS (PANTALLA DIVIDIDA)
  // ===========================================================================
  if (vistaFacturador) {
    return (
      <div className="space-y-3">
        {/* Barra Superior */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 px-4 py-3 text-white shadow"
          style={{ background: NEGRO, borderLeft: `4px solid ${NARANJA}` }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setVistaFacturador(false)}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white hover:border-[#FF5500]"
            >
              <ArrowLeft size={14} color={NARANJA} />
              <span>Volver a la lista de alquileres</span>
            </button>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Facturador y Salida de Equipos de Galpón
              </h2>
              <p className="text-[11px] text-neutral-400">
                Selecciona los equipos del lado izquierdo y completa los datos del cliente y su abono a la derecha
              </p>
            </div>
          </div>

          <div className="font-mono text-xs text-neutral-300">
            Tasa del Día:{' '}
            <b style={{ color: NARANJA }}>{tasa ? fmtVES(tasa) : '—'}</b>
          </div>
        </div>

        {/* Pantalla Dividida: Izquierda (Catálogo) / Derecha (Hoja de Liquidación) */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* COLUMNA IZQUIERDA: Catálogo de Equipos en Galpón */}
          <div
            className="flex flex-col overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm lg:col-span-7"
            style={{ borderLeft: `4px solid ${NARANJA}` }}
          >
            <div className="border-b border-neutral-200 bg-neutral-900 px-4 py-3 text-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  1. Equipos Disponibles en Galpón
                </span>
                <div className="flex items-center gap-2 rounded border border-neutral-700 bg-black px-2.5 py-1">
                  <Search size={13} color={NARANJA} />
                  <input
                    value={busquedaCatalogo}
                    onChange={(e) => setBusquedaCatalogo(e.target.value)}
                    placeholder="Buscar equipo por nombre o código..."
                    className="w-48 bg-transparent text-xs text-white outline-none"
                  />
                </div>
              </div>

              {/* Filtros rápidos */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {categoriasCatalogo.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaFiltro(cat)}
                    className="rounded px-2.5 py-1 text-[10px] font-bold uppercase transition-colors"
                    style={{
                      background: categoriaFiltro === cat ? NARANJA : '#262626',
                      color: categoriaFiltro === cat ? '#fff' : '#bdbdbd',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Aviso si falta stock propio */}
            {avisoAliado && (
              <div className="m-3 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold">
                      Falta material propio en galpón para &ldquo;{avisoAliado.equipo.material}&rdquo;
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Tenemos en galpón: <b>{avisoAliado.disponiblePropio}</b> · Traídos de aliados:{' '}
                      <b>{avisoAliado.disponibleExterno}</b>. Puedes ir a &quot;Préstamos con Aliados&quot; para pedirle prestado a una empresa amiga.
                    </p>
                  </div>
                </div>
                {onIrModulo && (
                  <button
                    type="button"
                    onClick={() => onIrModulo('prestamos')}
                    className="flex items-center gap-1 rounded bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black"
                  >
                    <Handshake size={13} color={NARANJA} />
                    <span>Pedir a un Aliado</span>
                  </button>
                )}
              </div>
            )}

            {/* Grilla de equipos */}
            <div className="grid max-h-[640px] gap-2.5 overflow-y-auto p-3 sm:grid-cols-2">
              {catalogoFiltrado.map((eq) => {
                const disp = num(eq.stock_propio_disponible)
                const ext = num(eq.stock_externo_prestado)
                const precio = num(eq.precio_alquiler_dia_usd)
                const enCarrito = lineas.find((l) => String(l.inventario_id) === String(eq.id))
                const sinStock = disp <= 0

                return (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => agregarAlDespacho(eq)}
                    className="flex flex-col justify-between rounded-md border p-3 text-left transition-all hover:border-[#FF5500]"
                    style={{
                      borderColor: enCarrito ? NARANJA : '#d4d4d4',
                      background: enCarrito
                        ? 'rgba(255,85,0,0.06)'
                        : sinStock
                          ? '#fafafa'
                          : '#ffffff',
                      borderLeft: `4px solid ${sinStock ? '#dc2626' : NARANJA}`,
                    }}
                    title="Toca para agregar 1 unidad a la hoja de despacho"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] font-bold text-neutral-500">
                          {eq.codigo}
                        </span>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                          {eq.categoria || 'General'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-bold text-neutral-900">{eq.material}</p>
                    </div>

                    <div className="mt-2.5 flex items-end justify-between border-t border-neutral-200 pt-2">
                      <div>
                        <span
                          className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                          style={
                            disp > 0
                              ? { background: 'rgba(16,185,129,0.15)', color: '#047857' }
                              : { background: 'rgba(239,68,68,0.15)', color: '#b91c1c' }
                          }
                        >
                          EN GALPÓN: {fmtNum(disp)}
                        </span>
                        {ext > 0 && (
                          <span className="ml-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-800">
                            +{fmtNum(ext)} DE ALIADO
                          </span>
                        )}
                      </div>

                      <div className="text-right font-mono">
                        <div className="text-xs font-bold text-neutral-900">
                          {fmtUSD(precio)}/día
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {tasa ? fmtVES(precio * tasa) : '—'}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* COLUMNA DERECHA: Hoja de Contrato, Abono Directo y Liquidación */}
          <form
            onSubmit={emitirContratoYDespachar}
            className="flex flex-col justify-between overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm lg:col-span-5"
            style={{ borderLeft: `4px solid ${NARANJA}` }}
          >
            <div>
              <div className="border-b border-neutral-200 bg-neutral-900 px-4 py-3 text-white">
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  2. Datos del Cliente, Abono y Cobro
                </h3>
                <p className="text-[10px] text-neutral-400">
                  Cálculo automático de días, fletes, abono de hoy y restante por cobrar
                </p>
              </div>

              <div className="space-y-3.5 p-4 text-xs">
                {errorMsg && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
                    <TriangleAlert size={15} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Cliente */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="font-bold uppercase text-neutral-700">
                      Cliente / Empresa *
                    </label>
                    <button
                      type="button"
                      onClick={() => setMostrarFormCliente((v) => !v)}
                      className="flex items-center gap-1 rounded bg-neutral-900 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-black"
                    >
                      <UserPlus size={11} color={NARANJA} />
                      <span>{mostrarFormCliente ? 'Cerrar' : '+ Cliente Nuevo'}</span>
                    </button>
                  </div>

                  <select
                    required
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="w-full rounded border border-neutral-300 bg-white px-2.5 py-2 outline-none focus:border-[#FF5500]"
                  >
                    <option value="">— Elige un cliente registrado —</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre_razon_social} ({c.rif_cedula})
                      </option>
                    ))}
                  </select>

                  {/* Semáforo y Alerta de Cliente con Deuda */}
                  {(() => {
                    const cliSel = clientes.find((c) => String(c.id) === String(clienteId))
                    const deuda = num(cliSel?.saldo_pendiente_usd)
                    if (!cliSel || deuda <= 0.009) return null
                    return (
                      <div className="mt-2 flex items-start gap-2.5 rounded-md border-2 border-red-500 bg-red-50 p-3 text-xs text-red-900 shadow-sm">
                        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
                        <div>
                          <p className="font-bold text-red-800">
                            ⚠️ Atención: Este cliente registra un saldo pendiente actual de USD {fmtUSD(deuda)}
                            {tasa ? ` (${fmtVES(deuda * tasa)} a la Tasa del Día)` : ''}.
                          </p>
                          <p className="mt-0.5 text-[11px] text-red-700">
                            Tiene cobros atrasados de alquileres previos. Verifica antes de despachar o solicita el abono de su deuda.
                          </p>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Formulario rápido para cliente nuevo */}
                  {mostrarFormCliente && (
                    <div className="mt-2 space-y-2 rounded border border-neutral-300 bg-neutral-50 p-3">
                      <p className="text-[11px] font-bold uppercase text-neutral-700">
                        Anotar Nuevo Cliente
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="RIF o Cédula *"
                          value={nuevoCliente.rif_cedula}
                          onChange={(e) =>
                            setNuevoCliente({ ...nuevoCliente, rif_cedula: e.target.value })
                          }
                          className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                        />
                        <input
                          placeholder="Teléfono de contacto"
                          value={nuevoCliente.telefono}
                          onChange={(e) =>
                            setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
                          }
                          className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                        />
                      </div>
                      <input
                        placeholder="Nombre completo o Razón Social *"
                        value={nuevoCliente.nombre_razon_social}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            nombre_razon_social: e.target.value,
                          })
                        }
                        className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                      />
                      <input
                        placeholder="Dirección de la obra donde van los equipos"
                        value={nuevoCliente.direccion_obra}
                        onChange={(e) =>
                          setNuevoCliente({ ...nuevoCliente, direccion_obra: e.target.value })
                        }
                        className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={guardarClienteRapido}
                          disabled={guardandoCliente}
                          className="rounded px-3 py-1 text-xs font-bold text-white"
                          style={{ background: NARANJA }}
                        >
                          {guardandoCliente ? 'Guardando...' : 'Guardar y Seleccionar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Fechas y Días (Campo numérico limpio) */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                      Fecha Salida
                    </label>
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                      Días Alquiler
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej. 3"
                      value={diasAlquiler}
                      onChange={(e) => setDiasAlquiler(limpiarInputEntero(e.target.value))}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                      Fecha Regreso
                    </label>
                    <input
                      type="date"
                      readOnly
                      value={fechaVencimientoCalculada}
                      className="w-full rounded border border-neutral-200 bg-neutral-100 px-2 py-1.5 font-mono text-xs text-neutral-700"
                    />
                  </div>
                </div>

                {/* Equipos seleccionados */}
                <div className="rounded border border-neutral-300 bg-neutral-50 p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                      Equipos en el despacho ({lineas.length})
                    </span>
                    <span className="font-mono text-[10px] text-neutral-500">
                      Por: {diasCalculo} día(s)
                    </span>
                  </div>

                  {lineas.length === 0 ? (
                    <p className="py-4 text-center text-xs text-neutral-400">
                      Toca los equipos en el catálogo izquierdo para cargarlos a esta lista.
                    </p>
                  ) : (
                    <div className="max-h-44 divide-y divide-neutral-200 overflow-y-auto bg-white">
                      {lineas.map((l) => {
                        const sub =
                          Number(l.cantidad || 0) *
                          num(l.precio_alquiler_dia_usd) *
                          diasCalculo
                        return (
                          <div
                            key={l.inventario_id}
                            className="flex items-center justify-between gap-2 px-2.5 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-bold text-neutral-900">{l.material}</p>
                              <p className="font-mono text-[10px] text-neutral-500">
                                {l.codigo} · {fmtUSD(l.precio_alquiler_dia_usd)}/día
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="1"
                                value={l.cantidad}
                                onChange={(e) =>
                                  cambiarCantidadLinea(l.inventario_id, e.target.value)
                                }
                                className="w-14 rounded border border-neutral-300 px-1.5 py-1 text-center font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                                title="Cantidad de piezas a entregar"
                              />
                              <span className="w-20 text-right font-mono text-xs font-bold">
                                {fmtUSD(sub)}
                              </span>
                              <button
                                type="button"
                                onClick={() => quitarLinea(l.inventario_id)}
                                className="text-red-600 hover:text-red-800"
                                title="Quitar de este despacho"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Flete y Garantía (Inician en blanco '' con placeholder) */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded border border-neutral-300 p-2.5">
                    <label className="flex cursor-pointer items-center gap-2 font-bold text-neutral-800">
                      <input
                        type="checkbox"
                        checked={requiereFlete}
                        onChange={(e) => setRequiereFlete(e.target.checked)}
                        className="h-4 w-4 accent-[#FF5500]"
                      />
                      <Truck size={14} color={NARANJA} />
                      <span>Incluir Transporte / Flete</span>
                    </label>
                    {requiereFlete && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-neutral-600">Costo USD:</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ej. 15.00"
                          value={costoFleteUsd}
                          onChange={(e) =>
                            setCostoFleteUsd(limpiarInputDecimal(e.target.value))
                          }
                          className="w-24 rounded border border-neutral-300 px-2 py-1 text-right font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-neutral-300 p-2.5">
                    <label className="block text-[10px] font-bold uppercase text-neutral-600">
                      Depósito en Garantía (USD)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={depositoGarantiaUsd}
                      onChange={(e) =>
                        setDepositoGarantiaUsd(limpiarInputDecimal(e.target.value))
                      }
                      placeholder="0.00"
                      className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-right font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                </div>

                {/* ABONO DIRECTO Y CÁLCULO AUTOMÁTICO DEL RESTANTE (SIN BOTONES DE %) */}
                <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-700">
                        Monto Abonado / Pagado Hoy (USD)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={montoAbonadoHoyUsd}
                        onChange={(e) =>
                          setMontoAbonadoHoyUsd(limpiarInputDecimal(e.target.value))
                        }
                        placeholder={
                          totalContratoUSD > 0
                            ? `Ej. ${totalContratoUSD.toFixed(2)}`
                            : '0.00'
                        }
                        className="w-full rounded border border-neutral-300 bg-white px-2.5 py-2 font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="block text-[10px] font-bold uppercase text-neutral-700">
                          Forma de Pago del Cliente
                        </label>
                      </div>
                      {!pagoMixto ? (
                        <select
                          value={metodoPago}
                          onChange={(e) => setMetodoPago(e.target.value)}
                          className="w-full rounded border border-neutral-300 bg-white px-2.5 py-2 font-bold outline-none focus:border-[#FF5500]"
                        >
                          {metodosPago.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] font-bold text-amber-800">
                          💳 Pago Mixto (Desglosado abajo)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Casilla para Habilitar Pago Mixto */}
                  <div className="mt-2.5 border-t border-neutral-200 pt-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-neutral-800">
                      <input
                        type="checkbox"
                        checked={pagoMixto}
                        onChange={(e) => {
                          const activando = e.target.checked
                          setPagoMixto(activando)
                          if (activando && abonoHoyNum > 0) {
                            const mitad = (abonoHoyNum / 2).toFixed(2)
                            const resto = (abonoHoyNum - Number(mitad)).toFixed(2)
                            setMontoMetodo1Usd(mitad)
                            setMontoMetodo2Usd(resto)
                          }
                        }}
                        className="h-4 w-4 accent-[#FF5500]"
                      />
                      <span>💳 Habilitar Pago Mixto (Dividir en dos métodos)</span>
                    </label>

                    {pagoMixto && (
                      <div className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50/70 p-2.5">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                              Método 1
                            </label>
                            <select
                              value={metodoPago1}
                              onChange={(e) => setMetodoPago1(e.target.value)}
                              className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-[#FF5500]"
                            >
                              {metodosPago.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="text-[10px] font-bold text-neutral-500">Monto 1 USD:</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={montoMetodo1Usd}
                                onChange={(e) => {
                                  const val = limpiarInputDecimal(e.target.value)
                                  setMontoMetodo1Usd(val)
                                  if (abonoHoyNum > 0) {
                                    const restante = Math.max(
                                      0,
                                      Number((abonoHoyNum - Number(val || 0)).toFixed(2)),
                                    )
                                    setMontoMetodo2Usd(restante > 0 ? String(restante) : '')
                                  }
                                }}
                                className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-right font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                              />
                            </div>
                            {tasa && Number(montoMetodo1Usd || 0) > 0 && (
                              <p className="mt-0.5 text-right font-mono text-[10px] text-neutral-500">
                                ≈ {fmtVES(Number(montoMetodo1Usd) * tasa)} (a la Tasa del Día)
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                              Método 2
                            </label>
                            <select
                              value={metodoPago2}
                              onChange={(e) => setMetodoPago2(e.target.value)}
                              className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-[#FF5500]"
                            >
                              {metodosPago.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="text-[10px] font-bold text-neutral-500">Monto 2 USD:</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={montoMetodo2Usd}
                                onChange={(e) =>
                                  setMontoMetodo2Usd(limpiarInputDecimal(e.target.value))
                                }
                                className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-right font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                              />
                            </div>
                            {tasa && Number(montoMetodo2Usd || 0) > 0 && (
                              <p className="mt-0.5 text-right font-mono text-[10px] text-neutral-500">
                                ≈ {fmtVES(Number(montoMetodo2Usd) * tasa)} (a la Tasa del Día)
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Comparación de suma vs total abonado */}
                        <div className="flex items-center justify-between border-t border-amber-200 pt-1.5 font-mono text-[11px]">
                          <span>
                            Suma Mixta:{' '}
                            <b>
                              {fmtUSD(
                                Number(montoMetodo1Usd || 0) + Number(montoMetodo2Usd || 0),
                              )}
                            </b>
                          </span>
                          <span
                            className={
                              Math.abs(
                                Number(montoMetodo1Usd || 0) +
                                  Number(montoMetodo2Usd || 0) -
                                  abonoHoyNum,
                              ) < 0.01
                                ? 'font-bold text-emerald-700'
                                : 'font-bold text-red-600'
                            }
                          >
                            {Math.abs(
                              Number(montoMetodo1Usd || 0) +
                                Number(montoMetodo2Usd || 0) -
                                abonoHoyNum,
                            ) < 0.01
                              ? '✓ Cuadra con el abono hoy'
                              : `⚠️ Diferencia: ${fmtUSD(Math.abs(Number(montoMetodo1Usd || 0) + Number(montoMetodo2Usd || 0) - abonoHoyNum))}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Desglose en vivo: Abonado Hoy y Restante por Cobrar */}
                  <div className="mt-2.5 space-y-1 rounded border border-neutral-200 bg-white p-2.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-emerald-700">
                      <span className="font-bold">Abonado Hoy:</span>
                      <span className="font-bold">
                        {fmtUSD(abonoHoyNum)} (
                        {tasa ? `${fmtVES(abonoHoyNum * tasa)} a la Tasa del Día` : '—'})
                      </span>
                    </div>
                    <div
                      className={`flex items-center justify-between ${
                        restantePorCobrarHoyUSD > 0 ? 'text-red-600' : 'text-neutral-600'
                      }`}
                    >
                      <span className="font-bold">Restante por Cobrar (Deuda):</span>
                      <span className="font-bold">
                        {fmtUSD(restantePorCobrarHoyUSD)} (
                        {tasa
                          ? `${fmtVES(restantePorCobrarHoyUSD * tasa)} a la Tasa del Día`
                          : '—'}
                        )
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total final */}
            <div
              className="border-t border-neutral-800 p-4 text-white"
              style={{ background: NEGRO }}
            >
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between text-neutral-400">
                  <span>Alquiler de equipos ({diasCalculo} días):</span>
                  <span>{fmtUSD(subtotalEquiposUSD)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Transporte / Flete:</span>
                  <span>{fmtUSD(fleteUSD)}</span>
                </div>
                {garantiaUSD > 0 && (
                  <div className="flex justify-between text-neutral-400">
                    <span>Garantía Reembolsable:</span>
                    <span>{fmtUSD(garantiaUSD)}</span>
                  </div>
                )}

                <div className="my-2 border-t border-neutral-700 pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase text-white">
                      TOTAL CONTRATO EN DÓLARES:
                    </span>
                    <span className="text-lg font-bold" style={{ color: NARANJA }}>
                      {fmtUSD(totalContratoUSD)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] text-neutral-300">
                    <span>TOTAL EN BOLÍVARES (TASA DEL DÍA):</span>
                    <span className="font-bold">
                      {tasa ? fmtVES(totalContratoUSD * tasa) : '—'}
                    </span>
                  </div>
                  {garantiaUSD > 0 && (
                    <div className="mt-1.5 flex justify-between rounded bg-neutral-900 px-2 py-1 text-[11px] text-amber-300">
                      <span>Total con Garantía:</span>
                      <span className="font-bold">
                        {fmtUSD(totalConGarantiaUSD)} (
                        {tasa ? fmtVES(totalConGarantiaUSD * tasa) : '—'})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={procesando}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow transition-opacity hover:opacity-95 disabled:opacity-50"
                style={{ background: NARANJA }}
              >
                {procesando ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>Aprobar Despacho, Descontar de Galpón y Guardar</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ===========================================================================
  // VISTA LISTA DE CONTRATOS
  // ===========================================================================
  return (
    <div className="space-y-4">
      {/* Guía Rápida */}
      <GuiaRapida moduloNombre="Alquileres y Facturación" tips={tipsAlquileres} />

      <section
        className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
        style={{ borderLeft: `4px solid ${NARANJA}` }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
          style={{ background: NEGRO }}
        >
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Control de Alquileres, Abonos, Fletes y Devoluciones
            </h2>
            <p className="text-[11px] text-neutral-400">
              Contratos activos, abonos parciales, postergación de días y recepción de equipos en galpón
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1.5">
              <Search size={14} color={NARANJA} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por cliente, RIF o contrato..."
                className="w-48 bg-transparent text-xs text-white outline-none"
              />
            </div>

            <button
              onClick={() => {
                setErrorMsg(null)
                setAvisoAliado(null)
                setMetodoPago(metodosPago[0] || 'Efectivo USD')
                setVistaFacturador(true)
              }}
              className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-bold text-white shadow"
              style={{ background: NARANJA }}
              title="Abrir la pantalla para registrar la salida de equipos y cobrar al cliente"
            >
              <Plus size={15} />
              <span>+ Nuevo Despacho (Facturador de Equipos)</span>
            </button>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-xs text-neutral-500">
            No hay contratos registrados. Haz clic en &quot;+ Nuevo Despacho&quot; para registrar el primero.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ color: NEGRO }}>
              <thead style={{ background: '#1c1c1c' }}>
                <tr>
                  <th className={th}>N° Contrato</th>
                  <th className={th}>Cliente / Obra</th>
                  <th className={th}>Equipos en Obra</th>
                  <th className={th}>Fecha Regreso</th>
                  <th className={`${th} text-center`}>Prórrogas</th>
                  {permisos.puedeVerMontosVentas && (
                    <>
                      <th className={`${th} text-right`}>Total Contrato</th>
                      <th className={`${th} text-right`}>Monto Pagado</th>
                      <th className={`${th} text-right`}>Restante por Cobrar</th>
                    </>
                  )}
                  <th className={`${th} text-center`}>Estado</th>
                  <th className={`${th} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtrados.map((c) => {
                  const cli = mapaClientes.get(String(c.cliente_id))
                  const items = obtenerItemsConRespaldo(c)
                  const est = String(c.estado ?? 'Activo')
                  const estDespacho = String(
                    c.estado_despacho ||
                      (est.toLowerCase().includes('devuelt') ||
                      est.toLowerCase().includes('finaliz')
                        ? 'Devuelto a Galpón'
                        : 'Pendiente por Cargar'),
                  )
                  const finalizado =
                    est.toLowerCase().includes('finaliz') ||
                    est.toLowerCase().includes('devuelt') ||
                    estDespacho.toLowerCase().includes('devuelt')
                  const pendienteCarga = !finalizado && estDespacho === 'Pendiente por Cargar'
                  const diasRest = diasEntreHoyY(c.fecha_vencimiento)
                  const datosPago = obtenerDatosPagoContrato(c)

                  const nro =
                    c.codigo_contrato ||
                    c.numero_contrato ||
                    `CT-${String(c.id ?? '').slice(0, 6).toUpperCase()}`

                  return (
                    <tr key={c.id} className="transition-colors hover:bg-orange-50/50">
                      <td className={`${td} font-mono font-bold text-neutral-800`}>
                        <div>{nro}</div>
                        <div className="text-[10px] font-normal text-neutral-500">
                          {c.metodo_pago || '—'}
                        </div>
                      </td>
                      <td className={td}>
                        <div className="font-bold text-neutral-900">
                          {cli?.nombre_razon_social ||
                            c.cliente_nombre ||
                            `Cliente #${c.cliente_id ?? '—'}`}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-500">
                          {cli?.rif_cedula || c.cliente_rif || '—'} ·{' '}
                          {c.direccion_obra || cli?.direccion_obra || ''}
                        </div>
                      </td>

                      <td className={td}>
                        {items.length > 0 ? (
                          <div className="space-y-0.5 text-xs">
                            {items.map((it, i) => (
                              <div key={i}>
                                <b className="font-mono">{fmtNum(it.cantidad)}x</b>{' '}
                                {it.material || it.codigo}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">Ver en PDF</span>
                        )}
                      </td>

                      <td className={`${td} font-mono`}>
                        <div className="font-bold">{fmtFecha(c.fecha_vencimiento)}</div>
                        {!finalizado && diasRest !== null && (
                          <div
                            className="text-[10px] font-bold uppercase"
                            style={{
                              color:
                                diasRest < 0
                                  ? '#dc2626'
                                  : diasRest <= 3
                                    ? '#d97706'
                                    : '#047857',
                            }}
                          >
                            {diasRest < 0
                              ? `Venció hace ${Math.abs(diasRest)}d`
                              : diasRest === 0
                                ? 'VENCE HOY'
                                : `Vence en ${diasRest}d`}
                          </div>
                        )}
                      </td>

                      <td className={`${td} text-center font-mono font-bold`}>
                        +{num(c.prorrogas_aplicadas)} d
                      </td>

                      {permisos.puedeVerMontosVentas && (
                        <>
                          <td className={`${td} text-right font-mono leading-tight`}>
                            <div className="font-bold text-neutral-900">
                              {fmtUSD(datosPago.total)}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {tasa ? fmtVES(datosPago.total * tasa) : '—'}
                            </div>
                          </td>

                          <td className={`${td} text-right font-mono leading-tight`}>
                            <div className="font-bold text-emerald-700">
                              {fmtUSD(datosPago.pagado)}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {tasa ? fmtVES(datosPago.pagado * tasa) : '—'}
                            </div>
                          </td>

                          <td className={`${td} text-right font-mono leading-tight`}>
                            <div
                              className="font-bold"
                              style={{
                                color: datosPago.restante > 0 ? '#dc2626' : '#047857',
                              }}
                            >
                              {fmtUSD(datosPago.restante)}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {datosPago.restante > 0
                                ? tasa
                                  ? fmtVES(datosPago.restante * tasa)
                                  : 'Deuda activa'
                                : 'Pagado completo'}
                            </div>
                          </td>
                        </>
                      )}

                      <td className={`${td} text-center`}>
                        <span
                          className="rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={
                            finalizado
                              ? {
                                  background: '#f3f4f6',
                                  color: '#374151',
                                  borderColor: '#d1d5db',
                                }
                              : pendienteCarga
                                ? {
                                    background: 'rgba(245,158,11,0.14)',
                                    color: '#b45309',
                                    borderColor: '#fcd34d',
                                  }
                                : {
                                    background: 'rgba(16,185,129,0.12)',
                                    color: '#047857',
                                    borderColor: '#6ee7b7',
                                  }
                          }
                        >
                          {finalizado
                            ? 'Devuelto a Galpón'
                            : pendienteCarga
                              ? 'Pendiente por Cargar'
                              : 'En Obra (Despachado)'}
                        </span>
                      </td>

                      <td className={`${td} text-center`}>
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {permisos.puedeVerMontosVentas && datosPago.restante > 0 && (
                            <button
                              onClick={() => {
                                setMontoNuevoAbonoUsd('')
                                setMetodoPagoAbono(c.metodo_pago || metodosPago[0] || 'Efectivo USD')
                                setErrorMsg(null)
                                setModalAbono(c)
                              }}
                              className="flex items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100"
                              title="Registrar un abono o pago del cliente para descontar de su deuda pendiente"
                            >
                              <Banknote size={13} />
                              <span>💵 Registrar Abono</span>
                            </button>
                          )}

                          {!finalizado && (
                            <>
                              <button
                                onClick={() => {
                                  setDiasExtra('')
                                  setAbonoProrrogaUsd('')
                                  setMetodoPagoProrroga(
                                    c.metodo_pago || metodosPago[0] || 'Efectivo USD',
                                  )
                                  setErrorMsg(null)
                                  setModalProrroga(c)
                                }}
                                className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                                title="Extender los días de alquiler, recalcular cobro y actualizar fecha de vencimiento"
                              >
                                <CalendarPlus size={13} />
                                <span>📅 Postergar Días</span>
                              </button>

                              <button
                                onClick={() => abrirDevolucionParcial(c)}
                                disabled={procesando}
                                className="flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-800 hover:bg-purple-100"
                                title="Registrar devolución parcial de equipos y recalcular cobro por días reales de uso"
                              >
                                <PackageCheck size={13} />
                                <span>📦 Devolución Parcial</span>
                              </button>

                              <button
                                onClick={() => finalizarContrato(c)}
                                disabled={procesando}
                                className="flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                                title="Registra que el cliente ya regresó todos los equipos al galpón"
                              >
                                <RotateCcw size={13} />
                                <span>Devolver a Galpón</span>
                              </button>
                            </>
                          )}

                          <button
                            onClick={() =>
                              generarFacturaContratoPDF({
                                contrato: {
                                  ...c,
                                  monto_pagado_usd: datosPago.pagado,
                                  saldo_pendiente_usd: datosPago.restante,
                                  estado_pago: datosPago.estadoPago,
                                },
                                cliente: cli,
                                items,
                                tasaDelDia: tasa,
                              })
                            }
                            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold text-white"
                            style={{ background: NEGRO }}
                            title="Descargar Nota de Entrega en PDF con el desglose de abonos, restante y prórrogas"
                          >
                            <FileText size={13} color={NARANJA} />
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* =================================================================
            MODAL 1: REGISTRAR ABONO (💵 Registrar Abono)
           ================================================================= */}
        {modalAbono && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <div className="flex items-center gap-2">
                  <Banknote size={17} color={NARANJA} />
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    💵 Registrar Abono de Contrato
                  </h3>
                </div>
                <button
                  onClick={() => setModalAbono(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={confirmarRegistroAbono} className="space-y-4 p-5 text-xs">
                {errorMsg && (
                  <div className="rounded border border-red-300 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                    {errorMsg}
                  </div>
                )}

                {(() => {
                  const datosPago = obtenerDatosPagoContrato(modalAbono)
                  const abonoNum = Math.min(
                    datosPago.restante,
                    Math.max(0, Number(montoNuevoAbonoUsd || 0)),
                  )
                  const nuevoRestante = Math.max(
                    0,
                    Number((datosPago.restante - abonoNum).toFixed(2)),
                  )
                  return (
                    <>
                      <div className="rounded border border-neutral-200 bg-neutral-100 p-3 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-neutral-600">Total del Contrato:</span>
                          <b>{fmtUSD(datosPago.total)}</b>
                        </div>
                        <div className="flex justify-between text-emerald-700">
                          <span>Pagado hasta ahora:</span>
                          <b>{fmtUSD(datosPago.pagado)}</b>
                        </div>
                        <div className="mt-1 flex justify-between border-t border-neutral-300 pt-1 text-red-600">
                          <span className="font-bold">Restante por Cobrar actual:</span>
                          <b className="text-sm">
                            {fmtUSD(datosPago.restante)} (
                            {tasa ? fmtVES(datosPago.restante * tasa) : '—'})
                          </b>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block font-bold uppercase text-neutral-700">
                          Monto en USD que abona hoy *
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          required
                          placeholder={`Ej. ${datosPago.restante.toFixed(2)}`}
                          value={montoNuevoAbonoUsd}
                          onChange={(e) =>
                            setMontoNuevoAbonoUsd(limpiarInputDecimal(e.target.value))
                          }
                          className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                        />
                        {tasa && abonoNum > 0 && (
                          <p className="mt-1 font-mono text-[11px] text-neutral-600">
                            Equivalente hoy: <b>{fmtVES(abonoNum * tasa)}</b> (a la Tasa del Día)
                          </p>
                        )}
                      </div>

                      {/* Casilla para Habilitar Pago Mixto en Abono */}
                      <div className="border-t border-neutral-200 pt-2">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-neutral-800">
                          <input
                            type="checkbox"
                            checked={pagoMixtoAbono}
                            onChange={(e) => {
                              const activando = e.target.checked
                              setPagoMixtoAbono(activando)
                              if (activando && abonoNum > 0) {
                                const mitad = (abonoNum / 2).toFixed(2)
                                const resto = (abonoNum - Number(mitad)).toFixed(2)
                                setMontoMetodoAbono1Usd(mitad)
                                setMontoMetodoAbono2Usd(resto)
                              }
                            }}
                            className="h-4 w-4 accent-[#FF5500]"
                          />
                          <span>💳 Habilitar Pago Mixto (Dividir en dos métodos)</span>
                        </label>

                        {!pagoMixtoAbono ? (
                          <div className="mt-2">
                            <label className="mb-1 block font-bold uppercase text-neutral-700">
                              Método de Pago recibido
                            </label>
                            <select
                              value={metodoPagoAbono}
                              onChange={(e) => setMetodoPagoAbono(e.target.value)}
                              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 font-bold outline-none focus:border-[#FF5500]"
                            >
                              {metodosPago.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50/70 p-2.5">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                                  Método 1
                                </label>
                                <select
                                  value={metodoPagoAbono1}
                                  onChange={(e) => setMetodoPagoAbono1(e.target.value)}
                                  className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-[#FF5500]"
                                >
                                  {metodosPago.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-neutral-500">Monto 1 USD:</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={montoMetodoAbono1Usd}
                                    onChange={(e) => {
                                      const val = limpiarInputDecimal(e.target.value)
                                      setMontoMetodoAbono1Usd(val)
                                      if (abonoNum > 0) {
                                        const rest = Math.max(
                                          0,
                                          Number((abonoNum - Number(val || 0)).toFixed(2)),
                                        )
                                        setMontoMetodoAbono2Usd(rest > 0 ? String(rest) : '')
                                      }
                                    }}
                                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-right font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                                  />
                                </div>
                                {tasa && Number(montoMetodoAbono1Usd || 0) > 0 && (
                                  <p className="mt-0.5 text-right font-mono text-[10px] text-neutral-500">
                                    ≈ {fmtVES(Number(montoMetodoAbono1Usd) * tasa)} (a la Tasa del Día)
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                                  Método 2
                                </label>
                                <select
                                  value={metodoPagoAbono2}
                                  onChange={(e) => setMetodoPagoAbono2(e.target.value)}
                                  className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-[#FF5500]"
                                >
                                  {metodosPago.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-neutral-500">Monto 2 USD:</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={montoMetodoAbono2Usd}
                                    onChange={(e) =>
                                      setMontoMetodoAbono2Usd(limpiarInputDecimal(e.target.value))
                                    }
                                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-right font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                                  />
                                </div>
                                {tasa && Number(montoMetodoAbono2Usd || 0) > 0 && (
                                  <p className="mt-0.5 text-right font-mono text-[10px] text-neutral-500">
                                    ≈ {fmtVES(Number(montoMetodoAbono2Usd) * tasa)} (a la Tasa del Día)
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-amber-200 pt-1.5 font-mono text-[11px]">
                              <span>
                                Suma Mixta:{' '}
                                <b>
                                  {fmtUSD(
                                    Number(montoMetodoAbono1Usd || 0) +
                                      Number(montoMetodoAbono2Usd || 0),
                                  )}
                                </b>
                              </span>
                              <span
                                className={
                                  Math.abs(
                                    Number(montoMetodoAbono1Usd || 0) +
                                      Number(montoMetodoAbono2Usd || 0) -
                                      abonoNum,
                                  ) < 0.01
                                    ? 'font-bold text-emerald-700'
                                    : 'font-bold text-red-600'
                                }
                              >
                                {Math.abs(
                                  Number(montoMetodoAbono1Usd || 0) +
                                    Number(montoMetodoAbono2Usd || 0) -
                                    abonoNum,
                                ) < 0.01
                                  ? '✓ Cuadra con el abono hoy'
                                  : `⚠️ Diferencia: ${fmtUSD(Math.abs(Number(montoMetodoAbono1Usd || 0) + Number(montoMetodoAbono2Usd || 0) - abonoNum))}`}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded border border-emerald-200 bg-emerald-50 p-3 font-mono text-xs text-emerald-900">
                        <div className="flex justify-between">
                          <span>Nuevo Restante por Cobrar tras este abono:</span>
                          <b>
                            {fmtUSD(nuevoRestante)} (
                            {tasa ? fmtVES(nuevoRestante * tasa) : '—'})
                          </b>
                        </div>
                      </div>
                    </>
                  )
                })()}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalAbono(null)}
                    className="rounded border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={procesando}
                    className="flex items-center gap-1.5 rounded px-5 py-2 text-xs font-bold text-white"
                    style={{ background: NARANJA }}
                  >
                    {procesando && <Loader2 size={14} className="animate-spin" />}
                    <span>Confirmar Abono</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =================================================================
            MODAL 2: POSTERGAR / EXTENDER DÍAS DE ALQUILER (📅 Postergar Días)
           ================================================================= */}
        {modalProrroga && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <div className="flex items-center gap-2">
                  <CalendarPlus size={17} color={NARANJA} />
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    📅 Postergar / Extender Días de Alquiler
                  </h3>
                </div>
                <button
                  onClick={() => setModalProrroga(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={confirmarProrroga} className="space-y-3.5 p-5 text-xs">
                {errorMsg && (
                  <div className="rounded border border-red-300 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                    {errorMsg}
                  </div>
                )}

                <p className="text-neutral-600">
                  Fecha de regreso actual: <b>{fmtFecha(modalProrroga.fecha_vencimiento)}</b> · Días
                  extras acumulados: <b>+{num(modalProrroga.prorrogas_aplicadas)} día(s)</b>
                </p>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-700">
                    Cantidad de días adicionales de alquiler *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    required
                    placeholder="Ej. 3"
                    value={diasExtra}
                    onChange={(e) => setDiasExtra(limpiarInputEntero(e.target.value))}
                    className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                  />
                </div>

                {/* Cálculo automático del monto extra y nueva fecha */}
                <div className="space-y-1 rounded border border-neutral-200 bg-neutral-100 p-3 font-mono text-xs text-neutral-800">
                  <div className="flex justify-between">
                    <span>Nueva fecha de vencimiento:</span>
                    <b>{fmtFecha(calculosProrroga.nuevaFecha)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Monto Extra en USD ({calculosProrroga.extraDias} d):</span>
                    <b style={{ color: NARANJA }}>{fmtUSD(calculosProrroga.montoExtraUSD)}</b>
                  </div>
                  <div className="flex justify-between text-[11px] text-neutral-600">
                    <span>Monto Extra en Bs. (Tasa del Día):</span>
                    <b>
                      {tasa ? fmtVES(calculosProrroga.montoExtraUSD * tasa) : '—'}
                    </b>
                  </div>
                </div>

                {/* Abono opcional sobre esta extensión */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-700">
                      ¿Cuánto abonó hoy de esta extensión? (USD)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00 (Opcional)"
                      value={abonoProrrogaUsd}
                      onChange={(e) =>
                        setAbonoProrrogaUsd(limpiarInputDecimal(e.target.value))
                      }
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-700">
                      Método de Pago
                    </label>
                    <select
                      value={metodoPagoProrroga}
                      onChange={(e) => setMetodoPagoProrroga(e.target.value)}
                      className="w-full rounded border border-neutral-300 bg-white px-2.5 py-2 font-bold outline-none focus:border-[#FF5500]"
                    >
                      {metodosPago.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {calculosProrroga.extraDias > 0 && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2.5 font-mono text-[11px] text-amber-900">
                    <div className="flex justify-between">
                      <span>Se suma al Restante por Cobrar:</span>
                      <b>
                        {fmtUSD(calculosProrroga.deudaExtra)} (
                        {tasa ? fmtVES(calculosProrroga.deudaExtra * tasa) : '—'})
                      </b>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalProrroga(null)}
                    className="rounded border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={procesando}
                    className="flex items-center gap-1.5 rounded px-5 py-2 text-xs font-bold text-white"
                    style={{ background: NARANJA }}
                  >
                    {procesando && <Loader2 size={14} className="animate-spin" />}
                    <span>Confirmar Extensión</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* =================================================================
            MODAL 3: DEVOLUCIÓN PARCIAL DE EQUIPOS DE OBRA
           ================================================================= */}
        {modalDevolucionParcial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <div className="flex items-center gap-2">
                  <PackageCheck size={18} color={NARANJA} />
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    📦 Recepción de Devolución Parcial
                  </h3>
                </div>
                <button
                  onClick={() => setModalDevolucionParcial(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={confirmarDevolucionParcial} className="space-y-4 p-5 text-xs">
                {errorMsg && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                    <TriangleAlert size={15} className="shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="rounded border border-neutral-200 bg-neutral-50 p-3 font-mono">
                  <p className="text-sm font-bold text-neutral-900">
                    Contrato:{' '}
                    {modalDevolucionParcial.codigo_contrato ||
                      modalDevolucionParcial.numero_contrato ||
                      `CT-${modalDevolucionParcial.id}`}
                  </p>
                  <p className="text-neutral-600">
                    Cliente:{' '}
                    <b>{modalDevolucionParcial.cliente_nombre || 'Cliente de Obra'}</b>
                  </p>
                  {modalDevolucionParcial.direccion_obra && (
                    <p className="text-[11px] text-neutral-500">
                      Obra: {modalDevolucionParcial.direccion_obra}
                    </p>
                  )}
                  <p className="text-[11px] text-neutral-500">
                    Fecha de Salida: {fmtFecha(modalDevolucionParcial.fecha_inicio)} · Días pactados:{' '}
                    {modalDevolucionParcial.dias_alquiler}d
                  </p>
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-700">
                    Fecha de Ingreso Parcial a Galpón *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaDevolucionParcial}
                    onChange={(e) => setFechaDevolucionParcial(e.target.value)}
                    className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                  />
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Días reales calculados para los equipos que regresan:{' '}
                    <b>
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
                  <label className="mb-1.5 block font-bold uppercase text-neutral-700">
                    Indica cuántas unidades regresa el cliente hoy:
                  </label>
                  <div className="max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-300 bg-white">
                    {obtenerItemsConRespaldo(modalDevolucionParcial).map((it, idx) => {
                      const idKey = it.inventario_id
                        ? String(it.inventario_id)
                        : `${it.codigo || 'eq'}_${idx}`
                      const cantActiva = Number(it.cantidad || 0)
                      const yaDevuelto = Boolean(it.devuelto)
                      const precioDia = num(
                        it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
                      )

                      return (
                        <div key={idKey} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-neutral-900">{it.material}</p>
                            <p className="font-mono text-[11px] text-neutral-500">
                              {it.codigo} · {fmtUSD(precioDia)}/día · En obra:{' '}
                              <b>{cantActiva} und.</b>
                              {yaDevuelto && (
                                <span className="ml-2 font-bold text-emerald-700">
                                  [Lote ya devuelto]
                                </span>
                              )}
                            </p>
                          </div>

                          {!yaDevuelto && (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-neutral-600">
                                Devolver:
                              </span>
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
                                className="w-16 rounded border border-neutral-300 px-2 py-1.5 text-center font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setDevolucionCantidades((prev) => ({
                                    ...prev,
                                    [idKey]: String(cantActiva),
                                  }))
                                }}
                                className="rounded bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600 hover:bg-neutral-200"
                                title="Devolver todo este ítem"
                              >
                                Todo
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-bold">Ajuste financiero automático:</p>
                  <p className="mt-0.5 text-[11px]">
                    Al confirmar, el sistema suma de inmediato estas unidades al stock disponible en
                    galpón y ajusta el cobro diario solo a los{' '}
                    {diasEntreFechas(
                      modalDevolucionParcial.fecha_inicio,
                      fechaDevolucionParcial,
                    )}{' '}
                    días de uso efectivo. Los equipos no devueltos continúan alquilados en obra.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalDevolucionParcial(null)}
                    className="rounded border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={procesando}
                    className="flex items-center gap-1.5 rounded px-5 py-2 text-xs font-bold text-white shadow"
                    style={{ background: NARANJA }}
                  >
                    {procesando && <Loader2 size={14} className="animate-spin" />}
                    <span>Confirmar Entrada Parcial a Galpón</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
