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
    check (regime in ('simples', 'simples-iv', 'normal', 'mei', 'domestico')),
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

-- ---------------------------------------------------------------
-- Financeiro da KeyGest (receitas e despesas): somente o administrador
-- ---------------------------------------------------------------
create table if not exists financeiro (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita', 'despesa')),
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  data date,
  descricao text not null,
  categoria text,
  empresa_id uuid references empresas(id) on delete set null,
  valor numeric(12,2) not null default 0,
  quitado boolean not null default false,
  recorrente boolean not null default false,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists financeiro_comp_idx on financeiro (competencia);

drop trigger if exists financeiro_atualizado on financeiro;
create trigger financeiro_atualizado before update on financeiro
  for each row execute function tocar_atualizado_em();

alter table financeiro enable row level security;
drop policy if exists financeiro_admin on financeiro;
create policy financeiro_admin on financeiro for all to authenticated
  using (eh_admin()) with check (eh_admin());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------
-- Histórico das negociações: hora do contato
-- (mudança de etapa não é mais gravada no histórico)
-- ---------------------------------------------------------------
alter table negociacao_historico add column if not exists hora time;

-- ---------------------------------------------------------------
-- Páginas de cada perfil: o administrador escolhe em Usuários
-- ---------------------------------------------------------------
create table if not exists perfil_paginas (
  perfil text primary key check (perfil in ('admin', 'analista', 'consulta', 'cliente', 'colaborador')),
  paginas text[] not null default '{}',
  atualizado_em timestamptz not null default now()
);

insert into perfil_paginas (perfil, paginas) values
  ('admin', array['painel', 'empresas', 'colaboradores', 'folha', 'negociacoes', 'financeiro', 'usuarios']),
  ('analista', array['painel', 'empresas', 'colaboradores', 'folha', 'negociacoes']),
  ('consulta', array['painel', 'empresas', 'colaboradores', 'folha', 'negociacoes']),
  ('cliente', array['painel', 'colaboradores', 'folha']),
  ('colaborador', array['meus-dados', 'holerites'])
on conflict do nothing;

-- O administrador nunca perde a página de usuários
update perfil_paginas set paginas = array_append(paginas, 'usuarios')
  where perfil = 'admin' and not ('usuarios' = any (paginas));

drop trigger if exists perfil_paginas_atualizado on perfil_paginas;
create trigger perfil_paginas_atualizado before update on perfil_paginas
  for each row execute function tocar_atualizado_em();

create or replace function public.pagina_liberada(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p = any (paginas) from perfil_paginas where perfil = meu_perfil()), false);
$$;

alter table perfil_paginas enable row level security;
drop policy if exists perfil_paginas_ler on perfil_paginas;
create policy perfil_paginas_ler on perfil_paginas for select to authenticated using (true);
drop policy if exists perfil_paginas_admin on perfil_paginas;
create policy perfil_paginas_admin on perfil_paginas for all to authenticated
  using (eh_admin()) with check (eh_admin());

-- Negociações: só a equipe com a página liberada (o administrador sempre).
-- Substitui as regras criadas mais acima, que não conheciam as páginas.
drop policy if exists negociacoes_ler on negociacoes;
create policy negociacoes_ler on negociacoes for select to authenticated
  using (eh_equipe() and (eh_admin() or pagina_liberada('negociacoes')));
drop policy if exists negociacoes_editar on negociacoes;
create policy negociacoes_editar on negociacoes for all to authenticated
  using (pode_editar() and (eh_admin() or pagina_liberada('negociacoes')))
  with check (pode_editar() and (eh_admin() or pagina_liberada('negociacoes')));
drop policy if exists negociacao_historico_ler on negociacao_historico;
create policy negociacao_historico_ler on negociacao_historico for select to authenticated
  using (eh_equipe() and (eh_admin() or pagina_liberada('negociacoes')));
drop policy if exists negociacao_historico_editar on negociacao_historico;
create policy negociacao_historico_editar on negociacao_historico for all to authenticated
  using (pode_editar() and (eh_admin() or pagina_liberada('negociacoes')))
  with check (pode_editar() and (eh_admin() or pagina_liberada('negociacoes')));

-- Financeiro: o administrador sempre; a equipe com a página liberada vê e o analista também altera
drop policy if exists financeiro_ler on financeiro;
create policy financeiro_ler on financeiro for select to authenticated
  using (eh_equipe() and pagina_liberada('financeiro'));
drop policy if exists financeiro_editar on financeiro;
create policy financeiro_editar on financeiro for all to authenticated
  using (pode_editar() and pagina_liberada('financeiro'))
  with check (pode_editar() and pagina_liberada('financeiro'));

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------
-- Segurança das funções (recomendações do Supabase)
-- Fica no fim porque "create or replace function" desfaz estes ajustes.
-- ---------------------------------------------------------------
alter function public.eh_admin() set search_path = public;
alter function public.eh_cliente() set search_path = public;
alter function public.eh_equipe() set search_path = public;
alter function public.meu_email() set search_path = public;
alter function public.pode_editar() set search_path = public;
alter function public.tocar_atualizado_em() set search_path = public;

-- Usadas nas regras de acesso: só usuários logados
revoke execute on function public.meu_colaborador(), public.meu_perfil(), public.minha_empresa(), public.pagina_liberada(text) from public, anon;
grant execute on function public.meu_colaborador(), public.meu_perfil(), public.minha_empresa(), public.pagina_liberada(text) to authenticated;

-- Gatilho do cadastro: ninguém chama pela API, só o serviço de login
revoke execute on function public.validar_cadastro() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.validar_cadastro() to supabase_auth_admin;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.meu_colaborador(), public.meu_perfil(), public.minha_empresa(), public.pagina_liberada(text), public.validar_cadastro() to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Empregador doméstico (pessoa física, CPF no campo cnpj) como regime da empresa cliente
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.empresas'::regclass and conname = 'empresas_regime_check'
      and pg_get_constraintdef(oid) not like '%domestico%'
  ) then
    alter table public.empresas drop constraint empresas_regime_check;
    alter table public.empresas add constraint empresas_regime_check
      check (regime in ('simples', 'simples-iv', 'normal', 'mei', 'domestico'));
  end if;
end $$;
-- ---------------------------------------------------------------
-- Registro de acessos ao sistema (Marco Civil da Internet, art. 15):
-- guarda data/hora, IP e navegador de cada login por 6 meses.
-- Só o administrador consulta; ninguém grava pela API (só o gatilho).
-- ---------------------------------------------------------------
create table if not exists public.registros_acesso (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  ip inet,
  user_agent text,
  criado_em timestamptz not null default now()
);
create index if not exists registros_acesso_data_idx on public.registros_acesso (criado_em);
alter table public.registros_acesso enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'registros_acesso' and policyname = 'registros_acesso_admin') then
    create policy registros_acesso_admin on public.registros_acesso for select to authenticated using (public.eh_admin());
  end if;
end $$;

create or replace function public.registrar_acesso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.registros_acesso (user_id, email, ip, user_agent, criado_em)
    values (new.user_id, (select u.email from auth.users u where u.id = new.user_id), new.ip, new.user_agent, coalesce(new.created_at, now()));
    -- guarda 6 meses (exigência legal) e apaga o que passou de 7 meses (LGPD)
    delete from public.registros_acesso where criado_em < now() - interval '7 months';
  exception when others then
    null; -- nunca impede o login
  end;
  return new;
end $$;

revoke execute on function public.registrar_acesso() from public, anon, authenticated;

create or replace trigger registrar_acesso after insert on auth.sessions
  for each row execute function public.registrar_acesso();

notify pgrst, 'reload schema';

-- =================================================================
-- SaaS: contas de assinantes (multi-conta)
-- Cada registro pertence a uma conta; ninguém enxerga dados de outra.
-- A conta KeyGest é a dona da plataforma e recebe os dados existentes.
-- Fica no fim do arquivo: redefine funções e regras criadas acima.
-- =================================================================
create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'empresa' check (tipo in ('escritorio', 'empresa', 'domestico')),
  plano text not null default 'empresa' check (plano in ('domestico', 'empresa', 'escritorio')),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'anual')),
  situacao text not null default 'teste' check (situacao in ('teste', 'ativa', 'inadimplente', 'cancelada')),
  teste_ate date,
  documento text,
  email_dono text,
  telefone text,
  plataforma boolean not null default false,
  asaas_cliente text,
  asaas_assinatura text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.contas (id, nome, tipo, plano, situacao, plataforma, email_dono)
values ('00000000-0000-4000-8000-000000000001', 'KeyGest', 'escritorio', 'escritorio', 'ativa', true, 'keygestrh@gmail.com')
on conflict (id) do update set plataforma = true, situacao = 'ativa';

create or replace trigger contas_atualizado before update on public.contas
  for each row execute function public.tocar_atualizado_em();

-- conta_id em todas as tabelas de dados (os dados existentes vão para a conta KeyGest)
do $$
declare t text;
begin
  foreach t in array array['acessos', 'empresas', 'colaboradores', 'ferias', 'folha', 'negociacoes',
                           'negociacao_historico', 'financeiro', 'perfil_paginas', 'registros_acesso'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists conta_id uuid references public.contas(id) on delete cascade', t);
      execute format('update public.%I set conta_id = %L where conta_id is null', t, '00000000-0000-4000-8000-000000000001');
      execute format('alter table public.%I alter column conta_id set not null', t);
      execute format('create index if not exists %I on public.%I (conta_id)', t || '_conta_idx', t);
    end if;
  end loop;
end $$;

-- Conta do usuário logado (sem login, cai na conta KeyGest: só usado por scripts de manutenção)
create or replace function public.minha_conta()
returns uuid language sql stable security definer set search_path = public as $$
  select conta_id from public.acessos where email = public.meu_email() and ativo;
$$;

create or replace function public.conta_padrao()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_conta(), '00000000-0000-4000-8000-000000000001'::uuid);
$$;

-- Novos registros entram na conta de quem está logado
do $$
declare t text;
begin
  foreach t in array array['acessos', 'empresas', 'colaboradores', 'ferias', 'folha', 'negociacoes',
                           'negociacao_historico', 'financeiro', 'perfil_paginas', 'registros_acesso'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I alter column conta_id set default public.conta_padrao()', t);
    end if;
  end loop;
end $$;

-- Um CNPJ/CPF pode existir em contas diferentes (dois escritórios atendendo a mesma empresa)
alter table public.empresas drop constraint if exists empresas_cnpj_key;
create unique index if not exists empresas_conta_cnpj_idx on public.empresas (conta_id, cnpj);

-- Páginas por perfil passam a ser de cada conta
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'perfil_paginas_pkey'
             and pg_get_constraintdef(oid) = 'PRIMARY KEY (perfil)') then
    alter table public.perfil_paginas drop constraint perfil_paginas_pkey;
    alter table public.perfil_paginas add primary key (conta_id, perfil);
  end if;
end $$;

-- ---------------------------------------------------------------
-- Funções de permissão, agora dentro da conta do usuário
-- ---------------------------------------------------------------
create or replace function public.conta_ativa()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select situacao = 'ativa' or (situacao = 'teste' and coalesce(teste_ate, current_date) >= current_date)
    from public.contas where id = public.minha_conta()), false);
$$;

create or replace function public.eh_plataforma()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() = 'admin' and
    (select plataforma from public.contas where id = public.minha_conta()), false);
$$;

-- Editar só com a conta em dia (vencida ou inadimplente fica somente para consulta)
create or replace function public.pode_editar()
returns boolean language sql stable set search_path = public as $$
  select coalesce(public.meu_perfil() in ('admin', 'analista'), false) and public.conta_ativa();
$$;

create or replace function public.pagina_liberada(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p = any (paginas) from public.perfil_paginas
                   where perfil = public.meu_perfil() and conta_id = public.minha_conta()), false);
$$;

-- ---------------------------------------------------------------
-- Regras de acesso (RLS) com a conta
-- ---------------------------------------------------------------
alter table public.contas enable row level security;
drop policy if exists contas_ler on public.contas;
create policy contas_ler on public.contas for select to authenticated
  using (id = public.minha_conta() or public.eh_plataforma());
drop policy if exists contas_plataforma on public.contas;
create policy contas_plataforma on public.contas for update to authenticated
  using (public.eh_plataforma()) with check (public.eh_plataforma());

drop policy if exists acessos_ler on public.acessos;
create policy acessos_ler on public.acessos for select to authenticated
  using ((public.eh_admin() and conta_id = public.minha_conta()) or email = public.meu_email());
drop policy if exists acessos_admin on public.acessos;
create policy acessos_admin on public.acessos for all to authenticated
  using (public.eh_admin() and conta_id = public.minha_conta())
  with check (public.eh_admin() and conta_id = public.minha_conta());

drop policy if exists empresas_ler on public.empresas;
create policy empresas_ler on public.empresas for select to authenticated
  using (conta_id = public.minha_conta() and (public.eh_equipe() or id = public.minha_empresa()));
drop policy if exists empresas_editar on public.empresas;
create policy empresas_editar on public.empresas for all to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar())
  with check (conta_id = public.minha_conta() and public.pode_editar());

drop policy if exists colaboradores_ler on public.colaboradores;
create policy colaboradores_ler on public.colaboradores for select to authenticated
  using (conta_id = public.minha_conta() and (public.eh_equipe()
    or (public.eh_cliente() and empresa_id = public.minha_empresa()) or id = public.meu_colaborador()));
drop policy if exists colaboradores_editar on public.colaboradores;
create policy colaboradores_editar on public.colaboradores for all to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar())
  with check (conta_id = public.minha_conta() and public.pode_editar());

drop policy if exists ferias_ler on public.ferias;
create policy ferias_ler on public.ferias for select to authenticated
  using (conta_id = public.minha_conta() and (public.eh_equipe()
    or colaborador_id = public.meu_colaborador()
    or (public.eh_cliente() and exists (
      select 1 from public.colaboradores c where c.id = ferias.colaborador_id and c.empresa_id = public.minha_empresa()))));
drop policy if exists ferias_editar on public.ferias;
create policy ferias_editar on public.ferias for all to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar())
  with check (conta_id = public.minha_conta() and public.pode_editar());

drop policy if exists folha_ler on public.folha;
create policy folha_ler on public.folha for select to authenticated
  using (conta_id = public.minha_conta() and (public.eh_equipe()
    or colaborador_id = public.meu_colaborador() or (public.eh_cliente() and empresa_id = public.minha_empresa())));
drop policy if exists folha_incluir on public.folha;
create policy folha_incluir on public.folha for insert to authenticated
  with check (conta_id = public.minha_conta() and (public.pode_editar()
    or (public.eh_cliente() and public.conta_ativa() and empresa_id = public.minha_empresa() and exists (
      select 1 from public.colaboradores c where c.id = folha.colaborador_id and c.empresa_id = folha.empresa_id))));
drop policy if exists folha_alterar on public.folha;
create policy folha_alterar on public.folha for update to authenticated
  using (conta_id = public.minha_conta() and (public.pode_editar()
    or (public.eh_cliente() and public.conta_ativa() and empresa_id = public.minha_empresa())))
  with check (conta_id = public.minha_conta() and (public.pode_editar()
    or (public.eh_cliente() and public.conta_ativa() and empresa_id = public.minha_empresa() and exists (
      select 1 from public.colaboradores c where c.id = folha.colaborador_id and c.empresa_id = folha.empresa_id))));
drop policy if exists folha_excluir on public.folha;
create policy folha_excluir on public.folha for delete to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar());

drop policy if exists negociacoes_ler on public.negociacoes;
create policy negociacoes_ler on public.negociacoes for select to authenticated
  using (conta_id = public.minha_conta() and public.eh_equipe() and (public.eh_admin() or public.pagina_liberada('negociacoes')));
drop policy if exists negociacoes_editar on public.negociacoes;
create policy negociacoes_editar on public.negociacoes for all to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar() and (public.eh_admin() or public.pagina_liberada('negociacoes')))
  with check (conta_id = public.minha_conta() and public.pode_editar() and (public.eh_admin() or public.pagina_liberada('negociacoes')));
drop policy if exists negociacao_historico_ler on public.negociacao_historico;
create policy negociacao_historico_ler on public.negociacao_historico for select to authenticated
  using (conta_id = public.minha_conta() and public.eh_equipe() and (public.eh_admin() or public.pagina_liberada('negociacoes')));
drop policy if exists negociacao_historico_editar on public.negociacao_historico;
create policy negociacao_historico_editar on public.negociacao_historico for all to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar() and (public.eh_admin() or public.pagina_liberada('negociacoes')))
  with check (conta_id = public.minha_conta() and public.pode_editar() and (public.eh_admin() or public.pagina_liberada('negociacoes')));

drop policy if exists financeiro_admin on public.financeiro; -- regra antiga, sem conta
drop policy if exists financeiro_ler on public.financeiro;
create policy financeiro_ler on public.financeiro for select to authenticated
  using (conta_id = public.minha_conta() and public.eh_equipe() and public.pagina_liberada('financeiro'));
drop policy if exists financeiro_editar on public.financeiro;
create policy financeiro_editar on public.financeiro for all to authenticated
  using (conta_id = public.minha_conta() and public.pode_editar() and public.pagina_liberada('financeiro'))
  with check (conta_id = public.minha_conta() and public.pode_editar() and public.pagina_liberada('financeiro'));

drop policy if exists perfil_paginas_ler on public.perfil_paginas;
create policy perfil_paginas_ler on public.perfil_paginas for select to authenticated
  using (conta_id = public.minha_conta());
drop policy if exists perfil_paginas_admin on public.perfil_paginas;
create policy perfil_paginas_admin on public.perfil_paginas for all to authenticated
  using (public.eh_admin() and conta_id = public.minha_conta())
  with check (public.eh_admin() and conta_id = public.minha_conta());

-- Registros de acesso: cada administrador vê só os da própria conta
do $$
begin
  if to_regclass('public.registros_acesso') is not null then
    drop policy if exists registros_acesso_admin on public.registros_acesso;
    create policy registros_acesso_admin on public.registros_acesso for select to authenticated
      using (public.eh_admin() and conta_id = public.minha_conta());
  end if;
end $$;

create or replace function public.registrar_acesso() returns trigger
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  begin
    select u.email into e from auth.users u where u.id = new.user_id;
    insert into public.registros_acesso (user_id, email, ip, user_agent, criado_em, conta_id)
    values (new.user_id, e, new.ip, new.user_agent, coalesce(new.created_at, now()),
      coalesce((select conta_id from public.acessos where email = lower(e)), '00000000-0000-4000-8000-000000000001'::uuid));
    delete from public.registros_acesso where criado_em < now() - interval '7 months';
  exception when others then
    null; -- nunca impede o login
  end;
  return new;
end $$;

-- ---------------------------------------------------------------
-- Limites de cada plano (conferidos no banco)
-- ---------------------------------------------------------------
create or replace function public.limite_plano(p text, item text)
returns integer language sql immutable set search_path = public as $$
  select case item
    when 'colaboradores' then case p when 'domestico' then 2 when 'empresa' then 15 else 100 end
    when 'empresas' then case p when 'escritorio' then 1000 else 1 end
  end;
$$;

create or replace function public.conferir_limite() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.contas; usados integer; item text := tg_argv[0];
begin
  select * into c from public.contas where id = new.conta_id;
  if c.id is null or c.plataforma then return new; end if;
  if item = 'colaboradores' then
    select count(*) into usados from public.colaboradores where conta_id = new.conta_id and status <> 'desligado';
  else
    select count(*) into usados from public.empresas where conta_id = new.conta_id;
  end if;
  if usados >= public.limite_plano(c.plano, item) then
    raise exception 'KG_LIMITE_PLANO:%:%', item, public.limite_plano(c.plano, item);
  end if;
  return new;
end $$;

create or replace trigger colaboradores_limite before insert on public.colaboradores
  for each row execute function public.conferir_limite('colaboradores');
create or replace trigger empresas_limite before insert on public.empresas
  for each row execute function public.conferir_limite('empresas');

-- ---------------------------------------------------------------
-- Cadastro: e-mail liberado por um administrador (como antes) ou
-- criação de conta nova com teste grátis de 14 dias
-- ---------------------------------------------------------------
create or replace function public.validar_cadastro()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb; nova uuid; t text; doc text; nome_conta text;
begin
  if exists (select 1 from public.acessos where email = lower(new.email)) then
    return new;
  end if;
  d := new.raw_user_meta_data -> 'nova_conta';
  if d is null then
    raise exception 'KG_EMAIL_NAO_LIBERADO';
  end if;
  t := coalesce(d ->> 'tipo', 'empresa');
  if t not in ('escritorio', 'empresa', 'domestico') then t := 'empresa'; end if;
  nome_conta := left(coalesce(nullif(trim(d ->> 'empresa'), ''), nullif(trim(d ->> 'nome'), ''), lower(new.email)), 200);
  doc := nullif(left(trim(coalesce(d ->> 'documento', '')), 20), '');

  insert into public.contas (nome, tipo, plano, situacao, teste_ate, documento, email_dono, telefone)
  values (nome_conta, t, t, 'teste', current_date + 14, doc, lower(new.email), left(d ->> 'telefone', 20))
  returning id into nova;

  insert into public.acessos (email, nome, perfil, conta_id)
  values (lower(new.email), left(coalesce(d ->> 'nome', ''), 200), 'admin', nova);

  if t in ('empresa', 'domestico') then
    insert into public.empresas (razao_social, cnpj, regime, responsavel, email, telefone, conta_id)
    values (nome_conta, doc, case when t = 'domestico' then 'domestico' else 'simples' end,
            left(d ->> 'nome', 200), lower(new.email), left(d ->> 'telefone', 20), nova);
  end if;

  insert into public.perfil_paginas (conta_id, perfil, paginas)
  select nova, x.perfil, x.paginas from (values
    ('admin', case when t = 'escritorio'
       then array['painel', 'empresas', 'colaboradores', 'folha', 'negociacoes', 'financeiro', 'usuarios']
       else array['painel', 'colaboradores', 'folha', 'usuarios'] end),
    ('analista', case when t = 'escritorio' then array['painel', 'empresas', 'colaboradores', 'folha'] else array['painel', 'colaboradores', 'folha'] end),
    ('consulta', case when t = 'escritorio' then array['painel', 'empresas', 'colaboradores', 'folha'] else array['painel', 'colaboradores', 'folha'] end),
    ('cliente', array['painel', 'colaboradores', 'folha']),
    ('colaborador', array['meus-dados', 'holerites'])
  ) as x(perfil, paginas);
  return new;
end;
$$;

-- Resumo das contas para o painel de assinantes (somente a plataforma KeyGest)
create or replace function public.resumo_contas()
returns table (id uuid, nome text, tipo text, plano text, periodicidade text, situacao text, teste_ate date,
               email_dono text, telefone text, documento text, criado_em timestamptz, colaboradores bigint, empresas bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.tipo, c.plano, c.periodicidade, c.situacao, c.teste_ate, c.email_dono, c.telefone, c.documento, c.criado_em,
    (select count(*) from public.colaboradores x where x.conta_id = c.id and x.status <> 'desligado'),
    (select count(*) from public.empresas x where x.conta_id = c.id)
  from public.contas c
  where public.eh_plataforma()
  order by c.criado_em desc;
$$;

-- Quem pode chamar cada função pela API
revoke execute on function public.minha_conta(), public.conta_padrao(), public.conta_ativa(), public.eh_plataforma(),
  public.resumo_contas() from public, anon;
grant execute on function public.minha_conta(), public.conta_padrao(), public.conta_ativa(), public.eh_plataforma(),
  public.resumo_contas() to authenticated;
revoke execute on function public.conferir_limite(), public.registrar_acesso(), public.validar_cadastro() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.validar_cadastro() to supabase_auth_admin;
  end if;
end $$;

-- Trava de segurança: toda regra de acesso precisa filtrar pela conta.
-- Se alguma regra antiga ficou sem esse filtro, a atualização inteira é cancelada.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not like '%minha_conta%'
             and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not like '%eh_plataforma%' loop
    raise exception 'KG_REGRA_SEM_CONTA: % em %', r.policyname, r.tablename;
  end loop;
end $$;

notify pgrst, 'reload schema';
