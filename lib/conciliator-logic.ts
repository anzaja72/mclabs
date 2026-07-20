import { TIPO_CLASIFICACION, ResultItem } from "@/types/conciliator";

// ==================== UTILIDADES ====================

// Convierte fecha serial de Excel a JS Date
export const excelDateToJSDate = (serial: any) => {
    if (!serial) return null;
    const utc_days = Math.floor(Number(serial) - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

export const formatearFecha = (fecha: any) => {
    if (!fecha) return '-';

    // Si llega como número (serial Excel), intentar convertir
    if (typeof fecha === 'number') {
        const d = excelDateToJSDate(fecha);
        if (d) return d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }

    const str = String(fecha).trim();
    if (str === '-' || str === '') return '-';

    // Intentar parsear manualmente formatos comunes latinos: DD/MM/YYYY o DD-MM-YYYY
    const matchDMY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (matchDMY) {
        const day = parseInt(matchDMY[1], 10);
        const month = parseInt(matchDMY[2], 10);
        let year = parseInt(matchDMY[3], 10);
        if (year < 100) year += 2000;

        // Crear fecha (Mes es 0-indexado)
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
    }

    // Fallback a parser estándar
    try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
    } catch (e) { }

    return str;
};

export const normalizarNIT = (nit: any) => {
    if (!nit) return '0';
    const nitStr = nit.toString();
    const clean = nitStr.split('-')[0].replace(/[^0-9]/g, '');
    return clean || '0';
};

export const normalizarValor = (valor: any) => {
    // Si ya es número, devolverlo (aunque con raw:false esto será raro)
    if (typeof valor === 'number') return valor;
    if (!valor) return 0;

    let str = valor.toString().trim();
    str = str.replace(/[$\s]/g, ''); // Eliminar signo pesos y espacios

    const hasComma = str.includes(',');
    const hasDot = str.includes('.');

    // Caso 1: Tiene puntos y comas (Ej: 1.000.000,00 o 1,000,000.00)
    if (hasDot && hasComma) {
        if (str.lastIndexOf('.') < str.lastIndexOf(',')) {
            // Formato CO/EU: 1.000.000,00 -> Eliminar puntos, coma es decimal
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // Formato US: 1,000,000.00 -> Eliminar comas
            str = str.replace(/,/g, '');
        }
    }
    // Caso 2: Solo tiene puntos (Ej: 1.000.000 o 1.000 o 10.5)
    else if (hasDot) {
        // Si hay más de un punto, asumimos separador de miles (Ej: 1.030.000)
        if ((str.match(/\./g) || []).length > 1) {
            str = str.replace(/\./g, '');
        } else {
            // Un solo punto.
            // En contexto Colombia/Contable, si tiene 3 dígitos después del punto, es muy probable que sea miles (1.000, 17.000)
            const parts = str.split('.');
            if (parts[1] && parts[1].length === 3) {
                str = str.replace(/\./g, '');
            } else {
                // Si tiene 1 o 2 decimales (10.5, 10.50), asumimos decimal estándar
            }
        }
    }
    // Caso 3: Solo tiene comas (Ej: 1,000 o 50,5)
    else if (hasComma) {
        if ((str.match(/,/g) || []).length > 1) {
            str = str.replace(/,/g, '');
        } else {
            str = str.replace(',', '.');
        }
    }

    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
};

export const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(valor);
};

// ==================== LÓGICA DE NEGOCIO ====================

export const procesarDatosDIAN = (datosRaw: any[]) => {
    const mapa = new Map();
    let totalRegistros = 0;

    datosRaw.forEach(row => {
        // Búsqueda de columna mejorada
        const getCol = (matches: string[]) => {
            const keys = Object.keys(row);
            let key = keys.find(k => matches.some(m => k.trim().toLowerCase() === m.toLowerCase()));
            if (key) return row[key];
            for (const m of matches) {
                const foundKey = keys.find(k => k.toLowerCase().includes(m.toLowerCase()));
                if (foundKey) return row[foundKey];
            }
            return undefined;
        };

        const grupo = (getCol(['Grupo']) || '').trim();
        const tipoDoc = (getCol(['Tipo de documento', 'Tipo Documento']) || '').toLowerCase();

        const nitEmisor = normalizarNIT(getCol(['NIT Emisor', 'Emisor']));
        const nitReceptor = normalizarNIT(getCol(['NIT Receptor', 'Receptor']));
        const valorTotal = normalizarValor(getCol(['Valor Total', 'Total Factura', 'Total']));
        const prefijo = getCol(['Prefijo']) || '';
        const folio = getCol(['Folio', 'Número', 'Consecutivo']) || '';
        const fecha = getCol(['Fecha Emisión', 'Fecha', 'Fecha Generación']);

        if (!grupo || valorTotal === 0) return;

        let clasificacion = TIPO_CLASIFICACION.OTRO;
        let nitTercero = '';

        // --- LÓGICA DE CLASIFICACIÓN ---

        if (grupo === 'Emitido') {
            nitTercero = nitReceptor;
            if (tipoDoc.includes('documento soporte')) {
                clasificacion = TIPO_CLASIFICACION.COMPRA;
                nitTercero = nitReceptor;
            }
            else if (tipoDoc.includes('nómina')) {
                clasificacion = TIPO_CLASIFICACION.NOMINA;
            }
            else if (tipoDoc.includes('factura') || tipoDoc.includes('nota débito') || tipoDoc.includes('nota crédito')) {
                clasificacion = TIPO_CLASIFICACION.VENTA;
            }
        } else if (grupo === 'Recibido') {
            nitTercero = nitEmisor;
            clasificacion = TIPO_CLASIFICACION.COMPRA;
        }

        if (clasificacion === TIPO_CLASIFICACION.OTRO || !nitTercero || nitTercero.length < 5) return;

        let valorAjustado = valorTotal;
        const esNotaCredito = tipoDoc.includes('nota crédito') || tipoDoc.includes('nota credito') || tipoDoc.includes('nota de ajuste');

        if (esNotaCredito) {
            valorAjustado = -Math.abs(valorTotal);
        }

        const key = `${nitTercero}|${clasificacion}`;

        if (!mapa.has(key)) {
            mapa.set(key, {
                nit: nitTercero,
                tipo: clasificacion,
                total: 0,
                docs: 0,
                detalles: []
            });
        }

        const entry = mapa.get(key);
        entry.total += valorAjustado;
        entry.docs += 1;
        entry.detalles.push({
            id: `${prefijo}${folio}`,
            fecha: formatearFecha(fecha),
            valor: valorAjustado,
            tipoDoc: tipoDoc,
            esNotaCredito
        });
        totalRegistros++;
    });

    return { mapa, totalRegistros };
};

export const procesarDatosContables = (datosRaw: any[]) => {
    const mapa = new Map();
    let totalRegistros = 0;

    datosRaw.forEach(row => {
        const getCol = (matches: string[]) => {
            const keys = Object.keys(row);
            let key = keys.find(k => matches.some(m => k.trim().toLowerCase() === m.toLowerCase()));
            if (key) return row[key];
            for (const m of matches) {
                const foundKey = keys.find(k => k.toLowerCase().includes(m.toLowerCase()));
                if (foundKey) return row[foundKey];
            }
            return undefined;
        };

        const nit = normalizarNIT(getCol(['Identificación', 'NIT', 'Tercero']));
        const debito = normalizarValor(getCol(['Débito', 'Debito', 'Debe']));
        const credito = normalizarValor(getCol(['Crédito', 'Credito', 'Haber']));
        const comprobante = getCol(['Comprobante', 'Documento', 'Fuente']) || 'S/N';
        const fecha = getCol(['Fecha', 'Día']);
        // Intentar obtener cuenta contable para estados financieros
        const cuenta = getCol(['Cuenta', 'Codigo', 'Puc', 'Account', 'Código']) || '';

        if (!nit || nit.length < 5 || (debito === 0 && credito === 0)) return;

        if (!mapa.has(nit)) {
            mapa.set(nit, {
                nit,
                totalDebito: 0,
                totalCredito: 0,
                neto: 0,
                // Sumas por clase de cuenta PUC: el cruce correcto es
                // ventas ↔ cartera (13)/ingresos (41) y compras ↔ proveedores (22)/costos-gastos.
                porClase: { deb13: 0, cred13: 0, cred41: 0, deb41: 0, cred22: 0, deb22: 0, debGasto: 0 },
                movimientos: []
            });
        }

        const entry = mapa.get(nit);
        entry.totalDebito += debito;
        entry.totalCredito += credito;
        entry.neto += (debito - credito);

        const codCuenta = String(cuenta ?? '').replace(/[^0-9]/g, '');
        const grupoCta = codCuenta.slice(0, 2);
        if (grupoCta === '13') { entry.porClase.deb13 += debito; entry.porClase.cred13 += credito; }
        else if (grupoCta === '41') { entry.porClase.cred41 += credito; entry.porClase.deb41 += debito; }
        else if (grupoCta === '22') { entry.porClase.cred22 += credito; entry.porClase.deb22 += debito; }
        else if (['51', '52', '53', '61', '62', '71', '72', '14', '15'].includes(grupoCta)) {
            entry.porClase.debGasto += debito;
        }
        entry.movimientos.push({
            id: comprobante,
            fecha: formatearFecha(fecha),
            debito,
            credito,
            cuenta, // Guardamos la cuenta si existe
            netoLinea: debito - credito
        });
        totalRegistros++;
    });

    return { mapa, totalRegistros };
};

export const generarConciliacion = (mapaDIAN: Map<string, any>, mapaContable: Map<string, any>): ResultItem[] => {
    const resultados: ResultItem[] = [];

    mapaDIAN.forEach((dianData, key) => {
        const { nit, tipo, total } = dianData;
        const contableData = mapaContable.get(nit);

        let totalContableComparativo = 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        let movimientosContables: any[] = [];

        if (contableData) {
            movimientosContables = contableData.movimientos;
            const pc = contableData.porClase || {};

            // Con un auxiliar completo (todas las cuentas), los débitos y
            // créditos del mismo NIT se cancelan entre sí (partida doble).
            // El cruce fiable es por clase de cuenta; se elige el candidato
            // más cercano al total DIAN.
            let candidatos: number[] = [];
            if (tipo === TIPO_CLASIFICACION.VENTA) {
                candidatos = [
                    pc.deb13 || 0,                       // facturación a clientes (13xx débitos, con IVA)
                    pc.cred41 || 0,                      // ingresos (41xx, sin IVA)
                    (pc.cred41 || 0) - (pc.deb41 || 0),  // ingresos netos de devoluciones
                    Math.abs(contableData.totalCredito - contableData.totalDebito),
                    Math.abs(contableData.neto),
                ];
            } else if (tipo === TIPO_CLASIFICACION.COMPRA) {
                candidatos = [
                    pc.cred22 || 0,                      // causación a proveedores (22xx créditos, con IVA)
                    pc.debGasto || 0,                    // costo/gasto/inventario registrado (sin IVA)
                    contableData.totalCredito,
                    contableData.totalDebito,
                    Math.abs(contableData.neto),
                ];
            }
            const validos = candidatos.filter(c => c > 0);
            if (validos.length > 0) {
                totalContableComparativo = validos.reduce((mejor, c) =>
                    Math.abs(c - total) < Math.abs(mejor - total) ? c : mejor, validos[0]);
            }
        }

        const diferencia = totalContableComparativo - total;
        const difAbs = Math.abs(diferencia);

        let estado = 'OK';
        if (!contableData) estado = 'SOLO_DIAN';
        else if (difAbs <= 100) estado = 'OK';
        else if ((difAbs / total) < 0.10) estado = 'ADVERTENCIA';
        else estado = 'CRITICO';

        resultados.push({
            nit,
            tipo,
            dianTotal: total,
            dianDocs: dianData.docs,
            contableTotal: totalContableComparativo,
            diferencia,
            estado,
            detallesDian: dianData.detalles,
            detallesContable: contableData ? contableData.movimientos : [],
            debugContable: contableData
        });
    });

    return resultados.sort((a, b) => {
        const score: Record<string, number> = { 'CRITICO': 0, 'SOLO_DIAN': 1, 'ADVERTENCIA': 2, 'OK': 3 };
        return score[a.estado] - score[b.estado];
    });
};
