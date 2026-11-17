-- Latihan SKD: skema Tahap 1
-- Jalankan sekali di Supabase → SQL Editor → New query → Run.

-- ========== Tabel ==========

create table questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('TIU','TWK','TKP')),
  topic text not null,
  subtopic text,
  body text not null,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on questions (category);

-- Opsi = baris sendiri. "slot" cuma nomor penyimpanan 1-5, BUKAN huruf A-E
-- (huruf dibagikan di layar setelah opsi diacak).
-- score: TIU/TWK -> 5 untuk opsi benar, 0 untuk sisanya. TKP -> 1-5 per opsi.
create table question_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  body text not null,
  score smallint not null check (score between 0 and 5),
  unique (question_id, slot)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode text not null check (mode in ('TIU','TWK','TKP','ALL')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Satu baris per soal per sesi. Jawaban = selected_option_id (bukan huruf).
-- option_order = urutan id opsi setelah diacak, disimpan supaya huruf tidak berubah.
-- Soal yang dihapus ikut menghapus riwayat jawabannya.
create table session_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  seq int not null,
  option_order uuid[] not null,
  selected_option_id uuid references question_options(id) on delete set null,
  score smallint not null default 0,
  flagged boolean not null default false,
  time_spent_ms int not null default 0,
  unique (session_id, seq)
);
create index on session_answers (question_id);

-- ========== Keamanan (RLS): hanya pemilik baris yang bisa akses ==========

do $$
declare t text;
begin
  foreach t in array array['questions','question_options','sessions','session_answers'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ========== Fungsi ==========

-- Simpan soal (baru/edit) beserta tepat 5 opsi dalam satu transaksi.
-- Saat edit, opsi di-update per slot sehingga id opsi (dan riwayat jawaban) tetap utuh.
create or replace function save_question(
  p_id uuid, p_category text, p_topic text, p_subtopic text,
  p_body text, p_explanation text, p_options jsonb
) returns uuid
language plpgsql as $$
declare qid uuid;
begin
  if p_category not in ('TIU','TWK','TKP') then raise exception 'Kategori tidak valid'; end if;
  if coalesce(trim(p_topic), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Topik dan teks soal wajib diisi';
  end if;
  if jsonb_array_length(p_options) <> 5 then raise exception 'Soal harus punya tepat 5 opsi'; end if;
  if exists (select 1 from jsonb_array_elements(p_options) as t(o) where coalesce(trim(o->>'body'), '') = '') then
    raise exception 'Kelima opsi wajib diisi';
  end if;
  if (select count(distinct (o->>'slot')::int) from jsonb_array_elements(p_options) as t(o)
      where (o->>'slot')::int between 1 and 5) <> 5 then
    raise exception 'Slot opsi harus 1-5 tanpa duplikat';
  end if;

  if p_category = 'TKP' then
    if exists (select 1 from jsonb_array_elements(p_options) as t(o) where (o->>'score')::int not between 1 and 5) then
      raise exception 'TKP: skor tiap opsi harus 1-5';
    end if;
  else
    if (select count(*) from jsonb_array_elements(p_options) as t(o) where (o->>'score')::int = 5) <> 1
       or (select count(*) from jsonb_array_elements(p_options) as t(o) where (o->>'score')::int = 0) <> 4 then
      raise exception 'TIU/TWK: tepat satu opsi benar (skor 5), sisanya 0';
    end if;
  end if;

  if p_id is null then
    insert into questions (category, topic, subtopic, body, explanation)
    values (p_category, trim(p_topic), nullif(trim(p_subtopic), ''), trim(p_body), nullif(trim(p_explanation), ''))
    returning id into qid;
  else
    update questions
       set category = p_category, topic = trim(p_topic), subtopic = nullif(trim(p_subtopic), ''),
           body = trim(p_body), explanation = nullif(trim(p_explanation), ''), updated_at = now()
     where id = p_id
    returning id into qid;
    if qid is null then raise exception 'Soal tidak ditemukan'; end if;
  end if;

  insert into question_options (question_id, slot, body, score)
  select qid, (o->>'slot')::int, trim(o->>'body'), (o->>'score')::int
  from jsonb_array_elements(p_options) as t(o)
  on conflict (question_id, slot) do update set body = excluded.body, score = excluded.score;

  return qid;
end $$;

-- Ambil soal untuk sesi. Tahap 1: acak murni. Tahap 3 akan mengganti isi fungsi ini dengan pemilihan berbobot.
create or replace function pick_questions(p_category text, p_limit int)
returns table (id uuid)
language sql as $$
  select q.id from questions q where q.category = p_category order by random() limit p_limit
$$;

-- Buat sesi + semua baris soalnya sekaligus (atomik).
create or replace function create_session(p_mode text, p_items jsonb)
returns uuid
language plpgsql as $$
declare sid uuid;
begin
  insert into sessions (mode) values (p_mode) returning id into sid;
  insert into session_answers (session_id, question_id, seq, option_order)
  select sid, (t.e->>'question_id')::uuid, t.ord::int,
         array(select x.v::uuid
               from jsonb_array_elements_text(t.e->'option_order') with ordinality as x(v, n)
               order by x.n)
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);
  return sid;
end $$;

-- Skor jawaban selalu dihitung database dari opsi yang dipilih (kosong = 0).
create or replace function set_answer_score() returns trigger
language plpgsql as $$
begin
  if new.selected_option_id is null then
    new.score := 0;
  else
    select o.score into new.score from question_options o
     where o.id = new.selected_option_id and o.question_id = new.question_id;
    if not found then raise exception 'Opsi bukan milik soal ini'; end if;
  end if;
  return new;
end $$;

create trigger trg_answer_score
before insert or update on session_answers
for each row execute function set_answer_score();
