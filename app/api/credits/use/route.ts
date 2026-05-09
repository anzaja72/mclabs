import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ToolType, TOOL_CREDIT_COLUMN } from '@/types/credits';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, tool } = body as { userId: string; tool: ToolType };

        if (!userId || !tool) {
            return NextResponse.json(
                { error: 'userId y tool son requeridos' },
                { status: 400 }
            );
        }

        const creditColumn = TOOL_CREDIT_COLUMN[tool];
        if (!creditColumn) {
            return NextResponse.json(
                { error: 'Herramienta no válida' },
                { status: 400 }
            );
        }

        // Fetch current credits
        const { data: credits, error: fetchError } = await supabaseAdmin
            .from('user_credits')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            return NextResponse.json(
                { error: 'No se encontraron créditos para este usuario' },
                { status: 404 }
            );
        }

        const currentCredits = credits[creditColumn] as number;

        if (currentCredits <= 0) {
            return NextResponse.json(
                { error: 'Sin créditos disponibles', needsPurchase: true },
                { status: 403 }
            );
        }

        // Deduct 1 credit
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('user_credits')
            .update({
                [creditColumn]: currentCredits - 1,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .select()
            .single();

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            remaining: updated[creditColumn],
            credits: updated,
        });
    } catch (error: any) {
        console.error('Error using credit:', error);
        return NextResponse.json(
            { error: error.message || 'Error al usar crédito' },
            { status: 500 }
        );
    }
}
