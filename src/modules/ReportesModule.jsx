import { useMemo, useState } from 'react'
import {
  FileText,
  FileSpreadsheet,
  Calendar,
  Activity,
  DollarSign,
  Truck,
  CheckCircle2,
  Filter,
  Search,
} from 'lucide-react'
import {
  fechaEnRango,
  fmtFecha,
  fmtFechaHora,
  fmtNum,
  fmtUSD,
  fmtVES,
  hoyISO,
  inicioMesISO,
  inicioSemanaISO,
  NARANJA,
  NEGRO,
  num,
} from '../utils/formatters'
import {
  exportarKardexExcel,
  exportarKardexPDF,
  exportarReporteVentasExcel,
  exportarReporteVentasPDF,
} from '../utils/exportadores'
import { estiloBadgeMovimiento } from '../utils/kardex'
import GuiaRapida from '../components/GuiaRapida'

const TIPOS_HISTORIAL = [
  { id: 'TODOS', label: 'Todos los Movimientos' },
  { id: 'SALIDA', label: 'Salidas (Alquiler a Obra)' },
  { id: 'ENTRADA', label: 'Entradas (Devolución a Galpón)' },
  { id: 'PRESTAMO', label: 'Préstamos con Aliados' },
  { id: 'AJUSTE', label: 'Ajustes en Galpón' },
]

export default function ReportesModule({
  alquileres,
  movimientos,
  clientes,
  inventario,
  tasa,
  permisos,
}) {
  const [pestana, setPestana] = useState(() =>
    permisos.puedeVerMontosVentas ? 'ventas' : 'historial',
  )
  const [desde, setDesde] = useState(() => inicioMesISO())
  const [hasta, setHasta] = useState(() => hoyISO())

  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [filtroMaterial, setFiltroMaterial] = useState('')

  const mapaClientes = useMemo(() => {
    const m = new Map()
    clientes.forEach((c) => m.set(String(c.id), c))
    return m
  }, [clientes])

  const aplicarRangoRapido = (modo) => {
    const hoy = hoyISO()
    if (modo === 'HOY') {
      setDesde(hoy)
      setHasta(hoy)
    } else if (modo === 'SEMANA') {
      setDesde(inicioSemanaISO())
      setHasta(hoy)
    } else if (modo === 'MES') {
      setDesde(inicioMesISO())
      setHasta(hoy)
    } else if (modo === 'TODO') {
      setDesde('2020-01-01')
      setHasta('2099-12-31')
    }
  }

  // Pestaña A: Contratos y Resumen de Ventas
  const contratosFiltrados = useMemo(
    () =>
      alquileres.filter((c) =>
        fechaEnRango(c.fecha_inicio || c.created_at, desde, hasta),
      ),
    [alquileres, desde, hasta],
  )

  const resumenVentas = useMemo(() => {
    let totalFacturado = 0
    let totalFletes = 0
    let activos = 0
    let finalizados = 0
    const porMetodo = {}

    contratosFiltrados.forEach((c) => {
      const monto = num(c.total_contrato_usd)
      const flete = c.requiere_flete ? num(c.costo_flete_usd) : 0
      totalFacturado += monto
      totalFletes += flete

      const est = String(c.estado ?? 'Activo').toLowerCase()
      if (est.includes('finaliz') || est.includes('devuelt')) finalizados += 1
      else activos += 1

      const mp = c.metodo_pago || 'Efectivo USD'
      porMetodo[mp] = (porMetodo[mp] || 0) + monto
    })

    return { totalFacturado, totalFletes, activos, finalizados, porMetodo }
  }, [contratosFiltrados])

  // Pestaña B: Movimientos de Historial (Kardex)
  const movimientosFiltrados = useMemo(() => {
    const qMat = filtroMaterial.trim().toLowerCase()
    return movimientos.filter((m) => {
      if (!fechaEnRango(m.created_at || m.fecha, desde, hasta)) return false

      if (filtroTipo !== 'TODOS') {
        const t = String(m.tipo_movimiento ?? '')
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        if (!t.includes(filtroTipo)) return false
      }

      if (qMat) {
        const coincide = [m.codigo, m.material, m.referencia_documento, m.cliente_nombre].some(
          (v) => String(v ?? '').toLowerCase().includes(qMat),
        )
        if (!coincide) return false
      }
      return true
    })
  }, [movimientos, desde, hasta, filtroTipo, filtroMaterial])

  const tipsReportes = [
    'Elige el rango de fechas que deseas consultar arriba a la derecha (puedes pulsar "Hoy", "Esta Semana" o "Este Mes" para ir directo).',
    'Pestaña A (Cierre de Facturación): Muestra cuánto dinero entró a la empresa por alquileres, cuánto por fletes y el desglose de lo que se cobró por Zelle, Pago Móvil o Efectivo.',
    'Pestaña B (Historial de Entradas y Salidas de Galpón): Te muestra cada movimiento de mercancía con fecha, hora, responsable y cuántos equipos quedaron en galpón.',
    'Descarga los reportes: El botón PDF genera un documento formal listo para imprimir o enviar por WhatsApp; el botón Excel te genera la tabla para abrir en la computadora y sacar cuentas.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  return (
    <div className="space-y-4">
      {/* Guía Rápida */}
      <GuiaRapida moduloNombre="Reportes e Historial" tips={tipsReportes} />

      {/* Barra de Pestañas + Selector de Fechas */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 p-3 text-white shadow-sm"
        style={{ background: NEGRO, borderLeft: `4px solid ${NARANJA}` }}
      >
        <div className="flex flex-wrap gap-1.5">
          {permisos.puedeVerMontosVentas && (
            <button
              type="button"
              onClick={() => setPestana('ventas')}
              className="flex items-center gap-2 rounded px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                background: pestana === 'ventas' ? NARANJA : '#1f1f1f',
                color: '#ffffff',
              }}
            >
              <DollarSign size={15} />
              <span>Pestaña A · Cierre de Facturación y Alquileres</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPestana('historial')}
            className="flex items-center gap-2 rounded px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              background: pestana === 'historial' ? NARANJA : '#1f1f1f',
              color: '#ffffff',
            }}
          >
            <Activity size={15} />
            <span>Pestaña B · Historial de Entradas y Salidas de Galpón</span>
          </button>
        </div>

        {/* Filtros por fecha */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 rounded border border-neutral-700 bg-[#1a1a1a] px-2 py-1">
            <Calendar size={13} color={NARANJA} />
            <span className="text-[10px] font-bold uppercase text-neutral-400">Desde:</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="bg-transparent font-mono text-xs text-white outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded border border-neutral-700 bg-[#1a1a1a] px-2 py-1">
            <span className="text-[10px] font-bold uppercase text-neutral-400">Hasta:</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="bg-transparent font-mono text-xs text-white outline-none"
            />
          </div>

          <div className="flex gap-1">
            {[
              { id: 'HOY', label: 'Hoy' },
              { id: 'SEMANA', label: 'Esta Semana' },
              { id: 'MES', label: 'Este Mes' },
              { id: 'TODO', label: 'Todo el Histórico' },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => aplicarRangoRapido(b.id)}
                className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:border-[#FF5500]"
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* =====================================================================
          PESTAÑA A: REPORTE DE VENTAS Y FACTURACIÓN
      ===================================================================== */}
      {pestana === 'ventas' && permisos.puedeVerMontosVentas && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className="rounded-md border border-neutral-800 p-4 text-white shadow-sm"
              style={{ background: NEGRO, borderLeft: `4px solid ${NARANJA}` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                TOTAL FACTURADO EN ESTE PERÍODO
              </p>
              <p className="mt-1.5 font-mono text-2xl font-bold" style={{ color: NARANJA }}>
                {fmtUSD(resumenVentas.totalFacturado)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-neutral-300">
                {tasa ? fmtVES(resumenVentas.totalFacturado * tasa) : '—'}
              </p>
            </div>

            <div
              className="rounded-md border border-neutral-800 p-4 text-white shadow-sm"
              style={{ background: NEGRO, borderLeft: `4px solid ${NARANJA}` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  INGRESOS POR FLETES / TRANSPORTE
                </p>
                <Truck size={16} color={NARANJA} />
              </div>
              <p className="mt-1.5 font-mono text-2xl font-bold text-white">
                {fmtUSD(resumenVentas.totalFletes)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-neutral-400">
                {tasa ? fmtVES(resumenVentas.totalFletes * tasa) : '—'}
              </p>
            </div>

            <div
              className="rounded-md border border-neutral-800 p-4 text-white shadow-sm"
              style={{ background: NEGRO, borderLeft: `4px solid ${NARANJA}` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  ESTADO DE LOS CONTRATOS
                </p>
                <CheckCircle2 size={16} color={NARANJA} />
              </div>
              <p className="mt-1.5 font-mono text-xl font-bold text-white">
                {resumenVentas.activos} En Obra · {resumenVentas.finalizados} Ya en Galpón
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                Total operaciones realizadas: {contratosFiltrados.length}
              </p>
            </div>

            <div
              className="rounded-md border border-neutral-800 p-4 text-white shadow-sm"
              style={{ background: NEGRO, borderLeft: `4px solid ${NARANJA}` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                DINERO POR MÉTODO DE PAGO
              </p>
              <div className="mt-1.5 space-y-1 font-mono text-[11px]">
                {Object.keys(resumenVentas.porMetodo).length === 0 ? (
                  <p className="text-neutral-500">Sin cobros en este rango de fechas</p>
                ) : (
                  Object.entries(resumenVentas.porMetodo).map(([mp, monto]) => (
                    <div key={mp} className="flex justify-between">
                      <span className="truncate text-neutral-300">{mp}:</span>
                      <span className="font-bold text-white">{fmtUSD(monto)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Tabla de ventas */}
          <section
            className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
            style={{ borderLeft: `4px solid ${NARANJA}` }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
              style={{ background: NEGRO }}
            >
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  Listado Detallado de Contratos y Facturación ({contratosFiltrados.length})
                </h3>
                <p className="text-[11px] text-neutral-400">
                  Período: {fmtFecha(desde)} al {fmtFecha(hasta)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    exportarReporteVentasPDF({
                      contratos: contratosFiltrados,
                      mapaClientes,
                      desde,
                      hasta,
                      tasaDelDia: tasa,
                      resumen: resumenVentas,
                    })
                  }
                  className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-bold text-white hover:border-[#FF5500]"
                  title="PDF con membrete y logo oficial, listo para imprimir o enviar por WhatsApp"
                >
                  <FileText size={14} color={NARANJA} />
                  <span>Exportar Reporte en PDF</span>
                  <span className="hidden sm:inline font-mono text-[9px] text-amber-400">(Para Imprimir)</span>
                </button>
                <button
                  onClick={() =>
                    exportarReporteVentasExcel({
                      contratos: contratosFiltrados,
                      mapaClientes,
                      desde,
                      hasta,
                      tasaDelDia: tasa,
                    })
                  }
                  className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  title="Descargar tabla en Excel para sacar cuentas o hacer cálculos"
                >
                  <FileSpreadsheet size={14} />
                  <span>Exportar Facturación en Excel</span>
                  <span className="hidden sm:inline font-mono text-[9px] text-emerald-300">(Para Cuentas)</span>
                </button>
              </div>
            </div>

            {contratosFiltrados.length === 0 ? (
              <p className="p-8 text-center text-xs text-neutral-500">
                No hay contratos facturados en el rango de fechas seleccionado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ color: NEGRO }}>
                  <thead style={{ background: '#1c1c1c' }}>
                    <tr>
                      <th className={th}>N° Contrato</th>
                      <th className={th}>Fecha</th>
                      <th className={th}>Cliente / Razón Social</th>
                      <th className={th}>Forma de Pago</th>
                      <th className={`${th} text-center`}>Estado</th>
                      <th className={`${th} text-right`}>Flete USD</th>
                      <th className={`${th} text-right`}>Total USD</th>
                      <th className={`${th} text-right`}>Total en Bolívares</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {contratosFiltrados.map((c) => {
                      const cli = mapaClientes.get(String(c.cliente_id))
                      const total = num(c.total_contrato_usd)
                      const flete = c.requiere_flete ? num(c.costo_flete_usd) : 0
                      const nro =
                        c.codigo_contrato ||
                        c.numero_contrato ||
                        `CT-${String(c.id ?? '').slice(0, 6).toUpperCase()}`
                      return (
                        <tr key={c.id} className="hover:bg-orange-50/40">
                          <td className={`${td} font-mono font-bold text-neutral-800`}>{nro}</td>
                          <td className={`${td} font-mono`}>
                            {fmtFecha(c.fecha_inicio || c.created_at)}
                          </td>
                          <td className={`${td} font-bold`}>
                            {cli?.nombre_razon_social ||
                              c.cliente_nombre ||
                              `Cliente #${c.cliente_id ?? '—'}`}
                          </td>
                          <td className={td}>{c.metodo_pago || 'Efectivo USD'}</td>
                          <td className={`${td} text-center`}>
                            <span className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase">
                              {c.estado || 'Activo'}
                            </span>
                          </td>
                          <td className={`${td} text-right font-mono`}>{fmtUSD(flete)}</td>
                          <td className={`${td} text-right font-mono font-bold`}>
                            {fmtUSD(total)}
                          </td>
                          <td className={`${td} text-right font-mono text-neutral-600`}>
                            {tasa ? fmtVES(total * tasa) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA B: HISTORIAL DE ENTRADAS Y SALIDAS DE GALPÓN
      ===================================================================== */}
      {pestana === 'historial' && (
        <section
          className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
          style={{ borderLeft: `4px solid ${NARANJA}` }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
            style={{ background: NEGRO }}
          >
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Historial de Entradas y Salidas de Galpón ({movimientosFiltrados.length})
              </h3>
              <p className="text-[11px] text-neutral-400">
                Registro fiel de qué equipos salieron a obras, cuáles regresaron y qué préstamos se hicieron
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  exportarKardexPDF({
                    movimientos: movimientosFiltrados,
                    desde,
                    hasta,
                  })
                }
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-bold text-white hover:border-[#FF5500]"
                title="Descargar el historial en PDF listo para archivar o imprimir"
              >
                <FileText size={14} color={NARANJA} />
                <span>Exportar Historial en PDF</span>
                <span className="hidden sm:inline font-mono text-[9px] text-amber-400">(Para Imprimir)</span>
              </button>
              <button
                onClick={() =>
                  exportarKardexExcel({
                    movimientos: movimientosFiltrados,
                    desde,
                    hasta,
                  })
                }
                className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                title="Descargar el historial en Excel para analizar en la computadora"
              >
                <FileSpreadsheet size={14} />
                <span>Exportar en Excel</span>
                <span className="hidden sm:inline font-mono text-[9px] text-emerald-300">(Para Cuentas)</span>
              </button>
            </div>
          </div>

          {/* Sub-filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-100 px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter size={14} color={NARANJA} />
              <span className="font-bold uppercase text-neutral-700">Filtrar por:</span>
              {TIPOS_HISTORIAL.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFiltroTipo(t.id)}
                  className="rounded border px-2.5 py-1 text-[11px] font-bold transition-colors"
                  style={{
                    background: filtroTipo === t.id ? NEGRO : '#ffffff',
                    color: filtroTipo === t.id ? '#ffffff' : '#374151',
                    borderColor: filtroTipo === t.id ? NARANJA : '#d1d5db',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 rounded border border-neutral-300 bg-white px-2.5 py-1">
              <Search size={13} color="#666" />
              <input
                list="lista-materiales-historial"
                value={filtroMaterial}
                onChange={(e) => setFiltroMaterial(e.target.value)}
                placeholder="Buscar por equipo, código o cliente..."
                className="w-56 bg-transparent text-xs outline-none"
              />
              <datalist id="lista-materiales-historial">
                {inventario.map((i) => (
                  <option key={i.id} value={i.material} />
                ))}
              </datalist>
            </div>
          </div>

          {movimientosFiltrados.length === 0 ? (
            <p className="p-8 text-center text-xs text-neutral-500">
              No hay movimientos en el rango de fechas y filtros seleccionados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ color: NEGRO }}>
                <thead style={{ background: '#1c1c1c' }}>
                  <tr>
                    <th className={th}>Fecha y Hora</th>
                    <th className={th}>Tipo de Movimiento</th>
                    <th className={th}>Código</th>
                    <th className={th}>Equipo / Material</th>
                    <th className={`${th} text-right`}>Cantidad</th>
                    <th className={`${th} text-right`}>Quedan en Galpón</th>
                    <th className={th}>Doc. Referencia</th>
                    <th className={th}>Cliente / Empresa Aliada / Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {movimientosFiltrados.map((m, idx) => {
                    const b = estiloBadgeMovimiento(m.tipo_movimiento)
                    return (
                      <tr key={m.id ?? idx} className="hover:bg-orange-50/40">
                        <td className={`${td} font-mono text-[11px] text-neutral-600`}>
                          {fmtFechaHora(m.created_at || m.fecha)}
                        </td>
                        <td className={td}>
                          <span
                            className="inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase"
                            style={{
                              background: b.lightBg,
                              color: b.lightFg,
                              borderColor: b.border,
                            }}
                          >
                            {m.tipo_movimiento || 'MOVIMIENTO'}
                          </span>
                        </td>
                        <td className={`${td} font-mono font-bold text-neutral-700`}>
                          {m.codigo || '—'}
                        </td>
                        <td className={`${td} font-bold text-neutral-900`}>
                          {m.material || '—'}
                        </td>
                        <td className={`${td} text-right font-mono font-bold`}>
                          {fmtNum(m.cantidad)}
                        </td>
                        <td className={`${td} text-right font-mono`}>
                          {m.stock_resultante !== undefined && m.stock_resultante !== null
                            ? fmtNum(m.stock_resultante)
                            : '—'}
                        </td>
                        <td className={`${td} font-mono text-xs font-bold`} style={{ color: NARANJA }}>
                          {m.referencia_documento || '—'}
                        </td>
                        <td className={td}>
                          {m.cliente_nombre || m.observaciones || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
