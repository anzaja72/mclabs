import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { CREDIT_PACKAGES, PackageType } from '@/types/credits';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { packageType, userId, userEmail } = body as {
            packageType: PackageType;
            userId: string;
            userEmail: string;
        };

        if (!packageType || !userId) {
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

        const origin = request.headers.get('origin') || 'http://localhost:3000';

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
            customer_email: userEmail,
            metadata: {
                user_id: userId,
                package_type: packageType,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error('Stripe checkout error:', error);
        return NextResponse.json(
            { error: error.message || 'Error al crear sesión de pago' },
            { status: 500 }
        );
    }
}
