-- Latihan SKD: migrasi Tahap 2 (timer + pengaturan ambang batas)
-- Jalankan sekali di Supabase → SQL Editor, SEBELUM memakai kode aplikasi Tahap 2.

-- ========== Timer ==========
-- ends_at diisi server saat sesi dibuat, jadi timer tetap benar walau halaman di-refresh
-- atau jam HP/laptop tidak tepat. Sesi lama (Tahap 1) berisi NULL = tanpa timer.
alter table sessions add column duration_sec int, add column ends_at timestamptz;

drop function if exists create_session(text, jsonb);

create or replace function create_session(p_mode text, p_items jsonb, p_duration_sec int)
returns uuid
language plpgsql as $$
declare sid uuid;
begin
  insert into sessions (mode, duration_sec, ends_at)
  values (p_mode, p_duration_sec, now() + make_interval(secs => p_duration_sec))
  returning id into sid;

  insert into session_answers (session_id, question_id, seq, option_order)
  select sid, (t.e->>'question_id')::uuid, t.ord::int,
         array(select x.v::uuid
               from jsonb_array_elements_text(t.e->'option_order') with ordinality as x(v, n)
               order by x.n)
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);
  return sid;
end $$;

-- Sisa detik menurut jam server (bisa negatif kalau sudah lewat; NULL kalau sesi tanpa timer)
create or replace function session_remaining(p_id uuid)
returns int
language sql stable as $$
  select floor(extract(epoch from (s.ends_at - now())))::int from sessions s where s.id = p_id
$$;

-- Tandai sesi selesai. Kalau diselesaikan setelah waktu habis, waktu selesai dicatat = batas waktu.
create or replace function finish_session(p_id uuid)
returns timestamptz
language sql as $$
  update sessions
     set finished_at = least(now(), coalesce(ends_at, now()))
   where id = p_id and finished_at is null
  returning finished_at
$$;

-- ========== Pengaturan (ambang batas lulus) ==========
-- Ubah angkanya langsung di Supabase → Table Editor → settings.
create table settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  threshold_twk int not null default 65,
  threshold_tiu int not null default 80,
  threshold_tkp int not null default 166
);

alter table settings enable row level security;
create policy "own rows" on settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into settings (user_id) select id from auth.users on conflict do nothing;
