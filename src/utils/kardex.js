import { supabase } from '../supabaseClient'
import { num } from './formatters'

// ---------------------------------------------------------------------------
// Registro automatizado en `movimientos_inventario` (Historial de Entradas y Salidas)
// Tolerante a variaciones de columnas en la tabla de Supabase
// ---------------------------------------------------------------------------

export const registrarMovimientoKardex = async ({
  inventario_id,
  codigo,
  material,
  tipo_movimiento,
  cantidad,
  stock_resultante,
  referencia_documento,
  cliente_nombre,
  observaciones,
}) => {
  let payload = {
    inventario_id,
    codigo: codigo ?? '',
    material: material ?? '',
    tipo_movimiento,
    cantidad: num(cantidad),
    stock_resultante: num(stock_resultante),
    referencia_documento: referencia_documento ?? '',
    cliente_nombre: cliente_nombre ?? '',
    observaciones: observaciones ?? (cliente_nombre ? `Cliente/Aliado: ${cliente_nombre}` : ''),
  }

  for (let intento = 0; intento < 8; intento++) {
    const res = await supabase.from('movimientos_inventario').insert([payload])
    if (!res.error) return res
    const msg = res.error.message || ''
    const match =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "movimientos_inventario" does not exist/i)
    if (match && match[1] && match[1] in payload) {
      const { [match[1]]: _omit, ...resto } = payload
      payload = resto
      continue
    }
    return res
  }
  return await supabase.from('movimientos_inventario').insert([payload])
}

export const estiloBadgeMovimiento = (tipo) => {
  const t = String(tipo ?? '').toUpperCase()
  if (t.includes('SALIDA')) {
    return {
      bg: '#2a1205',
      fg: '#FF5500',
      border: '#FF5500',
      lightBg: 'rgba(255, 85, 0, 0.12)',
      lightFg: '#c2410c',
    }
  }
  if (t.includes('ENTRADA') || t.includes('DEVOLUC')) {
    return {
      bg: '#052e16',
      fg: '#10b981',
      border: '#10b981',
      lightBg: 'rgba(16, 185, 129, 0.14)',
      lightFg: '#047857',
    }
  }
  if (t.includes('PRÉSTAMO') || t.includes('PRESTAMO')) {
    return {
      bg: '#0c1e35',
      fg: '#38bdf8',
      border: '#0284c7',
      lightBg: 'rgba(2, 132, 199, 0.13)',
      lightFg: '#0369a1',
    }
  }
  return {
    bg: '#1f2937',
    fg: '#d1d5db',
    border: '#6b7280',
    lightBg: '#f3f4f6',
    lightFg: '#374151',
  }
}
