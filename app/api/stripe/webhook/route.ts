import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { CREDIT_PACKAGES, PackageType } from '@/types/credits';

export async function POST(request: NextRequest) {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
        return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json(
            { error: `Webhook Error: ${err.message}` },
            { status: 400 }
        );
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const packageType = session.metadata?.package_type as PackageType;

        if (!userId || !packageType) {
            console.error('Missing metadata in checkout session');
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
        }

        const pkg = CREDIT_PACKAGES[packageType];
        if (!pkg) {
            console.error('Invalid package type:', packageType);
            return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
        }

        try {
            // Check if user already has a credits row
            const { data: existing } = await supabaseAdmin
                .from('user_credits')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (existing) {
                // Add credits to existing row
                const { error } = await supabaseAdmin
                    .from('user_credits')
                    .update({
                        bank_recs_credits: existing.bank_recs_credits + pkg.bank_recs_credits,
                        conciliator_credits: existing.conciliator_credits + pkg.conciliator_credits,
                        dashboards_credits: existing.dashboards_credits + pkg.dashboards_credits,
                        extractor_credits: existing.extractor_credits + pkg.extractor_credits,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', userId);

                if (error) throw error;
            } else {
                // Create new credits row
                const { error } = await supabaseAdmin
                    .from('user_credits')
                    .insert({
                        user_id: userId,
                        bank_recs_credits: pkg.bank_recs_credits,
                        conciliator_credits: pkg.conciliator_credits,
                        dashboards_credits: pkg.dashboards_credits,
                        extractor_credits: pkg.extractor_credits,
                    });

                if (error) throw error;
            }

            console.log(`Credits added for user ${userId}: package ${packageType}`);
        } catch (err) {
            console.error('Error adding credits:', err);
            return NextResponse.json(
                { error: 'Error adding credits' },
                { status: 500 }
            );
        }
    }

    return NextResponse.json({ received: true });
}
