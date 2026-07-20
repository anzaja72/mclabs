/**
 * Motor de estados financieros Colombia (NIIF/ColGAAP + PUC).
 *
 * A partir del libro auxiliar o balance de prueba (Excel), clasifica las
 * cuentas por su código PUC y construye:
 *  - Balance General / Estado de Situación Financiera (NIC 1)
 *  - Estado de Resultados por función (NIC 1 párr. 103-105)
 *  - Ratios (márgenes bruto/operacional/EBITDA/neto, ROA, ROE)
 *  - Validación de la ecuación patrimonial A = P + Pt
 *
 * La clasificación es DETERMINÍSTICA (clase 1=activo, 2=pasivo, 3=patrimonio,
 * 4=ingresos, 5=gastos, 6-7=costos): no requiere IA, es instantánea.
 * Basado en las skills construir-balance-general y construir-estado-resultados
 * (Decreto 2420/2015, Resolución 139/2015 PUC).
 */

export interface CuentaSaldo {
    codigo: string
    nombre: string
    debito: number
    credito: number
}

export interface LineaEstado {
    codigo: string
    nombre: string
    valor: number
}

export interface BalanceGeneral {
    activoCorriente: LineaEstado[]
    activoNoCorriente: LineaEstado[]
    totalActivoCorriente: number
    totalActivoNoCorriente: number
    totalActivo: number
    pasivoCorriente: LineaEstado[]
    pasivoNoCorriente: LineaEstado[]
    totalPasivoCorriente: number
    totalPasivoNoCorriente: number
    totalPasivo: number
    patrimonio: LineaEstado[]
    totalPatrimonio: number
    validacion: { diferencia: number; cuadra: boolean; utilidadIncorporada: boolean }
}

export interface EstadoResultados {
    ingresosOperacionales: LineaEstado[]
    ingresosNetos: number
    costoVentas: LineaEstado[]
    totalCostoVentas: number
    utilidadBruta: number
    otrosIngresos: LineaEstado[]
    totalOtrosIngresos: number
    gastosAdmin: LineaEstado[]
    totalGastosAdmin: number
    gastosVentas: LineaEstado[]
    totalGastosVentas: number
    utilidadOperacional: number
    gastosNoOperacionales: LineaEstado[]
    totalGastosNoOperacionales: number
    utilidadAntesImpuestos: number
    impuestos: LineaEstado[]
    totalImpuestos: number
    utilidadNeta: number
    depreciacionAmortizacion: number
    ebitda: number
    margenes: { bruto: number; operacional: number; ebitda: number; neto: number }
}

export interface EstadosFinancieros {
    balanceGeneral: BalanceGeneral
    estadoResultados: EstadoResultados
    ratios: { roa: number; roe: number; endeudamiento: number; razonCorriente: number }
    cuentasIgnoradas: LineaEstado[]
    totalCuentas: number
}

/* ============ Parsing del Excel (libro auxiliar / balance de prueba) ============ */

const normalizar = (h: string) =>
    h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const num = (v: unknown): number => {
    if (typeof v === 'number') return v
    if (v == null || v === '') return 0
    const s = String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
    return parseFloat(s) || 0
}

/**
 * Convierte las filas del Excel en saldos por cuenta PUC.
 * Acepta balance de prueba (una fila por cuenta) o libro auxiliar
 * (varios movimientos por cuenta: se agregan sumando débitos y créditos).
 */
export function parsearCuentas(rows: Record<string, unknown>[]): CuentaSaldo[] {
    if (!rows.length) return []
    const headers = Object.keys(rows[0])

    const findCol = (candidates: string[], exclude: string[] = []) => {
        for (const c of candidates) {
            const hit = headers.find(h => {
                const n = normalizar(h)
                if (exclude.some(e => n.includes(e))) return false
                return n.includes(c)
            })
            if (hit) return hit
        }
        return undefined
    }

    const colCodigo = findCol(['codigo cuenta', 'codigo puc', 'cuenta puc', 'codigo', 'cod cuenta', 'cta'])
    const colNombre = findCol(['nombre cuenta', 'cuenta contable', 'nombre', 'descripcion cuenta', 'descripcion'], ['codigo'])
    const colDebito = findCol(['debito', 'debe', 'debit', 'movimiento debito'], ['saldo'])
    const colCredito = findCol(['credito', 'haber', 'credit', 'movimiento credito'], ['saldo'])
    const colSaldo = findCol(['saldo final', 'saldo actual', 'nuevo saldo', 'saldo'], ['inicial', 'anterior', 'movimiento'])

    if (!colCodigo) return []

    const mapa = new Map<string, CuentaSaldo>()

    for (const row of rows) {
        const codigoRaw = String(row[colCodigo] ?? '').trim()
        const codigo = codigoRaw.replace(/[^\d]/g, '')
        // Cuenta PUC válida: 1 a 10 dígitos, clase 1-9
        if (!codigo || codigo.length < 1 || !/^[1-9]/.test(codigo)) continue

        const nombre = colNombre ? String(row[colNombre] ?? '').trim() : ''
        let debito = colDebito ? num(row[colDebito]) : 0
        let credito = colCredito ? num(row[colCredito]) : 0

        // Archivo solo con columna de saldo: asignar el lado por la naturaleza
        if (!colDebito && !colCredito && colSaldo) {
            const saldo = num(row[colSaldo])
            const clase = codigo[0]
            const naturalezaDebito = ['1', '5', '6', '7'].includes(clase)
            if (naturalezaDebito) {
                if (saldo >= 0) debito = saldo
                else credito = -saldo
            } else {
                // clases 2,3,4: el saldo suele venir positivo aunque es crédito
                if (saldo >= 0) credito = saldo
                else debito = -saldo
            }
        }

        if (debito === 0 && credito === 0) continue

        const g = mapa.get(codigo) ?? { codigo, nombre, debito: 0, credito: 0 }
        g.debito += debito
        g.credito += credito
        if (!g.nombre && nombre) g.nombre = nombre
        mapa.set(codigo, g)
    }

    return [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))
}

/**
 * Parser robusto para exportes reales de software contable (hoja completa).
 *
 * Maneja los formatos típicos:
 *  - Filas de título antes de los encabezados (empresa, período, normas):
 *    el encabezado se localiza automáticamente en las primeras 30 filas.
 *  - "Cuenta" con código y nombre en la misma celda ("11050501 CAJA GENERAL")
 *    que aparece UNA vez por bloque; los movimientos de abajo van con la
 *    celda vacía (se arrastra la cuenta vigente).
 *  - Filas "Total …" / "Sumas …" de subtotales: se saltan (evita duplicar).
 *  - Balances jerárquicos (clase/grupo/cuenta/subcuenta): si un código es
 *    prefijo de otros y su valor es la suma exacta de sus hijos, es una fila
 *    de agregación y se descarta.
 *  - Balance de prueba plano (una fila por cuenta): funciona igual.
 */
export function parsearCuentasDesdeHoja(aoa: unknown[][]): CuentaSaldo[] {
    if (!aoa?.length) return []

    // 1) Localizar la fila de encabezados
    let headerIdx = -1
    for (let i = 0; i < Math.min(aoa.length, 30); i++) {
        const cells = (aoa[i] || []).map(c => normalizar(String(c ?? '')))
        const hasCuenta = cells.some(c => /(cuenta|codigo|puc)/.test(c) || c === 'cta')
        const hasValor = cells.some(c => /(debito|debitos|debe|credito|creditos|haber|saldo)/.test(c))
        if (hasCuenta && hasValor) { headerIdx = i; break }
    }
    if (headerIdx === -1) return []

    const headers = (aoa[headerIdx] || []).map(c => normalizar(String(c ?? '')))
    const findIdx = (cands: string[], exclude: string[] = []) => {
        for (const c of cands) {
            const idx = headers.findIndex(h => h && !exclude.some(e => h.includes(e)) && h.includes(c))
            if (idx !== -1) return idx
        }
        return -1
    }
    const iCod = findIdx(['codigo cuenta', 'codigo puc', 'cuenta puc', 'codigo', 'cuenta', 'cta'])
    const iNom = findIdx(['nombre cuenta', 'cuenta contable', 'nombre', 'descripcion'], ['codigo'])
    const iDeb = findIdx(['debito', 'debe'], ['saldo'])
    const iCre = findIdx(['credito', 'haber'], ['saldo'])
    const iSal = findIdx(['saldo final', 'saldo actual', 'nuevo saldo', 'saldo'], ['inicial', 'anterior'])
    if (iCod === -1) return []

    const mapa = new Map<string, CuentaSaldo>()
    let actual: CuentaSaldo | null = null

    for (let i = headerIdx + 1; i < aoa.length; i++) {
        const row = aoa[i] || []
        const celdaCod = String(row[iCod] ?? '').trim()
        const norm = normalizar(celdaCod)

        // Subtotales del software: cierran el bloque y no suman
        if (/^(total|sumas|suma general)/.test(norm)) { actual = null; continue }

        if (celdaCod) {
            const m = celdaCod.match(/^(\d{1,10})\s*[-–—.]?\s*(.*)$/)
            if (m && /^[1-9]/.test(m[1])) {
                const codigo = m[1]
                const nombreCelda = (m[2] || '').trim()
                const nombreCol = iNom !== -1 ? String(row[iNom] ?? '').trim() : ''
                const existente = mapa.get(codigo)
                actual = existente ?? { codigo, nombre: nombreCelda || nombreCol, debito: 0, credito: 0 }
                if (!existente) mapa.set(codigo, actual)
                else if (!actual.nombre && (nombreCelda || nombreCol)) actual.nombre = nombreCelda || nombreCol
            } else {
                // Texto que no es cuenta (títulos intermedios): cierra el bloque
                actual = null
                continue
            }
        }
        if (!actual) continue

        let deb = iDeb !== -1 ? num(row[iDeb]) : 0
        let cre = iCre !== -1 ? num(row[iCre]) : 0
        // Archivo solo con saldo: asignar el lado según la naturaleza de la clase
        if (iDeb === -1 && iCre === -1 && iSal !== -1) {
            const s = num(row[iSal])
            const naturalezaDebito = ['1', '5', '6', '7'].includes(actual.codigo[0])
            if (naturalezaDebito) { if (s >= 0) deb = s; else cre = -s }
            else { if (s >= 0) cre = s; else deb = -s }
        }
        actual.debito += deb
        actual.credito += cre
    }

    // 2) Filtrar filas de agregación jerárquica (padre = suma exacta de hijos)
    const lista = [...mapa.values()]
    const sinAgregadas = lista.filter(p => {
        const hijos = lista.filter(h => h !== p && h.codigo.startsWith(p.codigo))
        if (hijos.length === 0) return true
        const sumaDeb = hijos.reduce((s, h) => s + h.debito, 0)
        const sumaCre = hijos.reduce((s, h) => s + h.credito, 0)
        return !(Math.abs(p.debito - sumaDeb) < 1 && Math.abs(p.credito - sumaCre) < 1)
    })

    return sinAgregadas
        .filter(c => c.debito !== 0 || c.credito !== 0)
        .map(c => ({ ...c, debito: redondear(c.debito), credito: redondear(c.credito) }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
}

/* ============ Nombres PUC de respaldo (cuando el archivo no trae nombre) ============ */

const NOMBRES_PUC: Record<string, string> = {
    '11': 'Efectivo y equivalentes', '1105': 'Caja', '1110': 'Bancos', '1120': 'Cuentas de ahorro',
    '12': 'Inversiones', '13': 'Deudores', '1305': 'Clientes', '1330': 'Anticipos y avances',
    '1355': 'Anticipo de impuestos', '1365': 'Cuentas por cobrar a trabajadores', '1399': 'Deterioro (provisiones)',
    '14': 'Inventarios', '1435': 'Mercancías no fabricadas por la empresa',
    '15': 'Propiedades, planta y equipo', '1504': 'Terrenos', '1516': 'Construcciones y edificaciones',
    '1520': 'Maquinaria y equipo', '1524': 'Equipo de oficina', '1528': 'Equipo de cómputo',
    '1540': 'Flota y equipo de transporte', '1592': 'Depreciación acumulada',
    '16': 'Intangibles', '1610': 'Marcas', '1635': 'Licencias y software',
    '17': 'Diferidos', '1705': 'Gastos pagados por anticipado',
    '18': 'Otros activos', '19': 'Valorizaciones',
    '21': 'Obligaciones financieras', '2105': 'Obligaciones bancarias',
    '22': 'Proveedores', '2205': 'Proveedores nacionales',
    '23': 'Cuentas por pagar', '2335': 'Costos y gastos por pagar', '2365': 'Retención en la fuente',
    '2367': 'Impuesto a las ventas retenido', '2368': 'Impuesto de industria y comercio retenido',
    '2370': 'Retenciones y aportes de nómina', '2380': 'Acreedores varios',
    '24': 'Impuestos, gravámenes y tasas', '2404': 'Impuesto de renta por pagar', '2408': 'IVA por pagar',
    '25': 'Obligaciones laborales', '2505': 'Salarios por pagar', '2510': 'Cesantías consolidadas',
    '2515': 'Intereses sobre cesantías', '2525': 'Vacaciones consolidadas',
    '26': 'Pasivos estimados y provisiones', '27': 'Diferidos (ingresos anticipados)',
    '28': 'Otros pasivos', '2805': 'Anticipos y avances recibidos', '29': 'Bonos y papeles comerciales',
    '31': 'Capital social', '3105': 'Capital suscrito y pagado', '3115': 'Aportes sociales',
    '32': 'Superávit de capital', '33': 'Reservas', '3305': 'Reserva legal',
    '34': 'Revalorización del patrimonio', '36': 'Resultados del ejercicio', '3605': 'Utilidad del ejercicio',
    '3610': 'Pérdida del ejercicio', '37': 'Resultados de ejercicios anteriores',
    '3705': 'Utilidades acumuladas', '38': 'Superávit por valorizaciones',
    '41': 'Ingresos operacionales', '4135': 'Comercio al por mayor y al por menor', '4140': 'Servicios',
    '4170': 'Devoluciones en ventas', '4175': 'Descuentos en ventas',
    '42': 'Ingresos no operacionales', '4205': 'Ingresos financieros', '4210': 'Dividendos y participaciones',
    '4250': 'Utilidad en venta de propiedades', '4295': 'Ingresos diversos',
    '51': 'Gastos de administración', '5105': 'Gastos de personal', '5110': 'Honorarios',
    '5115': 'Impuestos', '5120': 'Arrendamientos', '5135': 'Servicios', '5140': 'Gastos legales',
    '5145': 'Mantenimiento y reparaciones', '5155': 'Gastos de viaje', '5160': 'Depreciaciones',
    '5165': 'Amortizaciones', '5195': 'Gastos diversos', '5199': 'Provisiones y deterioros',
    '52': 'Gastos de ventas', '5260': 'Depreciaciones (ventas)', '5299': 'Provisiones (ventas)',
    '53': 'Gastos no operacionales', '5305': 'Gastos financieros', '5310': 'Pérdida en venta de activos',
    '5320': 'Diferencia en cambio', '5395': 'Gastos diversos no operacionales',
    '54': 'Impuesto de renta y complementarios', '5405': 'Impuesto de renta corriente',
    '5410': 'Impuesto de renta diferido',
    '61': 'Costo de ventas', '6135': 'Costo — comercio al por mayor y menor', '6205': 'Costo de servicios',
    '62': 'Costo de servicios', '71': 'Costos de producción', '72': 'Costos indirectos',
}

const nombreCuenta = (c: CuentaSaldo): string => {
    if (c.nombre) return c.nombre
    return NOMBRES_PUC[c.codigo]
        ?? NOMBRES_PUC[c.codigo.slice(0, 4)]
        ?? NOMBRES_PUC[c.codigo.slice(0, 2)]
        ?? `Cuenta ${c.codigo}`
}

/* ============ Construcción de los estados ============ */

const redondear = (v: number) => Math.round(v * 100) / 100
const sum = (arr: LineaEstado[]) => redondear(arr.reduce((s, l) => s + l.valor, 0))

export function construirEstados(cuentas: CuentaSaldo[]): EstadosFinancieros {
    const bg = {
        activoCorriente: [] as LineaEstado[],
        activoNoCorriente: [] as LineaEstado[],
        pasivoCorriente: [] as LineaEstado[],
        pasivoNoCorriente: [] as LineaEstado[],
        patrimonio: [] as LineaEstado[],
    }
    const er = {
        ingresosOperacionales: [] as LineaEstado[],
        otrosIngresos: [] as LineaEstado[],
        costoVentas: [] as LineaEstado[],
        gastosAdmin: [] as LineaEstado[],
        gastosVentas: [] as LineaEstado[],
        gastosNoOperacionales: [] as LineaEstado[],
        impuestos: [] as LineaEstado[],
    }
    const ignoradas: LineaEstado[] = []
    let depreciacionAmortizacion = 0

    for (const c of cuentas) {
        const clase = c.codigo[0]
        const grupo = c.codigo.slice(0, 2)
        const sub = c.codigo.slice(0, 4)
        const nombre = nombreCuenta(c)
        const nombreLower = normalizar(nombre)

        if (clase === '1') {
            // Activo: valor con naturaleza débito (reductoras quedan negativas)
            const valor = redondear(c.debito - c.credito)
            const linea = { codigo: c.codigo, nombre, valor }
            // Corriente: efectivo, inversiones temporales, deudores, inventarios, diferidos CP.
            // En el grupo 12 solo son corrientes las inversiones temporales (CDT,
            // fiducias, bonos CP); acciones y aportes permanentes van a no corriente.
            const inversionTemporal = grupo === '12' &&
                (['1205', '1210', '1215'].includes(sub) || /cdt|fiduci|temporal/.test(nombreLower))
            const esCorriente = (['11', '13', '14', '17'].includes(grupo) || inversionTemporal) &&
                !nombreLower.includes('largo plazo')
            if (esCorriente) bg.activoCorriente.push(linea)
            else bg.activoNoCorriente.push(linea)
        } else if (clase === '2') {
            const valor = redondear(c.credito - c.debito)
            const linea = { codigo: c.codigo, nombre, valor }
            const esNoCorriente = grupo === '29' ||
                nombreLower.includes('largo plazo') || / lp\b/.test(nombreLower)
            if (esNoCorriente) bg.pasivoNoCorriente.push(linea)
            else bg.pasivoCorriente.push(linea)
        } else if (clase === '3') {
            bg.patrimonio.push({ codigo: c.codigo, nombre, valor: redondear(c.credito - c.debito) })
        } else if (clase === '4') {
            const valor = redondear(c.credito - c.debito)
            const linea = { codigo: c.codigo, nombre, valor }
            if (grupo === '41') er.ingresosOperacionales.push(linea)
            else er.otrosIngresos.push(linea)
        } else if (clase === '5') {
            const valor = redondear(c.debito - c.credito)
            const linea = { codigo: c.codigo, nombre, valor }
            if (['5160', '5165', '5260', '5265', '5199', '5299'].includes(sub)) {
                depreciacionAmortizacion += valor
            }
            if (grupo === '51') er.gastosAdmin.push(linea)
            else if (grupo === '52') er.gastosVentas.push(linea)
            else if (grupo === '53') er.gastosNoOperacionales.push(linea)
            else if (grupo === '54') er.impuestos.push(linea)
            else if (grupo === '59') ignoradas.push(linea) // cuentas de cierre
            else er.gastosAdmin.push(linea)
        } else if (clase === '6' || clase === '7') {
            er.costoVentas.push({ codigo: c.codigo, nombre, valor: redondear(c.debito - c.credito) })
        } else {
            // Clases 8 y 9: cuentas de orden y cierre — no van a los estados
            ignoradas.push({ codigo: c.codigo, nombre, valor: redondear(c.debito - c.credito) })
        }
    }

    /* --- Estado de Resultados (por función, NIC 1 párr. 103) --- */
    const ingresosNetos = sum(er.ingresosOperacionales)
    const totalCostoVentas = sum(er.costoVentas)
    const utilidadBruta = redondear(ingresosNetos - totalCostoVentas)
    const totalOtrosIngresos = sum(er.otrosIngresos)
    const totalGastosAdmin = sum(er.gastosAdmin)
    const totalGastosVentas = sum(er.gastosVentas)
    const utilidadOperacional = redondear(utilidadBruta + totalOtrosIngresos - totalGastosAdmin - totalGastosVentas)
    const totalGastosNoOperacionales = sum(er.gastosNoOperacionales)
    const utilidadAntesImpuestos = redondear(utilidadOperacional - totalGastosNoOperacionales)
    const totalImpuestos = sum(er.impuestos)
    const utilidadNeta = redondear(utilidadAntesImpuestos - totalImpuestos)
    const ebitda = redondear(utilidadOperacional + depreciacionAmortizacion)

    const pct = (v: number) => (ingresosNetos !== 0 ? redondear((v / ingresosNetos) * 100) : 0)
    const estadoResultados: EstadoResultados = {
        ...er,
        ingresosNetos, totalCostoVentas, utilidadBruta, totalOtrosIngresos,
        totalGastosAdmin, totalGastosVentas, utilidadOperacional,
        totalGastosNoOperacionales, utilidadAntesImpuestos, totalImpuestos,
        utilidadNeta, depreciacionAmortizacion: redondear(depreciacionAmortizacion), ebitda,
        margenes: { bruto: pct(utilidadBruta), operacional: pct(utilidadOperacional), ebitda: pct(ebitda), neto: pct(utilidadNeta) },
    }

    /* --- Balance General --- */
    // Si las cuentas de resultado siguen abiertas (no cerradas a 3605), el
    // resultado del período se incorpora al patrimonio para que A = P + Pt.
    const hayResultadoAbierto =
        er.ingresosOperacionales.length + er.otrosIngresos.length +
        er.costoVentas.length + er.gastosAdmin.length + er.gastosVentas.length +
        er.gastosNoOperacionales.length + er.impuestos.length > 0
    let utilidadIncorporada = false
    if (hayResultadoAbierto && Math.abs(utilidadNeta) > 0.005) {
        bg.patrimonio.push({
            codigo: '3605*',
            nombre: utilidadNeta >= 0 ? 'Utilidad del ejercicio (resultado del período)' : 'Pérdida del ejercicio (resultado del período)',
            valor: utilidadNeta,
        })
        utilidadIncorporada = true
    }

    const totalActivoCorriente = sum(bg.activoCorriente)
    const totalActivoNoCorriente = sum(bg.activoNoCorriente)
    const totalActivo = redondear(totalActivoCorriente + totalActivoNoCorriente)
    const totalPasivoCorriente = sum(bg.pasivoCorriente)
    const totalPasivoNoCorriente = sum(bg.pasivoNoCorriente)
    const totalPasivo = redondear(totalPasivoCorriente + totalPasivoNoCorriente)
    const totalPatrimonio = sum(bg.patrimonio)
    const diferencia = redondear(totalActivo - totalPasivo - totalPatrimonio)

    const balanceGeneral: BalanceGeneral = {
        ...bg,
        totalActivoCorriente, totalActivoNoCorriente, totalActivo,
        totalPasivoCorriente, totalPasivoNoCorriente, totalPasivo,
        totalPatrimonio,
        validacion: { diferencia, cuadra: Math.abs(diferencia) < 1, utilidadIncorporada },
    }

    const ratios = {
        roa: totalActivo !== 0 ? redondear((utilidadNeta / totalActivo) * 100) : 0,
        roe: totalPatrimonio !== 0 ? redondear((utilidadNeta / totalPatrimonio) * 100) : 0,
        endeudamiento: totalActivo !== 0 ? redondear((totalPasivo / totalActivo) * 100) : 0,
        razonCorriente: totalPasivoCorriente !== 0 ? redondear(totalActivoCorriente / totalPasivoCorriente) : 0,
    }

    return { balanceGeneral, estadoResultados, ratios, cuentasIgnoradas: ignoradas, totalCuentas: cuentas.length }
}
