import { useMemo, useState } from 'react'
import {
  Plus,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  X,
  Loader2,
  TriangleAlert,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  fmtFecha,
  fmtNum,
  hoyISO,
  limpiarInputEntero,
  NARANJA,
  NEGRO,
  num,
} from '../utils/formatters'
import { registrarMovimientoKardex } from '../utils/kardex'
import GuiaRapida from '../components/GuiaRapida'

const insertarPrestamoSeguro = async (payloadInicial) => {
  let payload = { ...payloadInicial }
  for (let intento = 0; intento < 6; intento++) {
    const res = await supabase
      .from('prestamos_interempresas')
      .insert([payload])
      .select('*')
      .maybeSingle()
    if (!res.error) return res
    const msg = res.error.message || ''
    const match =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "prestamos_interempresas" does not exist/i)
    if (match && match[1] && match[1] in payload) {
      const { [match[1]]: _omit, ...resto } = payload
      payload = resto
      continue
    }
    return res
  }
  return await supabase.from('prestamos_interempresas').insert([payload]).select('*').maybeSingle()
}

const actualizarPrestamoSeguro = async (id, cambiosIniciales) => {
  let cambios = { ...cambiosIniciales }
  for (let intento = 0; intento < 4; intento++) {
    const res = await supabase.from('prestamos_interempresas').update(cambios).eq('id', id)
    if (!res.error) return res
    const msg = res.error.message || ''
    const match =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "prestamos_interempresas" does not exist/i)
    if (match && match[1] && match[1] in cambios) {
      const { [match[1]]: _omit, ...resto } = cambios
      cambios = resto
      continue
    }
    return res
  }
  return await supabase.from('prestamos_interempresas').update(cambios).eq('id', id)
}

export default function PrestamosModule({
  prestamos,
  inventario,
  onRecargarTodo,
}) {
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  const [tipo, setTipo] = useState('RECIBIDO')
  const [empresaAliada, setEmpresaAliada] = useState('')
  const [inventarioId, setInventarioId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const mapaInventario = useMemo(() => {
    const m = new Map()
    inventario.forEach((i) => m.set(String(i.id), i))
    return m
  }, [inventario])

  const registrarPrestamo = async (e) => {
    e.preventDefault()
    const eq = mapaInventario.get(String(inventarioId))
    const cant = num(cantidad)
    const tipoOperacion = tipo === 'PRESTADO' ? 'PRESTADO' : 'RECIBIDO'
    if (!empresaAliada.trim()) {
      setErrorMsg('Indica el nombre de la empresa aliada.')
      return
    }
    if (!eq || cant <= 0) {
      setErrorMsg('Selecciona un equipo válido y una cantidad mayor a cero.')
      return
    }

    if (tipoOperacion === 'PRESTADO' && cant > num(eq.stock_propio_disponible)) {
      setErrorMsg(
        `No tenemos suficiente material propio disponible en galpón (${eq.stock_propio_disponible}) para prestar.`,
      )
      return
    }

    setProcesando(true)
    setErrorMsg(null)

    const payload = {
      empresa_aliada: empresaAliada.trim(),
      tipo_operacion: tipoOperacion,
      tipo_movimiento: tipoOperacion,
      tipo: tipoOperacion,
      inventario_id: eq.id,
      material: eq.material,
      codigo: eq.codigo,
      cantidad: cant,
      fecha_prestamo: hoyISO(),
      estado: 'Activo',
      observaciones: observaciones.trim(),
    }

    const { data: creado, error } = await insertarPrestamoSeguro(payload)
    if (error) {
      setProcesando(false)
      setErrorMsg(`Error al registrar préstamo: ${error.message}`)
      return
    }

    const refDoc = creado?.id ? `PREST-${String(creado.id).slice(0, 6)}` : `PREST-${hoyISO()}`

    if (tipoOperacion === 'RECIBIDO') {
      const nuevoExterno = num(eq.stock_externo_prestado) + cant
      await supabase
        .from('inventario')
        .update({ stock_externo_prestado: nuevoExterno })
        .eq('id', eq.id)

      await registrarMovimientoKardex({
        inventario_id: eq.id,
        codigo: eq.codigo,
        material: eq.material,
        tipo_movimiento: 'PRÉSTAMO RECIBIDO (De Aliado)',
        cantidad: cant,
        stock_resultante: num(eq.stock_propio_disponible) + nuevoExterno,
        referencia_documento: refDoc,
        cliente_nombre: empresaAliada.trim(),
      })
    } else {
      const nuevoDisp = Math.max(0, num(eq.stock_propio_disponible) - cant)
      const nuevoPrest = num(eq.stock_propio_prestado) + cant
      await supabase
        .from('inventario')
        .update({
          stock_propio_disponible: nuevoDisp,
          stock_propio_prestado: nuevoPrest,
        })
        .eq('id', eq.id)

      await registrarMovimientoKardex({
        inventario_id: eq.id,
        codigo: eq.codigo,
        material: eq.material,
        tipo_movimiento: 'PRÉSTAMO ENVIADO (A Aliado)',
        cantidad: cant,
        stock_resultante: nuevoDisp,
        referencia_documento: refDoc,
        cliente_nombre: empresaAliada.trim(),
      })
    }

    setProcesando(false)
    setModalAbierto(false)
    setEmpresaAliada('')
    setInventarioId('')
    setCantidad('')
    setObservaciones('')
    onRecargarTodo()
  }

  const marcarDevuelto = async (p) => {
    const ok = window.confirm(
      '¿Confirmar que este material ya fue devuelto a su dueño y actualizar el galpón?',
    )
    if (!ok) return

    setProcesando(true)
    const eq =
      mapaInventario.get(String(p.inventario_id ?? p.equipo_id)) ||
      inventario.find((i) => i.codigo === p.codigo || i.material === p.material)

    const cant = num(p.cantidad)
    const t = String(p.tipo_operacion || p.tipo_movimiento || p.tipo || 'RECIBIDO').toUpperCase()
    const esRecibido = t.includes('RECIB') || t.includes('EXTER') || t.includes('PEDID')
    const refDoc = p.id ? `DEV-PREST-${String(p.id).slice(0, 6)}` : `DEV-PREST-${hoyISO()}`
    const aliado = p.empresa_aliada || p.empresa || 'Empresa Aliada'

    if (eq && cant > 0) {
      if (esRecibido) {
        const nuevoExterno = Math.max(0, num(eq.stock_externo_prestado) - cant)
        await supabase
          .from('inventario')
          .update({ stock_externo_prestado: nuevoExterno })
          .eq('id', eq.id)

        await registrarMovimientoKardex({
          inventario_id: eq.id,
          codigo: eq.codigo,
          material: eq.material,
          tipo_movimiento: 'DEVOLUCIÓN DE PRÉSTAMO (Regresado a Aliado)',
          cantidad: cant,
          stock_resultante: num(eq.stock_propio_disponible) + nuevoExterno,
          referencia_documento: refDoc,
          cliente_nombre: aliado,
        })
      } else {
        const nuevoDisp = num(eq.stock_propio_disponible) + cant
        const nuevoPrest = Math.max(0, num(eq.stock_propio_prestado) - cant)
        await supabase
          .from('inventario')
          .update({
            stock_propio_prestado: nuevoPrest,
            stock_propio_disponible: nuevoDisp,
          })
          .eq('id', eq.id)

        await registrarMovimientoKardex({
          inventario_id: eq.id,
          codigo: eq.codigo,
          material: eq.material,
          tipo_movimiento: 'RETORNO DE PRÉSTAMO (Regresó a Nuestro Galpón)',
          cantidad: cant,
          stock_resultante: nuevoDisp,
          referencia_documento: refDoc,
          cliente_nombre: aliado,
        })
      }
    }

    await actualizarPrestamoSeguro(p.id, {
      estado: 'Devuelto',
      devuelto: true,
      fecha_devolucion: hoyISO(),
    })

    setProcesando(false)
    onRecargarTodo()
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return prestamos
    return prestamos.filter((p) => {
      const eq = mapaInventario.get(String(p.inventario_id ?? p.equipo_id))
      return [
        p.empresa_aliada,
        p.empresa,
        p.material,
        eq?.material,
        eq?.codigo,
        p.tipo_movimiento,
        p.tipo,
        p.estado,
      ].some((v) => String(v ?? '').toLowerCase().includes(q))
    })
  }, [prestamos, busqueda, mapaInventario])

  const tipsPrestamos = [
    'Pedir prestado a otra empresa: Úsalo cuando un cliente te pide más andamios o puntales de los que tenemos en el galpón y un aliado te los facilita para no perder la venta.',
    'Prestar material nuestro a una empresa amiga: Cuando un aliado necesita equipos nuestros y se los facilitamos temporalmente. Se descuentan de lo disponible en galpón.',
    'Marcar como Devuelto: Cuando los equipos regresen a su dueño original, pulsa este botón verde para que el galpón vuelva a su balance real.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  return (
    <div className="space-y-4">
      {/* Guía Rápida */}
      <GuiaRapida moduloNombre="Préstamos con Aliados" tips={tipsPrestamos} />

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
              Préstamos de Equipos con Empresas Aliadas
            </h2>
            <p className="text-[11px] text-neutral-400">
              Control de equipos que pedimos prestados o que prestamos a empresas amigas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1.5">
              <Search size={14} color={NARANJA} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por empresa o equipo..."
                className="w-48 bg-transparent text-xs text-white outline-none"
              />
            </div>

            <button
              onClick={() => {
                setErrorMsg(null)
                setTipo('RECIBIDO')
                setModalAbierto(true)
              }}
              className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-bold text-white shadow"
              style={{ background: NARANJA }}
              title="Anotar un préstamo con otra empresa constructora o de alquiler"
            >
              <Plus size={15} />
              <span>+ Anotar Préstamo</span>
            </button>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-xs text-neutral-500">
            No hay préstamos con empresas aliadas registrados actualmente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ color: NEGRO }}>
              <thead style={{ background: '#1c1c1c' }}>
                <tr>
                  <th className={th}>¿Qué tipo de préstamo es?</th>
                  <th className={th}>Empresa Aliada</th>
                  <th className={th}>Equipo / Material</th>
                  <th className={`${th} text-right`}>Cantidad</th>
                  <th className={th}>Fecha</th>
                  <th className={`${th} text-center`}>Estado</th>
                  <th className={`${th} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtrados.map((p) => {
                  const eq = mapaInventario.get(String(p.inventario_id ?? p.equipo_id))
                  const t = String(p.tipo_operacion || p.tipo_movimiento || p.tipo || 'RECIBIDO').toUpperCase()
                  const esRecibido =
                    t.includes('RECIB') || t.includes('EXTER') || t.includes('PEDID')
                  const devuelto =
                    p.devuelto === true ||
                    String(p.estado ?? '').toLowerCase().includes('devuelt')

                  return (
                    <tr key={p.id} className="transition-colors hover:bg-orange-50/50">
                      <td className={td}>
                        <span
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-bold uppercase"
                          style={
                            esRecibido
                              ? {
                                  background: 'rgba(2,132,199,0.12)',
                                  color: '#0369a1',
                                  borderColor: '#7dd3fc',
                                }
                              : {
                                  background: 'rgba(255,85,0,0.12)',
                                  color: '#c2410c',
                                  borderColor: '#fdba74',
                                }
                          }
                          title={
                            esRecibido
                              ? 'Nosotros le pedimos este material a la empresa amiga para completar un contrato'
                              : 'Nosotros le prestamos este material a la empresa amiga'
                          }
                        >
                          {esRecibido ? (
                            <ArrowDownLeft size={12} />
                          ) : (
                            <ArrowUpRight size={12} />
                          )}
                          {esRecibido ? 'NOS PRESTARON (Entró a Galpón)' : 'PRESTAMOS (Salió a Aliado)'}
                        </span>
                      </td>
                      <td className={`${td} font-bold text-neutral-900`}>
                        {p.empresa_aliada || p.empresa || 'Empresa Aliada'}
                      </td>
                      <td className={td}>
                        <div className="font-bold">{eq?.material || p.material || '—'}</div>
                        <div className="font-mono text-[11px] text-neutral-500">
                          {eq?.codigo || p.codigo || ''}
                        </div>
                      </td>
                      <td className={`${td} text-right font-mono font-bold`}>
                        {fmtNum(p.cantidad)}
                      </td>
                      <td className={`${td} font-mono`}>
                        {fmtFecha(p.fecha_prestamo || p.created_at)}
                      </td>
                      <td className={`${td} text-center`}>
                        <span
                          className="rounded border px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={
                            devuelto
                              ? {
                                  background: '#f3f4f6',
                                  color: '#374151',
                                  borderColor: '#d1d5db',
                                }
                              : {
                                  background: 'rgba(16,185,129,0.12)',
                                  color: '#047857',
                                  borderColor: '#6ee7b7',
                                }
                          }
                        >
                          {devuelto ? 'Devuelto' : 'Prestado Activo'}
                        </span>
                      </td>
                      <td className={`${td} text-center`}>
                        {!devuelto ? (
                          <button
                            onClick={() => marcarDevuelto(p)}
                            disabled={procesando}
                            className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                            title="Registra que el material ya regresó a su dueño original y ajusta el conteo de galpón"
                          >
                            <CheckCircle2 size={13} />
                            <span>Marcar como Devuelto</span>
                          </button>
                        ) : (
                          <span className="font-mono text-[11px] text-neutral-400">Devolución Lista</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Nuevo Préstamo */}
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Anotar Préstamo con Empresa Aliada
                </h3>
                <button onClick={() => setModalAbierto(false)} className="text-neutral-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={registrarPrestamo} className="space-y-4 p-5 text-xs">
                {errorMsg && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
                    <TriangleAlert size={15} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block font-bold uppercase text-neutral-700">
                    ¿Qué movimiento vas a hacer? *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTipo('RECIBIDO')}
                      className="rounded border p-2.5 text-left text-xs font-bold transition-all"
                      style={{
                        background: tipo === 'RECIBIDO' ? NEGRO : '#f9fafb',
                        color: tipo === 'RECIBIDO' ? '#fff' : '#374151',
                        borderColor: tipo === 'RECIBIDO' ? NARANJA : '#d1d5db',
                      }}
                    >
                      <div className="text-[11px] text-amber-400 uppercase">1. Pedir Prestado a Aliado</div>
                      <div className="mt-0.5 text-[10px] font-normal text-neutral-300">
                        Cuando nos falta material en galpón y un aliado nos lo envía para completar una factura.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipo('PRESTADO')}
                      className="rounded border p-2.5 text-left text-xs font-bold transition-all"
                      style={{
                        background: tipo === 'PRESTADO' ? NEGRO : '#f9fafb',
                        color: tipo === 'PRESTADO' ? '#fff' : '#374151',
                        borderColor: tipo === 'PRESTADO' ? NARANJA : '#d1d5db',
                      }}
                    >
                      <div className="text-[11px] text-amber-400 uppercase">2. Prestar Material Nuestro</div>
                      <div className="mt-0.5 text-[10px] font-normal text-neutral-300">
                        Una empresa amiga necesita material y se lo facilitamos desde nuestro galpón.
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Nombre de la Empresa Aliada *
                  </label>
                  <input
                    required
                    value={empresaAliada}
                    onChange={(e) => setEmpresaAliada(e.target.value)}
                    placeholder="Ej. Andamios del Centro, C.A."
                    className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Equipo o Material *
                    </label>
                    <select
                      required
                      value={inventarioId}
                      onChange={(e) => setInventarioId(e.target.value)}
                      className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                    >
                      <option value="">— Seleccionar equipo —</option>
                      {inventario.map((i) => (
                        <option key={i.id} value={i.id}>
                          [{i.codigo}] {i.material} (En Galpón: {i.stock_propio_disponible})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Cantidad de Piezas *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      placeholder="Ej. 10"
                      value={cantidad}
                      onChange={(e) => setCantidad(limpiarInputEntero(e.target.value))}
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Notas adicionales (Obra, chofer que retiró o número de factura)
                  </label>
                  <input
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Opcional: quién transportó el material o para qué obra va"
                    className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setModalAbierto(false)}
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
                    <span>Guardar Préstamo</span>
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
