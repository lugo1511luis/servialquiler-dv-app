import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  cargarLogoBase64,
  fmtFecha,
  fmtFechaHora,
  fmtNum,
  fmtUSD,
  fmtVES,
  hoyISO,
  num,
} from './formatters'

// ---------------------------------------------------------------------------
// Membrete Corporativo común para PDFs (Eco-Print: Fondo Blanco y Ahorro de Tinta)
// ---------------------------------------------------------------------------
const dibujarEncabezadoCorporativo = (
  doc,
  logo,
  tituloReporte,
  subtituloDerecha1,
  subtituloDerecha2,
) => {
  const ancho = doc.internal.pageSize.getWidth()

  // Fondo 100% blanco para impresión económica
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, ancho, 28, 'F')

  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 4, 20, 20)
    } catch {
      // Continúa sin logo si falla
    }
  }

  // Nombre de empresa en gris oscuro/negro corporativo
  doc.setTextColor(17, 17, 17)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('ServiAlquiler DV, C.A.', logo ? 36 : 12, 12)

  // Título del reporte en naranja de acento
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 85, 0)
  doc.text(tituloReporte, logo ? 36 : 12, 19)

  // Subtítulos a la derecha en gris oscuro
  doc.setTextColor(55, 65, 81)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  if (subtituloDerecha1) doc.text(subtituloDerecha1, ancho - 12, 12, { align: 'right' })
  if (subtituloDerecha2) doc.text(subtituloDerecha2, ancho - 12, 19, { align: 'right' })

  // Línea divisoria fina de acento naranja (#FF5500)
  doc.setDrawColor(255, 85, 0)
  doc.setLineWidth(0.8)
  doc.line(12, 26, ancho - 12, 26)
}

// ---------------------------------------------------------------------------
// 1. Exportación y Plantilla de Inventario de Galpón: PDF, Excel (.xlsx) y CSV
// ---------------------------------------------------------------------------

// Plantilla descargable de Excel SIN columna Codigo (se autogenera al importar)
export const descargarPlantillaInventarioExcel = () => {
  const ejemplo = [
    {
      Material: 'Andamio tubular estándar 1.50m con cruceta',
      Categoria: 'Andamios',
      Stock_Total: 50,
      Disponible_Galpon: 50,
      Precio_Dia_USD: 2.5,
    },
    {
      Material: 'Puntal metálico telescópico 3.50m',
      Categoria: 'Puntales',
      Stock_Total: 80,
      Disponible_Galpon: 80,
      Precio_Dia_USD: 1.5,
    },
  ]

  const hoja = XLSX.utils.json_to_sheet(ejemplo, {
    header: ['Material', 'Categoria', 'Stock_Total', 'Disponible_Galpon', 'Precio_Dia_USD'],
  })
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Plantilla_Inventario')
  XLSX.writeFile(libro, 'Plantilla_Importar_Inventario_ServiAlquiler.xlsx')
}

// Plantilla descargable de Excel para Importación Masiva de Clientes
export const descargarPlantillaClientesExcel = () => {
  const columnas = [
    'nombre_razon_social',
    'rif_cedula',
    'telefono',
    'direccion_obra',
    'correo',
    'saldo_pendiente_usd',
  ]

  const ejemplos = [
    {
      nombre_razon_social: 'Constructora Los Andes, C.A.',
      rif_cedula: 'J-40123456-7',
      telefono: '0414-1234567',
      direccion_obra: 'Av. Principal, Obra Residencias Sol',
      correo: 'contacto@constructora.com',
      saldo_pendiente_usd: 0,
    },
    {
      nombre_razon_social: 'Inversiones del Centro, S.A.',
      rif_cedula: 'J-30987654-2',
      telefono: '0424-9876543',
      direccion_obra: 'Calle Bolívar c/c Miranda, Edif. Torre Sur',
      correo: 'administracion@inversionescentro.com',
      saldo_pendiente_usd: 0,
    },
  ]

  const hoja = XLSX.utils.json_to_sheet(ejemplos, { header: columnas })
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Plantilla_Clientes')
  XLSX.writeFile(libro, 'Plantilla_Clientes_ServiAlquiler.xlsx')
}

export const exportarInventarioPDF = async (inventario, tasaDelDia) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await cargarLogoBase64()
  const tasa = num(tasaDelDia)

  dibujarEncabezadoCorporativo(
    doc,
    logo,
    'REPORTE DE INVENTARIO Y EQUIPOS EN GALPÓN',
    `Fecha: ${fmtFecha(hoyISO())}`,
    `Tasa del Día: ${tasa > 0 ? fmtVES(tasa) : '—'}`,
  )

  const filas = inventario.map((f) => {
    const propios = num(f.stock_propio_prestado)
    const externos = num(f.stock_externo_prestado)
    const precio = num(f.precio_alquiler_dia_usd)
    return [
      f.codigo ?? '—',
      f.material ?? '—',
      f.categoria ?? '—',
      fmtNum(f.stock_propio_total),
      fmtNum(f.stock_propio_disponible),
      fmtNum(f.stock_propio_alquilado),
      `${fmtNum(propios + externos)} (${fmtNum(propios)} nuestros / ${fmtNum(externos)} aliados)`,
      fmtUSD(precio),
      tasa > 0 ? fmtVES(precio * tasa) : '—',
    ]
  })

  autoTable(doc, {
    startY: 32,
    head: [
      [
        'Código',
        'Equipo / Material',
        'Categoría',
        'Total Propio',
        'En Galpón',
        'En Obra',
        'Prestados con Aliados',
        'Precio/Día USD',
        'Precio/Día Bs. (Tasa del Día)',
      ],
    ],
    body: filas,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [243, 244, 246], // Fondo gris muy claro (#F3F4F6) Eco-Print
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      lineColor: [209, 213, 219],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right' },
    },
  })

  doc.save(`Inventario_Galpon_ServiAlquiler_${hoyISO()}.pdf`)
}

export const exportarInventarioExcel = (inventario, tasaDelDia) => {
  const tasa = num(tasaDelDia)
  const datos = inventario.map((f) => {
    const precio = num(f.precio_alquiler_dia_usd)
    return {
      Código: f.codigo ?? '',
      'Equipo / Material': f.material ?? '',
      Categoría: f.categoria ?? '',
      'Total Propio': num(f.stock_propio_total),
      'En Galpón (Disponible)': num(f.stock_propio_disponible),
      'Alquilado en Obra': num(f.stock_propio_alquilado),
      'Nuestros Prestados': num(f.stock_propio_prestado),
      'De Aliados en Galpón': num(f.stock_externo_prestado),
      'Total con Aliados': num(f.stock_propio_prestado) + num(f.stock_externo_prestado),
      'Precio por Día (USD)': precio,
      'Precio por Día (Bs. a Tasa del Día)': tasa > 0 ? Number((precio * tasa).toFixed(2)) : 0,
    }
  })

  const hoja = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Inventario_Galpon')
  XLSX.writeFile(libro, `Inventario_Galpon_ServiAlquiler_${hoyISO()}.xlsx`)
}

export const exportarInventarioCSV = (inventario, tasaDelDia) => {
  const tasa = num(tasaDelDia)
  const encabezados = [
    'Codigo',
    'Equipo_Material',
    'Categoria',
    'Total_Propio',
    'En_Galpon_Disponible',
    'Alquilado_En_Obra',
    'Nuestros_Prestados',
    'De_Aliados',
    'Precio_Dia_USD',
    'Precio_Dia_VES_Tasa_Del_Dia',
  ]

  const escapar = (val) => {
    const s = String(val ?? '').replace(/"/g, '""')
    return /[",\n;]/.test(s) ? `"${s}"` : s
  }

  const lineas = [
    encabezados.join(','),
    ...inventario.map((f) => {
      const precio = num(f.precio_alquiler_dia_usd)
      return [
        f.codigo,
        f.material,
        f.categoria,
        num(f.stock_propio_total),
        num(f.stock_propio_disponible),
        num(f.stock_propio_alquilado),
        num(f.stock_propio_prestado),
        num(f.stock_externo_prestado),
        precio.toFixed(2),
        tasa > 0 ? (precio * tasa).toFixed(2) : '0.00',
      ]
        .map(escapar)
        .join(',')
    }),
  ]

  const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Inventario_Galpon_ServiAlquiler_${hoyISO()}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// 2. Generación de Nota de Entrega / Factura PDF para un Contrato
// ---------------------------------------------------------------------------

export const generarFacturaContratoPDF = async ({ contrato, cliente, items, tasaDelDia }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await cargarLogoBase64()
  const tasa = num(contrato?.tasa_aplicada_bcv || contrato?.tasa_bcv || tasaDelDia)

  // Membrete Eco-Print sobre fondo 100% blanco (Ahorro de Tinta)
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, 210, 32, 'F')

  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 4, 22, 22)
    } catch {
      // Continúa sin logo si falla
    }
  }

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('ServiAlquiler DV, C.A.', logo ? 38 : 12, 13)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 85, 0)
  doc.text('Alquiler de Equipos para la Construcción', logo ? 38 : 12, 20)

  const nro =
    contrato?.codigo_contrato ||
    contrato?.numero_contrato ||
    `CT-${String(contrato?.id ?? '').slice(0, 6).toUpperCase()}`

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('NOTA DE ENTREGA / FACTURA', 198, 12, { align: 'right' })
  doc.setFontSize(11)
  doc.setTextColor(255, 85, 0)
  doc.text(`N° ${nro}`, 198, 19, { align: 'right' })
  doc.setTextColor(75, 85, 99)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(
    `Emisión: ${fmtFecha(contrato?.fecha_inicio || contrato?.created_at || hoyISO())} · Tasa del Día: ${tasa > 0 ? fmtVES(tasa) : '—'}`,
    198,
    25,
    { align: 'right' },
  )

  // Línea divisoria fina de acento naranja (#FF5500)
  doc.setDrawColor(255, 85, 0)
  doc.setLineWidth(0.8)
  doc.line(12, 29, 198, 29)

  // Bloque de datos del cliente y condiciones
  doc.setFillColor(249, 250, 251)
  doc.rect(12, 33, 186, 36, 'F')
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.rect(12, 33, 186, 36, 'S')

  // Borde de acento naranja a la izquierda
  doc.setFillColor(255, 85, 0)
  doc.rect(12, 33, 1.5, 36, 'F')

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('DATOS DEL CLIENTE', 17, 40)
  doc.text('CONDICIONES DEL ALQUILER', 115, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(55, 65, 81)
  const nombreCliente =
    cliente?.nombre_razon_social || contrato?.cliente_nombre || 'Cliente General'
  const rifCliente = cliente?.rif_cedula || contrato?.cliente_rif || '—'
  const telCliente = cliente?.telefono || '—'
  const dirCliente = contrato?.direccion_obra || cliente?.direccion_obra || '—'

  doc.text(`Razón Social: ${nombreCliente}`, 17, 46)
  doc.text(`RIF / Cédula: ${rifCliente}`, 17, 52)
  doc.text(`Teléfono: ${telCliente}`, 17, 58)
  doc.text(`Dirección Obra: ${String(dirCliente).slice(0, 50)}`, 17, 64)

  const dias = num(contrato?.dias_alquiler) || 1
  const prorrogas = num(contrato?.prorrogas_aplicadas)
  const deposito = num(contrato?.deposito_garantia_usd)
  doc.text(`Fecha Salida: ${fmtFecha(contrato?.fecha_inicio || contrato?.created_at)}`, 115, 46)
  doc.text(`Fecha Regreso: ${fmtFecha(contrato?.fecha_vencimiento)}`, 115, 52)
  doc.text(
    `Días Totales: ${dias} día(s)${prorrogas > 0 ? ` (+${prorrogas} d prórroga)` : ''}`,
    115,
    58,
  )
  doc.text(
    `Forma de Pago: ${contrato?.metodo_pago || 'Efectivo USD'}${deposito > 0 ? ` · Garantía: ${fmtUSD(deposito)}` : ''}`,
    115,
    64,
  )
  doc.text(
    `Días Totales: ${dias} día(s)${prorrogas > 0 ? ` (Incluye +${prorrogas} d de prórroga)` : ''}`,
    115,
    66,
  )
  doc.text(
    `Forma de Pago: ${contrato?.metodo_pago || 'Efectivo USD'}${deposito > 0 ? ` · Garantía: ${fmtUSD(deposito)}` : ''}`,
    115,
    72,
  )

  const listaItems = Array.isArray(items) ? items : []
  const cantTotalPiezas = listaItems.reduce((s, it) => s + (num(it.cantidad) || 1), 0)
  const cantDevueltasPiezas = listaItems
    .filter((it) => it.devuelto && !it.extraviado)
    .reduce((s, it) => s + (num(it.cantidad) || 1), 0)
  const cantExtraviadasPiezas = listaItems
    .filter((it) => it.extraviado)
    .reduce((s, it) => s + (num(it.cantidad_extraviada || it.cantidad) || 1), 0)
  const cantEnObraPiezas = Math.max(
    0,
    cantTotalPiezas - cantDevueltasPiezas - cantExtraviadasPiezas,
  )

  const filasEquipos = listaItems.map((it, idx) => {
    const cant = num(it.cantidad) || 1
    const precioDia = num(
      it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
    )
    const esDevuelto = Boolean(it.devuelto)
    const esExtraviado = Boolean(it.extraviado)
    const diasItem = esDevuelto ? num(it.dias_efectivos) || dias : dias
    const subtotal = esDevuelto
      ? num(it.subtotal_item_usd) || cant * precioDia * diasItem
      : cant * precioDia * diasItem

    let etiquetaEstado = ''
    if (esExtraviado) {
      etiquetaEstado = ` [EXTRAVÍO / NO DEVUELTO · ${fmtNum(it.cantidad_extraviada || cant)} und]`
    } else if (esDevuelto) {
      etiquetaEstado = ` [DEVUELTO EL ${fmtFecha(it.fecha_devolucion)} · ${diasItem}d]`
    }

    const nombreEquipo = `${it.material ?? it.nombre ?? 'Equipo'}${etiquetaEstado}`

    return [
      idx + 1,
      it.codigo ?? '—',
      nombreEquipo,
      fmtNum(cant),
      `${diasItem} d`,
      fmtUSD(precioDia),
      fmtUSD(subtotal),
      tasa > 0 ? fmtVES(subtotal * tasa) : '—',
    ]
  })

  autoTable(doc, {
    startY: 72,
    head: [
      [
        '#',
        'Código',
        'Equipo Despachado (Estado)',
        'Cant.',
        'Días',
        'Precio/Día',
        'Subtotal USD',
        'Subtotal Bs. (Tasa del Día)',
      ],
    ],
    body:
      filasEquipos.length > 0
        ? filasEquipos
        : [
            [
              '1',
              '—',
              'Servicio de alquiler de equipos según contrato',
              '1',
              `${dias} d`,
              fmtUSD(contrato?.total_contrato_usd),
              fmtUSD(contrato?.total_contrato_usd),
              tasa > 0 ? fmtVES(num(contrato?.total_contrato_usd) * tasa) : '—',
            ],
          ],
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [243, 244, 246], // Fondo gris muy claro (#F3F4F6) Eco-Print
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      lineColor: [209, 213, 219],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 20 },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' },
    },
  })

  const finalY = (doc.lastAutoTable?.finalY || 115) + 5
  const totalUSD = num(contrato?.total_contrato_usd)
  const fleteUSD = contrato?.requiere_flete ? num(contrato?.costo_flete_usd) : 0
  const subtotalEquiposUSD = Math.max(0, totalUSD - fleteUSD)

  // Cálculo de Abono y Restante por Cobrar
  const tieneCamposAbono =
    contrato?.monto_pagado_usd !== undefined || contrato?.saldo_pendiente_usd !== undefined
  const montoPagadoUSD = tieneCamposAbono ? num(contrato?.monto_pagado_usd) : totalUSD
  const saldoPendienteUSD = tieneCamposAbono
    ? Math.max(0, num(contrato?.saldo_pendiente_usd))
    : Math.max(0, totalUSD - montoPagadoUSD)
  const estadoPago =
    contrato?.estado_pago ||
    (saldoPendienteUSD <= 0.009
      ? 'Pagado'
      : montoPagadoUSD > 0
        ? 'Abono Parcial'
        : 'Pendiente')

  // Desglose de pagos (Pago Mixto o Múltiples métodos)
  let desglosePagos = []
  if (Array.isArray(contrato?.desglose_pagos)) {
    desglosePagos = contrato.desglose_pagos
  } else if (
    typeof contrato?.desglose_pagos === 'string' &&
    contrato.desglose_pagos.trim().startsWith('[')
  ) {
    try {
      desglosePagos = JSON.parse(contrato.desglose_pagos)
    } catch {
      // Ignorar JSON inválido
    }
  }

  // Cuadro izquierdo: Resumen de Pagos, Abonos y Desglose Mixto (Eco-Print: Blanco con borde fino)
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.3)
  doc.rect(12, finalY, 94, 52, 'FD')

  // Detalle de acento superior naranja
  doc.setFillColor(255, 85, 0)
  doc.rect(12, finalY, 94, 1.2, 'F')

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('ESTADO DE CUENTA Y DESGLOSE DE PAGO', 16, finalY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(55, 65, 81)
  doc.text(
    `Estado: ${estadoPago.toUpperCase()} · Prórrogas: +${prorrogas} día(s)`,
    16,
    finalY + 12,
  )

  doc.text(
    `Equipos: ${cantEnObraPiezas} en obra · ${cantDevueltasPiezas} devueltos${cantExtraviadasPiezas > 0 ? ` · ${cantExtraviadasPiezas} faltante(s)` : ''}`,
    16,
    finalY + 18,
  )

  // Desglose de Pago Mixto
  if (desglosePagos.length > 1) {
    const textoPagos = desglosePagos
      .map((p) => `${p.metodo || 'Método'}: $${num(p.monto_usd || p.monto)}`)
      .join(' + ')
    doc.text(`Pago Mixto: ${String(textoPagos).slice(0, 52)}`, 16, finalY + 24)
  } else {
    doc.text(`Método de Pago: ${contrato?.metodo_pago || 'Efectivo USD'}`, 16, finalY + 24)
  }

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(4, 120, 87)
  doc.text(
    `Abonado / Pagado: ${fmtUSD(montoPagadoUSD)} (${tasa > 0 ? fmtVES(montoPagadoUSD * tasa) : '—'})`,
    16,
    finalY + 32,
  )

  doc.setTextColor(
    saldoPendienteUSD > 0.009 ? 185 : 4,
    saldoPendienteUSD > 0.009 ? 28 : 120,
    saldoPendienteUSD > 0.009 ? 28 : 87,
  )
  doc.text(
    `Restante por Cobrar: ${fmtUSD(saldoPendienteUSD)} (${tasa > 0 ? fmtVES(saldoPendienteUSD * tasa) : '—'})`,
    16,
    finalY + 40,
  )

  doc.setTextColor(107, 114, 128)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(
    `Tasa del Día aplicada: ${tasa > 0 ? fmtVES(tasa) : '—'} por cada 1.00 USD`,
    16,
    finalY + 47,
  )

  // Cuadro derecho: Totales del Contrato (Eco-Print: Blanco con bordes sutiles y acento negro/naranja)
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.3)
  doc.rect(110, finalY, 88, 52, 'FD')

  // Detalle de acento superior oscuro
  doc.setFillColor(17, 17, 17)
  doc.rect(110, finalY, 88, 1.2, 'F')

  doc.setTextColor(75, 85, 99)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal Equipos:', 115, finalY + 8)
  doc.setTextColor(17, 17, 17)
  doc.text(fmtUSD(subtotalEquiposUSD), 193, finalY + 8, { align: 'right' })

  doc.setTextColor(75, 85, 99)
  doc.text(`Transporte / Flete (${contrato?.requiere_flete ? 'Sí' : 'No'}):`, 115, finalY + 14)
  doc.setTextColor(17, 17, 17)
  doc.text(fmtUSD(fleteUSD), 193, finalY + 14, { align: 'right' })

  doc.setTextColor(75, 85, 99)
  doc.text('Garantía Reembolsable:', 115, finalY + 20)
  doc.setTextColor(17, 17, 17)
  doc.text(fmtUSD(deposito), 193, finalY + 20, { align: 'right' })

  // Línea divisoria fina naranja
  doc.setDrawColor(255, 85, 0)
  doc.setLineWidth(0.4)
  doc.line(115, finalY + 25, 193, finalY + 25)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 85, 0)
  doc.text('TOTAL CONTRATO USD:', 115, finalY + 32)
  doc.text(fmtUSD(totalUSD), 193, finalY + 32, { align: 'right' })

  doc.setFontSize(8)
  doc.setTextColor(55, 65, 81)
  doc.text(
    `Total en Bs. (Tasa del Día): ${tasa > 0 ? fmtVES(totalUSD * tasa) : '—'}`,
    193,
    finalY + 39,
    { align: 'right' },
  )

  doc.setTextColor(
    saldoPendienteUSD > 0.009 ? 185 : 4,
    saldoPendienteUSD > 0.009 ? 28 : 120,
    saldoPendienteUSD > 0.009 ? 28 : 87,
  )
  doc.text(
    `Saldo Deuda: ${fmtUSD(saldoPendienteUSD)}`,
    193,
    finalY + 46,
    { align: 'right' },
  )

  // Firmas de Entregado y Recibido Conforme
  const firmaY = Math.min(274, finalY + 68)
  doc.setDrawColor(156, 163, 175)
  doc.setLineWidth(0.3)
  doc.line(22, firmaY, 88, firmaY)
  doc.line(122, firmaY, 188, firmaY)

  doc.setTextColor(75, 85, 99)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Despachado desde Galpón por: ServiAlquiler DV, C.A.', 55, firmaY + 5, {
    align: 'center',
  })
  doc.text('Recibido Conforme en Obra por el Cliente', 155, firmaY + 5, { align: 'center' })

  doc.save(`Nota_Entrega_${nro}.pdf`)
}

// ---------------------------------------------------------------------------
// 3. Exportación de Reporte de Ventas y Facturación (PDF + Excel)
// ---------------------------------------------------------------------------

export const exportarReporteVentasPDF = async ({
  contratos,
  mapaClientes,
  desde,
  hasta,
  tasaDelDia,
  resumen,
}) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await cargarLogoBase64()
  const tasa = num(tasaDelDia)

  dibujarEncabezadoCorporativo(
    doc,
    logo,
    'CIERRE DE FACTURACIÓN Y ALQUILERES',
    `Período: ${fmtFecha(desde)} al ${fmtFecha(hasta)}`,
    `Tasa del Día: ${tasa > 0 ? fmtVES(tasa) : '—'}`,
  )

  const filas = contratos.map((c) => {
    const cli = mapaClientes.get(String(c.cliente_id))
    const total = num(c.total_contrato_usd)
    const tieneAbono = c.monto_pagado_usd !== undefined || c.saldo_pendiente_usd !== undefined
    const abonado = tieneAbono ? num(c.monto_pagado_usd) : total
    const restante = tieneAbono ? num(c.saldo_pendiente_usd) : 0
    const flete = c.requiere_flete ? num(c.costo_flete_usd) : 0
    const nro =
      c.codigo_contrato || c.numero_contrato || `CT-${String(c.id ?? '').slice(0, 6).toUpperCase()}`
    return [
      nro,
      fmtFecha(c.fecha_inicio || c.created_at),
      cli?.nombre_razon_social || c.cliente_nombre || `Cliente #${c.cliente_id ?? '—'}`,
      c.metodo_pago || 'Efectivo USD',
      fmtUSD(flete),
      fmtUSD(total),
      fmtUSD(abonado),
      fmtUSD(restante),
      tasa > 0 ? fmtVES(total * tasa) : '—',
    ]
  })

  autoTable(doc, {
    startY: 32,
    head: [
      [
        'Contrato',
        'Fecha',
        'Cliente / Empresa',
        'Forma de Pago',
        'Flete USD',
        'Total USD',
        'Abonado USD',
        'Restante USD',
        'Total Bs. (Tasa del Día)',
      ],
    ],
    body: filas,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [243, 244, 246], // Fondo gris muy claro (#F3F4F6) Eco-Print
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      lineColor: [209, 213, 219],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
  })

  const finalY = (doc.lastAutoTable?.finalY || 120) + 6

  // Cuadro resumen Eco-Print sobre fondo blanco con borde sutil y acento naranja
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(209, 213, 219)
  doc.setLineWidth(0.3)
  doc.rect(14, finalY, 269, 18, 'FD')

  doc.setFillColor(255, 85, 0)
  doc.rect(14, finalY, 269, 1.2, 'F')

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.text(
    `TOTAL FACTURADO: ${fmtUSD(resumen.totalFacturado)} (${tasa > 0 ? fmtVES(resumen.totalFacturado * tasa) : '—'} a la Tasa del Día)`,
    20,
    finalY + 8,
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 85, 0)
  doc.text(
    `Por Fletes: ${fmtUSD(resumen.totalFletes)}   |   En Obra: ${resumen.activos}   |   Ya en Galpón: ${resumen.finalizados}`,
    20,
    finalY + 14,
  )

  doc.save(`Cierre_Facturacion_ServiAlquiler_${desde}_${hasta}.pdf`)
}

export const exportarReporteVentasExcel = ({
  contratos,
  mapaClientes,
  desde,
  hasta,
  tasaDelDia,
}) => {
  const tasa = num(tasaDelDia)
  const datos = contratos.map((c) => {
    const cli = mapaClientes.get(String(c.cliente_id))
    const total = num(c.total_contrato_usd)
    const tieneAbono = c.monto_pagado_usd !== undefined || c.saldo_pendiente_usd !== undefined
    const abonado = tieneAbono ? num(c.monto_pagado_usd) : total
    const restante = tieneAbono ? num(c.saldo_pendiente_usd) : 0
    const flete = c.requiere_flete ? num(c.costo_flete_usd) : 0
    return {
      'N° Contrato':
        c.codigo_contrato || c.numero_contrato || `CT-${String(c.id ?? '').slice(0, 6).toUpperCase()}`,
      'Fecha Salida': fmtFecha(c.fecha_inicio || c.created_at),
      'Fecha Regreso': fmtFecha(c.fecha_vencimiento),
      Cliente: cli?.nombre_razon_social || c.cliente_nombre || '',
      'RIF / Cédula': cli?.rif_cedula || '',
      'Forma de Pago': c.metodo_pago || 'Efectivo USD',
      'Estado de Pago': c.estado_pago || (restante <= 0 ? 'Pagado' : 'Abono Parcial'),
      Estado: c.estado || 'Activo',
      'Días Alquiler': num(c.dias_alquiler) || 1,
      'Prórrogas (Días extras)': num(c.prorrogas_aplicadas),
      'Ingreso por Flete (USD)': flete,
      'Total Contrato (USD)': total,
      'Monto Abonado (USD)': abonado,
      'Restante por Cobrar (USD)': restante,
      'Total en Bolívares (Tasa del Día)': tasa > 0 ? Number((total * tasa).toFixed(2)) : 0,
    }
  })

  const hoja = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Cierre_Facturacion')
  XLSX.writeFile(libro, `Cierre_Facturacion_ServiAlquiler_${desde}_${hasta}.xlsx`)
}

// ---------------------------------------------------------------------------
// 4. Exportación de Historial de Entradas y Salidas de Galpón (PDF + Excel)
// ---------------------------------------------------------------------------

export const exportarKardexPDF = async ({ movimientos, desde, hasta }) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await cargarLogoBase64()

  dibujarEncabezadoCorporativo(
    doc,
    logo,
    'HISTORIAL DE ENTRADAS Y SALIDAS DE GALPÓN',
    `Período: ${fmtFecha(desde)} al ${fmtFecha(hasta)}`,
    `Total de Movimientos: ${movimientos.length}`,
  )

  const filas = movimientos.map((m) => [
    fmtFechaHora(m.created_at || m.fecha),
    m.tipo_movimiento ?? '—',
    m.codigo ?? '—',
    m.material ?? '—',
    fmtNum(m.cantidad),
    m.stock_resultante !== undefined && m.stock_resultante !== null
      ? fmtNum(m.stock_resultante)
      : '—',
    m.referencia_documento ?? '—',
    m.cliente_nombre || m.observaciones || '—',
  ])

  autoTable(doc, {
    startY: 32,
    head: [
      [
        'Fecha y Hora',
        'Tipo de Movimiento',
        'Código',
        'Equipo / Material',
        'Cantidad',
        'Quedan en Galpón',
        'Doc. Referencia',
        'Cliente / Empresa / Motivo',
      ],
    ],
    body: filas,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [243, 244, 246], // Fondo gris muy claro (#F3F4F6) Eco-Print
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      lineColor: [209, 213, 219],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
    },
  })

  doc.save(`Historial_Galpon_${desde}_${hasta}.pdf`)
}

export const exportarKardexExcel = ({ movimientos, desde, hasta }) => {
  const datos = movimientos.map((m) => ({
    'Fecha y Hora': fmtFechaHora(m.created_at || m.fecha),
    'Tipo de Movimiento': m.tipo_movimiento ?? '',
    Código: m.codigo ?? '',
    'Equipo / Material': m.material ?? '',
    Cantidad: num(m.cantidad),
    'Quedaron en Galpón':
      m.stock_resultante !== undefined && m.stock_resultante !== null
        ? num(m.stock_resultante)
        : '',
    'N° Documento': m.referencia_documento ?? '',
    'Cliente / Observaciones': m.cliente_nombre || m.observaciones || '',
  }))

  const hoja = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Historial_Galpon')
  XLSX.writeFile(libro, `Historial_Galpon_${desde}_${hasta}.xlsx`)
}

// =============================================================================
// 5. Módulo de Nómina: Recibos Individuales y Planillas Semanales (Eco-Print)
// =============================================================================

export const descargarPlantillaEmpleadosExcel = () => {
  const datos = [
    {
      nombre_completo: 'Pedro Pérez',
      cedula: 'V-18456123',
      telefono: '0414-1234567',
      cargo: 'Operador de Andamios',
      sueldo_semanal_usd: 70,
      datos_pago_movil: '04141234567 Banesco 18456123',
      estado: 'ACTIVO',
    },
    {
      nombre_completo: 'Juan Gómez',
      cedula: 'V-20987654',
      telefono: '0424-7654321',
      cargo: 'Chofer / Despachador',
      sueldo_semanal_usd: 80,
      datos_pago_movil: '04247654321 Mercantil 20987654',
      estado: 'ACTIVO',
    },
    {
      nombre_completo: 'Carlos Rodríguez',
      cedula: 'V-23541890',
      telefono: '0412-9871234',
      cargo: 'Ayudante de Galpón',
      sueldo_semanal_usd: 50,
      datos_pago_movil: '04129871234 Venezuela 23541890',
      estado: 'ACTIVO',
    },
  ]

  const hoja = XLSX.utils.json_to_sheet(datos)
  hoja['!cols'] = [
    { wch: 26 }, // nombre_completo
    { wch: 15 }, // cedula
    { wch: 16 }, // telefono
    { wch: 24 }, // cargo
    { wch: 20 }, // sueldo_semanal_usd
    { wch: 32 }, // datos_pago_movil
    { wch: 14 }, // estado
  ]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Plantilla_Empleados')
  XLSX.writeFile(libro, 'Plantilla_Empleados_ServiAlquiler.xlsx')
}

export const generarReciboNominaPDF = async (pago, tasa = 0) => {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
  const ancho = 215.9

  const logo = await cargarLogoBase64()
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 10, 22, 22)
    } catch {
      // Continuar sin logo
    }
  }

  // Encabezado corporativo Eco-Print
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('ServiAlquiler DV, C.A.', logo ? 38 : 12, 16)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 85, 0)
  doc.text('Alquiler de Equipos para la Construcción · Administración y Nómina', logo ? 38 : 12, 22)

  doc.setTextColor(17, 17, 17)
  doc.setFontSize(13)
  doc.text('RECIBO DE NÓMINA SEMANAL', ancho - 12, 16, { align: 'right' })

  const nroRecibo = pago?.id
    ? `REC-${String(pago.id).slice(0, 8).toUpperCase()}`
    : `REC-${hoyISO()}`
  doc.setFontSize(10)
  doc.setTextColor(255, 85, 0)
  doc.text(nroRecibo, ancho - 12, 22, { align: 'right' })

  const tasaNum = num(tasa) || num(pago?.tasa_bcv) || 0
  doc.setFontSize(8)
  doc.setTextColor(75, 85, 99)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Fecha: ${fmtFecha(pago?.fecha_pago || hoyISO())} · Tasa Oficial: ${tasaNum > 0 ? fmtVES(tasaNum) : '—'}`,
    ancho - 12,
    27,
    { align: 'right' },
  )

  // Línea divisoria naranja
  doc.setDrawColor(255, 85, 0)
  doc.setLineWidth(0.8)
  doc.line(12, 33, ancho - 12, 33)

  // Recuadro del trabajador y período
  doc.setFillColor(249, 250, 251)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.roundedRect(12, 36, ancho - 24, 22, 1.5, 1.5, 'FD')
  doc.setFillColor(255, 85, 0)
  doc.rect(12, 36, 2.5, 22, 'F')

  const nombreTrabajador = pago?.empleado_nombre || pago?.nombre_completo || 'Trabajador'
  const cedula = pago?.cedula || '—'
  const cargo = pago?.cargo || 'Colaborador'
  const semana = pago?.semana_texto || 'Semana Laboral'
  const diasTrabajados = num(pago?.dias_laborados) || 6
  const diasFaltados = num(pago?.dias_faltados) || 0

  doc.setFontSize(9)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text(`Trabajador: ${nombreTrabajador}`, 18, 42)
  doc.text(`Cédula / Identidad: ${cedula}`, 18, 48)
  doc.text(`Cargo: ${cargo}`, 18, 54)

  doc.text(`Período: ${semana}`, 115, 42)
  doc.setFont('helvetica', 'normal')
  doc.text('Jornada Estándar: 6 Días (Lunes a Sábado)', 115, 48)
  doc.text(
    `Días Laborados: ${diasTrabajados} de 6 ${diasFaltados > 0 ? `(${diasFaltados} faltas registradas)` : '(Semana Completa)'}`,
    115,
    54,
  )

  // Filas de Asignaciones vs Deducciones
  const sueldoBase = num(pago?.sueldo_base_usd)
  const bonos = num(pago?.bonos_extras_usd)
  const descFaltas = num(pago?.deducciones_inasistencia_usd)
  const adelantos = num(pago?.descuento_adelantos_usd)
  const netoUSD = num(pago?.neto_pagar_usd)
  const netoVES = tasaNum > 0 ? netoUSD * tasaNum : 0
  const metodo = pago?.metodo_pago || 'Efectivo USD'
  const detalleFaltas = pago?.detalle_faltas ? ` (${pago.detalle_faltas})` : ''

  const filasTabla = [
    [
      'Sueldo Semanal Base (Jornada ordinaria 6 días)',
      'Asignación',
      fmtUSD(sueldoBase),
      tasaNum > 0 ? fmtVES(sueldoBase * tasaNum) : '—',
    ],
  ]

  if (bonos > 0) {
    filasTabla.push([
      'Bonificación por Rendimiento / Horas Extra',
      'Asignación',
      fmtUSD(bonos),
      tasaNum > 0 ? fmtVES(bonos * tasaNum) : '—',
    ],)
  }

  if (descFaltas > 0) {
    filasTabla.push([
      `Deducción por Inasistencias (${diasFaltados} día(s))${detalleFaltas}`,
      'Deducción',
      `-${fmtUSD(descFaltas)}`,
      tasaNum > 0 ? `-${fmtVES(descFaltas * tasaNum)}` : '—',
    ])
  }

  if (adelantos > 0) {
    filasTabla.push([
      'Amortización de Adelantos de Sueldo / Vales recibidos',
      'Deducción',
      `-${fmtUSD(adelantos)}`,
      tasaNum > 0 ? `-${fmtVES(adelantos * tasaNum)}` : '—',
    ])
  }

  autoTable(doc, {
    startY: 62,
    head: [['Concepto / Descripción', 'Tipo', 'Monto USD', 'Monto Bs.']],
    body: filasTabla,
    theme: 'plain',
    margin: { left: 12, right: 12 },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      lineColor: [209, 213, 219],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 30, halign: 'right' },
    },
  })

  const finTablaY = doc.lastAutoTable.finalY + 4

  // Recuadro de Totales Eco-Print
  doc.setFillColor(249, 250, 251)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.roundedRect(12, finTablaY, ancho - 24, 28, 1.5, 1.5, 'FD')

  doc.setFontSize(8.5)
  doc.setTextColor(75, 85, 99)
  doc.text('Forma de Pago Aplicada:', 18, finTablaY + 8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 17, 17)
  doc.text(metodo, 18, finTablaY + 14)

  if (pago?.datos_pago_movil) {
    doc.setFontSize(7.5)
    doc.setTextColor(107, 114, 128)
    doc.setFont('helvetica', 'normal')
    doc.text(`Datos Pago Móvil: ${pago.datos_pago_movil}`, 18, finTablaY + 20)
  }

  // Cuadro destacado a la derecha con el Neto
  doc.setFontSize(9)
  doc.setTextColor(75, 85, 99)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL NETO LIQUIDADO:', ancho - 18, finTablaY + 8, { align: 'right' })

  doc.setFontSize(14)
  doc.setTextColor(255, 85, 0)
  doc.text(`USD ${fmtUSD(netoUSD)}`, ancho - 18, finTablaY + 16, { align: 'right' })

  doc.setFontSize(9.5)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'normal')
  doc.text(tasaNum > 0 ? `Bs. ${fmtVES(netoVES)}` : '—', ancho - 18, finTablaY + 22, {
    align: 'right',
  })

  // Firmas de conformidad
  const firmaY = finTablaY + 45
  doc.setDrawColor(156, 163, 175)
  doc.setLineWidth(0.4)

  // Firma Empleador
  doc.line(22, firmaY, 92, firmaY)
  doc.setFontSize(8)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text('Por: ServiAlquiler DV, C.A.', 57, firmaY + 5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text('Administración y Pagaduría', 57, firmaY + 9, { align: 'center' })

  // Firma Trabajador
  doc.line(124, firmaY, 194, firmaY)
  doc.setFontSize(8)
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.text(`Recibí Conforme: ${nombreTrabajador}`, 159, firmaY + 5, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text(`C.I. / RIF: ${cedula}`, 159, firmaY + 9, { align: 'center' })

  doc.save(`Recibo_Nomina_${nombreTrabajador.replace(/\s+/g, '_')}_${pago?.semana_inicio || hoyISO()}.pdf`)
}

export const generarPlanillaSemanalNominaPDF = async (listaPagos = [], semanaTexto = '', tasa = 0) => {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' })
  const ancho = 279.4

  const logo = await cargarLogoBase64()
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 9, 20, 20)
    } catch {
      // Continuar sin logo
    }
  }

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('ServiAlquiler DV, C.A.', logo ? 36 : 12, 14)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 85, 0)
  doc.text(`PLANILLA CONSOLIDADA DE NÓMINA SEMANAL · ${semanaTexto}`, logo ? 36 : 12, 20)

  const tasaNum = num(tasa)
  doc.setFontSize(8)
  doc.setTextColor(75, 85, 99)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Emisión: ${fmtFecha(hoyISO())} · Tasa Oficial: ${tasaNum > 0 ? fmtVES(tasaNum) : '—'}`,
    ancho - 12,
    14,
    { align: 'right' },
  )

  doc.setDrawColor(255, 85, 0)
  doc.setLineWidth(0.8)
  doc.line(12, 27, ancho - 12, 27)

  let sumBase = 0
  let sumDescFaltas = 0
  let sumAdelantos = 0
  let sumBonos = 0
  let sumNetoUSD = 0

  const filas = listaPagos.map((p, idx) => {
    const base = num(p.sueldo_base_usd)
    const trab = num(p.dias_laborados) || 6
    const falt = num(p.dias_faltados) || 0
    const dFalt = num(p.deducciones_inasistencia_usd)
    const adel = num(p.descuento_adelantos_usd)
    const bon = num(p.bonos_extras_usd)
    const netoUSD = num(p.neto_pagar_usd)
    const netoVES = tasaNum > 0 ? netoUSD * tasaNum : 0

    sumBase += base
    sumDescFaltas += dFalt
    sumAdelantos += adel
    sumBonos += bon
    sumNetoUSD += netoUSD

    return [
      idx + 1,
      p.empleado_nombre || p.nombre_completo || '—',
      p.cargo || '—',
      fmtUSD(base),
      `${trab}/6`,
      falt > 0 ? `${falt}` : '0',
      dFalt > 0 ? `-${fmtUSD(dFalt)}` : '$0.00',
      adel > 0 ? `-${fmtUSD(adel)}` : '$0.00',
      bon > 0 ? `+${fmtUSD(bon)}` : '$0.00',
      fmtUSD(netoUSD),
      tasaNum > 0 ? fmtVES(netoVES) : '—',
      p.metodo_pago || 'Efectivo USD',
      p.estado_pago || 'PAGADO',
    ]
  })

  autoTable(doc, {
    startY: 30,
    head: [
      [
        'N°',
        'Trabajador',
        'Cargo',
        'Sueldo Base',
        'Días',
        'Faltas',
        'Desc. Faltas',
        'Vales',
        'Bonos',
        'Neto USD',
        'Neto Bs.',
        'Método Pago',
        'Estado',
      ],
    ],
    body: filas,
    theme: 'plain',
    margin: { left: 12, right: 12 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      lineColor: [209, 213, 219],
      lineWidth: 0.25,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 42, fontStyle: 'bold' },
      2: { cellWidth: 32 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 18, halign: 'right', textColor: [220, 38, 38] },
      7: { cellWidth: 16, halign: 'right', textColor: [217, 119, 6] },
      8: { cellWidth: 16, halign: 'right', textColor: [5, 150, 105] },
      9: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: [255, 85, 0] },
      10: { cellWidth: 24, halign: 'right' },
      11: { cellWidth: 22 },
      12: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
    },
  })

  const finTablaY = doc.lastAutoTable.finalY + 4

  // Barra de resumen al pie
  doc.setFillColor(249, 250, 251)
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.roundedRect(12, finTablaY, ancho - 24, 16, 1.5, 1.5, 'FD')

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(17, 17, 17)
  doc.text(`TOTALES DE LA SEMANA (${listaPagos.length} TRABAJADORES):`, 16, finTablaY + 10)

  doc.setTextColor(75, 85, 99)
  doc.text(`Sueldos Base: USD ${fmtUSD(sumBase)}`, 110, finTablaY + 10)
  doc.text(`Descuentos: -USD ${fmtUSD(sumDescFaltas + sumAdelantos)}`, 155, finTablaY + 10)

  doc.setTextColor(255, 85, 0)
  doc.setFontSize(10)
  doc.text(`TOTAL NETO: USD ${fmtUSD(sumNetoUSD)}`, ancho - 16, finTablaY + 10, {
    align: 'right',
  })

  doc.save(`Planilla_Nomina_ServiAlquiler_${hoyISO()}.pdf`)
}

export const exportarPlanillaNominaExcel = (listaPagos = [], semanaTexto = '', tasa = 0) => {
  const tasaNum = num(tasa)
  const datos = listaPagos.map((p, idx) => {
    const base = num(p.sueldo_base_usd)
    const trab = num(p.dias_laborados) || 6
    const falt = num(p.dias_faltados) || 0
    const dFalt = num(p.deducciones_inasistencia_usd)
    const adel = num(p.descuento_adelantos_usd)
    const bon = num(p.bonos_extras_usd)
    const netoUSD = num(p.neto_pagar_usd)
    const netoVES = tasaNum > 0 ? netoUSD * tasaNum : 0

    return {
      'N°': idx + 1,
      Trabajador: p.empleado_nombre || p.nombre_completo || '',
      Cédula: p.cedula || '',
      Cargo: p.cargo || '',
      'Sueldo Base (USD)': base,
      'Días Laborados': trab,
      'Días Faltados': falt,
      'Detalle Faltas': p.detalle_faltas || '',
      'Descuento Faltas (USD)': dFalt,
      'Vales / Adelantos (USD)': adel,
      'Bonos / Extras (USD)': bon,
      'Neto a Pagar (USD)': netoUSD,
      'Neto a Pagar (Bs)': netoVES,
      'Tasa BCV': tasaNum,
      'Método de Pago': p.metodo_pago || 'Efectivo USD',
      Estado: p.estado_pago || 'PAGADO',
      'Fecha Pago': p.fecha_pago || hoyISO(),
    }
  })

  const hoja = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Nomina_Semanal')
  XLSX.writeFile(libro, `Planilla_Nomina_${semanaTexto.replace(/\s+/g, '_') || hoyISO()}.xlsx`)
}
