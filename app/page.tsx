'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type P = { id: string; username: string; aura: number };
type W = { receiver_id: string; gain: number; loss: number };
type T = { id: string; sender_id: string; receiver_id: string; amount: number; reason: string; created_at: string };
const STEPS = [10, 50, 100, 500, 1000, 5000, 10000, 25000, 50000, 100000];
const fmt = (n: number) => n.toLocaleString('en-IN');
const titleFor = (i: number, n: number) => (i === 0 ? 'Aura King' : i === n - 1 ? 'The Fallen One' : i === 1 ? 'Main Character' : 'Side Quest NPC');

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState('');
  const [people, setPeople] = useState<P[]>([]);
  const [stats, setStats] = useState<W[]>([]);
  const [feed, setFeed] = useState<T[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/login'); return; }
    setMe(session.user.id);
    const [p, w, t] = await Promise.all([
      supabase.from('profiles').select('id,username,aura').order('aura', { ascending: false }),
      supabase.from('weekly_stats').select('*'),
      supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    setPeople((p.data as P[]) ?? []); setStats((w.data as W[]) ?? []); setFeed((t.data as T[]) ?? []);
  }, [router]);

  useEffect(() => {
    load();
    const ch = supabase.channel('aura')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  async function send(confirmed = false) {
    setError('');
    if (reason.trim().length < 3) { setError('Add a reason first.'); return; }
    if (amount > 50000 && !confirmed) { setConfirm(true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/aura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ receiver: target, amount: sign * amount, reason }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error); setConfirm(false); return; }
    setConfirm(false); setTarget(null); setReason('');
  }

  const name = (id: string) => people.find(p => p.id === id)?.username ?? 'Someone';
  const stat = (id: string) => stats.find(s => s.receiver_id === id) ?? { gain: 0, loss: 0 };

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-center justify-between mb-10">
        <h1 className="text-3xl font-bold text-white tracking-tight">Aura</h1>
        <button aria-label="Log out" onClick={async () => { await supabase.auth.signOut(); router.replace('/login'); }}
          className="rounded-full p-2 text-aura-mist/60 hover:text-white hover:bg-ink-700"><LogOut size={20} /></button>
      </header>

      <ol className="space-y-3">
        {people.map((p, i) => (
          <motion.li layout key={p.id} className={`rounded-2xl p-5 ${i === 0 ? 'bg-ink-700 ring-1 ring-aura' : 'bg-ink-800'}`}>
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-lg text-white">{i + 1}. {p.username}{p.id === me && ' (you)'}</p>
                <p className="text-sm text-aura-light">{titleFor(i, people.length)}</p>
              </div>
              <p className={`font-bold text-white ${i === 0 ? 'text-5xl' : 'text-3xl'}`}>{fmt(p.aura)}</p>
            </div>
            <p className="mt-1 text-sm text-aura-mist/50">This week: +{fmt(stat(p.id).gain)} / −{fmt(stat(p.id).loss)}</p>
            {p.id !== me && (
              <button onClick={() => { setTarget(target === p.id ? null : p.id); setError(''); }}
                className="mt-3 text-sm font-medium text-aura-light hover:text-white">
                {target === p.id ? 'Close' : `Change ${p.username}'s aura`}
              </button>
            )}
            {target === p.id && (
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  {([1, -1] as const).map(s => (
                    <button key={s} onClick={() => setSign(s)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${sign === s ? 'bg-aura text-white' : 'bg-ink-700'}`}>
                      {s === 1 ? 'Give' : 'Remove'}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {STEPS.map(s => (
                    <button key={s} onClick={() => setAmount(s)} className={`rounded-lg px-3 py-1.5 text-sm ${amount === s ? 'bg-aura-deep text-white' : 'bg-ink-700'}`}>
                      {sign === 1 ? '+' : '−'}{fmt(s)}
                    </button>
                  ))}
                </div>
                <label className="block text-sm">Custom amount: {fmt(amount)}
                  <input type="range" min={1} max={100000} value={amount} onChange={e => setAmount(+e.target.value)} className="w-full accent-[#A100FF]" />
                </label>
                <input value={reason} onChange={e => setReason(e.target.value)} maxLength={280} placeholder="Why? (required)"
                  className="w-full rounded-xl bg-ink-700 px-4 py-3" />
                {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                <button onClick={() => send()} className="rounded-xl bg-aura px-5 py-2.5 font-semibold text-white hover:bg-aura-deep transition-colors">
                  {sign === 1 ? 'Give' : 'Remove'} {fmt(amount)} aura
                </button>
              </div>
            )}
          </motion.li>
        ))}
      </ol>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-white mb-4">Live feed</h2>
        {feed.length === 0 && <p className="text-aura-mist/50">Nothing yet. Give a friend some aura to start the feed.</p>}
        <ul className="space-y-3">
          {feed.map(t => (
            <li key={t.id} className="rounded-xl bg-ink-800 p-4">
              <p className="text-white">{name(t.sender_id)} {t.amount > 0 ? `gave ${name(t.receiver_id)} +${fmt(t.amount)}` : `removed ${fmt(-t.amount)} from ${name(t.receiver_id)}`}</p>
              <p className="text-sm text-aura-mist/60">“{t.reason}”</p>
            </li>
          ))}
        </ul>
      </section>

      <AnimatePresence>
        {confirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 grid place-items-center bg-black/70 p-6">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-2xl bg-ink-800 p-6 space-y-4">
              <p className="text-lg text-white">Confirm {sign === 1 ? '+' : '−'}{fmt(amount)} for {name(target ?? '')}?</p>
              {sign === -1 && <p className="text-sm text-aura-light">This opens an Aura Court case. Friends vote for 24 hours.</p>}
              <div className="flex gap-2">
                <button onClick={() => send(true)} className="flex-1 rounded-xl bg-aura py-2.5 font-semibold text-white">Confirm</button>
                <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl bg-ink-700 py-2.5">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
