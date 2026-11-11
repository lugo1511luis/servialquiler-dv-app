import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
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
  FileSpreadsheet,
  Upload,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  construirMensajeWhatsAppCliente,
  fmtUSD,
  fmtVES,
  formatearTelefonoWhatsApp,
  limpiarInputDecimal,
  NARANJA,
  NEGRO,
  num,
  WhatsAppIcon,
} from '../utils/formatters'
import { descargarPlantillaClientesExcel } from '../utils/exportadores'
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

  // Estados de Importación Masiva Excel
  const [importando, setImportando] = useState(false)
  const [mensajeImportacion, setMensajeImportacion] = useState(null)
  const inputArchivoRef = useRef(null)

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

  const enviarWhatsAppCliente = (c) => {
    let tel = c?.telefono || ''
    let telFormateado = formatearTelefonoWhatsApp(tel)

    if (!telFormateado) {
      const pedido = window.prompt(
        `El cliente "${c.nombre_razon_social}" no tiene un teléfono guardado. Ingresa el número de WhatsApp (ej. 04141234567):`,
      )
      if (!pedido) return
      telFormateado = formatearTelefonoWhatsApp(pedido)
      if (!telFormateado) {
        window.alert('Número de teléfono inválido.')
        return
      }
    }

    const textoCodificado = construirMensajeWhatsAppCliente({
      cliente: c,
      tasa,
    })

    const url = `https://wa.me/${telFormateado}?text=${textoCodificado}`
    window.open(url, '_blank')
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

  // ---- Importación Masiva desde Excel -------------------------------------
  const manejarImportacionExcel = async (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return

    setImportando(true)
    setMensajeImportacion(null)

    try {
      const buffer = await archivo.arrayBuffer()
      const libro = XLSX.read(buffer, { type: 'array' })
      const nombreHoja = libro.SheetNames[0]
      const hoja = libro.Sheets[nombreHoja]
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })

      if (!Array.isArray(filas) || filas.length === 0) {
        setImportando(false)
        setMensajeImportacion({
          tipo: 'error',
          texto: 'El archivo Excel seleccionado está vacío o no contiene filas de datos.',
        })
        if (inputArchivoRef.current) inputArchivoRef.current.value = ''
        return
      }

      // Normalizar y validar registros
      const registrosValidos = []
      const omitidos = []

      filas.forEach((f, idx) => {
        const rif = String(
          f.rif_cedula ?? f.RIF_CEDULA ?? f.rif ?? f.RIF ?? f['RIF / Cédula'] ?? f['RIF / Cedula'] ?? '',
        ).trim()
        const nombre = String(
          f.nombre_razon_social ??
            f.NOMBRE_RAZON_SOCIAL ??
            f.nombre ??
            f.NOMBRE ??
            f['Nombre / Razón Social'] ??
            f['Nombre / Razon Social'] ??
            f.cliente ??
            '',
        ).trim()
        const tel = String(f.telefono ?? f.TELEFONO ?? f['Teléfono'] ?? f.Telefono ?? '').trim()
        const dir = String(
          f.direccion_obra ??
            f.DIRECCION_OBRA ??
            f.direccion ??
            f['Dirección de Obra'] ??
            f['Dirección'] ??
            '',
        ).trim()
        const cor = String(f.correo ?? f.CORREO ?? f.email ?? f.EMAIL ?? '').trim()
        const saldoRaw = f.saldo_pendiente_usd ?? f.saldo ?? f.SALDO ?? 0
        const saldo = num(saldoRaw)

        if (!rif || !nombre) {
          omitidos.push(`Fila #${idx + 2}`)
          return
        }

        registrosValidos.push({
          rif_cedula: rif,
          nombre_razon_social: nombre,
          telefono: tel,
          direccion_obra: dir,
          correo: cor,
          saldo_pendiente_usd: isNaN(saldo) ? 0 : Math.max(0, saldo),
        })
      })

      if (registrosValidos.length === 0) {
        setImportando(false)
        setMensajeImportacion({
          tipo: 'error',
          texto: 'No se encontraron clientes válidos. Verifica que el archivo contenga las columnas "nombre_razon_social" y "rif_cedula".',
        })
        if (inputArchivoRef.current) inputArchivoRef.current.value = ''
        return
      }

      // Obtener clientes actuales para comparar por RIF
      const { data: clientesActuales, error: errFetch } = await supabase
        .from('clientes')
        .select('id, rif_cedula')

      const mapaExistentes = new Map()
      if (!errFetch && Array.isArray(clientesActuales)) {
        clientesActuales.forEach((c) => {
          if (c.rif_cedula) {
            mapaExistentes.set(c.rif_cedula.trim().toUpperCase(), c.id)
          }
        })
      }

      let creados = 0
      let actualizados = 0

      for (const reg of registrosValidos) {
        const key = reg.rif_cedula.toUpperCase()
        const idExistente = mapaExistentes.get(key)

        const datosConCorreo = {
          rif_cedula: reg.rif_cedula,
          nombre_razon_social: reg.nombre_razon_social,
          telefono: reg.telefono,
          direccion_obra: reg.direccion_obra,
          correo: reg.correo,
          saldo_pendiente_usd: reg.saldo_pendiente_usd,
        }
        const datosSinCorreo = {
          rif_cedula: reg.rif_cedula,
          nombre_razon_social: reg.nombre_razon_social,
          telefono: reg.telefono,
          direccion_obra: reg.direccion_obra,
          saldo_pendiente_usd: reg.saldo_pendiente_usd,
        }

        if (idExistente) {
          let res = await supabase.from('clientes').update(datosConCorreo).eq('id', idExistente)
          if (res.error && res.error.message?.toLowerCase().includes('correo')) {
            res = await supabase.from('clientes').update(datosSinCorreo).eq('id', idExistente)
          }
          if (!res.error) actualizados++
        } else {
          let res = await supabase.from('clientes').insert([datosConCorreo])
          if (res.error && res.error.message?.toLowerCase().includes('correo')) {
            res = await supabase.from('clientes').insert([datosSinCorreo])
          }
          if (!res.error) {
            creados++
            mapaExistentes.set(key, true)
          }
        }
      }

      setImportando(false)
      if (inputArchivoRef.current) inputArchivoRef.current.value = ''
      setMensajeImportacion({
        tipo: 'ok',
        texto: `Importación completada: ${creados} nuevo(s) cliente(s) registrado(s) y ${actualizados} actualizado(s).${
          omitidos.length > 0 ? ` (${omitidos.length} fila(s) omitida(s) por faltar RIF o Nombre)` : ''
        }`,
      })
      onRecargar()
    } catch (err) {
      setImportando(false)
      if (inputArchivoRef.current) inputArchivoRef.current.value = ''
      setMensajeImportacion({
        tipo: 'error',
        texto: `Error al procesar el archivo Excel: ${err.message}`,
      })
    }
  }

  const tipsClientes = [
    'Anota aquí los datos de tus clientes frecuentes: su RIF o cédula, teléfono para llamarlos y la dirección de la obra donde usan los equipos.',
    'Puedes descargar la "Plantilla Excel", llenarla con los datos de tus clientes e importarlos masivamente con un solo clic.',
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

      {/* Banner de resultado de importación */}
      {mensajeImportacion && (
        <div
          className={`flex items-center justify-between gap-3 rounded-md border p-3 text-xs font-bold shadow-sm ${
            mensajeImportacion.tipo === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-red-300 bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {mensajeImportacion.tipo === 'ok' ? (
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            ) : (
              <TriangleAlert size={16} className="shrink-0 text-red-600" />
            )}
            <span>{mensajeImportacion.texto}</span>
          </div>
          <button
            onClick={() => setMensajeImportacion(null)}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200/60"
            title="Cerrar notificación"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
                className="w-48 bg-transparent text-xs text-white outline-none placeholder:text-neutral-500"
              />
            </div>

            {/* Descargar Plantilla Excel */}
            <button
              type="button"
              onClick={descargarPlantillaClientesExcel}
              className="flex items-center gap-1.5 rounded border border-neutral-600 bg-[#222222] px-2.5 py-1.5 text-xs font-bold text-neutral-200 hover:border-neutral-400 hover:bg-[#2c2c2c]"
              title="Descargar plantilla de Excel modelo para importar clientes"
            >
              <FileSpreadsheet size={14} color="#34D399" />
              <span>Plantilla Excel</span>
            </button>

            {/* Input oculto e Importar Excel */}
            <input
              ref={inputArchivoRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={manejarImportacionExcel}
              className="hidden"
            />
            <button
              type="button"
              disabled={importando}
              onClick={() => inputArchivoRef.current?.click()}
              className="flex items-center gap-1.5 rounded border border-amber-600/70 bg-amber-950/60 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50"
              title="Subir archivo Excel para cargar clientes masivamente"
            >
              {importando ? (
                <Loader2 size={14} className="animate-spin text-amber-400" />
              ) : (
                <Upload size={14} className="text-amber-400" />
              )}
              <span>{importando ? 'Importando...' : 'Importar Excel'}</span>
            </button>

            <button
              onClick={abrirNuevo}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold text-white shadow hover:brightness-110"
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
                            type="button"
                            onClick={() => enviarWhatsAppCliente(c)}
                            className="flex items-center gap-1 rounded border border-emerald-500 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                            title="Enviar estado de cuenta por WhatsApp con 1 clic"
                          >
                            <WhatsAppIcon size={12} className="text-emerald-600" />
                            <span>WhatsApp</span>
                          </button>
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
