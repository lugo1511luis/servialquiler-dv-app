// ---------------------------------------------------------------------------
// Identidad Corporativa y Utilidades Compartidas - ServiAlquiler DV, C.A.
// Sistema Amigable de Control de Galpón, Alquileres y Facturación
// ---------------------------------------------------------------------------

export const NEGRO = '#111111'
export const NARANJA = '#FF5500'
export const FONT = "'Century Gothic', CenturyGothic, AppleGothic, 'Futura', sans-serif"
export const LOGO_URL = '/Logo_SDV.jpeg'

export const METODOS_PAGO_DEFAULT = [
  'Efectivo USD',
  'Efectivo Bs.',
  'Pago Móvil',
  'Zelle',
  'Transferencia Bancaria',
  'Mixto (USD + Bs.)',
]

export const CATEGORIAS_INVENTARIO_DEFAULT = [
  'Andamios',
  'Puntales',
  'Tablas',
  'Mezcladoras',
  'Herramientas',
  'Maquinaria',
]

export const CATEGORIAS_INVENTARIO_STORAGE_KEY = 'servialquiler_categorias_inventario'
export const PRECIOS_REPOSICION_STORAGE_KEY = 'servialquiler_precios_reposicion'

export const leerCategoriasLocalStorage = () => {
  try {
    const raw = localStorage.getItem(CATEGORIAS_INVENTARIO_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x?.nombre ?? x ?? '').trim()).filter(Boolean)
    }
  } catch {
    // Ignorar error de localStorage
  }
  return []
}

export const guardarCategoriasLocalStorage = (lista) => {
  try {
    if (Array.isArray(lista)) {
      localStorage.setItem(CATEGORIAS_INVENTARIO_STORAGE_KEY, JSON.stringify(lista))
    }
  } catch {
    // Ignorar error de localStorage
  }
}

export const guardarPrecioReposicionLocal = (idOCodigo, precio) => {
  if (!idOCodigo) return
  try {
    const raw = localStorage.getItem(PRECIOS_REPOSICION_STORAGE_KEY)
    const mapa = raw ? JSON.parse(raw) : {}
    mapa[String(idOCodigo)] = num(precio)
    localStorage.setItem(PRECIOS_REPOSICION_STORAGE_KEY, JSON.stringify(mapa))
  } catch {
    // Ignorar
  }
}

export const obtenerPrecioReposicionEquipo = (eq) => {
  if (!eq) return 0
  if (eq.precio_reposicion_usd !== undefined && eq.precio_reposicion_usd !== null && eq.precio_reposicion_usd !== '') {
    return num(eq.precio_reposicion_usd)
  }
  try {
    const raw = localStorage.getItem(PRECIOS_REPOSICION_STORAGE_KEY)
    if (raw) {
      const mapa = JSON.parse(raw)
      if (eq.id && mapa[String(eq.id)] !== undefined) return num(mapa[String(eq.id)])
      if (eq.inventario_id && mapa[String(eq.inventario_id)] !== undefined) return num(mapa[String(eq.inventario_id)])
      if (eq.codigo && mapa[String(eq.codigo)] !== undefined) return num(mapa[String(eq.codigo)])
    }
  } catch {
    // Ignorar
  }
  return 0
}

export const obtenerCategoriasInventario = (config, inventario = []) => {
  const raw = config?.categorias_inventario
  let lista = []
  if (Array.isArray(raw)) {
    lista = raw
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          if (item.activo === false) return null
          return String(item.nombre || item.categoria || '').trim()
        }
        return ''
      })
      .filter(Boolean)
  } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        lista = parsed.map((x) => String(x?.nombre ?? x ?? '').trim()).filter(Boolean)
      }
    } catch {
      // Ignorar JSON inválido
    }
  }

  if (lista.length === 0) {
    lista = leerCategoriasLocalStorage()
  } else {
    guardarCategoriasLocalStorage(lista)
  }

  const base = lista.length > 0 ? lista : CATEGORIAS_INVENTARIO_DEFAULT
  const conjunto = new Set(base)

  if (Array.isArray(inventario)) {
    inventario.forEach((i) => {
      if (i?.categoria && typeof i.categoria === 'string' && i.categoria.trim()) {
        conjunto.add(i.categoria.trim())
      }
    })
  }

  return Array.from(conjunto)
}

export const obtenerMetodosPago = (config) => {
  const raw = config?.metodos_pago
  let lista = []
  if (Array.isArray(raw)) {
    lista = raw
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          if (item.activo === false) return null
          return String(item.nombre || item.metodo || item.label || '').trim()
        }
        return ''
      })
      .filter(Boolean)
  } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        lista = parsed.map((x) => String(x?.nombre ?? x ?? '').trim()).filter(Boolean)
      }
    } catch {
      // Ignorar JSON inválido
    }
  }
  return lista.length > 0 ? lista : METODOS_PAGO_DEFAULT
}

export const num = (v) => {
  if (v === '' || v === null || v === undefined) return 0
  const limpio = typeof v === 'string' ? v.replace(',', '.').trim() : v
  const n = Number(limpio)
  return Number.isFinite(n) ? n : 0
}

// Permite cadena vacía '' mientras el usuario escribe, aceptando solo dígitos y un punto decimal
export const limpiarInputDecimal = (valor) => {
  if (valor === '' || valor === null || valor === undefined) return ''
  const normalizado = String(valor).replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const partes = normalizado.split('.')
  if (partes.length <= 1) return normalizado
  return `${partes[0]}.${partes.slice(1).join('')}`
}

// Permite cadena vacía '' mientras el usuario escribe, aceptando solo números enteros
export const limpiarInputEntero = (valor) => {
  if (valor === '' || valor === null || valor === undefined) return ''
  return String(valor).replace(/[^0-9]/g, '')
}

// Genera automáticamente el código de equipo: 3 letras de Categoría/Material + correlativo (ej. AND-005)
export const generarCodigoEquipo = (categoria, material, listaExistente = []) => {
  const limpiarTexto = (txt) =>
    String(txt ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase()

  const catLimpia = limpiarTexto(categoria)
  const matLimpio = limpiarTexto(material)

  let prefijo = ''
  if (catLimpia && catLimpia !== 'GENERAL' && catLimpia.length >= 3) {
    prefijo = catLimpia.slice(0, 3)
  } else if (matLimpio.length >= 3) {
    prefijo = matLimpio.slice(0, 3)
  } else if (catLimpia.length >= 1) {
    prefijo = (catLimpia + 'EQP').slice(0, 3)
  } else {
    prefijo = 'EQP'
  }

  let maxCorrelativo = 0
  const regex = new RegExp(`^${prefijo}-?(\\d+)$`, 'i')

  listaExistente.forEach((item) => {
    const cod = String(item?.codigo ?? '').trim().toUpperCase()
    const match = cod.match(regex)
    if (match && match[1]) {
      const n = parseInt(match[1], 10)
      if (Number.isFinite(n) && n > maxCorrelativo) {
        maxCorrelativo = n
      }
    }
  })

  const siguiente = maxCorrelativo + 1
  return `${prefijo}-${String(siguiente).padStart(3, '0')}`
}

export const fmtUSD = (v) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(num(v))

export const fmtVES = (v) =>
  'Bs. ' +
  new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num(v))

export const fmtNum = (v) => new Intl.NumberFormat('es-VE').format(num(v))

export const fmtFecha = (f) => {
  if (!f) return '—'
  const str = String(f)
  const d = str.length === 10 ? new Date(str + 'T00:00:00') : new Date(str)
  if (Number.isNaN(d.getTime())) return str
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const fmtFechaHora = (f) => {
  if (!f) return '—'
  const d = new Date(f)
  if (Number.isNaN(d.getTime())) return fmtFecha(f)
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const hoyISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const inicioSemanaISO = () => {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

export const inicioMesISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export const fechaEnRango = (fechaValor, desdeISO, hastaISO) => {
  if (!fechaValor) return false
  const str = String(fechaValor)
  let iso = str.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const d = new Date(str)
    if (Number.isNaN(d.getTime())) return false
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    iso = `${y}-${m}-${day}`
  }
  if (desdeISO && iso < desdeISO) return false
  if (hastaISO && iso > hastaISO) return false
  return true
}

export const sumarDiasISO = (fechaBase, dias) => {
  const str = String(fechaBase || hoyISO()).slice(0, 10)
  const d = new Date(str + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return hoyISO()
  d.setDate(d.getDate() + num(dias))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const diasEntreHoyY = (fechaFin) => {
  if (!fechaFin) return null
  const str = String(fechaFin).slice(0, 10)
  const fin = new Date(str + 'T00:00:00')
  const hoy = new Date(hoyISO() + 'T00:00:00')
  if (Number.isNaN(fin.getTime())) return null
  return Math.round((fin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export const diasEntreFechas = (fechaInicio, fechaFin) => {
  if (!fechaInicio || !fechaFin) return 1
  const strIni = String(fechaInicio).slice(0, 10)
  const strFin = String(fechaFin).slice(0, 10)
  const dIni = new Date(strIni + 'T00:00:00')
  const dFin = new Date(strFin + 'T00:00:00')
  if (Number.isNaN(dIni.getTime()) || Number.isNaN(dFin.getTime())) return 1
  const diff = Math.round((dFin.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}

export const esDeHoy = (fechaValor) => {
  if (!fechaValor) return false
  const hoy = hoyISO()
  const str = String(fechaValor)
  if (str.slice(0, 10) === hoy) return true
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return false
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}` === hoy
}

export const ordenarPorCodigo = (filas) =>
  [...filas].sort((a, b) =>
    String(a.codigo ?? '').localeCompare(String(b.codigo ?? ''), 'es', { numeric: true }),
  )

// Normalización de roles amigables: 'Administrador', 'Facturacion' (compatible con 'Administracion'), 'Galpon' (con compatibilidad 'Patio')
export const normalizarRol = (rol) => {
  const r = String(rol ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (r.includes('administrador') || r === 'admin' || r === 'superadmin') return 'Administrador'
  if (r.includes('facturacion') || r.includes('administracion') || r.includes('caja')) return 'Facturacion'
  if (r.includes('galpon') || r.includes('patio') || r.includes('operador') || r.includes('despacho'))
    return 'Galpon'
  return 'Administrador'
}

export const etiquetaRol = (rol) => {
  const r = normalizarRol(rol)
  if (r === 'Administrador') return 'Administrador General'
  if (r === 'Facturacion') return 'Facturación'
  if (r === 'Galpon') return 'Encargado de Galpón'
  return r
}

export const permisosPorRol = (rol) => {
  const r = normalizarRol(rol)
  const esGalpon = r === 'Galpon'
  const esFacturacion = r === 'Facturacion'
  return {
    rol: r,
    esAdmin: r === 'Administrador',
    esAdministracion: esFacturacion,
    esFacturacion: esFacturacion,
    esGalpon: esGalpon,
    puedeEditarTasa: r === 'Administrador',
    puedeCrearEditarInventario: r === 'Administrador' || esFacturacion || esGalpon,
    puedeEliminarInventario: r === 'Administrador',
    puedeExportarReportes: true,
    puedeVerMontosVentas: !esGalpon,
    puedeGestionarUsuarios: r === 'Administrador',
    puedeGestionarNomina: r === 'Administrador',
    modulosPermitidos:
      r === 'Administrador'
        ? [
            'dashboard',
            'inventario',
            'alquileres',
            'prestamos',
            'clientes',
            'reportes',
            'nomina',
            'usuarios',
          ]
        : esFacturacion
          ? ['dashboard', 'inventario', 'alquileres', 'prestamos', 'clientes', 'reportes']
          : ['inventario', 'alquileres', 'prestamos', 'reportes'],
  }
}

// Carga el logo en Base64 para incrustarlo en reportes PDF
let logoCache = null
export const cargarLogoBase64 = async () => {
  if (logoCache) return logoCache
  try {
    const res = await fetch(LOGO_URL)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        logoCache = reader.result
        resolve(logoCache)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// Formatea teléfonos a formato estándar internacional para WhatsApp (58 para Venezuela)
export const formatearTelefonoWhatsApp = (tel) => {
  if (!tel) return ''
  const soloDigitos = String(tel).replace(/[^0-9]/g, '')
  if (!soloDigitos) return ''
  // Si empieza por 0 (ej. 04141234567, 0412...), remover el 0 y anteponer código 58
  if (soloDigitos.startsWith('0')) {
    return `58${soloDigitos.slice(1)}`
  }
  // Si tiene 10 dígitos y empieza por 4 (ej. 4141234567), anteponer código 58
  if (soloDigitos.length === 10 && soloDigitos.startsWith('4')) {
    return `58${soloDigitos}`
  }
  return soloDigitos
}

// Redacta mensajes personalizados de WhatsApp según el estado de cuenta y situación operativa
export const construirMensajeWhatsAppContrato = ({ contrato, cliente, tasa }) => {
  const nombreCliente =
    cliente?.nombre_razon_social || contrato?.cliente_nombre || 'Estimado(a) Cliente'
  const codigo =
    contrato?.codigo_contrato || contrato?.numero_contrato || `CT-${contrato?.id ?? '001'}`
  const vencimiento = fmtFecha(contrato?.fecha_vencimiento)
  const diasRestantes = diasEntreHoyY(contrato?.fecha_vencimiento)
  const estaVencido = diasRestantes !== null && diasRestantes < 0
  const diasMora = estaVencido ? Math.abs(diasRestantes) : 0
  const saldoPendiente = num(contrato?.saldo_pendiente_usd)
  const finalizado =
    String(contrato?.estado ?? '').toLowerCase().includes('devuelt') ||
    String(contrato?.estado_despacho ?? '').toLowerCase().includes('devuelt') ||
    String(contrato?.estado ?? '').toLowerCase().includes('finaliz')

  let items = []
  if (Array.isArray(contrato?.items)) {
    items = contrato.items
  } else if (typeof contrato?.items === 'string') {
    try {
      items = JSON.parse(contrato.items)
    } catch {
      items = []
    }
  }

  const resumenEquipos =
    items.length > 0
      ? items
          .map((it) => `• ${num(it.cantidad) || 1} und. de ${it.material || it.nombre || 'Equipo'}`)
          .join('\n')
      : '• Equipos en obra'

  let mensaje = ''

  // CASO A: Con Deuda o Contrato Vencido
  if (saldoPendiente > 0.009 || estaVencido) {
    let estadoTexto = ''
    if (estaVencido) {
      estadoTexto = `⚠️ *ESTADO:* Contrato vencido con *${diasMora} día(s) de mora* (Venció el: ${vencimiento})`
    } else {
      estadoTexto = `⚠️ *ESTADO:* Saldo pendiente por cancelar (Fecha límite: ${vencimiento})`
    }

    const enBs = tasa ? ` (Aprox. *${fmtVES(saldoPendiente * tasa)}* a la Tasa del Día)` : ''

    mensaje = `*SERVIALQUILER DV, C.A.*
*Departamento de Administración y Cobranzas*

Estimado(a) *${nombreCliente}*, le saludamos cordialmente. Nos comunicamos para compartirle el estado actual de su contrato de alquiler:

📋 *Contrato:* ${codigo}
${estadoTexto}

🛠️ *Equipos actualmente en obra:*
${resumenEquipos}

💵 *Monto Pendiente por Liquidar:*
*USD ${fmtUSD(saldoPendiente)}*${enBs}

Agradecemos gestionar la cancelación o renovación del contrato a la brevedad. Puede realizar su pago mediante Efectivo USD, Pago Móvil, Zelle o Transferencia Bancaria y reportar su comprobante por esta vía.

_Atentamente, ServiAlquiler DV, C.A._`
  }
  // CASO B: Al Día / Contrato Activo por Vencer
  else if (!finalizado) {
    const tiempoTexto =
      diasRestantes === 0
        ? '¡Vence hoy!'
        : diasRestantes === 1
          ? 'Resta 1 día'
          : `Restan ${diasRestantes} días`

    mensaje = `*SERVIALQUILER DV, C.A.*
*Seguimiento Operativo de Obra*

Estimado(a) *${nombreCliente}*, le saludamos cordialmente de ServiAlquiler DV, C.A. Esperamos que nuestros equipos estén apoyando con éxito el avance de su obra.

Le compartimos el recordatorio de su contrato activo:

📋 *Contrato:* ${codigo}
📅 *Fecha límite de entrega:* ${vencimiento} (${tiempoTexto})

🛠️ *Equipos alquilados en obra:*
${resumenEquipos}

✅ *Estado Financiero:* Su contrato se encuentra *TOTALMENTE AL DÍA Y CANCELADO*.

Si requiere prorrogar los días de uso en obra o coordinar la recolección/devolución a nuestro galpón, favor indicarnos por esta vía.

_¡Gracias por confiar en ServiAlquiler DV, C.A.!_`
  }
  // CASO C: Solvente / Saldo a Favor o $0 deuda
  else {
    mensaje = `*SERVIALQUILER DV, C.A.*
*Constancia de Solvencia y Cierre de Contrato*

Estimado(a) *${nombreCliente}*, le saludamos cordialmente de ServiAlquiler DV, C.A.

Le notificamos formalmente que su contrato *${codigo}* se encuentra *TOTALMENTE SOLVENTE ($0,00 deuda pendiente)* y los equipos han sido recibidos e inspeccionados satisfactoriamente en nuestro galpón.

Agradecemos profundamente su puntualidad, cuidado del material y preferencia comercial. Su línea de despacho queda habilitada con máxima prioridad para sus próximos requerimientos.

_¡ServiAlquiler DV, C.A. — A su entera disposición!_`
  }

  return encodeURIComponent(mensaje)
}

// Redacta mensaje de WhatsApp para el módulo de Clientes según su saldo global
export const construirMensajeWhatsAppCliente = ({ cliente, tasa }) => {
  const nombreCliente = cliente?.nombre_razon_social || 'Estimado(a) Cliente'
  const saldo = num(cliente?.saldo_pendiente_usd)

  let mensaje = ''
  if (saldo > 0.009) {
    const enBs = tasa ? ` (Aprox. *${fmtVES(saldo * tasa)}* a la Tasa del Día)` : ''
    mensaje = `*SERVIALQUILER DV, C.A.*
*Estado de Cuenta Comercial*

Estimado(a) *${nombreCliente}*, le saludamos de la Administración de ServiAlquiler DV, C.A.

Le notificamos que actualmente registra un saldo pendiente consolidado de:
💵 *USD ${fmtUSD(saldo)}*${enBs}

Agradecemos coordinar la liquidación correspondiente o reportar su comprobante de pago respondiendo a este mensaje.

_Atentamente, Administración · ServiAlquiler DV, C.A._`
  } else {
    mensaje = `*SERVIALQUILER DV, C.A.*
*Constancia de Solvencia Comercial*

Estimado(a) *${nombreCliente}*, le saludamos de ServiAlquiler DV, C.A.

Le confirmamos que su cuenta comercial se encuentra *TOTALMENTE AL DÍA Y SOLVENTE ($0,00 de saldo pendiente)*.

Tenemos inventario disponible en galpón (andamios, puntales, tablas, mezcladoras y maquinaria) con despacho inmediato para sus próximas obras.

_¡Gracias por su preferencia comercial!_`
  }

  return encodeURIComponent(mensaje)
}

/**
 * Calcula el rango de la semana laboral (Lunes a Sábado, 6 días) dada una fecha de referencia.
 * @param {Date|string} fechaRef
 * @returns {{ lunesISO: string, sabadoISO: string, textoSemana: string }}
 */
export const obtenerRangoSemana = (fechaRef = new Date()) => {
  const d = new Date(fechaRef)
  if (isNaN(d.getTime())) return obtenerRangoSemana(new Date())

  const day = d.getDay() // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diffLunes = day === 0 ? -6 : 1 - day

  const lunes = new Date(d)
  lunes.setDate(d.getDate() + diffLunes)

  const sabado = new Date(lunes)
  sabado.setDate(lunes.getDate() + 5)

  const pad = (n) => String(n).padStart(2, '0')
  const toISO = (fecha) =>
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`

  const fmtHumano = (fecha) =>
    `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`

  return {
    lunesISO: toISO(lunes),
    sabadoISO: toISO(sabado),
    textoSemana: `Semana del ${fmtHumano(lunes)} al ${fmtHumano(sabado)}`,
  }
}

/**
 * Redacta el mensaje de WhatsApp para el comprobante de nómina semanal del trabajador.
 */
export const construirMensajeWhatsAppNomina = ({ pago, empleado, tasa }) => {
  const nombre = empleado?.nombre_completo || pago?.empleado_nombre || 'Trabajador'
  const cargo = empleado?.cargo || pago?.cargo || 'Colaborador'
  const semana = pago?.semana_texto || 'Semana Laboral'

  const sueldoBase = num(pago?.sueldo_base_usd)
  const diasTrabajados = num(pago?.dias_laborados) || 6
  const diasFaltados = num(pago?.dias_faltados) || 0
  const descFaltas = num(pago?.deducciones_inasistencia_usd)
  const detalleFaltas = pago?.detalle_faltas || empleado?.detalle_faltas_semana || ''
  const bonos = num(pago?.bonos_extras_usd)
  const adelantos = num(pago?.descuento_adelantos_usd)
  const netoUSD = num(pago?.neto_pagar_usd)
  const tasaCalc = num(tasa) || num(pago?.tasa_bcv)
  const netoVES = tasaCalc > 0 ? netoUSD * tasaCalc : 0
  const metodo = pago?.metodo_pago || 'Efectivo USD'

  let desgloseFaltas = ''
  if (diasFaltados > 0) {
    desgloseFaltas = `\n⚠️ *Inasistencias:* ${diasFaltados} día(s) (-$${fmtUSD(descFaltas)})${detalleFaltas ? ` [${detalleFaltas}]` : ''}`
  }

  let desgloseAdelantos = ''
  if (adelantos > 0) {
    desgloseAdelantos = `\n📉 *Vales / Adelantos descontados:* -$${fmtUSD(adelantos)}`
  }

  let desgloseBonos = ''
  if (bonos > 0) {
    desgloseBonos = `\n⭐ *Bonos / Horas Extra:* +$${fmtUSD(bonos)}`
  }

  const enBs = tasaCalc > 0 ? `\n🇻🇪 *Equivalente en Bolívares:* ${fmtVES(netoVES)} (Tasa: ${fmtVES(tasaCalc)})` : ''

  const mensaje = `*SERVIALQUILER DV, C.A.*
*RECIBO DE PAGO DE NÓMINA SEMANAL*

👤 *Trabajador:* ${nombre}
🏷️ *Cargo:* ${cargo}
📅 *Período:* ${semana}
🕒 *Días Laborados:* ${diasTrabajados} de 6 días${desgloseFaltas}

*RESUMEN DE LIQUIDACIÓN:*
💵 *Sueldo Semanal Base:* $${fmtUSD(sueldoBase)}${desgloseBonos}${desgloseAdelantos}
-------------------------------------
💰 *TOTAL NETO PAGADO:* $${fmtUSD(netoUSD)}${enBs}
💳 *Forma de Pago:* ${metodo}

_Comprobante emitido por el Departamento de Administración y Nómina de ServiAlquiler DV, C.A._`

  return encodeURIComponent(mensaje)
}

// Icono SVG profesional de WhatsApp
export { default as WhatsAppIcon } from '../components/WhatsAppIcon'
