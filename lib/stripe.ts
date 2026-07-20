import Stripe from 'stripe';

// Inicialización perezosa: evita que el build falle al recolectar page data
// cuando STRIPE_SECRET_KEY aún no está disponible.
let instance: Stripe | null = null;

const getStripe = (): Stripe => {
    if (!instance) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error('Stripe no configurado: falta STRIPE_SECRET_KEY.');
        }
        instance = new Stripe(key);
    }
    return instance;
};

export const stripe = new Proxy({} as Stripe, {
    get(_target, prop) {
        const client = getStripe() as unknown as Record<string | symbol, unknown>;
        const value = client[prop];
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
    },
});
