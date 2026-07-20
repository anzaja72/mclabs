import { NextRequest, NextResponse } from 'next/server';

/**
 * Registra el usuario en la hoja "Usuarios MCTOOLS" (#5).
 *
 * Mecanismo: un Google Apps Script publicado como Web App (doPost) que
 * hace sheet.appendRow(...). La URL del Web App va en SHEETS_WEBHOOK_URL.
 * Si no está configurada, el endpoint no falla (el alta del usuario nunca
 * se bloquea por esto).
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { nombre, email, telefono, ciudad, empresa, cargo } = body as Record<string, string>;

        const url = process.env.SHEETS_WEBHOOK_URL;
        if (!url) {
            // Aún no configurado: aceptamos sin reenviar.
            return NextResponse.json({ ok: true, forwarded: false });
        }

        const token = process.env.SHEETS_WEBHOOK_TOKEN || '';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                fecha: new Date().toISOString(),
                nombre: nombre || '',
                email: email || '',
                telefono: telefono || '',
                ciudad: ciudad || '',
                empresa: empresa || '',
                cargo: cargo || '',
            }),
        });

        return NextResponse.json({ ok: true, forwarded: res.ok });
    } catch {
        // Nunca bloquear el registro por un fallo en la hoja
        return NextResponse.json({ ok: true, forwarded: false });
    }
}
