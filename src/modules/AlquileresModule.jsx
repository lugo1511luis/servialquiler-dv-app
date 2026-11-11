import { useMemo, useState } from 'react'
import {
  Plus,
  Minus,
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
  Check,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  construirMensajeWhatsAppContrato,
  diasEntreFechas,
  diasEntreHoyY,
  fmtFecha,
  fmtNum,
  fmtUSD,
  fmtVES,
  formatearTelefonoWhatsApp,
  hoyISO,
  limpiarInputDecimal,
  limpiarInputEntero,
  METODOS_PAGO_DEFAULT,
  NARANJA,
  NEGRO,
  num,
  obtenerPrecioReposicionEquipo,
  sumarDiasISO,
  WhatsAppIcon,
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
  usuario,
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
  // Pagos dinámicos en Modal de Abono
  const [pagosAbono, setPagosAbono] = useState(() => [
    { id: 'pa-1', metodo: metodosPago[0] || 'Efectivo USD', monto: '' },
  ])

  // Modal Devolución Parcial o Total + Extravíos
  const [modalDevolucionParcial, setModalDevolucionParcial] = useState(null)
  const [devolucionCantidades, setDevolucionCantidades] = useState({})
  const [devolucionFaltantes, setDevolucionFaltantes] = useState({})
  const [devolucionPreciosRep, setDevolucionPreciosRep] = useState({})
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
  // Pagos dinámicos en Facturación
  const [pagosFacturador, setPagosFacturador] = useState(() => [
    { id: 'pf-1', metodo: metodosPago[0] || 'Efectivo USD', monto: '' },
  ])
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

  // Cálculos de Abono y Restante por Cobrar en Facturación (Suma automática en tiempo real)
  const abonoHoyNum = useMemo(() => {
    const suma = pagosFacturador.reduce((acc, p) => acc + Number(p.monto || 0), 0)
    return Math.max(0, Number(suma.toFixed(2)))
  }, [pagosFacturador])

  const restantePorCobrarHoyUSD = useMemo(
    () => Math.max(0, Number((totalContratoUSD - abonoHoyNum).toFixed(2))),
    [totalContratoUSD, abonoHoyNum],
  )

  const estadoPagoHoy = useMemo(
    () => calcularEstadoPago(abonoHoyNum, restantePorCobrarHoyUSD),
    [abonoHoyNum, restantePorCobrarHoyUSD],
  )

  // Acciones sobre los métodos de pago dinámicos en Facturación
  const agregarFilaPagoFacturador = () => {
    const siguienteMetodo =
      metodosPago[pagosFacturador.length % metodosPago.length] || metodosPago[0] || 'Efectivo USD'
    setPagosFacturador((prev) => [
      ...prev,
      { id: `pf-${Date.now()}-${Math.random()}`, metodo: siguienteMetodo, monto: '' },
    ])
  }

  const actualizarMetodoPagoFacturador = (id, nuevoMetodo) => {
    setPagosFacturador((prev) =>
      prev.map((p) => (p.id === id ? { ...p, metodo: nuevoMetodo } : p)),
    )
  }

  const actualizarMontoPagoFacturador = (id, valTexto) => {
    const valLimpio = limpiarInputDecimal(valTexto)
    setPagosFacturador((prev) =>
      prev.map((p) => (p.id === id ? { ...p, monto: valLimpio } : p)),
    )
  }

  const eliminarFilaPagoFacturador = (id) => {
    setPagosFacturador((prev) => {
      const filtrados = prev.filter((p) => p.id !== id)
      return filtrados.length > 0
        ? filtrados
        : [{ id: `pf-${Date.now()}`, metodo: metodosPago[0] || 'Efectivo USD', monto: '' }]
    })
  }

  const cubrirRestanteFacturador = (id) => {
    const otrosMontos = pagosFacturador
      .filter((p) => p.id !== id)
      .reduce((s, p) => s + Number(p.monto || 0), 0)
    const resto = Math.max(0, Number((totalContratoUSD - otrosMontos).toFixed(2)))
    setPagosFacturador((prev) =>
      prev.map((p) => (p.id === id ? { ...p, monto: resto > 0 ? String(resto) : '' } : p)),
    )
  }

  const pagarTotalidadFacturador = () => {
    if (totalContratoUSD <= 0) return
    setPagosFacturador((prev) => {
      if (prev.length === 0) {
        return [{ id: 'pf-1', metodo: metodosPago[0] || 'Efectivo USD', monto: String(totalContratoUSD) }]
      }
      return prev.map((p, idx) => ({
        ...p,
        monto: idx === 0 ? String(totalContratoUSD) : '',
      }))
    })
  }

  const limpiarPagosFacturador = () => {
    setPagosFacturador([
      { id: `pf-${Date.now()}`, metodo: metodosPago[0] || 'Efectivo USD', monto: '' },
    ])
  }

  const incrementarEquipo = (eq) => {
    const dispPropio = num(eq.stock_propio_disponible)
    const yaEnLista = lineas
      .filter((l) => String(l.inventario_id) === String(eq.id))
      .reduce((s, l) => s + Number(l.cantidad || 0), 0)

    if (yaEnLista + 1 > dispPropio) {
      setAvisoAliado({
        equipo: eq,
        requerido: yaEnLista + 1,
        disponiblePropio: dispPropio,
        disponibleExterno: num(eq.stock_externo_prestado),
      })
      return
    }
    agregarAlDespacho(eq)
  }

  const decrementarEquipo = (eqId) => {
    const item = lineas.find((l) => String(l.inventario_id) === String(eqId))
    if (!item) return
    const actual = Number(item.cantidad || 0)
    if (actual <= 1) {
      quitarLinea(eqId)
    } else {
      cambiarCantidadLinea(eqId, String(actual - 1))
    }
  }

  // Cálculos y acciones para Modal de Abonos Dinámicos
  const totalAbonoModalUSD = useMemo(() => {
    const suma = pagosAbono.reduce((acc, p) => acc + Number(p.monto || 0), 0)
    return Math.max(0, Number(suma.toFixed(2)))
  }, [pagosAbono])

  const agregarFilaPagoAbono = () => {
    const siguienteMetodo =
      metodosPago[pagosAbono.length % metodosPago.length] || metodosPago[0] || 'Efectivo USD'
    setPagosAbono((prev) => [
      ...prev,
      { id: `pa-${Date.now()}-${Math.random()}`, metodo: siguienteMetodo, monto: '' },
    ])
  }

  const actualizarMetodoPagoAbono = (id, nuevoMetodo) => {
    setPagosAbono((prev) =>
      prev.map((p) => (p.id === id ? { ...p, metodo: nuevoMetodo } : p)),
    )
  }

  const actualizarMontoPagoAbono = (id, valTexto) => {
    const valLimpio = limpiarInputDecimal(valTexto)
    setPagosAbono((prev) =>
      prev.map((p) => (p.id === id ? { ...p, monto: valLimpio } : p)),
    )
  }

  const eliminarFilaPagoAbono = (id) => {
    setPagosAbono((prev) => {
      const filtrados = prev.filter((p) => p.id !== id)
      return filtrados.length > 0
        ? filtrados
        : [{ id: `pa-${Date.now()}`, metodo: metodosPago[0] || 'Efectivo USD', monto: '' }]
    })
  }

  const cubrirRestanteAbono = (id, restanteDeuda) => {
    const otrosMontos = pagosAbono
      .filter((p) => p.id !== id)
      .reduce((s, p) => s + Number(p.monto || 0), 0)
    const resto = Math.max(0, Number((restanteDeuda - otrosMontos).toFixed(2)))
    setPagosAbono((prev) =>
      prev.map((p) => (p.id === id ? { ...p, monto: resto > 0 ? String(resto) : '' } : p)),
    )
  }

  const abonarDeudaTotalModal = (restanteDeuda) => {
    if (restanteDeuda <= 0) return
    setPagosAbono((prev) => {
      if (prev.length === 0) {
        return [{ id: 'pa-1', metodo: metodosPago[0] || 'Efectivo USD', monto: String(restanteDeuda) }]
      }
      return prev.map((p, idx) => ({
        ...p,
        monto: idx === 0 ? String(restanteDeuda) : '',
      }))
    })
  }

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

    if (abonoHoyNum > totalContratoUSD + 0.01) {
      setErrorMsg(
        `La suma de los métodos de pago ($${abonoHoyNum.toFixed(2)}) no puede ser mayor al total del contrato ($${totalContratoUSD.toFixed(2)}).`,
      )
      return
    }

    setProcesando(true)
    setErrorMsg(null)

    const cli = mapaClientes.get(String(clienteId))
    const codigoGenerado = `CT-${String(alquileres.length + 1).padStart(4, '0')}`

    const pagosConMonto = pagosFacturador.filter((p) => Number(p.monto || 0) > 0)
    let metodoFinal = pagosFacturador[0]?.metodo || 'Efectivo USD'
    let desgloseFinal = null

    if (pagosConMonto.length === 1) {
      metodoFinal = pagosConMonto[0].metodo
      desgloseFinal = [
        {
          metodo: pagosConMonto[0].metodo,
          monto_usd: Number(pagosConMonto[0].monto),
          monto_ves: tasa ? Number((Number(pagosConMonto[0].monto) * tasa).toFixed(2)) : null,
        },
      ]
    } else if (pagosConMonto.length > 1) {
      metodoFinal = `Mixto: ${pagosConMonto
        .map((p) => `${p.metodo} ($${Number(p.monto).toFixed(2)})`)
        .join(' + ')}`
      desgloseFinal = pagosConMonto.map((p) => ({
        metodo: p.metodo,
        monto_usd: Number(p.monto),
        monto_ves: tasa ? Number((Number(p.monto) * tasa).toFixed(2)) : null,
      }))
    }

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
    limpiarPagosFacturador()
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
    const datosPago = obtenerDatosPagoContrato(modalAbono)
    const pagosConMonto = pagosAbono.filter((p) => Number(p.monto || 0) > 0)
    const abonoBruto = totalAbonoModalUSD

    if (abonoBruto <= 0) {
      setErrorMsg('Ingresa un monto de abono en USD mayor a 0.')
      return
    }

    if (abonoBruto > datosPago.restante + 0.01) {
      setErrorMsg(
        `El monto a abonar ($${abonoBruto.toFixed(2)}) supera el saldo pendiente actual ($${datosPago.restante.toFixed(2)}).`,
      )
      return
    }

    const abonoEfectivo = Math.min(datosPago.restante, abonoBruto)

    let metodoFinal = modalAbono.metodo_pago || 'Efectivo USD'
    let desgloseFinal = null

    if (pagosConMonto.length === 1) {
      metodoFinal = pagosConMonto[0].metodo
      desgloseFinal = [
        {
          metodo: pagosConMonto[0].metodo,
          monto_usd: Number(pagosConMonto[0].monto),
          monto_ves: tasa ? Number((Number(pagosConMonto[0].monto) * tasa).toFixed(2)) : null,
        },
      ]
    } else if (pagosConMonto.length > 1) {
      metodoFinal = `Mixto: ${pagosConMonto
        .map((p) => `${p.metodo} ($${Number(p.monto).toFixed(2)})`)
        .join(' + ')}`
      desgloseFinal = pagosConMonto.map((p) => ({
        metodo: p.metodo,
        monto_usd: Number(p.monto),
        monto_ves: tasa ? Number((Number(p.monto) * tasa).toFixed(2)) : null,
      }))
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
    setPagosAbono([{ id: 'pa-1', metodo: metodosPago[0] || 'Efectivo USD', monto: '' }])
    onRecargarTodo()
  }

  // ---- Modal 2: Postergar / Extender Días de Alquiler -----------------------
  // Calcula el costo diario adicional ÚNICAMENTE multiplicando los días extra por las piezas
  // que siguen activas en obra (cantidad_actual_en_obra = cantidad_inicial - cantidad_devuelta),
  // ignorando los materiales ya devueltos.
  const calculosProrroga = useMemo(() => {
    if (!modalProrroga) {
      return {
        extraDias: 0,
        tarifaDiaria: 0,
        piezasActivasEnObra: 0,
        montoExtraUSD: 0,
        nuevaFecha: '',
        abonoExt: 0,
        deudaExtra: 0,
      }
    }
    const extraDias = Math.max(0, Number(diasExtra || 0))
    const items = obtenerItemsConRespaldo(modalProrroga)
    const itemsActivos = items.filter((it) => !it.devuelto)
    const piezasActivasEnObra = itemsActivos.reduce(
      (s, it) => s + Math.max(0, num(it.cantidad) - num(it.cantidad_devuelta || 0)),
      0,
    )
    const tarifaDiaria =
      items.length > 0
        ? itemsActivos.reduce((s, it) => {
            const cantActiva = Math.max(0, num(it.cantidad) - num(it.cantidad_devuelta || 0))
            const precioDia = num(
              it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
            )
            return s + cantActiva * precioDia
          }, 0)
        : num(modalProrroga.total_contrato_usd) /
          Math.max(1, num(modalProrroga.dias_alquiler) || 1)
    const montoExtraUSD = Number((tarifaDiaria * extraDias).toFixed(2))
    const nuevaFecha = sumarDiasISO(modalProrroga.fecha_vencimiento || hoyISO(), extraDias)
    const abonoExt = Math.min(montoExtraUSD, Math.max(0, Number(abonoProrrogaUsd || 0)))
    const deudaExtra = Math.max(0, Number((montoExtraUSD - abonoExt).toFixed(2)))

    return {
      extraDias,
      tarifaDiaria: Number(tarifaDiaria.toFixed(2)),
      piezasActivasEnObra,
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

  // Devolver a Galpón (Abre el modal de Devolución prellenado al 100% para permitir reportar extravíos si los hubiera)
  const finalizarContrato = (contrato) => {
    abrirDevolucionParcial(contrato, true)
  }

  // ---- Devolución Parcial o Total de Equipos de Obra + Registro de Extravíos -
  const abrirDevolucionParcial = (c, prellenarTotal = false) => {
    setModalDevolucionParcial(c)
    setFechaDevolucionParcial(hoyISO())
    const items = obtenerItemsConRespaldo(c)
    const initCant = {}
    const initFalt = {}
    const initPreciosRep = {}
    items.forEach((it, idx) => {
      const idKey = it.inventario_id ? String(it.inventario_id) : `${it.codigo || 'eq'}_${idx}`
      const cantActiva = Math.max(0, num(it.cantidad) - num(it.cantidad_devuelta || 0))
      initCant[idKey] = !it.devuelto && prellenarTotal && cantActiva > 0 ? String(cantActiva) : ''
      initFalt[idKey] = ''
      const eqActual = inventario.find(
        (i) =>
          String(i.id) === String(it.inventario_id) ||
          (it.codigo && i.codigo === it.codigo),
      )
      const pRep = obtenerPrecioReposicionEquipo(eqActual || it)
      initPreciosRep[idKey] = pRep > 0 ? String(pRep) : ''
    })
    setDevolucionCantidades(initCant)
    setDevolucionFaltantes(initFalt)
    setDevolucionPreciosRep(initPreciosRep)
    setErrorMsg(null)
  }

  const confirmarDevolucionParcial = async (e) => {
    e.preventDefault()
    if (!modalDevolucionParcial) return

    const contrato = modalDevolucionParcial
    const items = obtenerItemsConRespaldo(contrato)
    const fechaDev = fechaDevolucionParcial || hoyISO()
    const diasUso = diasEntreFechas(contrato.fecha_inicio, fechaDev)

    // Validar cantidades a devolver y piezas faltantes
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
          `La suma de unidades devueltas (${cantADevolver}) + faltantes/extraviadas (${cantFaltante}) supera las unidades activas en obra (${cantActiva}) para ${it.material}.`,
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
    let totalCargoExtravioUSD = 0

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
      const precioRepUnit = Number(
        devolucionPreciosRep[idKey] !== undefined && devolucionPreciosRep[idKey] !== ''
          ? devolucionPreciosRep[idKey]
          : obtenerPrecioReposicionEquipo(eqActual || it),
      )
      const cargoExtravioItem = Number((cantFaltante * precioRepUnit).toFixed(2))
      totalCargoExtravioUSD = Number((totalCargoExtravioUSD + cargoExtravioItem).toFixed(2))

      if (it.devuelto) {
        nuevosItems.push(it)
        continue
      }

      if (cantProcesada <= 0) {
        nuevosItems.push(it)
        todasDevueltas = false
      } else {
        // 1. Registrar porción devuelta física
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

        // 2. Registrar porción extraviada / dañada
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

        // 3. Si quedan piezas activas en obra, mantener línea activa
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

      // Actualizar inventario y registrar movimientos en Kardex
      if (eqActual && (cantADevolver > 0 || cantFaltante > 0)) {
        const dispActual = num(eqActual.stock_propio_disponible)
        const alqActual = num(eqActual.stock_propio_alquilado)
        const totalPropioActual = num(eqActual.stock_propio_total)

        // Las piezas devueltas entran al disponible; si las faltantes superan lo alquilado, se descuentan del disponible general
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
            observaciones: `Devolución de obra (${cantADevolver} und. recibidas tras ${diasUso} días de uso). Recibido por ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
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
            observaciones: `EXTRAVÍO / NO DEVUELTO EN OBRA (${cantFaltante} pza(s) faltantes/dañadas). Cargo de reposición: $${cargoExtravioItem.toFixed(2)}. Reportado por ${usuario?.nombre_completo || usuario?.username || 'Operador'}`,
          })
        }
      }
    }

    // Recalcular montos del contrato incluyendo indemnización por extravío
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
    const datosPago = obtenerDatosPagoContrato(contrato)
    const diferenciaTotal = Number((nuevoTotalContrato - datosPago.total).toFixed(2))

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

    // Actualizar saldo_pendiente_usd del cliente (suma cargo de reposición o descuenta ajuste por entrega anticipada)
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

    setProcesando(false)
    setModalDevolucionParcial(null)
    onRecargarTodo()
  }

  // ---- Envío Directo por WhatsApp con 1 Clic --------------------------------
  const enviarWhatsAppContrato = (c, cli, datosPago) => {
    let tel = cli?.telefono || c?.cliente_telefono || ''
    let telFormateado = formatearTelefonoWhatsApp(tel)

    if (!telFormateado) {
      const pedido = window.prompt(
        `El cliente "${cli?.nombre_razon_social || c.cliente_nombre || 'de Obra'}" no tiene un teléfono guardado. Ingresa el número de WhatsApp (ej. 04141234567):`,
      )
      if (!pedido) return
      telFormateado = formatearTelefonoWhatsApp(pedido)
      if (!telFormateado) {
        window.alert('Número de teléfono inválido.')
        return
      }
    }

    const items = obtenerItemsConRespaldo(c)
    const textoCodificado = construirMensajeWhatsAppContrato({
      contrato: {
        ...c,
        monto_pagado_usd: datosPago.pagado,
        saldo_pendiente_usd: datosPago.restante,
        items,
      },
      cliente: cli,
      tasa,
    })

    const url = `https://wa.me/${telFormateado}?text=${textoCodificado}`
    window.open(url, '_blank')
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
    'Registrar Abono: Si un cliente dejó saldo pendiente, usa este botón para registrar pagos parciales o el pago final.',
    'Postergar Días: Extiende los días de alquiler, suma el monto extra al contrato y refleja todo en la Nota de Entrega PDF.',
    'Notificar por WhatsApp: Envía con 1 clic el resumen del contrato, equipos y saldo pendiente al teléfono del cliente.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  // ===========================================================================
  // VISTA FACTURADOR Y SALIDA DE EQUIPOS (REDISEÑO EN 3 PASOS VISUALES)
  // ===========================================================================
  if (vistaFacturador) {
    return (
      <form onSubmit={emitirContratoYDespachar} className="space-y-4">
        {/* Barra Superior con Resumen y Tasa del Día */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 px-4 py-3 text-white shadow"
          style={{ background: NEGRO, borderLeft: `5px solid ${NARANJA}` }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setVistaFacturador(false)}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:border-[#FF5500]"
            >
              <ArrowLeft size={14} color={NARANJA} />
              <span>Volver a la lista</span>
            </button>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Facturador de Equipos — Nuevo Contrato de Alquiler
              </h2>
              <p className="text-[11px] text-neutral-400">
                Proceso organizado en 3 pasos: 1. Cliente y Plazo · 2. Equipos · 3. Cobro y Liquidación
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded border border-neutral-700 bg-[#1a1a1a] px-3 py-1 font-mono text-xs text-neutral-300">
              Tasa del Día: <b style={{ color: NARANJA }}>{tasa ? fmtVES(tasa) : '—'}</b>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-md border border-red-500/60 bg-red-50 p-3 text-xs font-bold text-red-800 shadow-sm">
            <TriangleAlert size={16} className="shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* =====================================================================
            PASO 1: CLIENTE Y PLAZO
           ===================================================================== */}
        <div
          className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
          style={{ borderLeft: `5px solid ${NARANJA}` }}
        >
          <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-900 px-4 py-2.5 text-white">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold text-white shadow"
                style={{ background: NARANJA }}
              >
                1
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Paso 1: Cliente y Plazo del Alquiler
                </h3>
                <p className="text-[10px] text-neutral-400">
                  Selecciona la empresa o particular que alquila y la duración del contrato
                </p>
              </div>
            </div>
            <span className="rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-neutral-400">
              Paso 1 de 3
            </span>
          </div>

          <div className="space-y-3.5 p-4 text-xs">
            {/* Selector de Cliente */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="font-bold uppercase tracking-wider text-neutral-700">
                  Cliente / Empresa Contratante *
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarFormCliente((v) => !v)}
                  className="flex items-center gap-1 rounded bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-black"
                >
                  <UserPlus size={12} color={NARANJA} />
                  <span>{mostrarFormCliente ? 'Cerrar Formulario' : '+ Registrar Cliente Nuevo'}</span>
                </button>
              </div>

              <select
                required
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-900 outline-none focus:border-[#FF5500]"
              >
                <option value="">— Selecciona un cliente registrado —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_razon_social} ({c.rif_cedula})
                    {num(c.saldo_pendiente_usd) > 0.009 ? ` — [Deuda: $${num(c.saldo_pendiente_usd).toFixed(2)}]` : ''}
                  </option>
                ))}
              </select>

              {/* Semáforo y Alerta Visual de Clientes con Deuda */}
              {(() => {
                const cliSel = clientes.find((c) => String(c.id) === String(clienteId))
                const deuda = num(cliSel?.saldo_pendiente_usd)
                if (!cliSel || deuda <= 0.009) return null
                return (
                  <div className="mt-2.5 flex items-start gap-3 rounded-md border-2 border-red-500 bg-red-50 p-3 text-xs text-red-900 shadow-sm animate-pulse">
                    <TriangleAlert size={20} className="mt-0.5 shrink-0 text-red-600" />
                    <div>
                      <p className="text-xs font-bold text-red-900">
                        ⚠️ Atención: Este cliente registra un saldo pendiente actual de USD {fmtUSD(deuda)}
                        {tasa ? ` (${fmtVES(deuda * tasa)} a la Tasa del Día)` : ''}.
                      </p>
                      <p className="mt-0.5 text-[11px] text-red-700">
                        Tiene cobros o contratos atrasados pendientes de liquidación. Verifica las condiciones con Administración antes de despachar o solicita el abono de su deuda previa.
                      </p>
                    </div>
                  </div>
                )
              })()}

              {/* Formulario Rápido de Nuevo Cliente */}
              {mostrarFormCliente && (
                <div className="mt-3 space-y-2.5 rounded-md border border-neutral-300 bg-neutral-50 p-3.5">
                  <p className="text-xs font-bold uppercase text-neutral-800">
                    Anotar Nuevo Cliente Rápido
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <input
                      placeholder="RIF o Cédula (Ej. J-40123456-7) *"
                      value={nuevoCliente.rif_cedula}
                      onChange={(e) =>
                        setNuevoCliente({ ...nuevoCliente, rif_cedula: e.target.value })
                      }
                      className="rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                    />
                    <input
                      placeholder="Teléfono de contacto (Ej. 0414-1234567)"
                      value={nuevoCliente.telefono}
                      onChange={(e) =>
                        setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
                      }
                      className="rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
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
                    className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                  />
                  <input
                    placeholder="Dirección exacta de la obra donde estarán los equipos"
                    value={nuevoCliente.direccion_obra}
                    onChange={(e) =>
                      setNuevoCliente({ ...nuevoCliente, direccion_obra: e.target.value })
                    }
                    className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={guardarClienteRapido}
                      disabled={guardandoCliente}
                      className="rounded px-4 py-1.5 text-xs font-bold text-white shadow hover:opacity-95"
                      style={{ background: NARANJA }}
                    >
                      {guardandoCliente ? 'Guardando...' : 'Guardar y Seleccionar Cliente'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Fechas y Días de Alquiler */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                  Fecha de Salida (Despacho) *
                </label>
                <input
                  type="date"
                  required
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                  Días de Alquiler *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej. 3"
                  value={diasAlquiler}
                  onChange={(e) => setDiasAlquiler(limpiarInputEntero(e.target.value))}
                  className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                />
                {/* Botones de selección rápida de días */}
                <div className="mt-1 flex flex-wrap gap-1">
                  {[1, 3, 7, 15, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiasAlquiler(String(d))}
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
                        diasAlquiler === String(d)
                          ? 'bg-[#FF5500] text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                  Fecha de Regreso (Vencimiento)
                </label>
                <input
                  type="date"
                  readOnly
                  value={fechaVencimientoCalculada}
                  className="w-full rounded border border-neutral-200 bg-neutral-100 px-2.5 py-1.5 font-mono text-xs font-bold text-neutral-700"
                />
                <span className="mt-1 block text-[10px] font-bold text-neutral-500">
                  Calculado: {diasCalculo} día(s) de obra
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================================
            PASO 2: SELECCIÓN RÁPIDA DE EQUIPOS
           ===================================================================== */}
        <div
          className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
          style={{ borderLeft: `5px solid ${NARANJA}` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-900 px-4 py-2.5 text-white">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold text-white shadow"
                style={{ background: NARANJA }}
              >
                2
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Paso 2: Selección Rápida de Equipos de Galpón
                </h3>
                <p className="text-[10px] text-neutral-400">
                  Filtra por rubro, busca y ajusta cantidades con los botones +/- para ver el subtotal diario al instante
                </p>
              </div>
            </div>
            <span className="rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-neutral-400">
              Paso 2 de 3
            </span>
          </div>

          <div className="space-y-3.5 p-4 text-xs">
            {/* Buscador y Píldoras de Filtro por Categoría */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mr-1">
                  Categoría:
                </span>
                {categoriasCatalogo.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoriaFiltro(cat)}
                    className="rounded-full px-3 py-1 text-[11px] font-bold uppercase transition-colors shadow-sm"
                    style={{
                      background: categoriaFiltro === cat ? NARANJA : '#ffffff',
                      color: categoriaFiltro === cat ? '#ffffff' : '#404040',
                      border: `1px solid ${categoriaFiltro === cat ? NARANJA : '#d4d4d4'}`,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded border border-neutral-300 bg-white px-2.5 py-1 shadow-sm">
                <Search size={14} color={NARANJA} />
                <input
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                  placeholder="Buscar por equipo o código..."
                  className="w-48 bg-transparent text-xs font-bold text-neutral-800 outline-none placeholder:text-neutral-400"
                />
              </div>
            </div>

            {/* Aviso si falta stock propio */}
            {avisoAliado && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                  <div>
                    <p className="font-bold">
                      Falta material propio en galpón para &ldquo;{avisoAliado.equipo.material}&rdquo;
                    </p>
                    <p className="text-[11px] text-amber-800">
                      Tenemos en galpón: <b>{avisoAliado.disponiblePropio}</b> · Traídos de aliados:{' '}
                      <b>{avisoAliado.disponibleExterno}</b>. Puedes pedir prestado a una empresa amiga en el módulo de Préstamos.
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

            {/* Grilla de Equipos con Botones +/- y Subtotal Diario en Tiempo Real */}
            <div className="grid max-h-[380px] gap-2.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {catalogoFiltrado.map((eq) => {
                const disp = num(eq.stock_propio_disponible)
                const ext = num(eq.stock_externo_prestado)
                const precio = num(eq.precio_alquiler_dia_usd)
                const lineaSel = lineas.find((l) => String(l.inventario_id) === String(eq.id))
                const cantEnDespacho = Number(lineaSel?.cantidad || 0)
                const sinStock = disp <= 0
                const subtotalDiarioItem = Number((cantEnDespacho * precio).toFixed(2))

                return (
                  <div
                    key={eq.id}
                    className="flex flex-col justify-between rounded-md border p-3 text-left transition-all"
                    style={{
                      borderColor: cantEnDespacho > 0 ? NARANJA : '#e5e7eb',
                      background: cantEnDespacho > 0 ? 'rgba(255,85,0,0.05)' : '#ffffff',
                      borderLeft: `4px solid ${cantEnDespacho > 0 ? NARANJA : sinStock ? '#dc2626' : '#d1d5db'}`,
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] font-bold text-neutral-500">
                          {eq.codigo}
                        </span>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-neutral-600">
                          {eq.categoria || 'General'}
                        </span>
                      </div>
                      <p className="mt-1 font-bold text-neutral-900 leading-snug">{eq.material}</p>
                    </div>

                    <div className="mt-2.5 border-t border-neutral-200 pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span
                            className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                            style={
                              disp > 0
                                ? { background: 'rgba(16,185,129,0.15)', color: '#047857' }
                                : { background: 'rgba(239,68,68,0.15)', color: '#b91c1c' }
                            }
                          >
                            DISPONIBLE: {fmtNum(disp)}
                          </span>
                          {ext > 0 && (
                            <span className="ml-1 inline-block rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-800">
                              +{fmtNum(ext)} ALIADO
                            </span>
                          )}
                        </div>

                        <div className="text-right font-mono">
                          <span className="text-xs font-bold text-neutral-900">
                            {fmtUSD(precio)}/d
                          </span>
                          <span className="block text-[9px] text-neutral-500">
                            {tasa ? fmtVES(precio * tasa) : ''}
                          </span>
                        </div>
                      </div>

                      {/* Controles de Cantidad +/- */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-100">
                        {cantEnDespacho > 0 ? (
                          <>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => decrementarEquipo(eq.id)}
                                className="flex h-7 w-7 items-center justify-center rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 font-bold"
                                title="Restar 1 unidad"
                              >
                                <Minus size={13} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={lineaSel.cantidad}
                                onChange={(e) => cambiarCantidadLinea(eq.id, e.target.value)}
                                className="h-7 w-12 rounded border border-neutral-300 bg-white text-center font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                              />
                              <button
                                type="button"
                                onClick={() => incrementarEquipo(eq)}
                                className="flex h-7 w-7 items-center justify-center rounded text-white shadow font-bold"
                                style={{ background: NARANJA }}
                                title="Sumar 1 unidad"
                              >
                                <Plus size={13} />
                              </button>
                            </div>

                            <div className="text-right font-mono">
                              <span className="text-[10px] text-neutral-500">Subtotal/día:</span>
                              <span className="block font-bold text-emerald-800">
                                {fmtUSD(subtotalDiarioItem)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => agregarAlDespacho(eq)}
                            disabled={sinStock && ext <= 0}
                            className="flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-40"
                            style={{ background: NEGRO }}
                          >
                            <Plus size={13} color={NARANJA} />
                            <span>+ Agregar al Despacho</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Resumen / Bandeja de Equipos Seleccionados en este Despacho */}
            <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3">
              <div className="mb-2 flex items-center justify-between border-b border-neutral-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                  Resumen de Equipos en este Despacho ({lineas.length} ítems ·{' '}
                  {lineas.reduce((acc, l) => acc + Number(l.cantidad || 0), 0)} piezas totales)
                </span>
                <span className="font-mono text-xs font-bold text-neutral-600">
                  Multiplicador: {diasCalculo} día(s)
                </span>
              </div>

              {lineas.length === 0 ? (
                <p className="py-4 text-center text-xs text-neutral-400">
                  No hay equipos seleccionados aún. Usa los botones &quot;+ Agregar al Despacho&quot; o los controles +/- de arriba.
                </p>
              ) : (
                <div className="max-h-48 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-200 bg-white">
                  {lineas.map((l) => {
                    const cant = Number(l.cantidad || 0)
                    const precioDia = num(l.precio_alquiler_dia_usd)
                    const subtotalLinea = cant * precioDia * diasCalculo

                    return (
                      <div
                        key={l.inventario_id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-neutral-900">{l.material}</p>
                          <p className="font-mono text-[10px] text-neutral-500">
                            {l.codigo} · {fmtUSD(precioDia)}/día × {cant} pza(s) × {diasCalculo}d
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => decrementarEquipo(l.inventario_id)}
                              className="rounded border border-neutral-300 p-1 text-neutral-600 hover:bg-neutral-100"
                            >
                              <Minus size={11} />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.cantidad}
                              onChange={(e) => cambiarCantidadLinea(l.inventario_id, e.target.value)}
                              className="h-6 w-11 rounded border border-neutral-300 text-center font-mono text-xs font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const eq = inventario.find((i) => String(i.id) === String(l.inventario_id))
                                if (eq) incrementarEquipo(eq)
                              }}
                              className="rounded border border-neutral-300 p-1 text-neutral-600 hover:bg-neutral-100"
                            >
                              <Plus size={11} />
                            </button>
                          </div>

                          <span className="w-20 text-right font-mono text-xs font-bold text-neutral-900">
                            {fmtUSD(subtotalLinea)}
                          </span>

                          <button
                            type="button"
                            onClick={() => quitarLinea(l.inventario_id)}
                            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                            title="Quitar este equipo del despacho"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================================
            PASO 3: LIQUIDACIÓN, COBRO Y FORMAS DE PAGO
           ===================================================================== */}
        <div
          className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
          style={{ borderLeft: `5px solid ${NARANJA}` }}
        >
          <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-900 px-4 py-2.5 text-white">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold text-white shadow"
                style={{ background: NARANJA }}
              >
                3
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Paso 3: Liquidación, Formas de Pago y Cobro
                </h3>
                <p className="text-[10px] text-neutral-400">
                  Configura flete, depósito, registra el abono o pago completo a la Tasa del Día
                </p>
              </div>
            </div>
            <span className="rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-neutral-400">
              Paso 3 de 3
            </span>
          </div>

          <div className="space-y-4 p-4 text-xs">
            {/* Opciones Adicionales: Flete y Depósito en Garantía */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-neutral-300 p-3 bg-neutral-50">
                <label className="flex cursor-pointer items-center gap-2 font-bold text-neutral-800">
                  <input
                    type="checkbox"
                    checked={requiereFlete}
                    onChange={(e) => setRequiereFlete(e.target.checked)}
                    className="h-4 w-4 accent-[#FF5500]"
                  />
                  <Truck size={15} color={NARANJA} />
                  <span>Incluir Transporte / Flete</span>
                </label>
                {requiereFlete && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-200 pt-2">
                    <span className="text-[11px] font-bold text-neutral-600">Costo del Flete (USD):</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej. 15.00"
                      value={costoFleteUsd}
                      onChange={(e) => setCostoFleteUsd(limpiarInputDecimal(e.target.value))}
                      className="w-28 rounded border border-neutral-300 bg-white px-2.5 py-1 text-right font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-md border border-neutral-300 p-3 bg-neutral-50">
                <label className="block text-[11px] font-bold uppercase text-neutral-700">
                  Depósito en Garantía (USD) <span className="text-[10px] font-normal text-neutral-400">(Opcional)</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositoGarantiaUsd}
                  onChange={(e) => setDepositoGarantiaUsd(limpiarInputDecimal(e.target.value))}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded border border-neutral-300 bg-white px-2.5 py-1 text-right font-mono text-xs font-bold placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                />
              </div>
            </div>

            {/* Resumen Claro de Liquidación en USD y Bs. a la Tasa del Día */}
            <div className="rounded-md border border-neutral-800 bg-[#161616] p-4 text-white shadow-md">
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-neutral-400">
                  <span>Alquiler de equipos ({diasCalculo} días de obra):</span>
                  <span>{fmtUSD(subtotalEquiposUSD)}</span>
                </div>
                {fleteUSD > 0 && (
                  <div className="flex justify-between text-neutral-400">
                    <span>Transporte / Flete:</span>
                    <span>{fmtUSD(fleteUSD)}</span>
                  </div>
                )}
                {garantiaUSD > 0 && (
                  <div className="flex justify-between text-neutral-400">
                    <span>Depósito en Garantía:</span>
                    <span>{fmtUSD(garantiaUSD)}</span>
                  </div>
                )}

                <div className="my-2 border-t border-neutral-700 pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      TOTAL CONTRATO EN DÓLARES:
                    </span>
                    <span className="text-xl font-bold" style={{ color: NARANJA }}>
                      {fmtUSD(totalContratoUSD)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-neutral-300">
                    <span>TOTAL EN BOLÍVARES (TASA DEL DÍA):</span>
                    <span className="font-bold text-white">
                      {tasa ? fmtVES(totalContratoUSD * tasa) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque Unificado de Métodos de Pago: 1 o Múltiples Métodos con Suma Automática */}
            <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 pb-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                    Formas de Pago y Abono del Cliente
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Ingresa uno o varios métodos de pago. La suma y el saldo pendiente se calculan automáticamente.
                  </p>
                </div>

                {totalContratoUSD > 0 && (
                  <button
                    type="button"
                    onClick={pagarTotalidadFacturador}
                    className="flex items-center gap-1 rounded border border-emerald-400 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                    title="Cubrir el 100% del pago de este contrato"
                  >
                    <Check size={13} />
                    <span>Pagar Todo ({fmtUSD(totalContratoUSD)})</span>
                  </button>
                )}
              </div>

              {/* Lista dinámica de métodos de pago */}
              <div className="space-y-2">
                {pagosFacturador.map((p, idx) => {
                  const montoNum = Number(p.monto || 0)
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2.5 text-xs shadow-sm"
                    >
                      <div className="min-w-[150px] flex-1 sm:max-w-[240px]">
                        <label className="mb-0.5 block text-[9px] font-bold uppercase text-neutral-500">
                          Método #{idx + 1}
                        </label>
                        <select
                          value={p.metodo}
                          onChange={(e) => actualizarMetodoPagoFacturador(p.id, e.target.value)}
                          className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold text-neutral-800 outline-none focus:border-[#FF5500]"
                        >
                          {metodosPago.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-28 flex-1 sm:w-36">
                        <label className="mb-0.5 block text-[9px] font-bold uppercase text-neutral-500">
                          Monto (USD)
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 font-bold text-neutral-400">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.monto}
                            onChange={(e) => actualizarMontoPagoFacturador(p.id, e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded border border-neutral-300 bg-white py-1.5 pl-6 pr-2 text-right font-mono text-xs font-bold text-neutral-900 outline-none focus:border-[#FF5500]"
                          />
                        </div>
                      </div>

                      <div className="min-w-[130px] flex-1 text-right">
                        <span className="block text-[9px] font-bold uppercase text-neutral-500">
                          Equivalente en Bs.
                        </span>
                        <span className="font-mono text-[11px] font-bold text-neutral-700">
                          {tasa && montoNum > 0 ? fmtVES(montoNum * tasa) : 'Bs. 0,00'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 pt-3 sm:pt-2">
                        {totalContratoUSD > 0 && restantePorCobrarHoyUSD > 0 && (
                          <button
                            type="button"
                            onClick={() => cubrirRestanteFacturador(p.id)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                            title="Rellenar este método con el saldo pendiente para completar el total"
                          >
                            Cubrir Resto
                          </button>
                        )}
                        {pagosFacturador.length > 1 && (
                          <button
                            type="button"
                            onClick={() => eliminarFilaPagoFacturador(p.id)}
                            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar este método de pago"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={agregarFilaPagoFacturador}
                    className="flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-bold text-neutral-700 hover:border-[#FF5500] hover:text-[#FF5500]"
                  >
                    <Plus size={14} color={NARANJA} />
                    <span>+ Agregar otro método de pago</span>
                  </button>
                  <span className="text-[11px] text-neutral-500 font-bold">
                    {pagosFacturador.length} {pagosFacturador.length === 1 ? 'método configurado' : 'métodos configurados'}
                  </span>
                </div>
              </div>
            </div>

              {/* Resumen en Vivo de Abono y Restante por Cobrar */}
              <div className="rounded border border-neutral-200 bg-white p-3 font-mono text-xs shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="block text-[10px] font-bold uppercase text-neutral-500">
                      Total Abonado Hoy (Suma Automática):
                    </span>
                    <span className="text-base font-bold text-emerald-700">
                      {fmtUSD(abonoHoyNum)}
                    </span>
                    {tasa && abonoHoyNum > 0 && (
                      <span className="ml-1 text-[11px] text-neutral-500">
                        ({fmtVES(abonoHoyNum * tasa)} a la Tasa del Día)
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="block text-[10px] font-bold uppercase text-neutral-500">
                      Restante por Cobrar (Deuda):
                    </span>
                    <span
                      className={`text-base font-bold ${
                        restantePorCobrarHoyUSD > 0.009 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {fmtUSD(restantePorCobrarHoyUSD)}
                    </span>
                    {tasa && (
                      <span className="ml-1 text-[11px] text-neutral-500">
                        ({fmtVES(restantePorCobrarHoyUSD * tasa)})
                      </span>
                    )}
                  </div>
                </div>

                {abonoHoyNum > totalContratoUSD + 0.01 && (
                  <div className="mt-2 flex items-center gap-1.5 rounded border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700 font-sans">
                    <TriangleAlert size={15} className="text-red-600 shrink-0" />
                    <span>
                      Atención: La suma ingresada ({fmtUSD(abonoHoyNum)}) supera el total del contrato ({fmtUSD(totalContratoUSD)}).
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Botón Principal de Aprobación */}
            <button
              type="submit"
              disabled={procesando}
              className="flex w-full items-center justify-center gap-2 rounded py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-opacity hover:opacity-95 disabled:opacity-50"
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
                limpiarPagosFacturador()
                setVistaFacturador(true)
              }}
              className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-bold text-white shadow hover:brightness-110"
              style={{ background: NARANJA }}
              title="Abrir la pantalla para registrar la salida de equipos y cobrar al cliente"
            >
              <Plus size={15} />
              <span>Nuevo Despacho (Facturador de Equipos)</span>
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
                                const deudaTexto = datosPago.restante > 0 ? String(datosPago.restante) : ''
                                setPagosAbono([{ id: 'pa-1', metodo: metodosPago[0] || 'Efectivo USD', monto: deudaTexto }])
                                setErrorMsg(null)
                                setModalAbono(c)
                              }}
                              className="flex items-center gap-1 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100"
                              title="Registrar un abono o pago del cliente para descontar de su deuda pendiente"
                            >
                              <Banknote size={13} />
                              <span>Registrar Abono</span>
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
                                <span>Postergar Días</span>
                              </button>

                              <button
                                onClick={() => abrirDevolucionParcial(c)}
                                disabled={procesando}
                                className="flex items-center gap-1 rounded border border-purple-300 bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-800 hover:bg-purple-100"
                                title="Registrar devolución parcial de equipos y recalcular cobro por días reales de uso"
                              >
                                <PackageCheck size={13} />
                                <span>Devolución Parcial</span>
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

                          {/* Notificación directa por WhatsApp */}
                          <button
                            type="button"
                            onClick={() => enviarWhatsAppContrato(c, cli, datosPago)}
                            className="flex items-center gap-1 rounded border border-emerald-500 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                            title="Enviar resumen del contrato por WhatsApp al cliente con 1 clic"
                          >
                            <WhatsAppIcon size={13} className="text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>

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
            MODAL 1: REGISTRAR ABONO (Registrar Abono)
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
                    Registrar Abono de Contrato
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
                  const abonoNum = totalAbonoModalUSD
                  const nuevoRestante = Math.max(
                    0,
                    Number((datosPago.restante - abonoNum).toFixed(2)),
                  )
                  return (
                    <>
                      {/* Resumen actual de deuda */}
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
                          <span className="font-bold">Restante por Cobrar actual (Deuda):</span>
                          <b className="text-sm">
                            {fmtUSD(datosPago.restante)} (
                            {tasa ? fmtVES(datosPago.restante * tasa) : '—'})
                          </b>
                        </div>
                      </div>

                      {/* Gestor dinámico de formas de pago en Abono */}
                      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs">
                        <div className="mb-2 flex items-center justify-between border-b border-neutral-200 pb-1.5">
                          <label className="font-bold uppercase text-neutral-800">
                            Métodos de Pago del Abono
                          </label>
                          {datosPago.restante > 0 && (
                            <button
                              type="button"
                              onClick={() => abonarDeudaTotalModal(datosPago.restante)}
                              className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-200"
                              title="Abonar el 100% de la deuda pendiente"
                            >
                              Abonar Deuda Total ({fmtUSD(datosPago.restante)})
                            </button>
                          )}
                        </div>

                        {/* Filas de pago */}
                        <div className="space-y-2">
                          {pagosAbono.map((p, idx) => {
                            const montoNum = Number(p.monto || 0)
                            return (
                              <div
                                key={p.id}
                                className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-2 text-xs"
                              >
                                <div className="min-w-[140px] flex-1">
                                  <label className="mb-0.5 block text-[9px] font-bold uppercase text-neutral-500">
                                    Método #{idx + 1}
                                  </label>
                                  <select
                                    value={p.metodo}
                                    onChange={(e) => actualizarMetodoPagoAbono(p.id, e.target.value)}
                                    className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-bold outline-none focus:border-[#FF5500]"
                                  >
                                    {metodosPago.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="w-28">
                                  <label className="mb-0.5 block text-[9px] font-bold uppercase text-neutral-500">
                                    Monto (USD)
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1 font-bold text-neutral-400">$</span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0.00"
                                      value={p.monto}
                                      onChange={(e) => actualizarMontoPagoAbono(p.id, e.target.value)}
                                      className="w-full rounded border border-neutral-300 bg-white py-1 pl-5 pr-2 text-right font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                                    />
                                  </div>
                                </div>

                                {/* Acciones */}
                                <div className="flex items-center gap-1 pt-3">
                                  {datosPago.restante > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => cubrirRestanteAbono(p.id, datosPago.restante)}
                                      className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                                      title="Completar deuda restante en este método"
                                    >
                                      Cubrir Resto
                                    </button>
                                  )}
                                  {pagosAbono.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => eliminarFilaPagoAbono(p.id)}
                                      className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                                      title="Eliminar método"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>

                                {tasa && montoNum > 0 && (
                                  <div className="w-full text-right font-mono text-[10px] text-neutral-500">
                                    ≈ {fmtVES(montoNum * tasa)} (a la Tasa del Día)
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Botón agregar otro método */}
                        <div className="mt-2 flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={agregarFilaPagoAbono}
                            className="flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-bold text-neutral-700 hover:border-[#FF5500] hover:text-[#FF5500]"
                          >
                            <Plus size={13} color={NARANJA} />
                            <span>+ Agregar otro método de pago</span>
                          </button>
                          <span className="text-[10px] text-neutral-500 font-bold">
                            Total a Abonar: <b>{fmtUSD(abonoNum)}</b>
                          </span>
                        </div>
                      </div>

                      {/* Alerta de exceso si supera la deuda */}
                      {abonoNum > datosPago.restante + 0.01 && (
                        <div className="flex items-center gap-1.5 rounded border border-red-200 bg-red-50 p-2 text-xs font-bold text-red-700">
                          <TriangleAlert size={15} className="shrink-0 text-red-600" />
                          <span>
                            El monto ingresado ({fmtUSD(abonoNum)}) supera el saldo pendiente ({fmtUSD(datosPago.restante)}).
                          </span>
                        </div>
                      )}

                      {/* Nuevo saldo tras abono */}
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
            MODAL 2: POSTERGAR / EXTENDER DÍAS DE ALQUILER (Postergar Días)
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
                    Postergar / Extender Días de Alquiler
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

                {/* Cálculo automático del monto extra y nueva fecha (solo sobre piezas activas en obra) */}
                <div className="space-y-1 rounded border border-neutral-200 bg-neutral-100 p-3 font-mono text-xs text-neutral-800">
                  <div className="flex justify-between text-[11px] text-neutral-600">
                    <span>Piezas que siguen activas en obra:</span>
                    <b>{calculosProrroga.piezasActivasEnObra} und. ({fmtUSD(calculosProrroga.tarifaDiaria)}/día)</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Nueva fecha de vencimiento:</span>
                    <b>{fmtFecha(calculosProrroga.nuevaFecha)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Monto Extra en USD ({calculosProrroga.extraDias} d × {fmtUSD(calculosProrroga.tarifaDiaria)}):</span>
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
            MODAL 3: DEVOLUCIÓN (PARCIAL O TOTAL) Y REGISTRO DE EXTRAVÍOS
           ================================================================= */}
        {modalDevolucionParcial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
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
                    Fecha de Ingreso a Galpón *
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
                    Indica unidades devueltas a galpón y piezas faltantes / extraviadas / dañadas:
                  </label>
                  <div className="max-h-72 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-300 bg-white">
                    {obtenerItemsConRespaldo(modalDevolucionParcial).map((it, idx) => {
                      const idKey = it.inventario_id
                        ? String(it.inventario_id)
                        : `${it.codigo || 'eq'}_${idx}`
                      const cantActiva = Math.max(
                        0,
                        num(it.cantidad) - num(it.cantidad_devuelta || 0),
                      )
                      const yaDevuelto = Boolean(it.devuelto)
                      const precioDia = num(
                        it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
                      )
                      const cantFaltanteNum = Number(devolucionFaltantes[idKey] || 0)
                      const precioRepNum = Number(devolucionPreciosRep[idKey] || 0)
                      const cargoExtravio = Number((cantFaltanteNum * precioRepNum).toFixed(2))

                      return (
                        <div key={idKey} className="space-y-2.5 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-neutral-900">{it.material}</p>
                              <p className="font-mono text-[11px] text-neutral-500">
                                {it.codigo} · {fmtUSD(precioDia)}/día · Activas en obra:{' '}
                                <b>{cantActiva} und.</b>
                                {yaDevuelto && (
                                  <span className="ml-2 font-bold text-emerald-700">
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
                                className="rounded bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-700 hover:bg-neutral-200"
                                title="Devolver todas las piezas disponibles de este ítem"
                              >
                                Todo ({cantActiva})
                              </button>
                            )}
                          </div>

                          {!yaDevuelto && (
                            <div className="grid gap-2.5 rounded border border-neutral-200 bg-neutral-50 p-2.5 sm:grid-cols-3">
                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase text-emerald-800">
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
                                  className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-center font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase text-red-700">
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
                                  className="w-full rounded border border-red-300 bg-white px-2.5 py-1.5 text-center font-mono text-xs font-bold text-red-700 outline-none focus:border-red-600"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase text-neutral-600">
                                  Precio Reposición Unit. (USD)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Ej. 45.00"
                                  value={devolucionPreciosRep[idKey] || ''}
                                  onChange={(e) => {
                                    const val = limpiarInputDecimal(e.target.value)
                                    setDevolucionPreciosRep((prev) => ({
                                      ...prev,
                                      [idKey]: val,
                                    }))
                                  }}
                                  className="w-full rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-right font-mono text-xs font-bold outline-none focus:border-[#FF5500]"
                                  title="Cargo unitario de indemnización por pieza extraviada o no devuelta"
                                />
                              </div>

                              {cantFaltanteNum > 0 && (
                                <div className="sm:col-span-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-mono text-[11px] font-bold text-red-800">
                                  <span>
                                    EXTRAVÍO ({cantFaltanteNum} pza × {fmtUSD(precioRepNum)}): Se descuenta del stock general y se carga al cliente
                                  </span>
                                  <span>+{fmtUSD(cargoExtravio)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-bold">Ajuste financiero y de inventario automático:</p>
                  <p className="mt-0.5 text-[11px]">
                    Las piezas devueltas reingresan al galpón ajustando su cobro a los{' '}
                    {diasEntreFechas(
                      modalDevolucionParcial.fecha_inicio,
                      fechaDevolucionParcial,
                    )}{' '}
                    días reales de uso. Si se reportan piezas faltantes/extraviadas, se descuentan del stock general disponible, se registran en Kardex como <b>EXTRAVÍO / NO DEVUELTO EN OBRA</b> y su cargo de reposición se suma al saldo pendiente del contrato y del cliente.
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
                    <span>Confirmar Recepción en Galpón</span>
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
