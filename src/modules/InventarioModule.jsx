import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Plus,
  Pencil,
  Trash2,
  FileDown,
  FileSpreadsheet,
  FileText,
  Search,
  RefreshCw,
  X,
  Loader2,
  TriangleAlert,
  Upload,
  Download,
  Sparkles,
  Tags,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  fmtNum,
  fmtUSD,
  fmtVES,
  generarCodigoEquipo,
  limpiarInputDecimal,
  limpiarInputEntero,
  NARANJA,
  NEGRO,
  num,
  obtenerCategoriasInventario,
} from '../utils/formatters'
import {
  descargarPlantillaInventarioExcel,
  exportarInventarioCSV,
  exportarInventarioExcel,
  exportarInventarioPDF,
} from '../utils/exportadores'
import { registrarMovimientoKardex } from '../utils/kardex'
import GuiaRapida from '../components/GuiaRapida'

const FORM_INICIAL = {
  codigo: '',
  material: '',
  categoria: 'Andamios',
  stock_propio_total: '',
  stock_propio_disponible: '',
  stock_propio_alquilado: '',
  stock_propio_prestado: '',
  stock_externo_prestado: '',
  precio_alquiler_dia_usd: '',
}

export default function InventarioModule({
  inventario,
  tasa,
  permisos,
  config,
  onGuardarCategorias,
  cargando,
  onRecargar,
}) {
  const [busqueda, setBusqueda] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [errorModal, setErrorModal] = useState(null)
  const [mensajeImportacion, setMensajeImportacion] = useState(null)
  const inputArchivoRef = useRef(null)

  // Gestor dinámico de categorías
  const [modalCategoriasAbierto, setModalCategoriasAbierto] = useState(false)
  const [nuevaCatTexto, setNuevaCatTexto] = useState('')
  const [guardandoCat, setGuardandoCat] = useState(false)
  const [errorCat, setErrorCat] = useState(null)

  const categorias = useMemo(
    () => obtenerCategoriasInventario(config, inventario),
    [config, inventario],
  )

  const filtrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return inventario
    return inventario.filter((f) =>
      [f.codigo, f.material, f.categoria].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [inventario, busqueda])

  // Código autogenerado en tiempo real cuando se está creando un equipo nuevo
  const codigoAutomatico = useMemo(() => {
    if (editandoId) return form.codigo
    return generarCodigoEquipo(form.categoria, form.material, inventario)
  }, [editandoId, form.categoria, form.material, form.codigo, inventario])

  const abrirNuevo = () => {
    setEditandoId(null)
    setForm(FORM_INICIAL)
    setErrorModal(null)
    setModalAbierto(true)
  }

  // ---- Funciones del Gestor Dinámico de Categorías -------------------------
  const agregarCategoria = async (e) => {
    if (e) e.preventDefault()
    const limpia = nuevaCatTexto.trim()
    if (!limpia) return

    const existe = categorias.some((c) => c.toLowerCase() === limpia.toLowerCase())
    if (existe) {
      setErrorCat(`La categoría "${limpia}" ya se encuentra registrada.`)
      return
    }

    const nuevaLista = [...categorias, limpia]
    setGuardandoCat(true)
    setErrorCat(null)

    if (onGuardarCategorias) {
      const err = await onGuardarCategorias(nuevaLista)
      if (err) {
        setErrorCat(err)
      } else {
        setNuevaCatTexto('')
        // Si el formulario de equipo está abierto, seleccionarla automáticamente
        if (modalAbierto) {
          setForm((prev) => ({ ...prev, categoria: limpia }))
        }
      }
    }
    setGuardandoCat(false)
  }

  const eliminarCategoria = async (catEliminar) => {
    const equiposConCat = inventario.filter(
      (i) => (i.categoria || '').toLowerCase() === catEliminar.toLowerCase(),
    )
    if (equiposConCat.length > 0) {
      const ok = window.confirm(
        `Hay ${equiposConCat.length} equipo(s) con la categoría "${catEliminar}". Si la eliminas, esos equipos conservarán su valor pero la categoría ya no aparecerá como opción rápida. ¿Deseas eliminarla?`,
      )
      if (!ok) return
    } else {
      const ok = window.confirm(`¿Deseas eliminar la categoría "${catEliminar}"?`)
      if (!ok) return
    }

    const nuevaLista = categorias.filter((c) => c !== catEliminar)
    setGuardandoCat(true)
    setErrorCat(null)
    if (onGuardarCategorias) {
      await onGuardarCategorias(nuevaLista)
    }
    setGuardandoCat(false)
  }

  const abrirEditar = (fila) => {
    setEditandoId(fila.id)
    setForm({
      codigo: fila.codigo ?? '',
      material: fila.material ?? '',
      categoria: fila.categoria ?? '',
      stock_propio_total:
        fila.stock_propio_total !== null && fila.stock_propio_total !== undefined
          ? String(fila.stock_propio_total)
          : '',
      stock_propio_disponible:
        fila.stock_propio_disponible !== null && fila.stock_propio_disponible !== undefined
          ? String(fila.stock_propio_disponible)
          : '',
      stock_propio_alquilado:
        fila.stock_propio_alquilado !== null && fila.stock_propio_alquilado !== undefined
          ? String(fila.stock_propio_alquilado)
          : '',
      stock_propio_prestado:
        fila.stock_propio_prestado !== null && fila.stock_propio_prestado !== undefined
          ? String(fila.stock_propio_prestado)
          : '',
      stock_externo_prestado:
        fila.stock_externo_prestado !== null && fila.stock_externo_prestado !== undefined
          ? String(fila.stock_externo_prestado)
          : '',
      precio_alquiler_dia_usd:
        fila.precio_alquiler_dia_usd !== null && fila.precio_alquiler_dia_usd !== undefined
          ? String(fila.precio_alquiler_dia_usd)
          : '',
    })
    setErrorModal(null)
    setModalAbierto(true)
  }

  const guardarEquipo = async (e) => {
    e.preventDefault()
    const codigoFinal = (editandoId ? form.codigo : codigoAutomatico).trim()
    if (!form.material.trim()) {
      setErrorModal('El nombre del material es obligatorio.')
      return
    }
    setGuardando(true)
    setErrorModal(null)

    const stockTotal = Number(form.stock_propio_total || 0)
    const stockDisp =
      form.stock_propio_disponible === ''
        ? stockTotal
        : Number(form.stock_propio_disponible || 0)

    const payload = {
      codigo: codigoFinal,
      material: form.material.trim(),
      categoria: form.categoria.trim() || 'General',
      stock_propio_total: stockTotal,
      stock_propio_disponible: stockDisp,
      stock_propio_alquilado: Number(form.stock_propio_alquilado || 0),
      stock_propio_prestado: Number(form.stock_propio_prestado || 0),
      stock_externo_prestado: Number(form.stock_externo_prestado || 0),
      precio_alquiler_dia_usd: Number(form.precio_alquiler_dia_usd || 0),
    }

    const previo = editandoId
      ? inventario.find((i) => String(i.id) === String(editandoId))
      : null

    const res = editandoId
      ? await supabase
          .from('inventario')
          .update(payload)
          .eq('id', editandoId)
          .select('*')
          .maybeSingle()
      : await supabase.from('inventario').insert([payload]).select('*').maybeSingle()

    if (res.error) {
      setGuardando(false)
      setErrorModal(res.error.message)
      return
    }

    const eqId = res.data?.id ?? editandoId
    const diffCantidad = previo
      ? Math.abs(num(payload.stock_propio_disponible) - num(previo.stock_propio_disponible)) ||
        num(payload.stock_propio_disponible)
      : num(payload.stock_propio_disponible)

    await registrarMovimientoKardex({
      inventario_id: eqId,
      codigo: payload.codigo,
      material: payload.material,
      tipo_movimiento: 'AJUSTE EN GALPÓN',
      cantidad: diffCantidad,
      stock_resultante: payload.stock_propio_disponible,
      referencia_documento: `INV-${payload.codigo}`,
      cliente_nombre: editandoId ? 'Ajuste Manual en Galpón' : 'Alta de Nuevo Equipo',
    })

    setGuardando(false)
    setModalAbierto(false)
    onRecargar()
  }

  // Importación masiva desde Excel generando el código automáticamente para cada fila
  const manejarImportacionExcel = async (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    e.target.value = ''

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
          texto: 'El archivo Excel está vacío o no tiene filas válidas.',
        })
        return
      }

      const acumulados = [...inventario]
      const nuevosRegistros = []

      for (const f of filas) {
        const material = String(
          f.Material ?? f.material ?? f['Equipo / Material'] ?? f.Equipo ?? '',
        ).trim()
        if (!material) continue

        const categoria =
          String(f.Categoria ?? f.Categoría ?? f.categoria ?? 'General').trim() || 'General'
        const stockTotal = num(f.Stock_Total ?? f['Total Propio'] ?? f.stock_propio_total ?? 0)
        const dispRaw =
          f.Disponible_Galpon ?? f['En Galpón (Disponible)'] ?? f.stock_propio_disponible
        const stockDisp = dispRaw === '' || dispRaw === undefined ? stockTotal : num(dispRaw)
        const precioDia = num(
          f.Precio_Dia_USD ?? f['Precio por Día (USD)'] ?? f.precio_alquiler_dia_usd ?? 0,
        )

        const codigoGenerado = generarCodigoEquipo(categoria, material, acumulados)
        const registro = {
          codigo: codigoGenerado,
          material,
          categoria,
          stock_propio_total: stockTotal,
          stock_propio_disponible: stockDisp,
          stock_propio_alquilado: 0,
          stock_propio_prestado: 0,
          stock_externo_prestado: 0,
          precio_alquiler_dia_usd: precioDia,
        }
        nuevosRegistros.push(registro)
        acumulados.push(registro)
      }

      if (nuevosRegistros.length === 0) {
        setImportando(false)
        setMensajeImportacion({
          tipo: 'error',
          texto:
            'No se encontraron materiales válidos. Usa la Plantilla Excel con las columnas: Material, Categoria, Stock_Total, Disponible_Galpon, Precio_Dia_USD.',
        })
        return
      }

      const { error } = await supabase.from('inventario').insert(nuevosRegistros)
      setImportando(false)

      if (error) {
        setMensajeImportacion({
          tipo: 'error',
          texto: `Error al importar en Supabase: ${error.message}`,
        })
        return
      }

      setMensajeImportacion({
        tipo: 'ok',
        texto: `Se importaron ${nuevosRegistros.length} equipo(s) con códigos generados exitosamente.`,
      })
      onRecargar()
    } catch (err) {
      setImportando(false)
      setMensajeImportacion({
        tipo: 'error',
        texto: `No se pudo leer el archivo Excel: ${err.message || 'Formato inválido'}`,
      })
    }
  }

  const eliminarEquipo = async (fila) => {
    if (!permisos.puedeEliminarInventario) return
    const ok = window.confirm(
      `¿Eliminar definitivamente "${fila.material}" (${fila.codigo}) del galpón?`,
    )
    if (!ok) return
    const { error } = await supabase.from('inventario').delete().eq('id', fila.id)
    if (error) {
      window.alert(`Error al eliminar: ${error.message}`)
      return
    }
    onRecargar()
  }

  const tipsInventario = [
    'Al pulsar "+ Nuevo Equipo" o importar desde Excel, el sistema genera automáticamente el código del equipo (ej. AND-005).',
    'Puedes descargar la "Plantilla Excel" (sin columna Código), llenarla con tus equipos y subirla con el botón "Importar Excel".',
    'Descarga el catálogo actualizado en PDF (para imprimir o enviar por WhatsApp), Excel o CSV.',
  ]

  const th =
    'whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white'
  const td = 'whitespace-nowrap px-3.5 py-2.5 text-xs'

  return (
    <div className="space-y-4">
      {/* Guía Rápida */}
      <GuiaRapida moduloNombre="Inventario en Galpón" tips={tipsInventario} />

      {mensajeImportacion && (
        <div
          className={`flex items-center justify-between gap-2 rounded-md border p-3 text-xs font-bold ${
            mensajeImportacion.tipo === 'ok'
              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-700'
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
            className="rounded px-2 py-0.5 text-[11px] underline"
          >
            Cerrar
          </button>
        </div>
      )}

      <section
        className="overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm"
        style={{ borderLeft: `4px solid ${NARANJA}` }}
      >
        {/* Barra de herramientas */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white"
          style={{ background: NEGRO }}
        >
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Inventario de Equipos en Galpón
            </h2>
            <p className="text-[11px] text-neutral-400">
              {filtrado.length} de {inventario.length} equipo(s) registrados · códigos y precios a la Tasa del Día
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded border border-neutral-700 bg-[#1a1a1a] px-2.5 py-1.5">
              <Search size={14} color={NARANJA} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código, material..."
                className="w-40 bg-transparent text-xs text-white outline-none sm:w-48"
              />
            </div>

            {permisos.puedeCrearEditarInventario && (
              <>
                <button
                  type="button"
                  onClick={() => setModalCategoriasAbierto(true)}
                  className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-neutral-200 hover:border-[#FF5500]"
                  title="Gestionar categorías de equipos (crear, editar o eliminar)"
                >
                  <Tags size={13} color={NARANJA} />
                  <span>Gestionar Categorías</span>
                </button>

                <button
                  type="button"
                  onClick={descargarPlantillaInventarioExcel}
                  className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-neutral-200 hover:border-[#FF5500]"
                  title="Descargar plantilla de Excel limpia (Material, Categoria, Stock_Total, Disponible_Galpon, Precio_Dia_USD)"
                >
                  <Download size={13} color={NARANJA} />
                  <span>Plantilla Excel</span>
                </button>

                <input
                  ref={inputArchivoRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={manejarImportacionExcel}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={importando}
                  onClick={() => inputArchivoRef.current?.click()}
                  className="flex items-center gap-1.5 rounded border border-amber-600/60 bg-amber-950/50 px-2.5 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/60 disabled:opacity-50"
                  title="Importar equipos desde Excel generando el código automáticamente"
                >
                  {importando ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Upload size={13} color={NARANJA} />
                  )}
                  <span>Importar Excel</span>
                </button>
              </>
            )}

            {permisos.puedeExportarReportes && (
              <>
                <button
                  onClick={() => exportarInventarioPDF(filtrado, tasa)}
                  className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs font-bold text-white hover:border-[#FF5500]"
                  title="PDF listo para imprimir o enviar por WhatsApp con los precios a la Tasa del Día"
                >
                  <FileText size={14} color={NARANJA} />
                  <span>PDF</span>
                </button>
                <button
                  onClick={() => exportarInventarioExcel(filtrado, tasa)}
                  className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  title="Exportar inventario a Excel"
                >
                  <FileSpreadsheet size={14} />
                  <span>Excel</span>
                </button>
                <button
                  onClick={() => exportarInventarioCSV(filtrado, tasa)}
                  className="flex items-center gap-1.5 rounded border border-neutral-600 bg-neutral-200 px-2.5 py-1.5 text-xs font-bold text-neutral-900 hover:bg-white"
                  title="Descargar archivo en formato universal CSV"
                >
                  <FileDown size={14} />
                  <span>CSV</span>
                </button>
              </>
            )}

            {permisos.puedeCrearEditarInventario && (
              <button
                onClick={abrirNuevo}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-95"
                style={{ background: NARANJA }}
                title="Registrar un nuevo equipo en el galpón con código automático"
              >
                <Plus size={15} />
                <span>+ Nuevo Equipo</span>
              </button>
            )}

            <button
              onClick={onRecargar}
              className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-white hover:border-[#FF5500]"
              title="Volver a leer las cantidades desde el servidor"
            >
              <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} color={NARANJA} />
            </button>
          </div>
        </div>

        {/* Tabla amigable */}
        {inventario.length === 0 ? (
          <p className="p-8 text-center text-xs text-neutral-500">
            No hay equipos registrados en el inventario. Pulsa &quot;+ Nuevo Equipo&quot; para agregar el primero.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ color: NEGRO }}>
              <thead style={{ background: '#1c1c1c' }}>
                <tr>
                  <th className={th}>Código</th>
                  <th className={th}>Equipo / Material</th>
                  <th className={th}>Categoría</th>
                  <th className={`${th} text-right`}>Total Propio</th>
                  <th className={`${th} text-right`}>En Galpón (Disponible)</th>
                  <th className={`${th} text-right`}>Alquilado en Obra</th>
                  <th className={`${th} text-right`}>Prestados con Aliados</th>
                  <th className={`${th} text-right`}>Precio por Día</th>
                  {(permisos.puedeCrearEditarInventario || permisos.puedeEliminarInventario) && (
                    <th className={`${th} text-center`}>Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filtrado.map((f) => {
                  const disponible = num(f.stock_propio_disponible)
                  const propios = num(f.stock_propio_prestado)
                  const externos = num(f.stock_externo_prestado)
                  const precio = num(f.precio_alquiler_dia_usd)
                  return (
                    <tr key={f.id} className="transition-colors hover:bg-orange-50/50">
                      <td className={`${td} font-mono font-bold text-neutral-700`}>
                        {f.codigo ?? '—'}
                      </td>
                      <td className={`${td} font-bold text-neutral-900`}>{f.material ?? '—'}</td>
                      <td className={td}>
                        <span className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-[11px] font-bold uppercase text-neutral-700">
                          {f.categoria ?? '—'}
                        </span>
                      </td>
                      <td className={`${td} text-right font-mono`}>
                        {fmtNum(f.stock_propio_total)}
                      </td>
                      <td className={`${td} text-right font-mono`}>
                        <span
                          className="rounded border px-2 py-0.5 text-[11px] font-bold"
                          style={
                            disponible > 0
                              ? {
                                  background: 'rgba(16,185,129,0.12)',
                                  color: '#047857',
                                  borderColor: '#6ee7b7',
                                }
                              : {
                                  background: 'rgba(239,68,68,0.12)',
                                  color: '#b91c1c',
                                  borderColor: '#fca5a5',
                                }
                          }
                        >
                          {fmtNum(disponible)}
                        </span>
                      </td>
                      <td
                        className={`${td} text-right font-mono font-bold`}
                        style={{ color: NARANJA }}
                      >
                        {fmtNum(f.stock_propio_alquilado)}
                      </td>
                      <td className={`${td} text-right font-mono`}>
                        <div className="font-bold">{fmtNum(propios + externos)}</div>
                        <div className="text-[10px] text-neutral-500">
                          {fmtNum(propios)} nuestros · {fmtNum(externos)} de aliados
                        </div>
                      </td>
                      <td className={`${td} text-right font-mono leading-tight`}>
                        <div className="font-bold">{fmtUSD(precio)}</div>
                        <div className="text-[11px] text-neutral-500">
                          {tasa ? fmtVES(precio * tasa) : '—'}
                        </div>
                      </td>
                      {(permisos.puedeCrearEditarInventario || permisos.puedeEliminarInventario) && (
                        <td className={`${td} text-center`}>
                          <div className="flex items-center justify-center gap-1">
                            {permisos.puedeCrearEditarInventario && (
                              <button
                                onClick={() => abrirEditar(f)}
                                className="rounded border border-neutral-300 bg-neutral-100 p-1.5 text-neutral-800 hover:border-[#FF5500]"
                                title="Editar nombre, precio por día o ajustar cantidades en galpón"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {permisos.puedeEliminarInventario && (
                              <button
                                onClick={() => eliminarEquipo(f)}
                                className="rounded border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                                title="Eliminar este equipo de la lista (Solo Administrador)"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Crear / Editar Equipo */}
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  {editandoId
                    ? 'Editar Equipo o Ajustar Cantidades'
                    : 'Ingresar Nuevo Equipo al Galpón'}
                </h3>
                <button
                  onClick={() => setModalAbierto(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={guardarEquipo} className="space-y-3.5 p-5 text-xs">
                {errorModal && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
                    <TriangleAlert size={15} />
                    <span>{errorModal}</span>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 flex items-center gap-1 font-bold uppercase text-neutral-600">
                      <Sparkles size={12} color={NARANJA} />
                      <span>Código Automático</span>
                    </label>
                    <input
                      readOnly={!editandoId}
                      value={editandoId ? form.codigo : codigoAutomatico}
                      onChange={(e) => {
                        if (editandoId) setForm({ ...form, codigo: e.target.value })
                      }}
                      className="w-full rounded border border-neutral-300 bg-neutral-100 px-3 py-2 font-mono font-bold text-neutral-800 outline-none"
                      title="Se genera automáticamente con 3 letras de la categoría/material + correlativo"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block font-bold uppercase text-neutral-600">
                        Tipo / Categoría *
                      </label>
                      <button
                        type="button"
                        onClick={() => setModalCategoriasAbierto(true)}
                        className="flex items-center gap-1 text-[11px] font-bold text-[#FF5500] hover:underline"
                        title="Crear o gestionar categorías del sistema"
                      >
                        <Plus size={12} />
                        <span>Nueva Categoría</span>
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <select
                        required
                        value={form.categoria}
                        onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                        className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-800 outline-none focus:border-[#FF5500]"
                      >
                        {categorias.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setModalCategoriasAbierto(true)}
                        className="rounded border border-neutral-300 bg-neutral-100 px-2.5 py-2 text-neutral-600 hover:border-[#FF5500] hover:bg-neutral-200"
                        title="Gestionar lista de categorías"
                      >
                        <Tags size={14} color={NARANJA} />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-bold uppercase text-neutral-600">
                    Nombre o Descripción del Material *
                  </label>
                  <input
                    required
                    value={form.material}
                    onChange={(e) => setForm({ ...form, material: e.target.value })}
                    placeholder="Ej. Andamio tubular estándar 1.50m con cruceta"
                    className="w-full rounded border border-neutral-300 px-3 py-2 placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Total Propio
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej. 50"
                      value={form.stock_propio_total}
                      onChange={(e) => {
                        const limpio = limpiarInputEntero(e.target.value)
                        setForm((prev) => ({
                          ...prev,
                          stock_propio_total: limpio,
                          stock_propio_disponible: editandoId
                            ? prev.stock_propio_disponible
                            : limpio,
                        }))
                      }}
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      En Galpón (Disponible)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ej. 50"
                      value={form.stock_propio_disponible}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          stock_propio_disponible: limpiarInputEntero(e.target.value),
                        })
                      }
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold uppercase text-neutral-600">
                      Precio Alquiler / Día (USD)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej. 2.50"
                      value={form.precio_alquiler_dia_usd}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          precio_alquiler_dia_usd: limpiarInputDecimal(e.target.value),
                        })
                      }
                      className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                    />
                  </div>
                </div>

                {editandoId && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block font-bold uppercase text-neutral-600">
                        Alquilado en Obra
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={form.stock_propio_alquilado}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            stock_propio_alquilado: limpiarInputEntero(e.target.value),
                          })
                        }
                        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-bold uppercase text-neutral-600">
                        Nuestros Prestados
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={form.stock_propio_prestado}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            stock_propio_prestado: limpiarInputEntero(e.target.value),
                          })
                        }
                        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-bold uppercase text-neutral-600">
                        De Aliados aquí
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={form.stock_externo_prestado}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            stock_externo_prestado: limpiarInputEntero(e.target.value),
                          })
                        }
                        className="w-full rounded border border-neutral-300 px-3 py-2 font-mono placeholder:text-neutral-400 outline-none focus:border-[#FF5500]"
                      />
                    </div>
                  </div>
                )}

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
                    <span>{editandoId ? 'Guardar Cambios' : 'Registrar en Galpón'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* =================================================================
            MODAL GESTOR DINÁMICO DE CATEGORÍAS
           ================================================================= */}
        {modalCategoriasAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-md border border-neutral-700 bg-white shadow-2xl">
              <div
                className="flex items-center justify-between px-5 py-3.5 text-white"
                style={{ background: NEGRO, borderBottom: `3px solid ${NARANJA}` }}
              >
                <div className="flex items-center gap-2">
                  <Tags size={17} color={NARANJA} />
                  <h3 className="text-sm font-bold uppercase tracking-wider">
                    Gestor Dinámico de Categorías
                  </h3>
                </div>
                <button
                  onClick={() => setModalCategoriasAbierto(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 p-5 text-xs">
                {errorCat && (
                  <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-2.5 text-xs font-bold text-red-700">
                    <TriangleAlert size={15} className="shrink-0" />
                    <span>{errorCat}</span>
                  </div>
                )}

                <p className="text-neutral-600">
                  Las categorías permiten organizar el inventario en galpón, calcular la ocupación por rubro y generar automáticamente los códigos correlativos de tres letras (ej. AND-001, PUN-001).
                </p>

                {/* Formulario para agregar nueva categoría */}
                <form onSubmit={agregarCategoria} className="flex gap-2">
                  <input
                    type="text"
                    value={nuevaCatTexto}
                    onChange={(e) => setNuevaCatTexto(e.target.value)}
                    placeholder="Nombre de la nueva categoría (ej. Motores)"
                    className="flex-1 rounded border border-neutral-300 px-3 py-2 text-xs font-bold outline-none focus:border-[#FF5500]"
                  />
                  <button
                    type="submit"
                    disabled={guardandoCat || !nuevaCatTexto.trim()}
                    className="flex items-center gap-1.5 rounded px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                    style={{ background: NARANJA }}
                  >
                    {guardandoCat ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    <span>Agregar</span>
                  </button>
                </form>

                {/* Lista de categorías activas */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    Categorías Registradas ({categorias.length})
                  </label>
                  <div className="max-h-60 divide-y divide-neutral-200 overflow-y-auto rounded border border-neutral-300 bg-neutral-50">
                    {categorias.map((cat) => {
                      const cantEquipos = inventario.filter(
                        (i) => (i.categoria || '').toLowerCase() === cat.toLowerCase(),
                      ).length

                      return (
                        <div
                          key={cat}
                          className="flex items-center justify-between gap-2 bg-white px-3.5 py-2.5 transition-colors hover:bg-neutral-50"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: NARANJA }}
                            />
                            <span className="font-bold text-neutral-800">{cat}</span>
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                              {cantEquipos} equipo(s)
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => eliminarCategoria(cat)}
                            disabled={guardandoCat}
                            className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title={`Eliminar categoría ${cat}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setModalCategoriasAbierto(false)}
                    className="rounded border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
