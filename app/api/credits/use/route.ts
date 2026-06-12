import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { consumeCredit } from '@/lib/credits-server';
import { ToolType, TOOL_CREDIT_COLUMN } from '@/types/credits';

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const body = await request.json();
        const { tool } = body as { tool: ToolType };

        if (!tool || !TOOL_CREDIT_COLUMN[tool]) {
            return NextResponse.json({ error: 'Herramienta no válida' }, { status: 400 });
        }

        const result = await consumeCredit(user.id, tool);

        if (!result.ok) {
            return NextResponse.json(
                { error: 'Sin créditos disponibles', needsPurchase: result.needsPurchase },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            remaining: result.credits[TOOL_CREDIT_COLUMN[tool]],
            credits: result.credits,
        });
    } catch (error: unknown) {
        console.error('Error using credit:', error);
        const message = error instanceof Error ? error.message : 'Error al usar crédito';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
