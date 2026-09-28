import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  const { receiver, amount, reason } = await req.json();
  if (receiver === user.id) return NextResponse.json({ error: 'You cannot change your own aura' }, { status: 400 });
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000)
    return NextResponse.json({ error: 'Amount must be between 1 and 100,000' }, { status: 400 });
  if (typeof reason !== 'string' || reason.trim().length < 3)
    return NextResponse.json({ error: 'A reason is required' }, { status: 400 });
  const { error } = await sb.rpc('apply_aura', { p_receiver: receiver, p_amount: amount, p_reason: reason.trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
