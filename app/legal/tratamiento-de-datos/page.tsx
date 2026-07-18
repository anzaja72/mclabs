import Link from 'next/link'

export const metadata = {
    title: 'Política de Tratamiento de Datos — MC Labs',
}

export default function TratamientoDatosPage() {
    return (
        <main className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
                <Link href="/login" className="text-sm text-blue-600 hover:underline">← Volver</Link>
                <h1 className="mt-4 text-3xl font-black text-slate-900">Política de Tratamiento de Datos Personales</h1>
                <p className="mt-2 text-slate-500">MC Consultorías & Capacitación S.A.S. — NIT 900.614.837-8</p>

                <div className="mt-8 space-y-4 text-slate-700 leading-relaxed">
                    <p className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
                        Documento en proceso de validación legal. El contenido definitivo, conforme a la
                        Ley 1581 de 2012 y el Decreto 1074 de 2015, será publicado aquí. Para solicitudes
                        sobre tus datos personales, escribe a{' '}
                        <a href="mailto:datos@mcconsultorias.com.co" className="font-medium underline">datos@mcconsultorias.com.co</a>.
                    </p>

                    <h2 className="text-xl font-bold text-slate-900 pt-2">1. Responsable del tratamiento</h2>
                    <p>MC Consultorías & Capacitación S.A.S., con domicilio en Colombia, es responsable del
                    tratamiento de los datos personales recolectados a través de la plataforma MC Labs.</p>

                    <h2 className="text-xl font-bold text-slate-900 pt-2">2. Datos que recolectamos</h2>
                    <p>Nombre, correo electrónico, teléfono, ciudad, empresa y cargo, suministrados por el
                    titular al registrarse, además de la información que cargue para el uso de las herramientas.</p>

                    <h2 className="text-xl font-bold text-slate-900 pt-2">3. Finalidad</h2>
                    <p>Prestar los servicios de la plataforma, gestionar la cuenta y los créditos, enviar
                    comunicaciones relacionadas con el servicio y cumplir obligaciones legales.</p>

                    <h2 className="text-xl font-bold text-slate-900 pt-2">4. Derechos del titular</h2>
                    <p>Conocer, actualizar, rectificar y suprimir sus datos, y revocar la autorización, en los
                    términos de la Ley 1581 de 2012.</p>
                </div>
            </div>
        </main>
    )
}
