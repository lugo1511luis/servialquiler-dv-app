import { useMemo } from 'react'
import {
  Package,
  HardHat,
  Handshake,
  ShoppingCart,
  BellRing,
  Activity,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react'
import {
  diasEntreHoyY,
  esDeHoy,
  fmtFecha,
  fmtFechaHora,
  fmtNum,
  fmtUSD,
  fmtVES,
  NARANJA,
  NEGRO,
  num,
} from '../utils/formatters'
import { estiloBadgeMovimiento } from '../utils/kardex'
import GuiaRapida from '../components/GuiaRapida'

function TarjetaResumen({
  titulo,
  valor,
  subtitulo,
  icono: Icono,
  porcentaje,
  etiquetaBarra,
  ayuda,
  destacado = false,
}) {
  const pct = Math.min(100, Math.max(0, Math.round(num(porcentaje))))
  return (
    <div
      className="flex flex-col justify-between rounded-md border border-neutral-800 bg-[#141414] p-4 text-white shadow-md"
      style={{
        borderLeft: `4px solid ${NARANJA}`,
        background: destacado ? '#19130f' : NEGRO,
      }}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                {titulo}
              </p>
              {ayuda && (
                <span title={ayuda} className="cursor-help text-neutral-500 hover:text-white">
                  <HelpCircle size={12} />
                </span>
              )}
            </div>
          </div>
          <div
            className="rounded border border-neutral-800 p-2"
            style={{ background: 'rgba(255,85,0,0.12)' }}
          >
            <Icono size={18} color={NARANJA} />
          </div>
        </div>

        <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">{valor}</p>
        {subtitulo && <p className="mt-0.5 text-[11px] text-neutral-400">{subtitulo}</p>}
      </div>

      {porcentaje !== undefined && (
        <div className="mt-3 border-t border-neutral-800/80 pt-2">
          <div className="mb-1 flex items-center justify-between text-[10px] font-mono">
            <span className="text-neutral-400">{etiquetaBarra || 'DISPONIBILIDAD'}</span>
            <span className="font-bold" style={{ color: NARANJA }}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-neutral-800">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: NARANJA }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardModule({
  inventario,
  alquileres,
  movimientos = [],
  clientes,
  tasa,
  permisos,
  onIrModulo,
}) {
  const mapaClientes = useMemo(() => {
    const m = new Map()
    clientes.forEach((c) => m.set(String(c.id), c))
    return m
  }, [clientes])

  // KPIs Globales de Inventario en Galpón
  const kpis = useMemo(() => {
    const suma = (campo) => inventario.reduce((s, f) => s + num(f[campo]), 0)
    const totalPropio = suma('stock_propio_total')
    const disponible = suma('stock_propio_disponible')
    const obra = suma('stock_propio_alquilado')
    const propiosPrestados = suma('stock_propio_prestado')
    const externosPrestados = suma('stock_externo_prestado')
    const prestamos = propiosPrestados + externosPrestados

    const pctDisponibilidad = totalPropio > 0 ? (disponible / totalPropio) * 100 : 0
    const pctOcupacionObra = totalPropio > 0 ? (obra / totalPropio) * 100 : 0
    const pctPrestamos =
      totalPropio + externosPrestados > 0
        ? (prestamos / (totalPropio + externosPrestados)) * 100
        : 0

    return {
      totalPropio,
      disponible,
      obra,
      propiosPrestados,
      externosPrestados,
      prestamos,
      pctDisponibilidad,
      pctOcupacionObra,
      pctPrestamos,
    }
  }, [inventario])

  // Ventas del día desde alquileres.total_contrato_usd
  const ventasHoy = useMemo(() => {
    const contratosHoy = alquileres.filter((a) => esDeHoy(a.created_at || a.fecha_inicio))
    const total = contratosHoy.reduce((s, a) => s + num(a.total_contrato_usd), 0)
    return { total, cantidad: contratosHoy.length }
  }, [alquileres])

  // Matriz de Ocupación de Galpón por Categoría
  const matrizCategorias = useMemo(() => {
    const grupos = new Map()
    const categoriasBase = ['Andamios', 'Maquinaria', 'Puntales', 'Madera']
    categoriasBase.forEach((cat) =>
      grupos.set(cat, {
        categoria: cat,
        items: 0,
        total: 0,
        disponible: 0,
        enObra: 0,
        prestado: 0,
      }),
    )

    inventario.forEach((f) => {
      const catRaw = String(f.categoria || 'General').trim()
      let clave = catRaw
      for (const k of grupos.keys()) {
        if (k.toLowerCase() === catRaw.toLowerCase()) {
          clave = k
          break
        }
      }
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          categoria: clave,
          items: 0,
          total: 0,
          disponible: 0,
          enObra: 0,
          prestado: 0,
        })
      }
      const g = grupos.get(clave)
      g.items += 1
      g.total += num(f.stock_propio_total)
      g.disponible += num(f.stock_propio_disponible)
      g.enObra += num(f.stock_propio_alquilado)
      g.prestado += num(f.stock_propio_prestado) + num(f.stock_externo_prestado)
    })

    return Array.from(grupos.values())
      .filter((g) => g.total > 0 || g.items > 0 || categoriasBase.includes(g.categoria))
      .map((g) => {
        const base = Math.max(1, g.total || g.disponible + g.enObra)
        const pctObra = g.total > 0 ? Math.min(100, Math.round((g.enObra / base) * 100)) : 0
        const pctDisp = g.total > 0 ? Math.min(100, Math.round((g.disponible / base) * 100)) : 0
        return { ...g, pctObra, pctDisp }
      })
  }, [inventario])

  // Alertas de Contratos Vencidos o Por Vencer
  const alertasContratos = useMemo(() => {
    const activos = alquileres.filter((a) => {
      const est = String(a.estado ?? 'Activo').toLowerCase()
      return !est.includes('finaliz') && !est.includes('devuelt') && !est.includes('cancel')
    })
    const vencidos = []
    const porVencer = []
    activos.forEach((a) => {
      const d = diasEntreHoyY(a.fecha_vencimiento)
      if (d === null) return
      if (d < 0) vencidos.push({ ...a, diasRestantes: d })
      else if (d <= 3) porVencer.push({ ...a, diasRestantes: d })
    })
    return { vencidos, porVencer, totalActivos: activos.length }
  }, [alquileres])

  const ultimosMovimientos = useMemo(() => movimientos.slice(0, 8), [movimientos])

  const tipsDashboard = [
    'Mira de un vistazo cuántos equipos tienes guardados en galpón listos para alquilar y cuántos están trabajando en obras.',
    'Revisa la lista de contratos vencidos para llamar al cliente y cobrar prórrogas o coordinar el regreso de los equipos.',
    'Sigue la bitácora en vivo: cada vez que alguien despacha, devuelve o presta mercancía, el movimiento aparece registrado aquí automáticamente.',
  ]

  return (
    <div className="space-y-4">
      {/* Guía Rápida Amigable */}
      <GuiaRapida moduloNombre="Resumen del Negocio" tips={tipsDashboard} />

      {/* Fila 1: 4 Tarjetas de Resumen con Porcentajes */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaResumen
          titulo="En Galpón (Disponible)"
          valor={fmtNum(kpis.disponible)}
          subtitulo={`De ${fmtNum(kpis.totalPropio)} equipos propios en total`}
          icono={Package}
          porcentaje={kpis.pctDisponibilidad}
          etiquetaBarra="% GUARDADO EN GALPÓN"
          ayuda="Cantidad de equipos físicos que tenemos en el galpón listos para entregar a los clientes."
          destacado
        />
        <TarjetaResumen
          titulo="Alquilado en Obra"
          valor={fmtNum(kpis.obra)}
          subtitulo={`${alertasContratos.totalActivos} contrato(s) activos en calle`}
          icono={HardHat}
          porcentaje={kpis.pctOcupacionObra}
          etiquetaBarra="% ALQUILADO EN OBRAS"
          ayuda="Equipos que están actualmente en las obras de los clientes generando ingresos diarios."
        />
        <TarjetaResumen
          titulo="Préstamos con Aliados"
          valor={fmtNum(kpis.prestamos)}
          subtitulo={`${fmtNum(kpis.propiosPrestados)} nuestros prestados · ${fmtNum(kpis.externosPrestados)} de aliados aquí`}
          icono={Handshake}
          porcentaje={kpis.pctPrestamos}
          etiquetaBarra="MOVIMIENTO CON AMIGOS"
          ayuda="Equipos que le pedimos a empresas amigas o que nosotros les prestamos para ayudarnos mutuamente."
        />
        {permisos.puedeVerMontosVentas ? (
          <TarjetaResumen
            titulo="Ventas del Día"
            valor={fmtUSD(ventasHoy.total)}
            subtitulo={`${tasa ? fmtVES(ventasHoy.total * tasa) : '—'} · ${ventasHoy.cantidad} despacho(s) hoy`}
            icono={ShoppingCart}
            porcentaje={ventasHoy.cantidad > 0 ? 100 : 0}
            etiquetaBarra="DINERO FACTURADO HOY"
            ayuda="Suma total en dólares de todos los alquileres y fletes despachados hoy."
          />
        ) : (
          <TarjetaResumen
            titulo="Salidas del Día"
            valor={fmtNum(ventasHoy.cantidad)}
            subtitulo="Contratos despachados hoy"
            icono={ShoppingCart}
            porcentaje={ventasHoy.cantidad > 0 ? 100 : 0}
            etiquetaBarra="DESPACHOS DE HOY"
            ayuda="Número de entregas de equipos realizadas hoy desde el galpón."
          />
        )}
      </section>

      {/* Fila 2: Ocupación de Galpón por Categoría + Bitácora en Vivo */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Panel 1: Ocupación de Galpón por Tipo */}
        <section
          className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm lg:col-span-7"
          style={{ borderLeft: `4px solid ${NARANJA}` }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ background: NEGRO }}
          >
            <div className="flex items-center gap-2">
              <Layers size={16} color={NARANJA} />
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  Ocupación de Galpón por Tipo de Equipo
                </h2>
                <p className="text-[10px] text-neutral-400">
                  Comparación visual: ¿Cuánto está en Obra vs. Cuánto queda en Galpón?
                </p>
              </div>
            </div>
            <button
              onClick={() => onIrModulo('inventario')}
              className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:border-[#FF5500]"
              title="Ir a ver la lista detallada de equipos"
            >
              <span>Ver Inventario</span>
              <ArrowRight size={12} color={NARANJA} />
            </button>
          </div>

          <div className="divide-y divide-neutral-200 p-4">
            {matrizCategorias.map((cat) => (
              <div key={cat.categoria} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-wider text-neutral-900">
                      {cat.categoria}
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">
                      {cat.items} modelos · {fmtNum(cat.total)} piezas en total
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="font-bold" style={{ color: NARANJA }}>
                      EN OBRA: {fmtNum(cat.enObra)} ({cat.pctObra}%)
                    </span>
                    <span className="font-bold text-emerald-700">
                      EN GALPÓN: {fmtNum(cat.disponible)} ({cat.pctDisp}%)
                    </span>
                  </div>
                </div>

                {/* Barra segmentada: Naranja (En Obra) vs Esmeralda (En Galpón) */}
                <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-sm border border-neutral-300 bg-neutral-100">
                  <div
                    style={{ width: `${cat.pctObra}%`, background: NARANJA }}
                    title={`Alquilado en Obra: ${cat.pctObra}%`}
                  />
                  <div
                    style={{ width: `${cat.pctDisp}%`, background: '#10b981' }}
                    title={`Disponible en Galpón: ${cat.pctDisp}%`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Panel 2: Bitácora en Vivo (Entradas y Salidas Recientes) */}
        <section
          className="flex flex-col justify-between overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm lg:col-span-5"
          style={{ borderLeft: `4px solid ${NARANJA}` }}
        >
          <div>
            <div
              className="flex items-center justify-between px-4 py-3 text-white"
              style={{ background: NEGRO }}
            >
              <div className="flex items-center gap-2">
                <Activity size={16} color={NARANJA} />
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider">
                    Últimos Movimientos en Galpón
                  </h2>
                  <p className="text-[10px] text-neutral-400">
                    Registro en vivo de despachos, devoluciones y préstamos
                  </p>
                </div>
              </div>
              <button
                onClick={() => onIrModulo('reportes')}
                className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:border-[#FF5500]"
                title="Abrir el historial completo de entradas y salidas"
              >
                <span>Ver Todo el Historial</span>
                <ArrowRight size={12} color={NARANJA} />
              </button>
            </div>

            {ultimosMovimientos.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                No hay movimientos registrados hoy. Se anotarán solos cada vez que despaches o devuelvas equipos.
              </div>
            ) : (
              <div className="divide-y divide-neutral-200">
                {ultimosMovimientos.map((m, idx) => {
                  const badge = estiloBadgeMovimiento(m.tipo_movimiento)
                  return (
                    <div
                      key={m.id ?? idx}
                      className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs hover:bg-neutral-50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                            style={{ background: badge.lightBg, color: badge.lightFg }}
                          >
                            {m.tipo_movimiento || 'MOVIMIENTO'}
                          </span>
                          <span className="truncate font-bold text-neutral-900">
                            {m.material || m.codigo || 'Equipo'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {m.referencia_documento ? `Doc: ${m.referencia_documento} · ` : ''}
                          {m.cliente_nombre || m.observaciones || fmtFechaHora(m.created_at)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right font-mono">
                        <div className="text-xs font-bold text-neutral-900">
                          Cant: {fmtNum(m.cantidad)}
                        </div>
                        {m.stock_resultante !== undefined && m.stock_resultante !== null && (
                          <div className="text-[10px] text-neutral-500">
                            Quedan: {fmtNum(m.stock_resultante)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Fila 3: Control de Vencimientos */}
      <section
        className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
        style={{ borderLeft: `4px solid ${NARANJA}` }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-white"
          style={{ background: NEGRO }}
        >
          <div className="flex items-center gap-2">
            <BellRing size={15} color={NARANJA} />
            <h2 className="text-xs font-bold uppercase tracking-wider">
              Contratos Vencidos y por Vencer (Próximos 3 días)
            </h2>
          </div>
          <button
            onClick={() => onIrModulo('alquileres')}
            className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-white hover:border-[#FF5500]"
          >
            <span>Ir a Alquileres</span>
            <ArrowRight size={12} color={NARANJA} />
          </button>
        </div>

        <div className="p-3">
          {alertasContratos.vencidos.length === 0 && alertasContratos.porVencer.length === 0 ? (
            <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 size={15} />
              <span>
                ¡Todo al día! No hay contratos vencidos ni que venzan en los próximos 3 días.
              </span>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...alertasContratos.vencidos, ...alertasContratos.porVencer].map((c) => {
                const cli = mapaClientes.get(String(c.cliente_id))
                const vencido = c.diasRestantes < 0
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs"
                    style={{
                      borderLeft: `4px solid ${vencido ? '#dc2626' : '#d97706'}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle
                          size={13}
                          color={vencido ? '#dc2626' : '#d97706'}
                          className="shrink-0"
                        />
                        <span className="truncate font-bold text-neutral-900">
                          {cli?.nombre_razon_social ||
                            c.cliente_nombre ||
                            `Cliente #${c.cliente_id ?? '—'}`}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-neutral-600">
                        Vence: {fmtFecha(c.fecha_vencimiento)} (
                        {vencido
                          ? `Venció hace ${Math.abs(c.diasRestantes)} día(s)`
                          : c.diasRestantes === 0
                            ? 'VENCE HOY'
                            : `Vence en ${c.diasRestantes} día(s)`}
                        )
                      </p>
                    </div>
                    {permisos.puedeVerMontosVentas && (
                      <div className="shrink-0 text-right font-mono">
                        <div className="font-bold text-neutral-900">
                          {fmtUSD(c.total_contrato_usd)}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          +{num(c.prorrogas_aplicadas)}d prórroga
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
