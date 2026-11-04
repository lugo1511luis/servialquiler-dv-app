import { useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Loader2,
  TriangleAlert,
  Phone,
  MapPin,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  fmtUSD,
  fmtVES,
  limpiarInputDecimal,
  NARANJA,
  NEGRO,
  num,
} from '../utils/formatters'
import GuiaRapida from '../components/GuiaRapida'

const FORM_INICIAL = {
  rif_cedula: '',
  nombre_razon_social: '',
  telefono: '',
  direccion_obra: '',
  saldo_pendiente_usd: '',
}

export default function ClientesModule({
  clientes,
  tasa,
  permisos,
  onRecargar,
}) {
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState(null)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter((c) =>
      [c.rif_cedula, c.nombre_razon_social, c.telefono, c.direccion_obra].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [clientes, busqueda])

  const abrirNuevo = () => {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
    setModalAbierto(true)
  }

  const abrirEditar = (cli) => {
    setEditandoId(cli.id)
    setForm({
      rif_cedula: cli.rif_cedula ?? '',
      nombre_razon_social: cli.nombre_razon_social ?? '',
      telefono: cli.telefono ?? '',
      direccion_obra: cli.direccion_obra ?? '',
      saldo_pendiente_usd:
        cli.saldo_pendiente_usd !== null &&
        cli.saldo_pendiente_usd !== undefined &&
        num(cli.saldo_pendiente_usd) > 0
          ? String(cli.saldo_pendiente_usd)
          : '',
    })
    setErrorModal(null)
    setModalAbierto(true)
  }

  const guardarCliente = async (e) => {
    e.preventDefault()
    if (!form.rif_cedula.trim() || !form.nombre_razon_social.trim()) {
      setErrorModal('El RIF o Cédula y el Nombre o Razón Social son obligatorios.')
      return
    }
    setGuardando(true)
    setErrorModal(null)

    const payload = {
      rif_cedula: form.rif_cedula.trim(),
      nombre_razon_social: form.nombre_razon_social.trim(),
      telefono: form.telefono.trim(),
      direccion_obra: form.direccion_obra.trim(),
      saldo_pendiente_usd: num(form.saldo_pendiente_usd),
    }

    const res = editandoId
      ? await supabase.from('clientes').update(payload).eq('id', editandoId)
      : await supabase.from('clientes').insert([payload])

    setGuardando(false)
    if (res.error) {
      setErrorModal(res.error.message)
      return
    }
    setModalAbierto(false)
    onRecargar()
  }

  const eliminarCliente = async (cli) => {
    const ok = window.confirm(
      `¿Eliminar de la lista al cliente "${cli.nombre_razon_social}" (${cli.rif_cedula})?`,
    )
    if (!ok) return
    const { error } = await supabase.from('clientes').delete().eq('id', cli.id)
    if (error) {
      window.alert(`Error al eliminar cliente: ${error.message}`)
      return
    }
    onRecargar()
  }

  const tipsClientes = [
    'Anota aquí los datos de tus clientes frecuentes: su RIF o cédula, teléfono para llamarlos y la dirección de la obra donde usan los equipos.',
    'Al tenerlos guardados aquí, cuando vayas a despachar en Alquileres solo tienes que seleccionarlo en la lista.',
    'El saldo pendiente te avisa si el cliente tiene alguna cuenta sin pagar.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  return (
    <div className="space-y-4">
      {/* Guía Rápida */}
      <GuiaRapida moduloNombre="Cartera de Clientes" tips={tipsClientes} />

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
              Cartera de Clientes y Obras Registradas
            </h2>
            <p className="text-[11px] text-neutral-400">
              {filtrados.length} de {clientes.length} cliente(s) guardados
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1.5">
              <Search size={14} color={NARANJA} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por RIF, nombre u obra..."
                className="w-52 bg-transparent text-xs text-white outline-none"
              />
            </div>

            <button
              onClick={abrirNuevo}
              className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-bold text-white shadow"
              style={{ background: NARANJA }}
              title="Registrar un nuevo cliente en el sistema"
            >
              <Plus size={15} />
              <span>+ Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-xs text-neutral-500">
            No hay clientes registrados en el directorio. Pulsa &quot;+ Nuevo Cliente&quot; para agregar el primero.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ color: NEGRO }}>
              <thead style={{ background: '#1c1c1c' }}>
                <tr>
                  <th className={th}>RIF / Cédula</th>
                  <th className={th}>Nombre / Razón Social</th>
                  <th className={th}>Teléfono</th>
                  <th className={th}>Dirección de la Obra</th>
                  <th className={`${th} text-right`}>Saldo por Pagar</th>
                  <th className={`${th} text-center`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtrados.map((c) => {
                  const saldo = num(c.saldo_pendiente_usd)
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-orange-50/50">
                      <td className={`${td} font-mono font-bold text-neutral-700`}>
                        {c.rif_cedula}
                      </td>
                      <td className={`${td} font-bold text-neutral-900`}>
                        {c.nombre_razon_social}
                      </td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-neutral-700">
                          <Phone size={12} color={NARANJA} />
                          {c.telefono || '—'}
                        </span>
                      </td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
                          <MapPin size={12} color="#888" />
                          {c.direccion_obra || '—'}
                        </span>
                      </td>
                      <td className={`${td} text-right font-mono leading-tight`}>
                        <div
                          className="font-bold"
                          style={{ color: saldo > 0 ? '#dc2626' : '#047857' }}
                          title={
                            saldo > 0
                              ? 'Tiene pagos pendientes con la empresa'
                              : 'Al día, no debe nada'
                          }
                        >
                          {fmtUSD(saldo)}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {tasa ? fmtVES(saldo * tasa) : '—'}
                        </div>
                      </td>
                      <td className={`${td} text-center`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => abrirEditar(c)}
                            className="rounded border border-neutral-300 bg-neutral-100 p-1.5 text-neutral-800 hover:border-[#FF5500]"
                            title="Editar datos del cliente, teléfono o saldo pendiente"
                          >
                            <Pencil size={13} />
                          </button>
                          {permisos.esAdmin && (
                            <button
                              onClick={() => eliminarCliente(c)}
                              className="rounded border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                              title="Eliminar cliente (Solo Administrador)"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Crear / Editar Cliente */}
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {editandoId ? 'Editar Datos del Cliente' : 'Registrar Nuevo Cliente'}
                </h3>
                <button onClick={() => setModalAbierto(false)} className="text-neutral-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={guardarCliente} className="space-y-3.5 p-5 text-xs">
                {errorModal && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
                    <TriangleAlert size={15} />
                    <span>{errorModal}</span>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      RIF o Cédula *
                    </label>
                    <input
                      required
                      value={form.rif_cedula}
                      onChange={(e) => setForm({ ...form, rif_cedula: e.target.value })}
                      placeholder="J-12345678-9 / V-12345678"
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono outline-none focus:border-[#FF5500]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Teléfono de Contacto
                    </label>
                    <input
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      placeholder="0414-0000000"
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono outline-none focus:border-[#FF5500]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Nombre Completo o Razón Social *
                  </label>
                  <input
                    required
                    value={form.nombre_razon_social}
                    onChange={(e) => setForm({ ...form, nombre_razon_social: e.target.value })}
                    placeholder="Constructora / Ingeniero / Cliente"
                    className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Dirección de la Obra
                  </label>
                  <input
                    value={form.direccion_obra}
                    onChange={(e) => setForm({ ...form, direccion_obra: e.target.value })}
                    placeholder="Lugar exacto donde se entregarán los equipos"
                    className="w-full rounded border border-neutral-300 px-3 py-2 outline-none focus:border-[#FF5500]"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Saldo Pendiente por Pagar (USD)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.saldo_pendiente_usd}
                    onChange={(e) =>
                      setForm({ ...form, saldo_pendiente_usd: limpiarInputDecimal(e.target.value) })
                    }
                    placeholder="0.00"
                    className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
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
                    disabled={guardando}
                    className="flex items-center gap-1.5 rounded px-5 py-2 text-xs font-bold text-white"
                    style={{ background: NARANJA }}
                  >
                    {guardando && <Loader2 size={14} className="animate-spin" />}
                    <span>{editandoId ? 'Guardar Cambios' : 'Guardar Cliente'}</span>
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
