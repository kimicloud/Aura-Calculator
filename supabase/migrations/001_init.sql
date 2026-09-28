create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  aura integer not null default 100000 check (aura >= 0),
  created_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles,
  receiver_id uuid not null references public.profiles,
  amount integer not null check (amount <> 0 and abs(amount) <= 100000),
  reason text not null check (length(trim(reason)) between 3 and 280),
  created_at timestamptz not null default now(),
  constraint no_self_aura check (sender_id <> receiver_id)
);
create table public.court_cases (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions,
  receiver_id uuid not null references public.profiles,
  amount integer not null,
  reason text not null,
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  status text not null default 'open' check (status in ('open','deserved','unfair'))
);
create table public.court_votes (
  case_id uuid not null references public.court_cases,
  voter_id uuid not null references public.profiles,
  vote text not null check (vote in ('deserved','unfair')),
  created_at timestamptz not null default now(),
  primary key (case_id, voter_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.weekly_results (
  week_start date not null,
  user_id uuid not null references public.profiles,
  username text not null,
  final_aura integer not null,
  rank integer not null,
  gain integer not null,
  loss integer not null,
  primary key (week_start, user_id)
);

-- Create a profile whenever an auth user is created.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Weekly gain/loss per user for the current week (Monday start, UTC).
create view public.weekly_stats with (security_invoker = true) as
select receiver_id,
  coalesce(sum(amount) filter (where amount > 0), 0)::int as gain,
  coalesce(-sum(amount) filter (where amount < 0), 0)::int as loss
from public.transactions
where created_at >= date_trunc('week', now())
group by receiver_id;

-- The only way to change aura. Sender is always the caller.
create function public.apply_aura(p_receiver uuid, p_amount integer, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tx uuid; sender_name text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_receiver = me then raise exception 'You cannot change your own aura'; end if;
  if p_amount = 0 or abs(p_amount) > 100000 then raise exception 'Amount must be between 1 and 100,000'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required'; end if;
  if (select count(*) from transactions where sender_id = me and created_at > now() - interval '1 minute') >= 8 then
    raise exception 'Slow down: max 8 changes per minute';
  end if;
  insert into transactions (sender_id, receiver_id, amount, reason)
    values (me, p_receiver, p_amount, trim(p_reason)) returning id into tx;
  update profiles set aura = greatest(aura + p_amount, 0) where id = p_receiver;
  select username into sender_name from profiles where id = me;
  insert into notifications (user_id, body) values (p_receiver,
    sender_name || case when p_amount > 0 then ' gave you +' else ' removed ' end || abs(p_amount) || ' aura: ' || trim(p_reason));
  if p_amount < -50000 then
    insert into court_cases (transaction_id, receiver_id, amount, reason) values (tx, p_receiver, p_amount, trim(p_reason));
    insert into notifications (user_id, body) select id, 'Aura Court opened: ' || (select username from profiles where id = p_receiver) || ' lost ' || abs(p_amount)
      from profiles;
  end if;
  return tx;
end $$;

-- Settle any open case that has expired or where all eligible friends voted.
create function public.resolve_court() returns void language plpgsql security definer set search_path = public as $$
declare c record; d int; u int; verdict text;
begin
  for c in select * from court_cases where status = 'open' loop
    select count(*) filter (where vote = 'deserved'), count(*) filter (where vote = 'unfair') into d, u
      from court_votes where case_id = c.id;
    if c.expires_at <= now() or d + u >= (select count(*) - 1 from profiles) then
      verdict := case when u > d then 'unfair' else 'deserved' end;
      update court_cases set status = verdict where id = c.id;
      if verdict = 'unfair' then
        update profiles set aura = aura + abs(c.amount) where id = c.receiver_id;
      end if;
      insert into notifications (user_id, body) values (c.receiver_id, 'Court verdict: ' || upper(verdict));
    end if;
  end loop;
end $$;

create function public.cast_vote(p_case uuid, p_vote text) returns void language plpgsql security definer set search_path = public as $$
declare c court_cases;
begin
  select * into c from court_cases where id = p_case and status = 'open' and expires_at > now();
  if not found then raise exception 'Case is closed'; end if;
  if c.receiver_id = auth.uid() then raise exception 'You cannot vote on your own case'; end if;
  insert into court_votes (case_id, voter_id, vote) values (p_case, auth.uid(), p_vote);
  perform resolve_court();
end $$;

-- Monday reset: archive last week, then set everyone back to 100,000.
create function public.weekly_reset() returns void language plpgsql security definer set search_path = public as $$
declare wk date := current_date - 7;
begin
  perform resolve_court();
  insert into weekly_results (week_start, user_id, username, final_aura, rank, gain, loss)
  select wk, p.id, p.username, p.aura, rank() over (order by p.aura desc),
    coalesce((select sum(amount) from transactions t where t.receiver_id = p.id and t.amount > 0 and t.created_at >= wk), 0),
    coalesce((select -sum(amount) from transactions t where t.receiver_id = p.id and t.amount < 0 and t.created_at >= wk), 0)
  from profiles p on conflict do nothing;
  if found then
    update profiles set aura = 100000;
    insert into notifications (user_id, body) select id, 'New week: everyone is back to 100,000 aura' from profiles;
  end if;
end $$;
revoke all on function public.weekly_reset(), public.resolve_court() from public, anon, authenticated;
revoke all on function public.apply_aura(uuid, integer, text), public.cast_vote(uuid, text) from public, anon;

-- Row level security: clients can read, never write directly. History is append-only.
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table court_cases enable row level security;
alter table court_votes enable row level security;
alter table notifications enable row level security;
alter table weekly_results enable row level security;
create policy read_all on profiles for select to authenticated using (true);
create policy read_all on transactions for select to authenticated using (true);
create policy read_all on court_cases for select to authenticated using (true);
create policy read_all on court_votes for select to authenticated using (true);
create policy read_all on weekly_results for select to authenticated using (true);
create policy read_own on notifications for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on all tables in schema public from anon, authenticated;

alter publication supabase_realtime add table profiles, transactions, court_cases, notifications;
