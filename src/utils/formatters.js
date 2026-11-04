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

// Normalización de roles amigables: 'Administrador', 'Administracion', 'Galpon' (con compatibilidad 'Patio')
export const normalizarRol = (rol) => {
  const r = String(rol ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (r.includes('administrador') || r === 'admin' || r === 'superadmin') return 'Administrador'
  if (r.includes('administracion')) return 'Administracion'
  if (r.includes('galpon') || r.includes('patio') || r.includes('operador') || r.includes('despacho'))
    return 'Galpon'
  return 'Administrador'
}

export const etiquetaRol = (rol) => {
  const r = normalizarRol(rol)
  if (r === 'Administrador') return 'Administrador General'
  if (r === 'Administracion') return 'Administración y Facturación'
  if (r === 'Galpon') return 'Encargado de Galpón'
  return r
}

export const permisosPorRol = (rol) => {
  const r = normalizarRol(rol)
  const esGalpon = r === 'Galpon'
  return {
    rol: r,
    esAdmin: r === 'Administrador',
    esAdministracion: r === 'Administracion',
    esGalpon: esGalpon,
    puedeEditarTasa: r === 'Administrador',
    puedeCrearEditarInventario: r === 'Administrador' || r === 'Administracion' || esGalpon,
    puedeEliminarInventario: r === 'Administrador',
    puedeExportarReportes: true,
    puedeVerMontosVentas: !esGalpon,
    puedeGestionarUsuarios: r === 'Administrador',
    modulosPermitidos:
      r === 'Administrador'
        ? [
            'dashboard',
            'inventario',
            'alquileres',
            'prestamos',
            'clientes',
            'reportes',
            'usuarios',
          ]
        : r === 'Administracion'
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

// Redacta el mensaje profesional de notificación de contrato para WhatsApp
export const construirMensajeWhatsAppContrato = ({ contrato, cliente, tasa }) => {
  const nombreCliente =
    cliente?.nombre_razon_social || contrato?.cliente_nombre || 'Estimado(a) Cliente'
  const codigo =
    contrato?.codigo_contrato || contrato?.numero_contrato || `CT-${contrato?.id}`
  const vencimiento = fmtFecha(contrato?.fecha_vencimiento)

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

  const saldoPendiente = num(contrato?.saldo_pendiente_usd)
  let lineaSaldo = ''
  if (saldoPendiente > 0.009) {
    const enBs = tasa ? ` (aprox. ${fmtVES(saldoPendiente * tasa)} a la Tasa del Día)` : ''
    lineaSaldo = `\n💰 Saldo pendiente por liquidar: ${fmtUSD(saldoPendiente)}${enBs}\n`
  } else {
    lineaSaldo = '\n✅ Estado de pago: Factura totalmente pagada al día\n'
  }

  const mensaje = `*SERVIALQUILER DV, C.A.*
*Control de Alquiler y Despacho de Equipos*

Estimado(a) *${nombreCliente}*, le compartimos el resumen de su contrato activo:

*Contrato:* ${codigo}
*Fecha límite de devolución:* ${vencimiento}

*Equipos despachados en obra:*
${resumenEquipos}
${lineaSaldo}
Para renovaciones, extensiones de días, devoluciones a galpón o reportes de pago, por favor responda a este mensaje.

_¡Gracias por confiar en ServiAlquiler DV, C.A.!_`

  return encodeURIComponent(mensaje)
}

// Icono SVG profesional de WhatsApp
export { default as WhatsAppIcon } from '../components/WhatsAppIcon'
