-- Latihan SKD: migrasi Tahap 3 (pemilihan soal berbobot)
-- Jalankan sekali di Supabase → SQL Editor. Tidak mengubah tabel, hanya fungsi.

-- Bobot tiap soal dihitung dari riwayat jawabanmu di sesi yang SUDAH SELESAI, urut kronologis.
-- Tiap jawaban mengubah bobot sesuai selisih skor dari 5:
--   d = (5 - skor) / 5          (TIU/TWK: salah/kosong d=1, benar d=0; TKP: skor 4 d=0.2, skor 1 d=0.8, dst)
--   bobot = bobot + c_up * d - c_down * (1 - d)
-- lalu dibatasi antara c_min dan c_max di setiap langkah (jadi soal yang lama benar lalu salah cepat naik lagi).
-- Ubah angka c_* di bawah kalau mau mengatur seberapa agresif pengulangannya.
create or replace function question_weights(p_category text)
returns table (question_id uuid, attempts int, weight float8)
language plpgsql as $$
declare
  c_base constant float8 := 1.0;  -- bobot awal sebelum ada riwayat
  c_up   constant float8 := 2.0;  -- kenaikan per jawaban dengan skor 0
  c_down constant float8 := 0.5;  -- penurunan per jawaban dengan skor 5
  c_min  constant float8 := 0.2;
  c_max  constant float8 := 8.0;
  r record;
  cur uuid := null;
  w float8;
  n int;
  d float8;
begin
  for r in
    select sa.question_id as qid, sa.score
    from session_answers sa
    join sessions s on s.id = sa.session_id
    join questions q on q.id = sa.question_id
    where s.finished_at is not null and q.category = p_category
    order by sa.question_id, s.finished_at, sa.seq
  loop
    if cur is distinct from r.qid then
      if cur is not null then
        question_id := cur; attempts := n; weight := w;
        return next;
      end if;
      cur := r.qid; w := c_base; n := 0;
    end if;
    d := (5 - r.score) / 5.0;
    w := least(c_max, greatest(c_min, w + c_up * d - c_down * (1 - d)));
    n := n + 1;
  end loop;
  if cur is not null then
    question_id := cur; attempts := n; weight := w;
    return next;
  end if;
end $$;

-- Pilih soal untuk sesi:
-- 1) soal yang belum pernah muncul di sesi selesai didahulukan (acak di antara mereka);
-- 2) kalau masih ada slot, sisanya diambil dari soal yang pernah dikerjakan, diundi berbobot
--    (makin tinggi bobot, makin besar peluang; undian tanpa pengembalian ala Efraimidis-Spirakis).
create or replace function pick_questions(p_category text, p_limit int)
returns table (id uuid)
language sql as $$
  with w as (select * from question_weights(p_category))
  select q.id
  from questions q
  left join w on w.question_id = q.id
  where q.category = p_category
  order by (w.question_id is null) desc,
           case when w.question_id is null then random()
                else ln(1 - random()) / w.weight end desc
  limit p_limit
$$;
