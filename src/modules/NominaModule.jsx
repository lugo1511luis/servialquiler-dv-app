import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Briefcase,
  Users,
  DollarSign,
  Calendar,
  CalendarX,
  Banknote,
  CheckCircle2,
  Clock,
  Plus,
  Pencil,
  Trash2,
  FileText,
  FileSpreadsheet,
  Download,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertTriangle,
  X,
  Loader2,
  Check,
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import {
  fmtFecha,
  fmtUSD,
  fmtVES,
  hoyISO,
  NARANJA,
  NEGRO,
  num,
  obtenerRangoSemana,
  construirMensajeWhatsAppNomina,
  WhatsAppIcon,
} from '../utils/formatters'
import {
  generarReciboNominaPDF,
  generarPlanillaSemanalNominaPDF,
  exportarPlanillaNominaExcel,
  descargarPlantillaEmpleadosExcel,
} from '../utils/exportadores'

const METODOS_PAGO = [
  'Efectivo USD',
  'Pago Móvil Bs.',
  'Transferencia Bancaria',
  'Pago Mixto (USD + Bs)',
  'Zelle',
]

const ESTADOS_EMPLEADO = ['ACTIVO', 'VACACIONES', 'REPOSO', 'INACTIVO']

export default function NominaModule({ tasa = 0 }) {
  // Pestaña activa: 'semanal' | 'personal' | 'cargos'
  const [pestaña, setPestaña] = useState('semanal')

  // Datos principales
  const [cargos, setCargos] = useState([])
  const [empleados, setEmpleados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensajeBanner, setMensajeBanner] = useState(null)

  // Selector de semana laboral (Lunes a Sábado)
  const [fechaReferencia, setFechaReferencia] = useState(new Date())
  const rangoSemana = useMemo(() => obtenerRangoSemana(fechaReferencia), [fechaReferencia])

  // Planilla en edición para la semana activa
  const [planilla, setPlanilla] = useState([])

  // Modales
  const [modalEmpleado, setModalEmpleado] = useState(false)
  const [editandoEmpleadoId, setEditandoEmpleadoId] = useState(null)
  const [formEmpleado, setFormEmpleado] = useState({
    nombre_completo: '',
    cedula: '',
    telefono: '',
    cargo_id: '',
    cargo: '',
    sueldo_semanal_usd: '',
    datos_pago_movil: '',
    estado: 'ACTIVO',
  })

  // Modal Registrar Falta
  const [modalFalta, setModalFalta] = useState(false)
  const [empleadoFalta, setEmpleadoFalta] = useState(null)
  const [formFalta, setFormFalta] = useState({
    fecha: hoyISO(),
    cantidad: 1, // 1 o 0.5
    tipo: 'Injustificada', // 'Injustificada' o 'Permiso / Justificada'
    motivo: '',
  })

  // Modal Registrar Vale / Adelanto
  const [modalVale, setModalVale] = useState(false)
  const [empleadoVale, setEmpleadoVale] = useState(null)
  const [formVale, setFormVale] = useState({
    monto_usd: '',
    motivo: 'Adelanto semanal de sueldo',
  })

  // Modal Cargo
  const [modalCargo, setModalCargo] = useState(false)
  const [editandoCargoId, setEditandoCargoId] = useState(null)
  const [formCargo, setFormCargo] = useState({
    nombre_cargo: '',
    sueldo_semanal_sugerido_usd: '',
  })

  // Buscador y filtros de personal
  const [busquedaPersonal, setBusquedaPersonal] = useState('')
  const [filtroEstadoPersonal, setFiltroEstadoPersonal] = useState('TODOS')
  const inputImportarPersonalRef = useRef(null)

  // ===========================================================================
  // CARGA DE DATOS DESDE SUPABASE
  // ===========================================================================
  const cargarDatos = async () => {
    setCargando(true)
    try {
      // 1. Cargos
      const { data: dataCargos } = await supabase
        .from('nomina_cargos')
        .select('*')
        .order('id', { ascending: true })
      setCargos(dataCargos || [])

      // 2. Empleados
      const { data: dataEmpleados } = await supabase
        .from('nomina_empleados')
        .select('*')
        .order('nombre_completo', { ascending: true })
      setEmpleados(dataEmpleados || [])

      // 3. Pagos de la semana
      await cargarPagosSemana(rangoSemana, dataEmpleados || [], dataCargos || [])
    } catch (err) {
      console.error('Error al cargar datos de nómina:', err)
      setMensajeBanner({
        tipo: 'error',
        texto: `No se pudieron cargar los datos de nómina: ${err.message}`,
      })
    } finally {
      setCargando(false)
    }
  }

  const cargarPagosSemana = async (rango, listaEmp = empleados, listaCargos = cargos) => {
    try {
      const { data: dataPagos } = await supabase
        .from('nomina_pagos_semanales')
        .select('*')
        .eq('semana_inicio', rango.lunesISO)

      const pagosExistentes = dataPagos || []

      // Inicializa la planilla de trabajo con los pagos existentes o con los empleados activos
      const mapaPagos = new Map()
      pagosExistentes.forEach((p) => mapaPagos.set(String(p.empleado_id), p))

      const activos = listaEmp.filter((e) => e.estado === 'ACTIVO')
      const filasPlanilla = activos.map((e) => {
        const pagoPrevio = mapaPagos.get(String(e.id))
        if (pagoPrevio) {
          return {
            ...pagoPrevio,
            empleado_nombre: e.nombre_completo,
            cedula: e.cedula,
            telefono: e.telefono,
            datos_pago_movil: e.datos_pago_movil,
          }
        }

        // Si aún no está guardado para esta semana, inicializa con datos vivos del empleado
        const sueldoBase = Number(e.sueldo_semanal_usd || 0)
        const faltas = Number(e.faltas_semana_actual || 0)
        const valorDia = sueldoBase > 0 ? sueldoBase / 6 : 0
        const descFaltas = Math.round(faltas * valorDia * 100) / 100
        const adelantos = Number(e.saldo_adelantos_usd || 0)
        const bonos = 0
        const netoUSD = Math.max(0, sueldoBase + bonos - descFaltas - adelantos)

        const cargoNombre =
          e.cargo ||
          listaCargos.find((c) => String(c.id) === String(e.cargo_id))?.nombre_cargo ||
          'Colaborador'

        return {
          id: `temp-${e.id}`,
          empleado_id: e.id,
          empleado_nombre: e.nombre_completo,
          cedula: e.cedula,
          telefono: e.telefono,
          cargo: cargoNombre,
          datos_pago_movil: e.datos_pago_movil,
          semana_inicio: rango.lunesISO,
          semana_fin: rango.sabadoISO,
          semana_texto: rango.textoSemana,
          sueldo_base_usd: sueldoBase,
          dias_laborados: Math.max(0, 6 - faltas),
          dias_faltados: faltas,
          falta_justificada: false,
          deducciones_inasistencia_usd: descFaltas,
          detalle_faltas: e.detalle_faltas_semana || '',
          descuento_adelantos_usd: adelantos,
          bonos_extras_usd: bonos,
          neto_pagar_usd: netoUSD,
          metodo_pago: 'Efectivo USD',
          estado_pago: 'PENDIENTE',
          tasa_bcv: tasa || null,
        }
      })

      setPlanilla(filasPlanilla)
    } catch (err) {
      console.warn('Error cargando pagos de semana:', err)
    }
  }

  useEffect(() => {
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaReferencia])

  // Navegación de semanas
  const irSemanaAnterior = () => {
    const d = new Date(fechaReferencia)
    d.setDate(d.getDate() - 7)
    setFechaReferencia(d)
  }

  const irSemanaSiguiente = () => {
    const d = new Date(fechaReferencia)
    d.setDate(d.getDate() + 7)
    setFechaReferencia(d)
  }

  const irSemanaActual = () => {
    setFechaReferencia(new Date())
  }

  // ===========================================================================
  // KPIS GENERALES SUPERIORES
  // ===========================================================================
  const kpis = useMemo(() => {
    const totalActivos = empleados.filter((e) => e.estado === 'ACTIVO').length
    const totalEstimadoUSD = empleados
      .filter((e) => e.estado === 'ACTIVO')
      .reduce((s, e) => s + num(e.sueldo_semanal_usd), 0)

    const totalDescuentosSemana = planilla.reduce(
      (s, p) => s + num(p.deducciones_inasistencia_usd) + num(p.descuento_adelantos_usd),
      0,
    )

    const pagados = planilla.filter((p) => p.estado_pago === 'PAGADO')
    const totalPagadoUSD = pagados.reduce((s, p) => s + num(p.neto_pagar_usd), 0)

    return {
      totalActivos,
      totalEstimadoUSD,
      totalEstimadoVES: tasa > 0 ? totalEstimadoUSD * tasa : 0,
      totalDescuentosSemana,
      totalPagadoUSD,
      totalPagadoVES: tasa > 0 ? totalPagadoUSD * tasa : 0,
      pendientesCount: planilla.length - pagados.length,
    }
  }, [empleados, planilla, tasa])

  // ===========================================================================
  // ACCIONES DE PLANILLA SEMANAL (PESTAÑA A)
  // ===========================================================================
  const actualizarFilaPlanilla = (empleadoId, cambios) => {
    setPlanilla((prev) =>
      prev.map((fila) => {
        if (fila.empleado_id !== empleadoId) return fila
        const act = { ...fila, ...cambios }

        const sueldoBase = Number(act.sueldo_base_usd || 0)
        const valorDia = sueldoBase > 0 ? sueldoBase / 6 : 0
        const faltas = Number(act.dias_faltados || 0)
        act.dias_laborados = Math.max(0, 6 - faltas)

        // Si marcó falta justificada, la deducción es 0; si no, calcula por días faltados
        if (act.falta_justificada) {
          act.deducciones_inasistencia_usd = 0
        } else if (cambios.deducciones_inasistencia_usd === undefined) {
          act.deducciones_inasistencia_usd = Math.round(faltas * valorDia * 100) / 100
        }

        const bonos = Number(act.bonos_extras_usd || 0)
        const descFaltas = Number(act.deducciones_inasistencia_usd || 0)
        const adelantos = Number(act.descuento_adelantos_usd || 0)

        act.neto_pagar_usd = Math.max(0, sueldoBase + bonos - descFaltas - adelantos)
        return act
      }),
    )
  }

  const liquidarEmpleado = async (fila) => {
    setGuardando(true)
    try {
      const payloadPago = {
        empleado_id: fila.empleado_id,
        semana_inicio: rangoSemana.lunesISO,
        semana_fin: rangoSemana.sabadoISO,
        semana_texto: rangoSemana.textoSemana,
        sueldo_base_usd: num(fila.sueldo_base_usd),
        dias_laborados: num(fila.dias_laborados),
        dias_faltados: num(fila.dias_faltados),
        deducciones_inasistencia_usd: num(fila.deducciones_inasistencia_usd),
        detalle_faltas: fila.detalle_faltas || null,
        descuento_adelantos_usd: num(fila.descuento_adelantos_usd),
        bonos_extras_usd: num(fila.bonos_extras_usd),
        neto_pagar_usd: num(fila.neto_pagar_usd),
        neto_pagar_ves: tasa > 0 ? num(fila.neto_pagar_usd) * tasa : null,
        metodo_pago: fila.metodo_pago || 'Efectivo USD',
        estado_pago: 'PAGADO',
        fecha_pago: hoyISO(),
        tasa_bcv: tasa || null,
      }

      // Upsert en nomina_pagos_semanales
      const { data: pagoGuardado, error: errPago } = await supabase
        .from('nomina_pagos_semanales')
        .upsert(payloadPago, { onConflict: 'empleado_id,semana_inicio' })
        .select()
        .single()

      if (errPago) {
        // Fallback si la clave única no es compuesta
        const { error: errInsert } = await supabase.from('nomina_pagos_semanales').insert([payloadPago])
        if (errInsert) throw errInsert
      }

      // Reinicia faltas y adelantos amortizados en el empleado para la semana siguiente
      await supabase
        .from('nomina_empleados')
        .update({
          saldo_adelantos_usd: 0,
          faltas_semana_actual: 0,
          detalle_faltas_semana: null,
        })
        .eq('id', fila.empleado_id)

      setMensajeBanner({
        tipo: 'exito',
        texto: `Nómina liquidada con éxito para ${fila.empleado_nombre}: $${fmtUSD(fila.neto_pagar_usd)} (${fila.metodo_pago}).`,
      })

      // Actualiza estado local
      setPlanilla((prev) =>
        prev.map((f) =>
          f.empleado_id === fila.empleado_id
            ? { ...f, estado_pago: 'PAGADO', id: pagoGuardado?.id || f.id }
            : f,
        ),
      )

      // Actualiza lista de empleados en memoria
      setEmpleados((prev) =>
        prev.map((e) =>
          e.id === fila.empleado_id
            ? { ...e, saldo_adelantos_usd: 0, faltas_semana_actual: 0, detalle_faltas_semana: null }
            : e,
        ),
      )
    } catch (err) {
      console.error('Error al liquidar empleado:', err)
      setMensajeBanner({
        tipo: 'error',
        texto: `Error al registrar pago de nómina: ${err.message}`,
      })
    } finally {
      setGuardando(false)
    }
  }

  const liquidarTodaLaSemana = async () => {
    const pendientes = planilla.filter((p) => p.estado_pago !== 'PAGADO')
    if (pendientes.length === 0) {
      setMensajeBanner({
        tipo: 'info',
        texto: 'Todos los trabajadores de la semana ya se encuentran liquidados.',
      })
      return
    }

    if (!window.confirm(`¿Confirmas liquidar y marcar como PAGADOS a los ${pendientes.length} trabajadores pendientes de la semana?`)) {
      return
    }

    setGuardando(true)
    try {
      let count = 0
      for (const fila of pendientes) {
        const payloadPago = {
          empleado_id: fila.empleado_id,
          semana_inicio: rangoSemana.lunesISO,
          semana_fin: rangoSemana.sabadoISO,
          semana_texto: rangoSemana.textoSemana,
          sueldo_base_usd: num(fila.sueldo_base_usd),
          dias_laborados: num(fila.dias_laborados),
          dias_faltados: num(fila.dias_faltados),
          deducciones_inasistencia_usd: num(fila.deducciones_inasistencia_usd),
          detalle_faltas: fila.detalle_faltas || null,
          descuento_adelantos_usd: num(fila.descuento_adelantos_usd),
          bonos_extras_usd: num(fila.bonos_extras_usd),
          neto_pagar_usd: num(fila.neto_pagar_usd),
          neto_pagar_ves: tasa > 0 ? num(fila.neto_pagar_usd) * tasa : null,
          metodo_pago: fila.metodo_pago || 'Efectivo USD',
          estado_pago: 'PAGADO',
          fecha_pago: hoyISO(),
          tasa_bcv: tasa || null,
        }

        await supabase.from('nomina_pagos_semanales').upsert(payloadPago, {
          onConflict: 'empleado_id,semana_inicio',
        })

        await supabase
          .from('nomina_empleados')
          .update({
            saldo_adelantos_usd: 0,
            faltas_semana_actual: 0,
            detalle_faltas_semana: null,
          })
          .eq('id', fila.empleado_id)

        count++
      }

      setMensajeBanner({
        tipo: 'exito',
        texto: `Semana liquidada con éxito: ${count} pagos procesados y trabajadores reiniciados para el lunes.`,
      })

      await cargarPagosSemana(rangoSemana)
    } catch (err) {
      setMensajeBanner({
        tipo: 'error',
        texto: `Error al liquidar la semana completa: ${err.message}`,
      })
    } finally {
      setGuardando(false)
    }
  }

  // ===========================================================================
  // GESTIÓN DE PERSONAL Y FALTAS (PESTAÑA B)
  // ===========================================================================
  const abrirModalNuevoEmpleado = () => {
    setEditandoEmpleadoId(null)
    setFormEmpleado({
      nombre_completo: '',
      cedula: '',
      telefono: '',
      cargo_id: cargos[0]?.id || '',
      cargo: cargos[0]?.nombre_cargo || '',
      sueldo_semanal_usd: cargos[0]?.sueldo_semanal_sugerido_usd || '',
      datos_pago_movil: '',
      estado: 'ACTIVO',
    })
    setModalEmpleado(true)
  }

  const abrirModalEditarEmpleado = (e) => {
    setEditandoEmpleadoId(e.id)
    setFormEmpleado({
      nombre_completo: e.nombre_completo || '',
      cedula: e.cedula || '',
      telefono: e.telefono || '',
      cargo_id: e.cargo_id || '',
      cargo: e.cargo || '',
      sueldo_semanal_usd: e.sueldo_semanal_usd !== null ? String(e.sueldo_semanal_usd) : '',
      datos_pago_movil: e.datos_pago_movil || '',
      estado: e.estado || 'ACTIVO',
    })
    setModalEmpleado(true)
  }

  const guardarEmpleado = async (e) => {
    if (e) e.preventDefault()
    if (!formEmpleado.nombre_completo.trim()) {
      alert('Ingresa el nombre completo del trabajador.')
      return
    }

    setGuardando(true)
    try {
      const payload = {
        nombre_completo: formEmpleado.nombre_completo.trim(),
        cedula: formEmpleado.cedula.trim() || null,
        telefono: formEmpleado.telefono.trim() || null,
        cargo_id: formEmpleado.cargo_id || null,
        cargo: formEmpleado.cargo || null,
        sueldo_semanal_usd: Number(formEmpleado.sueldo_semanal_usd || 0),
        datos_pago_movil: formEmpleado.datos_pago_movil.trim() || null,
        estado: formEmpleado.estado || 'ACTIVO',
      }

      if (editandoEmpleadoId) {
        const { error } = await supabase
          .from('nomina_empleados')
          .update(payload)
          .eq('id', editandoEmpleadoId)
        if (error) throw error
      } else {
        payload.faltas_semana_actual = 0
        payload.saldo_adelantos_usd = 0
        const { error } = await supabase.from('nomina_empleados').insert([payload])
        if (error) throw error
      }

      setModalEmpleado(false)
      setMensajeBanner({
        tipo: 'exito',
        texto: `Trabajador ${formEmpleado.nombre_completo} guardado con éxito.`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error al guardar empleado: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarEmpleado = async (emp) => {
    if (!window.confirm(`¿Seguro que deseas eliminar a ${emp.nombre_completo}?`)) return
    try {
      const { error } = await supabase.from('nomina_empleados').delete().eq('id', emp.id)
      if (error) throw error
      setMensajeBanner({
        tipo: 'exito',
        texto: `Empleado ${emp.nombre_completo} eliminado.`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error al eliminar empleado: ${err.message}`)
    }
  }

  // Registrar Falta
  const abrirModalFalta = (emp) => {
    setEmpleadoFalta(emp)
    setFormFalta({
      fecha: hoyISO(),
      cantidad: 1,
      tipo: 'Injustificada',
      motivo: '',
    })
    setModalFalta(true)
  }

  const guardarFalta = async (e) => {
    if (e) e.preventDefault()
    if (!empleadoFalta) return

    setGuardando(true)
    try {
      const cant = Number(formFalta.cantidad || 1)
      const nuevasFaltas = Number(empleadoFalta.faltas_semana_actual || 0) + cant

      const etiqueta = `${fmtFecha(formFalta.fecha)}: ${formFalta.tipo}${formFalta.motivo ? ` (${formFalta.motivo.trim()})` : ''}`
      const nuevoDetalle = empleadoFalta.detalle_faltas_semana
        ? `${empleadoFalta.detalle_faltas_semana}; ${etiqueta}`
        : etiqueta

      const { error } = await supabase
        .from('nomina_empleados')
        .update({
          faltas_semana_actual: nuevasFaltas,
          detalle_faltas_semana: nuevoDetalle,
        })
        .eq('id', empleadoFalta.id)

      if (error) throw error

      setModalFalta(false)
      setMensajeBanner({
        tipo: 'exito',
        texto: `Falta de ${cant} día(s) registrada para ${empleadoFalta.nombre_completo}. Total acumulado esta semana: ${nuevasFaltas} día(s).`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error registrando falta: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  // Registrar Vale / Adelanto
  const abrirModalVale = (emp) => {
    setEmpleadoVale(emp)
    setFormVale({
      monto_usd: '',
      motivo: 'Adelanto de sueldo semanal',
    })
    setModalVale(true)
  }

  const guardarVale = async (e) => {
    if (e) e.preventDefault()
    if (!empleadoVale) return
    const monto = Number(formVale.monto_usd || 0)
    if (monto <= 0) {
      alert('Ingresa un monto válido para el vale o adelanto.')
      return
    }

    setGuardando(true)
    try {
      const nuevoSaldo = Number(empleadoVale.saldo_adelantos_usd || 0) + monto
      const { error } = await supabase
        .from('nomina_empleados')
        .update({ saldo_adelantos_usd: nuevoSaldo })
        .eq('id', empleadoVale.id)

      if (error) throw error

      setModalVale(false)
      setMensajeBanner({
        tipo: 'exito',
        texto: `Vale de $${fmtUSD(monto)} registrado para ${empleadoVale.nombre_completo}. Saldo acumulado a descontar: $${fmtUSD(nuevoSaldo)}.`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error registrando vale: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  // Importar personal desde Excel
  const manejarImportacionPersonalExcel = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const libro = XLSX.read(buffer, { type: 'array' })
      const nombreHoja = libro.SheetNames[0]
      const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja])

      if (filas.length === 0) {
        alert('El archivo no contiene filas de trabajadores.')
        return
      }

      let importados = 0
      for (const row of filas) {
        const nombre = String(row.nombre_completo || row.Nombre || row.Trabajador || '').trim()
        if (!nombre) continue

        const payload = {
          nombre_completo: nombre,
          cedula: String(row.cedula || row.Cedula || row.RIF || '').trim() || null,
          telefono: String(row.telefono || row.Telefono || '').trim() || null,
          cargo: String(row.cargo || row.Cargo || 'Operador').trim(),
          sueldo_semanal_usd: Number(row.sueldo_semanal_usd || row.Sueldo || 0),
          datos_pago_movil: String(row.datos_pago_movil || row.PagoMovil || '').trim() || null,
          estado: String(row.estado || 'ACTIVO').trim().toUpperCase(),
          faltas_semana_actual: 0,
          saldo_adelantos_usd: 0,
        }

        await supabase.from('nomina_empleados').insert([payload])
        importados++
      }

      setMensajeBanner({
        tipo: 'exito',
        texto: `Importación completada: ${importados} trabajadores agregados a la nómina.`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error al importar trabajadores: ${err.message}`)
    } finally {
      if (inputImportarPersonalRef.current) inputImportarPersonalRef.current.value = ''
    }
  }

  // ===========================================================================
  // GESTIÓN DE CARGOS Y TABULADOR (PESTAÑA C)
  // ===========================================================================
  const abrirModalNuevoCargo = () => {
    setEditandoCargoId(null)
    setFormCargo({
      nombre_cargo: '',
      sueldo_semanal_sugerido_usd: '',
    })
    setModalCargo(true)
  }

  const abrirModalEditarCargo = (c) => {
    setEditandoCargoId(c.id)
    setFormCargo({
      nombre_cargo: c.nombre_cargo || c.nombre || '',
      sueldo_semanal_sugerido_usd:
        c.sueldo_semanal_sugerido_usd !== null ? String(c.sueldo_semanal_sugerido_usd) : '',
    })
    setModalCargo(true)
  }

  const guardarCargo = async (e) => {
    if (e) e.preventDefault()
    if (!formCargo.nombre_cargo.trim()) {
      alert('Ingresa el nombre del cargo.')
      return
    }

    setGuardando(true)
    try {
      const payload = {
        nombre_cargo: formCargo.nombre_cargo.trim(),
        sueldo_semanal_sugerido_usd: Number(formCargo.sueldo_semanal_sugerido_usd || 0),
      }

      if (editandoCargoId) {
        const { error } = await supabase
          .from('nomina_cargos')
          .update(payload)
          .eq('id', editandoCargoId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('nomina_cargos').insert([payload])
        if (error) throw error
      }

      setModalCargo(false)
      setMensajeBanner({
        tipo: 'exito',
        texto: `Cargo "${formCargo.nombre_cargo}" guardado con éxito.`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error al guardar cargo: ${err.message}`)
    } finally {
      setGuardando(false)
    }
  }

  const eliminarCargo = async (c) => {
    const enUso = empleados.filter((e) => String(e.cargo_id) === String(c.id)).length
    if (enUso > 0) {
      alert(`No puedes eliminar este cargo porque tiene ${enUso} trabajador(es) asignado(s).`)
      return
    }
    if (!window.confirm(`¿Seguro que deseas eliminar el cargo "${c.nombre_cargo}"?`)) return
    try {
      const { error } = await supabase.from('nomina_cargos').delete().eq('id', c.id)
      if (error) throw error
      setMensajeBanner({
        tipo: 'exito',
        texto: `Cargo eliminado correctamente.`,
      })
      await cargarDatos()
    } catch (err) {
      alert(`Error eliminando cargo: ${err.message}`)
    }
  }

  // Personal filtrado
  const personalFiltrado = useMemo(() => {
    return empleados.filter((e) => {
      const coincideBusqueda =
        !busquedaPersonal ||
        e.nombre_completo?.toLowerCase().includes(busquedaPersonal.toLowerCase()) ||
        e.cedula?.toLowerCase().includes(busquedaPersonal.toLowerCase()) ||
        e.cargo?.toLowerCase().includes(busquedaPersonal.toLowerCase())

      const coincideEstado =
        filtroEstadoPersonal === 'TODOS' || e.estado === filtroEstadoPersonal

      return coincideBusqueda && coincideEstado
    })
  }, [empleados, busquedaPersonal, filtroEstadoPersonal])

  return (
    <div className="space-y-4 font-sans text-neutral-800">
      {/* =========================================================================
          BANNER DE NOTIFICACIONES
          ========================================================================= */}
      {mensajeBanner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-md border p-3 text-xs font-semibold shadow-sm ${
            mensajeBanner.tipo === 'exito'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : mensajeBanner.tipo === 'error'
                ? 'border-red-300 bg-red-50 text-red-900'
                : 'border-blue-300 bg-blue-50 text-blue-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {mensajeBanner.tipo === 'exito' && <CheckCircle2 size={16} className="text-emerald-600" />}
            {mensajeBanner.tipo === 'error' && <AlertTriangle size={16} className="text-red-600" />}
            {mensajeBanner.tipo === 'info' && <Clock size={16} className="text-blue-600" />}
            <span>{mensajeBanner.texto}</span>
          </div>
          <button
            onClick={() => setMensajeBanner(null)}
            className="rounded p-0.5 text-neutral-400 hover:text-neutral-700"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* =========================================================================
          TARJETAS KPI SUPERIORES (INDUSTRIAL ERP)
          ========================================================================= */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Empleados Activos */}
        <div
          className="flex items-center justify-between rounded-md border border-neutral-800 bg-[#111111] p-3.5 text-white shadow"
          style={{ borderLeft: `4px solid ${NARANJA}` }}
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Personal Activo
            </span>
            <div className="mt-1 font-mono text-2xl font-black text-white">
              {kpis.totalActivos} <span className="text-xs font-normal text-neutral-400">trabajadores</span>
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400">Jornada 6 días (Lunes a Sábado)</p>
          </div>
          <div className="rounded-lg bg-neutral-900 p-2.5 text-[#FF5500]">
            <Users size={22} />
          </div>
        </div>

        {/* KPI 2: Nómina Semanal Estimada */}
        <div
          className="flex items-center justify-between rounded-md border border-neutral-800 bg-[#111111] p-3.5 text-white shadow"
          style={{ borderLeft: `4px solid ${NARANJA}` }}
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Nómina Estimada / Semana
            </span>
            <div className="mt-1 font-mono text-xl font-black text-[#FF5500]">
              ${fmtUSD(kpis.totalEstimadoUSD)}
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-neutral-300">
              {tasa > 0 ? `Bs. ${fmtVES(kpis.totalEstimadoVES)}` : 'Tasa oficial no fijada'}
            </p>
          </div>
          <div className="rounded-lg bg-neutral-900 p-2.5 text-[#FF5500]">
            <DollarSign size={22} />
          </div>
        </div>

        {/* KPI 3: Descuentos Semana */}
        <div
          className="flex items-center justify-between rounded-md border border-neutral-800 bg-[#111111] p-3.5 text-white shadow"
          style={{ borderLeft: '4px solid #f59e0b' }}
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Descuentos de la Semana
            </span>
            <div className="mt-1 font-mono text-xl font-black text-amber-400">
              -${fmtUSD(kpis.totalDescuentosSemana)}
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400">Faltas injustificadas + Vales</p>
          </div>
          <div className="rounded-lg bg-neutral-900 p-2.5 text-amber-400">
            <CalendarX size={22} />
          </div>
        </div>

        {/* KPI 4: Total Liquidado */}
        <div
          className="flex items-center justify-between rounded-md border border-neutral-800 bg-[#111111] p-3.5 text-white shadow"
          style={{ borderLeft: '4px solid #10b981' }}
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Liquidado en la Semana
            </span>
            <div className="mt-1 font-mono text-xl font-black text-emerald-400">
              ${fmtUSD(kpis.totalPagadoUSD)}
            </div>
            <p className="mt-0.5 text-[10px] text-neutral-400">
              {kpis.pendientesCount > 0 ? `${kpis.pendientesCount} pendientes por pagar` : '¡Todos liquidados!'}
            </p>
          </div>
          <div className="rounded-lg bg-neutral-900 p-2.5 text-emerald-400">
            <CheckCircle2 size={22} />
          </div>
        </div>
      </div>

      {/* =========================================================================
          BARRA DE NAVEGACIÓN DE SUB-PESTAÑAS
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPestaña('semanal')}
            className={`flex items-center gap-2 rounded px-3 py-2 text-xs font-bold transition-colors ${
              pestaña === 'semanal'
                ? 'bg-[#111111] text-white shadow'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            style={pestaña === 'semanal' ? { borderBottom: `3px solid ${NARANJA}` } : {}}
          >
            <Banknote size={15} color={pestaña === 'semanal' ? NARANJA : undefined} />
            <span>Generar Nómina Semanal (Planilla)</span>
          </button>

          <button
            onClick={() => setPestaña('personal')}
            className={`flex items-center gap-2 rounded px-3 py-2 text-xs font-bold transition-colors ${
              pestaña === 'personal'
                ? 'bg-[#111111] text-white shadow'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            style={pestaña === 'personal' ? { borderBottom: `3px solid ${NARANJA}` } : {}}
          >
            <Users size={15} color={pestaña === 'personal' ? NARANJA : undefined} />
            <span>Personal, Faltas y Adelantos (~20)</span>
          </button>

          <button
            onClick={() => setPestaña('cargos')}
            className={`flex items-center gap-2 rounded px-3 py-2 text-xs font-bold transition-colors ${
              pestaña === 'cargos'
                ? 'bg-[#111111] text-white shadow'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
            style={pestaña === 'cargos' ? { borderBottom: `3px solid ${NARANJA}` } : {}}
          >
            <Briefcase size={15} color={pestaña === 'cargos' ? NARANJA : undefined} />
            <span>Cargos y Tabulador ({cargos.length})</span>
          </button>
        </div>

        <button
          onClick={cargarDatos}
          disabled={cargando}
          className="flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-bold text-neutral-700 hover:border-[#FF5500] hover:text-[#FF5500] disabled:opacity-50"
          title="Recargar datos de nómina"
        >
          <RotateCcw size={13} className={cargando ? 'animate-spin' : ''} color={NARANJA} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* =========================================================================
          PESTAÑA A: GENERAR NÓMINA SEMANAL (PLANILLA DE PAGO)
          ========================================================================= */}
      {pestaña === 'semanal' && (
        <div className="space-y-3">
          {/* Barra de control de semana */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 bg-[#111111] p-3 text-white shadow"
            style={{ borderLeft: `4px solid ${NARANJA}` }}
          >
            <div className="flex items-center gap-2">
              <div className="rounded bg-neutral-900 p-1.5 text-[#FF5500]">
                <Calendar size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Período Semanal Seleccionado
                </span>
                <div className="font-mono text-sm font-black text-white">{rangoSemana.textoSemana}</div>
              </div>
            </div>

            {/* Controles de navegación de fecha */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={irSemanaAnterior}
                className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs font-bold text-neutral-200 hover:border-[#FF5500]"
                title="Semana anterior"
              >
                <ChevronLeft size={14} />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <button
                onClick={irSemanaActual}
                className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-bold text-neutral-200 hover:border-[#FF5500]"
                title="Ir a la semana en curso"
              >
                Semana Actual
              </button>

              <button
                onClick={irSemanaSiguiente}
                className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs font-bold text-neutral-200 hover:border-[#FF5500]"
                title="Semana siguiente"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight size={14} />
              </button>

              <button
                onClick={() => cargarPagosSemana(rangoSemana)}
                className="ml-2 flex items-center gap-1.5 rounded px-3 py-1 text-xs font-bold text-white shadow hover:brightness-110"
                style={{ background: NARANJA }}
                title="Vuelve a cargar a los empleados activos con sus faltas y vales"
              >
                <RotateCcw size={13} />
                <span>Cargar / Inicializar Semana</span>
              </button>
            </div>
          </div>

          {/* Barra de acciones de exportación y liquidación masiva */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 bg-white p-2.5 shadow-sm">
            <div className="text-xs text-neutral-600">
              <b>{planilla.length}</b> trabajadores en la planilla · Jornada estándar de 6 días laborables
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => generarPlanillaSemanalNominaPDF(planilla, rangoSemana.textoSemana, tasa)}
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-bold text-white hover:border-[#FF5500]"
                title="Generar planilla en PDF para imprimir y firmar"
              >
                <FileText size={14} color={NARANJA} />
                <span>Planilla PDF</span>
              </button>

              <button
                onClick={() => exportarPlanillaNominaExcel(planilla, rangoSemana.textoSemana, tasa)}
                className="flex items-center gap-1.5 rounded border border-emerald-700 bg-emerald-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                title="Exportar planilla a Excel"
              >
                <FileSpreadsheet size={14} />
                <span>Planilla Excel</span>
              </button>

              <button
                onClick={liquidarTodaLaSemana}
                disabled={guardando || kpis.pendientesCount === 0}
                className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-xs font-black text-white shadow hover:brightness-110 disabled:opacity-50"
                style={{ background: NARANJA }}
                title="Liquidar todos los trabajadores pendientes con un solo clic"
              >
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Liquidar Toda la Semana</span>
              </button>
            </div>
          </div>

          {/* Tabla interactiva de nómina semanal */}
          <div className="overflow-x-auto rounded border border-neutral-300 bg-white shadow-sm">
            <table className="w-full text-left text-xs" style={{ color: NEGRO }}>
              <thead className="border-b border-neutral-800 bg-[#1c1c1c] text-white">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider">Trabajador / Cargo</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider">
                    Sueldo Semanal Base
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider">
                    Asistencia y Faltas
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider">
                    Bonos / Extras
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider">
                    Adelantos / Vales
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider">
                    Neto a Pagar
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider">
                    Forma de Pago / Estado
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {planilla.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-xs text-neutral-500">
                      No hay empleados activos cargados en la planilla. Ve a la pestaña &quot;Personal&quot; para registrar trabajadores o pulsa &quot;Cargar / Inicializar Semana&quot;.
                    </td>
                  </tr>
                ) : (
                  planilla.map((f) => {
                    const sueldoBase = Number(f.sueldo_base_usd || 0)
                    const valorDia = sueldoBase > 0 ? sueldoBase / 6 : 0
                    const faltas = Number(f.dias_faltados || 0)
                    const descFaltas = Number(f.deducciones_inasistencia_usd || 0)
                    const netoUSD = Number(f.neto_pagar_usd || 0)
                    const netoVES = tasa > 0 ? netoUSD * tasa : 0
                    const estaPagado = f.estado_pago === 'PAGADO'

                    const empOriginal = empleados.find((e) => e.id === f.empleado_id)
                    const telWhatsApp = empOriginal?.telefono || f.telefono

                    return (
                      <tr
                        key={f.empleado_id}
                        className={`transition-colors hover:bg-orange-50/40 ${estaPagado ? 'bg-emerald-50/20' : ''}`}
                      >
                        {/* 1. Trabajador y Cargo */}
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-neutral-900">{f.empleado_nombre}</div>
                          <div className="text-[11px] text-neutral-500 font-semibold">
                            {f.cargo} · {f.cedula || 'Sin Cédula'}
                          </div>
                          {f.datos_pago_movil && (
                            <div className="text-[10px] text-neutral-400 font-mono truncate max-w-[200px]" title={f.datos_pago_movil}>
                              📱 {f.datos_pago_movil}
                            </div>
                          )}
                        </td>

                        {/* 2. Sueldo Semanal Base */}
                        <td className="px-3 py-2.5 text-right font-mono">
                          <div className="font-bold text-neutral-900">${fmtUSD(sueldoBase)}</div>
                          <div className="text-[10px] text-neutral-500 font-normal">
                            (${fmtUSD(valorDia)} / día)
                          </div>
                        </td>

                        {/* 3. Control de Asistencia y Faltas */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              disabled={estaPagado || faltas <= 0}
                              onClick={() =>
                                actualizarFilaPlanilla(f.empleado_id, {
                                  dias_faltados: Math.max(0, faltas - 0.5),
                                })
                              }
                              className="h-6 w-6 rounded border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                              title="Restar 0.5 días"
                            >
                              -
                            </button>

                            <div className="min-w-[70px] text-center font-mono">
                              <span className={`font-bold ${faltas > 0 ? 'text-red-600' : 'text-neutral-800'}`}>
                                {faltas > 0 ? `${faltas} falta(s)` : '0 faltas'}
                              </span>
                              <div className="text-[10px] text-neutral-500 font-normal">
                                {f.dias_laborados} de 6 trab.
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={estaPagado || faltas >= 6}
                              onClick={() =>
                                actualizarFilaPlanilla(f.empleado_id, {
                                  dias_faltados: Math.min(6, faltas + 0.5),
                                })
                              }
                              className="h-6 w-6 rounded border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                              title="Sumar 0.5 días"
                            >
                              +
                            </button>
                          </div>

                          {/* Casilla de justificación sin descuento y detalle */}
                          <div className="mt-1 text-center">
                            <label className="inline-flex items-center gap-1 text-[10px] text-neutral-600 cursor-pointer">
                              <input
                                type="checkbox"
                                disabled={estaPagado}
                                checked={Boolean(f.falta_justificada)}
                                onChange={(e) =>
                                  actualizarFilaPlanilla(f.empleado_id, {
                                    falta_justificada: e.target.checked,
                                  })
                                }
                                className="accent-[#FF5500] h-3 w-3"
                              />
                              <span>Justificada (No desc.)</span>
                            </label>

                            {descFaltas > 0 && !f.falta_justificada && (
                              <div className="font-mono text-[10px] font-bold text-red-600">
                                Descuento: -${fmtUSD(descFaltas)}
                              </div>
                            )}

                            {f.detalle_faltas && (
                              <div
                                className="text-[9px] text-neutral-500 truncate max-w-[170px] mx-auto italic"
                                title={f.detalle_faltas}
                              >
                                {f.detalle_faltas}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 4. Bonos / Horas Extra */}
                        <td className="px-3 py-2.5 text-right font-mono">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            disabled={estaPagado}
                            value={f.bonos_extras_usd || ''}
                            onChange={(e) =>
                              actualizarFilaPlanilla(f.empleado_id, {
                                bonos_extras_usd: e.target.value === '' ? 0 : Number(e.target.value),
                              })
                            }
                            placeholder="0.00"
                            className="w-20 rounded border border-neutral-300 bg-white px-2 py-1 text-right text-xs font-bold text-emerald-700 outline-none focus:border-[#FF5500] disabled:bg-neutral-100"
                          />
                        </td>

                        {/* 5. Adelantos / Vales */}
                        <td className="px-3 py-2.5 text-right font-mono">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            disabled={estaPagado}
                            value={f.descuento_adelantos_usd || ''}
                            onChange={(e) =>
                              actualizarFilaPlanilla(f.empleado_id, {
                                descuento_adelantos_usd:
                                  e.target.value === '' ? 0 : Number(e.target.value),
                              })
                            }
                            placeholder="0.00"
                            className="w-20 rounded border border-neutral-300 bg-white px-2 py-1 text-right text-xs font-bold text-amber-700 outline-none focus:border-[#FF5500] disabled:bg-neutral-100"
                          />
                        </td>

                        {/* 6. Neto a Pagar USD / Bs */}
                        <td className="px-3 py-2.5 text-right font-mono">
                          <div className="text-sm font-black" style={{ color: NARANJA }}>
                            ${fmtUSD(netoUSD)}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-semibold">
                            {tasa > 0 ? `Bs. ${fmtVES(netoVES)}` : '—'}
                          </div>
                        </td>

                        {/* 7. Forma de Pago y Estado */}
                        <td className="px-3 py-2.5 text-center">
                          <select
                            disabled={estaPagado}
                            value={f.metodo_pago}
                            onChange={(e) =>
                              actualizarFilaPlanilla(f.empleado_id, { metodo_pago: e.target.value })
                            }
                            className="w-32 rounded border border-neutral-300 bg-white px-1.5 py-1 text-[11px] font-bold text-neutral-800 outline-none focus:border-[#FF5500] disabled:bg-neutral-100"
                          >
                            {METODOS_PAGO.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <div className="mt-1">
                            {estaPagado ? (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                                <Check size={11} /> PAGADO
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                                PENDIENTE
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 8. Acciones por trabajador */}
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {!estaPagado ? (
                              <button
                                onClick={() => liquidarEmpleado(f)}
                                disabled={guardando}
                                className="rounded px-2.5 py-1 text-[11px] font-black text-white shadow hover:brightness-110 disabled:opacity-50"
                                style={{ background: NARANJA }}
                                title="Liquidar pago de este trabajador y reiniciar sus faltas/vales"
                              >
                                Pagar
                              </button>
                            ) : (
                              <span className="text-[11px] font-bold text-emerald-700">✓ Listo</span>
                            )}

                            {/* Recibo PDF */}
                            <button
                              type="button"
                              onClick={() => generarReciboNominaPDF(f, tasa)}
                              className="rounded border border-neutral-300 bg-white p-1 text-neutral-600 hover:border-[#FF5500] hover:text-[#FF5500]"
                              title="Descargar Recibo de Pago en PDF (Eco-Print)"
                            >
                              <FileText size={15} />
                            </button>

                            {/* WhatsApp */}
                            {telWhatsApp && (
                              <a
                                href={`https://wa.me/${telWhatsApp.replace(/\D/g, '')}?text=${construirMensajeWhatsAppNomina(
                                  { pago: f, empleado: empOriginal, tasa },
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded border border-emerald-300 bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100"
                                title="Enviar desglose de pago al trabajador por WhatsApp"
                              >
                                <WhatsAppIcon size={15} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA B: PERSONAL, FALTAS Y ADELANTOS (~20 EMPLEADOS)
          ========================================================================= */}
      {pestaña === 'personal' && (
        <div className="space-y-3">
          {/* Barra superior de personal */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-2.5 py-1.5">
                <Search size={14} color={NARANJA} />
                <input
                  value={busquedaPersonal}
                  onChange={(e) => setBusquedaPersonal(e.target.value)}
                  placeholder="Buscar trabajador o cargo..."
                  className="w-48 bg-transparent text-xs text-neutral-900 outline-none"
                />
              </div>

              <select
                value={filtroEstadoPersonal}
                onChange={(e) => setFiltroEstadoPersonal(e.target.value)}
                className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold text-neutral-700 outline-none"
              >
                <option value="TODOS">Todos los estados</option>
                {ESTADOS_EMPLEADO.map((est) => (
                  <option key={est} value={est}>
                    {est}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={descargarPlantillaEmpleadosExcel}
                className="flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-bold text-neutral-700 hover:border-[#FF5500]"
                title="Descargar plantilla de Excel para importar nómina"
              >
                <Download size={13} color={NARANJA} />
                <span>Plantilla Excel</span>
              </button>

              <input
                ref={inputImportarPersonalRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={manejarImportacionPersonalExcel}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => inputImportarPersonalRef.current?.click()}
                className="flex items-center gap-1.5 rounded border border-amber-600/60 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
                title="Subir archivo Excel con la lista de trabajadores"
              >
                <Upload size={13} color={NARANJA} />
                <span>Importar Personal</span>
              </button>

              <button
                type="button"
                onClick={abrirModalNuevoEmpleado}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold text-white shadow hover:brightness-110"
                style={{ background: NARANJA }}
              >
                <Plus size={14} />
                <span>+ Nuevo Trabajador</span>
              </button>
            </div>
          </div>

          {/* Listado de Personal */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {personalFiltrado.length === 0 ? (
              <div className="col-span-full rounded border border-dashed border-neutral-300 p-8 text-center text-xs text-neutral-500">
                No hay trabajadores que coincidan con la búsqueda. Haz clic en &quot;+ Nuevo Trabajador&quot; o importa tu nómina desde Excel.
              </div>
            ) : (
              personalFiltrado.map((emp) => {
                const sueldoBase = Number(emp.sueldo_semanal_usd || 0)
                const valorDia = sueldoBase > 0 ? sueldoBase / 6 : 0
                const faltas = Number(emp.faltas_semana_actual || 0)
                const vales = Number(emp.saldo_adelantos_usd || 0)

                return (
                  <div
                    key={emp.id}
                    className="flex flex-col justify-between rounded-md border border-neutral-200 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md"
                    style={{ borderTop: `3px solid ${emp.estado === 'ACTIVO' ? NARANJA : '#9ca3af'}` }}
                  >
                    <div>
                      {/* Cabecera trabajador */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-neutral-900">{emp.nombre_completo}</h4>
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-neutral-600">
                            {emp.cargo || 'Colaborador'}
                          </span>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${
                            emp.estado === 'ACTIVO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-neutral-100 text-neutral-600'
                          }`}
                        >
                          {emp.estado}
                        </span>
                      </div>

                      {/* Información de contacto y cédula */}
                      <div className="mt-2.5 space-y-1 text-xs text-neutral-600">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400">Cédula:</span>
                          <span className="font-mono font-bold text-neutral-800">{emp.cedula || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400">Teléfono:</span>
                          <span className="font-mono text-neutral-800">{emp.telefono || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400">Sueldo Base Semanal:</span>
                          <span className="font-mono font-bold text-neutral-900">
                            ${fmtUSD(sueldoBase)}{' '}
                            <span className="text-[10px] text-neutral-400 font-normal">
                              (${fmtUSD(valorDia)}/día)
                            </span>
                          </span>
                        </div>
                        {emp.datos_pago_movil && (
                          <div className="rounded bg-neutral-50 p-1.5 text-[10px] text-neutral-600 font-mono">
                            📱 {emp.datos_pago_movil}
                          </div>
                        )}
                      </div>

                      {/* Contadores operativos de la semana actual */}
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-neutral-100 bg-neutral-50 p-2 text-center text-xs">
                        <div>
                          <span className="text-[9px] font-bold uppercase text-neutral-400">
                            Faltas Semana
                          </span>
                          <div
                            className={`font-mono font-black ${faltas > 0 ? 'text-red-600' : 'text-neutral-700'}`}
                          >
                            {faltas} día(s)
                          </div>
                          {emp.detalle_faltas_semana && (
                            <p
                              className="text-[9px] text-neutral-500 truncate italic"
                              title={emp.detalle_faltas_semana}
                            >
                              {emp.detalle_faltas_semana}
                            </p>
                          )}
                        </div>

                        <div>
                          <span className="text-[9px] font-bold uppercase text-neutral-400">
                            Vales / Adelantos
                          </span>
                          <div
                            className={`font-mono font-black ${vales > 0 ? 'text-amber-600' : 'text-neutral-700'}`}
                          >
                            ${fmtUSD(vales)}
                          </div>
                          <p className="text-[9px] text-neutral-400">por descontar</p>
                        </div>
                      </div>
                    </div>

                    {/* Botones de acción rápida operativa */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-neutral-100 pt-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => abrirModalFalta(emp)}
                          className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-800 hover:bg-red-100"
                          title="Registrar inasistencia o falta de este trabajador"
                        >
                          <CalendarX size={13} />
                          <span>Falta</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => abrirModalVale(emp)}
                          className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                          title="Registrar vale o adelanto de dinero dado al trabajador"
                        >
                          <Banknote size={13} />
                          <span>Vale</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => abrirModalEditarEmpleado(emp)}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                          title="Editar ficha del trabajador"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarEmpleado(emp)}
                          className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                          title="Eliminar trabajador de la nómina"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA C: CARGOS Y TABULADOR DE SUELDOS
          ========================================================================= */}
      {pestaña === 'cargos' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-neutral-200 bg-white p-3 shadow-sm">
            <div>
              <h3 className="font-bold text-neutral-900">Tabulador de Cargos y Sueldos Semanales</h3>
              <p className="text-xs text-neutral-500">
                Define los roles y los sueldos sugeridos en dólares para el personal del galpón y administrativo.
              </p>
            </div>

            <button
              type="button"
              onClick={abrirModalNuevoCargo}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold text-white shadow hover:brightness-110"
              style={{ background: NARANJA }}
            >
              <Plus size={14} />
              <span>+ Nuevo Cargo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cargos.length === 0 ? (
              <div className="col-span-full rounded border border-dashed border-neutral-300 p-8 text-center text-xs text-neutral-500">
                No hay cargos registrados. Haz clic en &quot;+ Nuevo Cargo&quot; para crear los puestos de tu empresa.
              </div>
            ) : (
              cargos.map((c) => {
                const nombreCargo = c.nombre_cargo || c.nombre || 'Cargo'
                const sueldoSugerido = Number(c.sueldo_semanal_sugerido_usd || 0)
                const empleadosEnCargo = empleados.filter(
                  (e) => String(e.cargo_id) === String(c.id) || e.cargo === nombreCargo,
                )

                return (
                  <div
                    key={c.id}
                    className="flex flex-col justify-between rounded-md border border-neutral-200 bg-white p-3.5 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-neutral-900">{nombreCargo}</h4>
                        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
                          {empleadosEnCargo.length} activo(s)
                        </span>
                      </div>

                      <div className="mt-3">
                        <span className="text-[10px] font-bold uppercase text-neutral-400">
                          Sueldo Semanal Base Sugerido
                        </span>
                        <div className="font-mono text-xl font-black" style={{ color: NARANJA }}>
                          ${fmtUSD(sueldoSugerido)}
                        </div>
                        <p className="font-mono text-xs text-neutral-500">
                          {tasa > 0 ? `Bs. ${fmtVES(sueldoSugerido * tasa)}` : '—'}{' '}
                          <span className="text-[10px] font-normal">(${fmtUSD(sueldoSugerido / 6)} / día)</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-1 border-t border-neutral-100 pt-2">
                      <button
                        type="button"
                        onClick={() => abrirModalEditarCargo(c)}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                        title="Editar cargo"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarCargo(c)}
                        className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar cargo"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL CREAR / EDITAR EMPLEADO
          ========================================================================= */}
      {modalEmpleado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-neutral-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="font-bold text-neutral-900">
                {editandoEmpleadoId ? 'Editar Trabajador' : 'Registrar Nuevo Trabajador'}
              </h3>
              <button
                onClick={() => setModalEmpleado(false)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardarEmpleado} className="space-y-3 p-4 text-xs">
              <div>
                <label className="mb-1 block font-bold text-neutral-700">Nombre Completo *</label>
                <input
                  required
                  value={formEmpleado.nombre_completo}
                  onChange={(e) =>
                    setFormEmpleado((prev) => ({ ...prev, nombre_completo: e.target.value }))
                  }
                  placeholder="Ej: Pedro Pérez"
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-bold text-neutral-700">Cédula / Identidad</label>
                  <input
                    value={formEmpleado.cedula}
                    onChange={(e) => setFormEmpleado((prev) => ({ ...prev, cedula: e.target.value }))}
                    placeholder="V-18456123"
                    className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-neutral-700">Teléfono (WhatsApp)</label>
                  <input
                    value={formEmpleado.telefono}
                    onChange={(e) =>
                      setFormEmpleado((prev) => ({ ...prev, telefono: e.target.value }))
                    }
                    placeholder="0414-1234567"
                    className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-bold text-neutral-700">Cargo / Puesto</label>
                  <select
                    value={formEmpleado.cargo_id}
                    onChange={(e) => {
                      const sel = cargos.find((c) => String(c.id) === e.target.value)
                      setFormEmpleado((prev) => ({
                        ...prev,
                        cargo_id: e.target.value,
                        cargo: sel?.nombre_cargo || prev.cargo,
                        sueldo_semanal_usd:
                          prev.sueldo_semanal_usd === '' && sel?.sueldo_semanal_sugerido_usd
                            ? String(sel.sueldo_semanal_sugerido_usd)
                            : prev.sueldo_semanal_usd,
                      }))
                    }}
                    className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                  >
                    <option value="">Seleccionar cargo...</option>
                    {cargos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre_cargo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-neutral-700">Sueldo Semanal (USD) *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={formEmpleado.sueldo_semanal_usd}
                    onChange={(e) =>
                      setFormEmpleado((prev) => ({ ...prev, sueldo_semanal_usd: e.target.value }))
                    }
                    placeholder="70.00"
                    className="w-full rounded border border-neutral-300 px-2.5 py-1.5 font-mono text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">
                  Datos de Pago Móvil / Transferencia
                </label>
                <input
                  value={formEmpleado.datos_pago_movil}
                  onChange={(e) =>
                    setFormEmpleado((prev) => ({ ...prev, datos_pago_movil: e.target.value }))
                  }
                  placeholder="Ej: 04141234567 · Banesco · V-18456123"
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">Estado del Trabajador</label>
                <select
                  value={formEmpleado.estado}
                  onChange={(e) =>
                    setFormEmpleado((prev) => ({ ...prev, estado: e.target.value }))
                  }
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs font-bold text-neutral-800 outline-none focus:border-[#FF5500]"
                >
                  {ESTADOS_EMPLEADO.map((est) => (
                    <option key={est} value={est}>
                      {est}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  onClick={() => setModalEmpleado(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded px-4 py-1.5 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-50"
                  style={{ background: NARANJA }}
                >
                  {guardando ? 'Guardando...' : 'Guardar Trabajador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL REGISTRAR FALTA
          ========================================================================= */}
      {modalFalta && empleadoFalta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-neutral-900">Registrar Inasistencia / Falta</h3>
                <p className="text-[11px] text-neutral-500 font-semibold">
                  {empleadoFalta.nombre_completo}
                </p>
              </div>
              <button
                onClick={() => setModalFalta(false)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardarFalta} className="space-y-3 p-4 text-xs">
              <div>
                <label className="mb-1 block font-bold text-neutral-700">Fecha de la Falta</label>
                <input
                  type="date"
                  required
                  value={formFalta.fecha}
                  onChange={(e) => setFormFalta((prev) => ({ ...prev, fecha: e.target.value }))}
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">Cantidad de Días</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormFalta((prev) => ({ ...prev, cantidad: 1 }))}
                    className={`rounded border py-1.5 text-center text-xs font-bold ${
                      formFalta.cantidad === 1
                        ? 'border-[#FF5500] bg-orange-50 text-[#FF5500]'
                        : 'border-neutral-300 bg-white text-neutral-700'
                    }`}
                  >
                    1 Día Completo
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormFalta((prev) => ({ ...prev, cantidad: 0.5 }))}
                    className={`rounded border py-1.5 text-center text-xs font-bold ${
                      formFalta.cantidad === 0.5
                        ? 'border-[#FF5500] bg-orange-50 text-[#FF5500]'
                        : 'border-neutral-300 bg-white text-neutral-700'
                    }`}
                  >
                    0.5 (Medio Día)
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">Tipo de Inasistencia</label>
                <select
                  value={formFalta.tipo}
                  onChange={(e) => setFormFalta((prev) => ({ ...prev, tipo: e.target.value }))}
                  className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs font-bold text-neutral-800 outline-none focus:border-[#FF5500]"
                >
                  <option value="Injustificada">Injustificada (Descontar de nómina)</option>
                  <option value="Permiso / Justificada">Permiso / Justificada (Con o sin descuento)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">Motivo / Observación</label>
                <input
                  value={formFalta.motivo}
                  onChange={(e) => setFormFalta((prev) => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ej: Problemas personales, lluvia, reposo médico..."
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  onClick={() => setModalFalta(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded px-4 py-1.5 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-50"
                  style={{ background: NARANJA }}
                >
                  {guardando ? 'Guardando...' : 'Anotar Falta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL REGISTRAR VALE / ADELANTO
          ========================================================================= */}
      {modalVale && empleadoVale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <div>
                <h3 className="font-bold text-neutral-900">Registrar Vale / Adelanto</h3>
                <p className="text-[11px] text-neutral-500 font-semibold">
                  {empleadoVale.nombre_completo}
                </p>
              </div>
              <button
                onClick={() => setModalVale(false)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardarVale} className="space-y-3 p-4 text-xs">
              <div>
                <label className="mb-1 block font-bold text-neutral-700">Monto del Adelanto (USD) *</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  autoFocus
                  value={formVale.monto_usd}
                  onChange={(e) => setFormVale((prev) => ({ ...prev, monto_usd: e.target.value }))}
                  placeholder="Ej: 20.00"
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 font-mono text-sm font-bold text-neutral-900 outline-none focus:border-[#FF5500]"
                />
                {tasa > 0 && formVale.monto_usd && (
                  <p className="mt-1 font-mono text-[10px] text-neutral-500">
                    ≈ Bs. {fmtVES(Number(formVale.monto_usd) * tasa)} (a la tasa del día)
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">Concepto / Motivo</label>
                <input
                  value={formVale.motivo}
                  onChange={(e) => setFormVale((prev) => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ej: Adelanto de nómina, gastos médicos..."
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-800">
                Saldo acumulado actual: <b>${fmtUSD(empleadoVale.saldo_adelantos_usd || 0)}</b>. Este monto se precargará el sábado para ser descontado en la planilla semanal.
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  onClick={() => setModalVale(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded px-4 py-1.5 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-50"
                  style={{ background: NARANJA }}
                >
                  {guardando ? 'Guardando...' : 'Anotar Adelanto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL CREAR / EDITAR CARGO
          ========================================================================= */}
      {modalCargo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-neutral-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="font-bold text-neutral-900">
                {editandoCargoId ? 'Editar Cargo' : 'Crear Nuevo Cargo'}
              </h3>
              <button
                onClick={() => setModalCargo(false)}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardarCargo} className="space-y-3 p-4 text-xs">
              <div>
                <label className="mb-1 block font-bold text-neutral-700">Nombre del Cargo *</label>
                <input
                  required
                  value={formCargo.nombre_cargo}
                  onChange={(e) =>
                    setFormCargo((prev) => ({ ...prev, nombre_cargo: e.target.value }))
                  }
                  placeholder="Ej: Chofer / Despachador"
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-neutral-700">
                  Sueldo Semanal Sugerido (USD) *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={formCargo.sueldo_semanal_sugerido_usd}
                  onChange={(e) =>
                    setFormCargo((prev) => ({
                      ...prev,
                      sueldo_semanal_sugerido_usd: e.target.value,
                    }))
                  }
                  placeholder="Ej: 80.00"
                  className="w-full rounded border border-neutral-300 px-2.5 py-1.5 font-mono text-xs text-neutral-900 outline-none focus:border-[#FF5500]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  onClick={() => setModalCargo(false)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded px-4 py-1.5 text-xs font-bold text-white shadow hover:brightness-110 disabled:opacity-50"
                  style={{ background: NARANJA }}
                >
                  {guardando ? 'Guardando...' : 'Guardar Cargo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
