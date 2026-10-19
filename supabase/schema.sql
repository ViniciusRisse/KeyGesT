-- KeyGest — banco de dados do sistema de colaboradores
-- Como usar: no Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Equipe autorizada: só estes e-mails conseguem ler e gravar dados.
-- ---------------------------------------------------------------
create table if not exists equipe (
  email text primary key,
  nome text,
  criado_em timestamptz not null default now()
);

insert into equipe (email, nome)
values ('keygest.rh@gmail.com', 'KeyGest')
on conflict (email) do nothing;

create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from equipe
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------
-- Empresas clientes
-- ---------------------------------------------------------------
create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text unique,
  regime text not null default 'simples'
    check (regime in ('simples', 'simples-iv', 'normal', 'mei')),
  rat numeric(5,4) not null default 0.02,
  fap numeric(6,4) not null default 1,
  terceiros numeric(5,4) not null default 0.058,
  responsavel text,
  email text,
  telefone text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Colaboradores
-- ---------------------------------------------------------------
create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete restrict,
  nome text not null,
  cpf text not null,
  pis text,
  data_nascimento date,
  email text,
  telefone text,
  cargo text,
  departamento text,
  salario numeric(12,2) not null default 0 check (salario >= 0),
  data_admissao date not null,
  tipo_contrato text not null default 'clt'
    check (tipo_contrato in ('clt', 'experiencia', 'temporario', 'estagio', 'aprendiz', 'intermitente')),
  jornada_semanal integer not null default 44,
  status text not null default 'ativo'
    check (status in ('ativo', 'ferias', 'afastado', 'desligado')),
  data_desligamento date,
  dependentes integer not null default 0,
  chave_pix text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, cpf)
);

create index if not exists colaboradores_empresa_idx on colaboradores (empresa_id);

-- ---------------------------------------------------------------
-- Férias registradas (gozadas ou programadas)
-- ---------------------------------------------------------------
create table if not exists ferias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  periodo_inicio date not null,           -- início do período aquisitivo
  inicio date not null,                   -- primeiro dia de férias
  dias integer not null check (dias between 5 and 30),
  abono boolean not null default false,   -- venda de 1/3 (10 dias)
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists ferias_colaborador_idx on ferias (colaborador_id);

-- ---------------------------------------------------------------
-- Atualiza "atualizado_em" automaticamente
-- ---------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists empresas_atualizado on empresas;
create trigger empresas_atualizado before update on empresas
  for each row execute function tocar_atualizado_em();

drop trigger if exists colaboradores_atualizado on colaboradores;
create trigger colaboradores_atualizado before update on colaboradores
  for each row execute function tocar_atualizado_em();

-- ---------------------------------------------------------------
-- Segurança (RLS): só a equipe autorizada acessa os dados
-- ---------------------------------------------------------------
alter table equipe enable row level security;
alter table empresas enable row level security;
alter table colaboradores enable row level security;
alter table ferias enable row level security;

drop policy if exists equipe_le on equipe;
create policy equipe_le on equipe for select to authenticated using (eh_equipe());

drop policy if exists empresas_equipe on empresas;
create policy empresas_equipe on empresas for all to authenticated
  using (eh_equipe()) with check (eh_equipe());

drop policy if exists colaboradores_equipe on colaboradores;
create policy colaboradores_equipe on colaboradores for all to authenticated
  using (eh_equipe()) with check (eh_equipe());

drop policy if exists ferias_equipe on ferias;
create policy ferias_equipe on ferias for all to authenticated
  using (eh_equipe()) with check (eh_equipe());

-- ---------------------------------------------------------------
-- Folha do mês: lançamentos por colaborador e competência (AAAA-MM)
-- ---------------------------------------------------------------
create table if not exists folha (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  salario numeric(12,2) not null default 0,
  faltas numeric(5,2) not null default 0,
  he50 numeric(6,2) not null default 0,
  he100 numeric(6,2) not null default 0,
  adicionais numeric(12,2) not null default 0,
  vt numeric(12,2) not null default 0,
  desc_vr numeric(12,2) not null default 0,
  outros_descontos numeric(12,2) not null default 0,
  bruto numeric(12,2),
  inss numeric(12,2),
  irrf numeric(12,2),
  desc_vt numeric(12,2),
  liquido numeric(12,2),
  fgts numeric(12,2),
  custo numeric(12,2),
  atualizado_em timestamptz not null default now(),
  unique (colaborador_id, competencia)
);

create index if not exists folha_empresa_comp_idx on folha (empresa_id, competencia);

drop trigger if exists folha_atualizado on folha;
create trigger folha_atualizado before update on folha
  for each row execute function tocar_atualizado_em();

alter table folha enable row level security;
drop policy if exists folha_equipe on folha;
create policy folha_equipe on folha for all to authenticated
  using (eh_equipe()) with check (eh_equipe());
