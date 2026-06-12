import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { CREDIT_PACKAGES, PackageType } from '@/types/credits';

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const body = await request.json();
        const { packageType } = body as { packageType: PackageType };

        if (!packageType) {
            return NextResponse.json(
                { error: 'Faltan parámetros requeridos' },
                { status: 400 }
            );
        }

        const pkg = CREDIT_PACKAGES[packageType];
        if (!pkg) {
            return NextResponse.json(
                { error: 'Paquete no válido' },
                { status: 400 }
            );
        }

        const origin =
            process.env.NEXT_PUBLIC_APP_URL ||
            request.headers.get('origin') ||
            'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'cop',
                        product_data: {
                            name: `MC Labs - ${pkg.label}`,
                            description: pkg.description,
                        },
                        unit_amount: pkg.price_cop * 100, // Stripe expects cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${origin}/?payment=success&package=${packageType}`,
            cancel_url: `${origin}/?payment=cancelled`,
            customer_email: user.email,
            metadata: {
                user_id: user.id,
                package_type: packageType,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error: unknown) {
        console.error('Stripe checkout error:', error);
        const message = error instanceof Error ? error.message : 'Error al crear sesión de pago';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
