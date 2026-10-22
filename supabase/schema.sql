-- KeyGest — banco de dados do sistema de colaboradores
-- Como usar: no Supabase, abra "SQL Editor", cole este arquivo inteiro e clique em "Run".

create extension if not exists pgcrypto;

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

-- ---------------------------------------------------------------
-- Acessos: quem pode entrar e com qual perfil
--   admin     – equipe KeyGest, acesso total e gestão de usuários
--   analista  – equipe KeyGest, cadastra e edita tudo
--   consulta  – equipe KeyGest, só visualiza
--   cliente   – empresa cliente, vê a própria empresa e lança a folha dela
--   colaborador – vê só os próprios dados, férias e holerites
-- ---------------------------------------------------------------
create table if not exists acessos (
  email text primary key check (email = lower(email)),
  nome text,
  perfil text not null check (perfil in ('admin', 'analista', 'consulta', 'cliente', 'colaborador')),
  empresa_id uuid references empresas(id) on delete cascade,
  colaborador_id uuid references colaboradores(id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (perfil <> 'cliente' or empresa_id is not null),
  check (perfil <> 'colaborador' or colaborador_id is not null)
);

-- Remove o código de primeiro acesso de uma versão anterior
alter table acessos drop column if exists codigo_hash;

insert into acessos (email, nome, perfil)
values
  ('keygest.rh@gmail.com', 'KeyGest', 'admin'),
  ('keygestrh@gmail.com', 'KeyGest', 'admin')
on conflict (email) do update set perfil = 'admin', ativo = true;

-- Remove a tabela antiga de equipe, se existir de uma versão anterior
drop table if exists equipe cascade;

-- ---------------------------------------------------------------
-- Funções de permissão (usadas pelas regras de segurança)
-- ---------------------------------------------------------------
create or replace function public.meu_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select perfil from acessos where email = meu_email() and ativo;
$$;

create or replace function public.eh_equipe()
returns boolean language sql stable as $$
  select coalesce(meu_perfil() in ('admin', 'analista', 'consulta'), false);
$$;

create or replace function public.pode_editar()
returns boolean language sql stable as $$
  select coalesce(meu_perfil() in ('admin', 'analista'), false);
$$;

create or replace function public.eh_admin()
returns boolean language sql stable as $$
  select coalesce(meu_perfil() = 'admin', false);
$$;

create or replace function public.eh_cliente()
returns boolean language sql stable as $$
  select coalesce(meu_perfil() = 'cliente', false);
$$;

-- Empresa do usuário (cliente) ou da empresa onde o colaborador trabalha
create or replace function public.minha_empresa()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(a.empresa_id, c.empresa_id)
  from acessos a
  left join colaboradores c on c.id = a.colaborador_id
  where a.email = meu_email() and a.ativo;
$$;

create or replace function public.meu_colaborador()
returns uuid language sql stable security definer set search_path = public as $$
  select colaborador_id from acessos
  where email = meu_email() and ativo and perfil = 'colaborador';
$$;

-- ---------------------------------------------------------------
-- Segurança (RLS)
-- ---------------------------------------------------------------
alter table acessos enable row level security;
alter table empresas enable row level security;
alter table colaboradores enable row level security;
alter table ferias enable row level security;
alter table folha enable row level security;

-- remove regras de versões anteriores
drop policy if exists empresas_equipe on empresas;
drop policy if exists colaboradores_equipe on colaboradores;
drop policy if exists ferias_equipe on ferias;
drop policy if exists folha_equipe on folha;

-- Acessos: o admin gerencia; cada pessoa lê o próprio acesso
drop policy if exists acessos_ler on acessos;
create policy acessos_ler on acessos for select to authenticated
  using (eh_admin() or email = meu_email());
drop policy if exists acessos_admin on acessos;
create policy acessos_admin on acessos for all to authenticated
  using (eh_admin()) with check (eh_admin());

-- Empresas
drop policy if exists empresas_ler on empresas;
create policy empresas_ler on empresas for select to authenticated
  using (eh_equipe() or id = minha_empresa());
drop policy if exists empresas_editar on empresas;
create policy empresas_editar on empresas for all to authenticated
  using (pode_editar()) with check (pode_editar());

-- Colaboradores
drop policy if exists colaboradores_ler on colaboradores;
create policy colaboradores_ler on colaboradores for select to authenticated
  using (eh_equipe() or (eh_cliente() and empresa_id = minha_empresa()) or id = meu_colaborador());
drop policy if exists colaboradores_editar on colaboradores;
create policy colaboradores_editar on colaboradores for all to authenticated
  using (pode_editar()) with check (pode_editar());

-- Férias
drop policy if exists ferias_ler on ferias;
create policy ferias_ler on ferias for select to authenticated
  using (
    eh_equipe()
    or colaborador_id = meu_colaborador()
    or (eh_cliente() and exists (
      select 1 from colaboradores c where c.id = ferias.colaborador_id and c.empresa_id = minha_empresa()))
  );
drop policy if exists ferias_editar on ferias;
create policy ferias_editar on ferias for all to authenticated
  using (pode_editar()) with check (pode_editar());

-- Folha do mês: equipe edita tudo; cliente lança a folha da própria empresa
drop policy if exists folha_ler on folha;
create policy folha_ler on folha for select to authenticated
  using (eh_equipe() or colaborador_id = meu_colaborador() or (eh_cliente() and empresa_id = minha_empresa()));

drop policy if exists folha_incluir on folha;
create policy folha_incluir on folha for insert to authenticated
  with check (
    pode_editar()
    or (eh_cliente() and empresa_id = minha_empresa() and exists (
      select 1 from colaboradores c where c.id = folha.colaborador_id and c.empresa_id = folha.empresa_id))
  );

drop policy if exists folha_alterar on folha;
create policy folha_alterar on folha for update to authenticated
  using (pode_editar() or (eh_cliente() and empresa_id = minha_empresa()))
  with check (
    pode_editar()
    or (eh_cliente() and empresa_id = minha_empresa() and exists (
      select 1 from colaboradores c where c.id = folha.colaborador_id and c.empresa_id = folha.empresa_id))
  );

drop policy if exists folha_excluir on folha;
create policy folha_excluir on folha for delete to authenticated
  using (pode_editar());

-- ---------------------------------------------------------------
-- Cadastro de senha (Primeiro acesso): só aceita e-mails que o
-- administrador liberou na tabela acessos.
-- ---------------------------------------------------------------
create or replace function public.validar_cadastro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.acessos where email = lower(new.email)) then
    raise exception 'KG_EMAIL_NAO_LIBERADO';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_cadastro on auth.users;
create trigger validar_cadastro before insert on auth.users
  for each row execute function public.validar_cadastro();

-- Dados do demonstrativo de pagamento (holerite)
alter table colaboradores add column if not exists matricula text;
alter table colaboradores add column if not exists ctps_numero text;
alter table colaboradores add column if not exists ctps_serie text;
alter table colaboradores add column if not exists banco text;
alter table colaboradores add column if not exists agencia text;
alter table colaboradores add column if not exists conta text;

-- Relatório da folha: dados da empresa e novos proventos e descontos
alter table empresas add column if not exists endereco text;
alter table empresas add column if not exists setor_responsavel text;
alter table folha add column if not exists adicional_noturno numeric(12,2) not null default 0;
alter table folha add column if not exists insalubridade numeric(12,2) not null default 0;
alter table folha add column if not exists periculosidade numeric(12,2) not null default 0;
alter table folha add column if not exists comissoes numeric(12,2) not null default 0;
alter table folha add column if not exists gratificacoes numeric(12,2) not null default 0;
alter table folha add column if not exists dsr numeric(12,2) not null default 0;
alter table folha add column if not exists ferias numeric(12,2) not null default 0;
alter table folha add column if not exists terco_ferias numeric(12,2) not null default 0;
alter table folha add column if not exists decimo_terceiro numeric(12,2) not null default 0;
alter table folha add column if not exists atrasos numeric(6,2) not null default 0;
alter table folha add column if not exists plano_saude numeric(12,2) not null default 0;
alter table folha add column if not exists adiantamento numeric(12,2) not null default 0;
alter table folha add column if not exists pensao numeric(12,2) not null default 0;
alter table folha add column if not exists descontos numeric(12,2);
alter table folha add column if not exists data_pagamento date;

-- Desconto de faltas digitado à mão (opcional)
alter table folha add column if not exists valor_faltas numeric(12,2) not null default 0;
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------
-- Negociações: clientes em prospecção, do primeiro contato ao fechamento
-- ---------------------------------------------------------------
create table if not exists negociacoes (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  cnpj text,
  contato text,
  cargo_contato text,
  telefone text,
  email text,
  origem text,
  funcionarios integer,
  regime text,
  servicos text,
  valor_mensal numeric(12,2),
  valor_implantacao numeric(12,2),
  etapa text not null default 'contato'
    check (etapa in ('contato', 'reuniao', 'proposta', 'negociacao', 'ganho', 'perdido')),
  responsavel text,
  data_contato date default current_date,
  proximo_passo text,
  proximo_data date,
  motivo_perda text,
  fechado_em date,
  empresa_id uuid references empresas(id) on delete set null,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists negociacao_historico (
  id uuid primary key default gen_random_uuid(),
  negociacao_id uuid not null references negociacoes(id) on delete cascade,
  data date not null default current_date,
  tipo text not null default 'anotacao',
  descricao text not null,
  autor text,
  criado_em timestamptz not null default now()
);
create index if not exists negociacao_historico_idx on negociacao_historico (negociacao_id);

drop trigger if exists negociacoes_atualizado on negociacoes;
create trigger negociacoes_atualizado before update on negociacoes
  for each row execute function tocar_atualizado_em();

-- Só a equipe KeyGest vê; administrador e analista editam
alter table negociacoes enable row level security;
alter table negociacao_historico enable row level security;
drop policy if exists negociacoes_ler on negociacoes;
create policy negociacoes_ler on negociacoes for select to authenticated using (eh_equipe());
drop policy if exists negociacoes_editar on negociacoes;
create policy negociacoes_editar on negociacoes for all to authenticated
  using (pode_editar()) with check (pode_editar());
drop policy if exists negociacao_historico_ler on negociacao_historico;
create policy negociacao_historico_ler on negociacao_historico for select to authenticated using (eh_equipe());
drop policy if exists negociacao_historico_editar on negociacao_historico;
create policy negociacao_historico_editar on negociacao_historico for all to authenticated
  using (pode_editar()) with check (pode_editar());

notify pgrst, 'reload schema';
