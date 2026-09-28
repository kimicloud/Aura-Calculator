'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const router = useRouter();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: `${username.trim().toLowerCase()}@aura.local`, password });
    if (error) setError('Wrong username or password.'); else router.replace('/');
  }
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-6xl font-bold tracking-tight text-white">Aura</h1>
        <p className="text-aura-mist/60">Sign in to see where you stand.</p>
        <input className="w-full rounded-xl bg-ink-700 px-4 py-3" placeholder="Username" value={username} onChange={e => setU(e.target.value)} autoComplete="username" required />
        <input className="w-full rounded-xl bg-ink-700 px-4 py-3" type="password" placeholder="Password" value={password} onChange={e => setP(e.target.value)} autoComplete="current-password" required />
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button className="w-full rounded-xl bg-aura py-3 font-semibold text-white hover:bg-aura-deep transition-colors">Sign in</button>
      </form>
    </main>
  );
}
