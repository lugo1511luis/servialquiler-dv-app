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
// Membrete Corporativo común para PDFs
// ---------------------------------------------------------------------------
const dibujarEncabezadoCorporativo = (
  doc,
  logo,
  tituloReporte,
  subtituloDerecha1,
  subtituloDerecha2,
) => {
  const ancho = doc.internal.pageSize.getWidth()
  doc.setFillColor(17, 17, 17)
  doc.rect(0, 0, ancho, 28, 'F')
  doc.setFillColor(255, 85, 0)
  doc.rect(0, 28, ancho, 2, 'F')

  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 4, 20, 20)
    } catch {
      // Continúa sin logo si falla
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('ServiAlquiler DV, C.A.', logo ? 36 : 14, 13)

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 85, 0)
  doc.text(tituloReporte, logo ? 36 : 14, 20)

  doc.setTextColor(220, 220, 220)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  if (subtituloDerecha1) doc.text(subtituloDerecha1, ancho - 12, 12, { align: 'right' })
  if (subtituloDerecha2) doc.text(subtituloDerecha2, ancho - 12, 19, { align: 'right' })
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
    startY: 34,
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
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: {
      fillColor: [17, 17, 17],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
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

  doc.setFillColor(17, 17, 17)
  doc.rect(0, 0, 210, 34, 'F')
  doc.setFillColor(255, 85, 0)
  doc.rect(0, 34, 210, 2.5, 'F')

  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', 12, 5, 24, 24)
    } catch {
      // Continúa sin logo si falla
    }
  }

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text('ServiAlquiler DV, C.A.', logo ? 40 : 14, 15)

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 85, 0)
  doc.text('Alquiler de Equipos para la Construcción', logo ? 40 : 14, 22)

  const nro =
    contrato?.codigo_contrato ||
    contrato?.numero_contrato ||
    `CT-${String(contrato?.id ?? '').slice(0, 6).toUpperCase()}`

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('NOTA DE ENTREGA / FACTURA', 196, 13, { align: 'right' })
  doc.setFontSize(10)
  doc.setTextColor(255, 85, 0)
  doc.text(`N° ${nro}`, 196, 20, { align: 'right' })
  doc.setTextColor(220, 220, 220)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(
    `Emisión: ${fmtFecha(contrato?.fecha_inicio || contrato?.created_at || hoyISO())} · Tasa del Día: ${tasa > 0 ? fmtVES(tasa) : '—'}`,
    196,
    27,
    { align: 'right' },
  )

  // Bloque de datos
  doc.setFillColor(246, 246, 246)
  doc.rect(12, 41, 186, 36, 'F')
  doc.setDrawColor(210, 210, 210)
  doc.rect(12, 41, 186, 36, 'S')

  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('DATOS DEL CLIENTE', 16, 48)
  doc.text('CONDICIONES DEL ALQUILER', 115, 48)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const nombreCliente =
    cliente?.nombre_razon_social || contrato?.cliente_nombre || 'Cliente General'
  const rifCliente = cliente?.rif_cedula || contrato?.cliente_rif || '—'
  const telCliente = cliente?.telefono || '—'
  const dirCliente = contrato?.direccion_obra || cliente?.direccion_obra || '—'

  doc.text(`Razón Social: ${nombreCliente}`, 16, 54)
  doc.text(`RIF / Cédula: ${rifCliente}`, 16, 60)
  doc.text(`Teléfono: ${telCliente}`, 16, 66)
  doc.text(`Dirección Obra: ${String(dirCliente).slice(0, 50)}`, 16, 72)

  const dias = num(contrato?.dias_alquiler) || 1
  const prorrogas = num(contrato?.prorrogas_aplicadas)
  const deposito = num(contrato?.deposito_garantia_usd)
  doc.text(`Fecha Salida: ${fmtFecha(contrato?.fecha_inicio || contrato?.created_at)}`, 115, 54)
  doc.text(`Fecha Regreso: ${fmtFecha(contrato?.fecha_vencimiento)}`, 115, 60)
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
  const filasEquipos = listaItems.map((it, idx) => {
    const cant = num(it.cantidad) || 1
    const precioDia = num(
      it.precio_alquiler_dia_usd ?? it.precio_dia_usd ?? it.precio_unitario_usd,
    )
    const esDevuelto = Boolean(it.devuelto)
    const diasItem = esDevuelto ? num(it.dias_efectivos) || dias : dias
    const subtotal = esDevuelto
      ? num(it.subtotal_item_usd) || (cant * precioDia * diasItem)
      : (cant * precioDia * diasItem)
    const nombreEquipo = esDevuelto
      ? `${it.material ?? it.nombre ?? 'Equipo'} [DEVUELTO EL ${fmtFecha(it.fecha_devolucion)} · ${diasItem}d]`
      : (it.material ?? it.nombre ?? 'Equipo')
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
    startY: 83,
    head: [
      [
        '#',
        'Código',
        'Equipo Despachado',
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
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: {
      fillColor: [17, 17, 17],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
      7: { halign: 'right' },
    },
  })

  const finalY = (doc.lastAutoTable?.finalY || 120) + 6
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

  // Cuadro izquierdo: Resumen de Pagos, Abonos y Prórrogas
  doc.setFillColor(248, 248, 248)
  doc.setDrawColor(210, 210, 210)
  doc.rect(12, finalY, 94, 48, 'FD')
  doc.setTextColor(17, 17, 17)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('ESTADO DE CUENTA Y ABONOS DEL CONTRATO', 16, finalY + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Estado de Pago: ${estadoPago.toUpperCase()}`, 16, finalY + 14)
  doc.text(
    `Prórrogas / Días Extendidos: +${prorrogas} día(s) adicional(es)`,
    16,
    finalY + 20,
  )
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(4, 120, 87)
  doc.text(
    `Abonado / Pagado: ${fmtUSD(montoPagadoUSD)} (${tasa > 0 ? fmtVES(montoPagadoUSD * tasa) : '—'})`,
    16,
    finalY + 29,
  )
  doc.setTextColor(saldoPendienteUSD > 0 ? 185 : 17, saldoPendienteUSD > 0 ? 28 : 17, saldoPendienteUSD > 0 ? 28 : 17)
  doc.text(
    `Restante por Cobrar: ${fmtUSD(saldoPendienteUSD)} (${tasa > 0 ? fmtVES(saldoPendienteUSD * tasa) : '—'})`,
    16,
    finalY + 37,
  )
  doc.setTextColor(90, 90, 90)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(
    `Tasa del Día aplicada: ${tasa > 0 ? fmtVES(tasa) : '—'} por cada 1.00 USD`,
    16,
    finalY + 44,
  )

  // Cuadro derecho: Totales del Contrato
  doc.setFillColor(17, 17, 17)
  doc.rect(110, finalY, 88, 48, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal Equipos:', 115, finalY + 8)
  doc.text(fmtUSD(subtotalEquiposUSD), 193, finalY + 8, { align: 'right' })

  doc.text(`Transporte / Flete (${contrato?.requiere_flete ? 'Sí' : 'No'}):`, 115, finalY + 14)
  doc.text(fmtUSD(fleteUSD), 193, finalY + 14, { align: 'right' })

  doc.text('Garantía Reembolsable:', 115, finalY + 20)
  doc.text(fmtUSD(deposito), 193, finalY + 20, { align: 'right' })

  doc.setDrawColor(255, 85, 0)
  doc.line(115, finalY + 24, 193, finalY + 24)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 85, 0)
  doc.text('TOTAL CONTRATO USD:', 115, finalY + 31)
  doc.text(fmtUSD(totalUSD), 193, finalY + 31, { align: 'right' })

  doc.setFontSize(8)
  doc.setTextColor(230, 230, 230)
  doc.text(
    `Total en Bs. (Tasa del Día): ${tasa > 0 ? fmtVES(totalUSD * tasa) : '—'}`,
    193,
    finalY + 38,
    { align: 'right' },
  )
  doc.setTextColor(255, 200, 120)
  doc.text(
    `Restante por Cobrar: ${fmtUSD(saldoPendienteUSD)}`,
    193,
    finalY + 44,
    { align: 'right' },
  )

  const firmaY = Math.min(274, finalY + 66)
  doc.setDrawColor(120, 120, 120)
  doc.line(22, firmaY, 88, firmaY)
  doc.line(122, firmaY, 188, firmaY)
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8.5)
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
    startY: 34,
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
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [17, 17, 17], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
  })

  const finalY = (doc.lastAutoTable?.finalY || 120) + 6
  doc.setFillColor(17, 17, 17)
  doc.rect(14, finalY, 269, 18, 'F')
  doc.setTextColor(255, 255, 255)
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
    startY: 34,
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
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [17, 17, 17], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
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
