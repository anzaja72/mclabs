import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/supabase/server-auth';
import { getOrCreateCredits } from '@/lib/credits-server';

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const credits = await getOrCreateCredits(user.id);
        return NextResponse.json(credits);
    } catch (error: unknown) {
        console.error('Error fetching credits:', error);
        const message = error instanceof Error ? error.message : 'Error al obtener créditos';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
