import { supabase } from '../supabaseClient'

/**
 * Determina si un contrato de alquiler está actualmente activo en obra
 * (es decir, los equipos están en poder del cliente y NO han sido devueltos a galpón ni finalizados).
 */
export const esContratoActivo = (contrato) => {
  if (!contrato) return false
  const est = String(contrato.estado ?? 'Activo').trim().toLowerCase()
  if (!est) return true
  if (
    est.includes('devuelt') ||
    est.includes('finaliz') ||
    est.includes('cancel') ||
    est.includes('anulad')
  ) {
    return false
  }
  return true
}

/**
 * Extrae de forma segura el listado de ítems/equipos de un registro de contrato.
 * Soporta JSON parseado, string JSON o columnas históricas simples.
 */
export const obtenerItemsContrato = (contrato) => {
  if (!contrato) return []
  const posibles = [
    contrato.items,
    contrato.equipos,
    contrato.detalles,
    contrato.detalle_equipos,
    contrato.materiales,
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
  if (contrato.inventario_id || contrato.equipo_id) {
    return [
      {
        inventario_id: contrato.inventario_id ?? contrato.equipo_id,
        codigo: contrato.codigo ?? '—',
        material: contrato.material ?? 'Equipo alquilado',
        cantidad: Number(contrato.cantidad || 0),
        cantidad_devuelta: Number(contrato.cantidad_devuelta || 0),
        cantidad_faltante: Number(contrato.cantidad_faltante || 0),
      },
    ]
  }
  return []
}

/**
 * Calcula el inventario real actualmente en obra a partir de los contratos activos.
 * Considera devoluciones parciales y pérdidas/extravíos.
 *
 * @param {Array} alquileres - Lista completa de alquileres
 * @returns {{
 *   mapaPorId: Map<string, number>,
 *   mapaPorCodigo: Map<string, number>,
 *   totalPiezasEnObra: number,
 *   contratosActivosCount: number
 * }}
 */
export const calcularStockRealEnObra = (alquileres = []) => {
  const mapaPorId = new Map()
  const mapaPorCodigo = new Map()
  let totalPiezasEnObra = 0
  let contratosActivosCount = 0

  if (!Array.isArray(alquileres)) {
    return { mapaPorId, mapaPorCodigo, totalPiezasEnObra: 0, contratosActivosCount: 0 }
  }

  alquileres.forEach((contrato) => {
    if (!esContratoActivo(contrato)) return
    contratosActivosCount += 1
    const items = obtenerItemsContrato(contrato)

    items.forEach((it) => {
      const cantTotal = Number(it.cantidad || 0)
      const cantDevuelta = Number(it.cantidad_devuelta || 0)
      const cantFaltante = Number(it.cantidad_faltante || 0)
      const enObra = Math.max(0, cantTotal - cantDevuelta - cantFaltante)
      if (enObra <= 0) return

      totalPiezasEnObra += enObra

      if (it.inventario_id !== undefined && it.inventario_id !== null) {
        const idStr = String(it.inventario_id)
        mapaPorId.set(idStr, (mapaPorId.get(idStr) || 0) + enObra)
      }
      if (it.codigo) {
        const codStr = String(it.codigo).trim().toUpperCase()
        mapaPorCodigo.set(codStr, (mapaPorCodigo.get(codStr) || 0) + enObra)
      }
    })
  })

  return {
    mapaPorId,
    mapaPorCodigo,
    totalPiezasEnObra,
    contratosActivosCount,
  }
}

/**
 * Reconcilia en Supabase el stock_propio_alquilado y stock_propio_disponible de cada ítem de inventario
 * contrastándolo contra los contratos de alquiler activos reales.
 *
 * Si no hay contratos activos, stock_propio_alquilado queda estrictamente en 0.
 *
 * @param {{ inventario: Array, alquileres: Array }} params
 * @returns {Promise<{
 *   actualizadosCount: number,
 *   totalDiscrepancias: number,
 *   discrepancias: Array,
 *   totalPiezasEnObra: number,
 *   contratosActivosCount: number
 * }>}
 */
export const reconciliarStockEnSupabase = async ({ inventario = [], alquileres = [] }) => {
  const { mapaPorId, mapaPorCodigo, totalPiezasEnObra, contratosActivosCount } =
    calcularStockRealEnObra(alquileres)

  const discrepancias = []
  const updates = []

  inventario.forEach((item) => {
    const idStr = String(item.id)
    const codStr = String(item.codigo || '').trim().toUpperCase()

    // Búsqueda por ID o fallback por Código
    const alquiladoReal =
      mapaPorId.get(idStr) ?? (codStr ? mapaPorCodigo.get(codStr) : null) ?? 0

    const totalPropio = Number(item.stock_propio_total || 0)
    const prestados = Number(item.stock_propio_prestado || 0)
    const disponibleReal = Math.max(0, totalPropio - alquiladoReal - prestados)

    const alquiladoActual = Number(item.stock_propio_alquilado || 0)
    const disponibleActual = Number(item.stock_propio_disponible || 0)

    if (alquiladoActual !== alquiladoReal || disponibleActual !== disponibleReal) {
      discrepancias.push({
        id: item.id,
        codigo: item.codigo,
        descripcion: item.descripcion,
        alquiladoAnterior: alquiladoActual,
        alquiladoNuevo: alquiladoReal,
        disponibleAnterior: disponibleActual,
        disponibleNuevo: disponibleReal,
      })
      updates.push({
        id: item.id,
        payload: {
          stock_propio_alquilado: alquiladoReal,
          stock_propio_disponible: disponibleReal,
        },
      })
    }
  })

  let actualizadosCount = 0
  for (const up of updates) {
    try {
      const { error } = await supabase
        .from('inventario')
        .update(up.payload)
        .eq('id', up.id)
      if (!error) {
        actualizadosCount += 1
      }
    } catch (err) {
      console.warn('Error al reconciliar ítem de inventario en Supabase:', up.id, err)
    }
  }

  return {
    actualizadosCount,
    totalDiscrepancias: discrepancias.length,
    discrepancias,
    totalPiezasEnObra,
    contratosActivosCount,
  }
}

