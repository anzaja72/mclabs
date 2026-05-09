import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
    try {
        const userId = request.nextUrl.searchParams.get('userId');

        if (!userId) {
            return NextResponse.json(
                { error: 'userId es requerido' },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from('user_credits')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // No row found — create one with 100 credits for testing
            const { data: newRow, error: insertError } = await supabaseAdmin
                .from('user_credits')
                .insert({ 
                    user_id: userId,
                    bank_recs_credits: 100,
                    conciliator_credits: 100,
                    dashboards_credits: 100,
                    extractor_credits: 100
                })
                .select()
                .single();

            if (insertError) throw insertError;
            return NextResponse.json(newRow);
        }

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching credits:', error);
        return NextResponse.json(
            { error: error.message || 'Error al obtener créditos' },
            { status: 500 }
        );
    }
}
