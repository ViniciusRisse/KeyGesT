/*
 * Camada de dados do sistema.
 * - Com Supabase configurado em js/config.js: usa o banco online.
 * - Sem configuração: modo demonstração, com dados salvos só neste navegador.
 */
(function () {
  'use strict';

  var cfg = (window.KEYGEST_CONFIG || {}).supabase || {};
  var online = !!(cfg.url && cfg.anonKey && window.supabase);
  var sb = online ? window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { flowType: 'pkce' } }) : null;
  var ENDERECO = location.origin + location.pathname;

  // Chave primária de cada tabela
  function chave(tabela) { return tabela === 'acessos' ? 'email' : 'id'; }

  function traduzirErro(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/duplicate key|unique/i.test(m)) {
      if (/cnpj/i.test(m)) return 'Já existe uma empresa com este CNPJ.';
      if (/cpf/i.test(m)) return 'Este CPF já está cadastrado nesta empresa.';
      if (/acessos/i.test(m)) return 'Este e-mail já tem um acesso cadastrado.';
      return 'Registro duplicado.';
    }
    if (/foreign key|violates.*restrict/i.test(m)) return 'Não é possível excluir: existem colaboradores ligados a esta empresa.';
    if (/KG_EMAIL_NAO_LIBERADO/.test(m)) return 'Este e-mail ainda não foi liberado pela KeyGest.';
    if (/Database error saving new user/i.test(m)) return 'Não foi possível criar a senha: este e-mail não está liberado no sistema (ou o banco precisa ser atualizado). Confira o e-mail digitado ou fale com a KeyGest.';
    if (/signups? not allowed|signup.*disabled|Email signups are disabled|email_provider_disabled/i.test(m)) return 'O cadastro de novas senhas está desligado no Supabase (Authentication → Sign In / Providers → "Allow new users to sign up" e "Email"). Peça para a KeyGest ligar.';
    if (/Email address .* is invalid|invalid.*email/i.test(m)) return 'O Supabase recusou este e-mail. Confira se está escrito corretamente.';
    if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme o seu e-mail antes de entrar (veja a caixa de entrada e o spam).';
    if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem senha criada. Use "Entrar" ou "Esqueci a senha".';
    if (/pwned|leaked|compromised/i.test(m)) return 'Esta senha já apareceu em vazamentos de dados. Crie outra senha, exclusiva para a KeyGest.';
    if (/Password should|weak_password|at least \d+ characters|should contain/i.test(m)) return 'A senha não cumpre as regras: mínimo de 8 caracteres, com letras, números e símbolos.';
    if (/same.*password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da anterior.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    if (/row-level security|permission denied|multiple \(or no\) rows|0 rows/i.test(m)) return 'Você não tem permissão para esta ação.';
    return m;
  }

  function resultado(r) {
    if (r.error) throw new Error(traduzirErro(r.error));
    return r.data;
  }

  /*
   * Se o banco ainda não tem uma coluna nova (SQL de atualização não rodado),
   * grava sem ela e avisa a tela, em vez de perder o registro inteiro.
   */
  var colunasAusentes = {};
  // Grupos de colunas criados juntos no mesmo SQL: se falta uma, faltam todas do grupo
  var COLUNAS_NOVAS = {
    folha: [
      ['adicional_noturno', 'insalubridade', 'periculosidade', 'comissoes', 'gratificacoes', 'dsr', 'ferias', 'terco_ferias',
        'decimo_terceiro', 'atrasos', 'plano_saude', 'adiantamento', 'pensao', 'descontos', 'data_pagamento'],
      ['valor_faltas'],
    ],
    empresas: [['endereco', 'setor_responsavel']],
    colaboradores: [['matricula', 'ctps_numero', 'ctps_serie', 'banco', 'agencia', 'conta']],
  };

  function semAusentes(tabela, obj) {
    var aus = colunasAusentes[tabela] || {};
    var o = {};
    Object.keys(obj).forEach(function (k) { if (!aus[k]) o[k] = obj[k]; });
    return o;
  }

  function gravar(tabela, obj, executar) {
    var tentativas = 0;
    function tentar() {
      var o = semAusentes(tabela, obj);
      if (!Object.keys(o).length) return Promise.resolve(null);
      return executar(o).then(function (r) {
        var m = r.error && (r.error.message || '');
        var x = m && /Could not find the '([^']+)' column/i.exec(m);
        if (x && tentativas++ < 40 && Object.prototype.hasOwnProperty.call(obj, x[1])) {
          colunasAusentes[tabela] = colunasAusentes[tabela] || {};
          colunasAusentes[tabela][x[1]] = true;
          (COLUNAS_NOVAS[tabela] || []).forEach(function (grupo) {
            if (grupo.indexOf(x[1]) !== -1) grupo.forEach(function (k) { colunasAusentes[tabela][k] = true; });
          });
          try {
            window.dispatchEvent(new CustomEvent('keygest-colunas-ausentes', { detail: { tabela: tabela, colunas: Object.keys(colunasAusentes[tabela]) } }));
          } catch (e) { /* navegador antigo */ }
          return tentar();
        }
        return resultado(r);
      });
    }
    return tentar();
  }

  // ---------------- Supabase ----------------
  var remoto = {
    modo: 'online',
    sessao: function () {
      return sb.auth.getSession().then(function (r) { return r.data.session; });
    },
    entrar: function (email, senha) {
      return sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
        return resultado(r).session;
      });
    },
    // Primeiro acesso: a pessoa cria a própria senha (o e-mail precisa ter sido liberado pelo admin)
    cadastrar: function (email, senha) {
      return sb.auth.signUp({ email: email, password: senha, options: { emailRedirectTo: ENDERECO } }).then(resultado);
    },
    recuperar: function (email) {
      return sb.auth.resetPasswordForEmail(email, { redirectTo: ENDERECO }).then(resultado);
    },
    novaSenha: function (senha) {
      return sb.auth.updateUser({ password: senha }).then(resultado);
    },
    aoMudarLogin: function (fn) {
      sb.auth.onAuthStateChange(function (evento, sessao) { fn(evento, sessao); });
    },
    sair: function () { return sb.auth.signOut(); },
    meuAcesso: function (sessao) {
      var email = String(sessao.user.email || '').toLowerCase();
      return sb.from('acessos').select('*').eq('email', email).maybeSingle().then(resultado);
    },
    listar: function (tabela, filtros) {
      var q = sb.from(tabela).select('*');
      Object.keys(filtros || {}).forEach(function (k) { q = q.eq(k, filtros[k]); });
      return q.then(resultado);
    },
    obter: function (tabela, id) {
      return sb.from(tabela).select('*').eq(chave(tabela), id).maybeSingle().then(resultado);
    },
    inserir: function (tabela, obj) {
      return gravar(tabela, obj, function (o) { return sb.from(tabela).insert(o).select().single(); });
    },
    atualizar: function (tabela, id, obj) {
      return gravar(tabela, obj, function (o) { return sb.from(tabela).update(o).eq(chave(tabela), id).select().single(); });
    },
    excluir: function (tabela, id) {
      return sb.from(tabela).delete().eq(chave(tabela), id).then(resultado);
    },
  };

  // ---------------- Demonstração (localStorage) ----------------
  var CHAVE = 'keygest-sistema-demo';
  var memoria = null;

  function carregar() {
    if (memoria) return memoria;
    try { memoria = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { memoria = null; }
    if (!memoria) {
      memoria = dadosExemplo();
      salvar();
    }
    if (!Array.isArray(memoria.negociacoes)) memoria.negociacoes = negociacoesExemplo();
    if (!Array.isArray(memoria.financeiro)) memoria.financeiro = financeiroExemplo(memoria.empresas[0] && memoria.empresas[0].id, memoria.empresas[1] && memoria.empresas[1].id);
    ['empresas', 'colaboradores', 'ferias', 'folha', 'acessos', 'negociacao_historico'].forEach(function (t) {
      if (!Array.isArray(memoria[t])) memoria[t] = [];
    });
    if (!memoria.acessos.length) memoria.acessos = acessosExemplo(memoria);
    return memoria;
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(memoria)); } catch (e) { /* modo privado */ }
  }

  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function dataRelativa(anos, meses, dias) {
    var d = new Date();
    d.setFullYear(d.getFullYear() + anos, d.getMonth() + meses, d.getDate() + dias);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Lançamentos financeiros fictícios dos últimos 6 meses
  function financeiroExemplo(e1, e2) {
    var lista = [];
    var hoje = new Date();
    for (var m = 5; m >= 0; m--) {
      var d = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
      var comp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var pago = m > 0;
      var l = function (tipo, desc, cat, valor, emp, rec) {
        lista.push({ id: novoId(), tipo: tipo, competencia: comp, data: comp + '-10', descricao: desc, categoria: cat, empresa_id: emp || null,
          valor: valor, quitado: pago, recorrente: !!rec, observacoes: '' });
      };
      l('receita', 'Honorários – Loja Exemplo', 'honorarios', 650, e1, true);
      l('receita', 'Honorários – Restaurante Modelo', 'honorarios', 900, e2, true);
      if (m === 3) l('receita', 'Rescisão avulsa', 'avulsos', 350, e2);
      if (m <= 2) l('receita', 'Honorários – cliente novo (fictício)', 'honorarios', 980, null, true);
      l('despesa', 'Simples Nacional (DAS)', 'impostos', Math.round((1550 + (m <= 2 ? 980 : 0)) * 0.06 * 100) / 100, null, true);
      l('despesa', 'Sistemas e software', 'sistemas', 189.9, null, true);
      l('despesa', 'Internet e telefone', 'internet', 149.9, null, true);
      l('despesa', 'Pró-labore', 'prolabore', 800, null, true);
      if (m === 1) l('despesa', 'Anúncios no Instagram', 'marketing', 250);
    }
    return lista;
  }

  function negociacoesExemplo() {
    function n(empresa, contato, etapa, valor, func, origem, contatoDias, passo, passoDias) {
      return {
        id: novoId(), empresa: empresa, cnpj: '', contato: contato, cargo_contato: 'Sócio(a)', telefone: '(11) 90000-0000', email: '',
        origem: origem, funcionarios: func, regime: 'simples', servicos: 'Folha de pagamento e admissões', valor_mensal: valor, valor_implantacao: 0,
        etapa: etapa, responsavel: 'KeyGest', data_contato: dataRelativa(0, 0, -contatoDias), proximo_passo: passo,
        proximo_data: passo ? dataRelativa(0, 0, passoDias) : null, motivo_perda: null, fechado_em: null, empresa_id: null,
        observacoes: 'Negociação fictícia de demonstração.',
      };
    }
    return [
      n('Padaria Exemplo (fictícia)', 'Marcos', 'contato', 450, 6, 'Site', 2, 'Ligar para entender a necessidade', 1),
      n('Clínica Modelo (fictícia)', 'Patrícia', 'reuniao', 900, 14, 'Indicação', 6, 'Reunião de diagnóstico', 3),
      n('Oficina Teste (fictícia)', 'Roberto', 'proposta', 650, 9, 'WhatsApp', 12, 'Cobrar retorno da proposta', -2),
      n('Mercado Amostra (fictícia)', 'Juliana', 'negociacao', 1200, 22, 'Prospecção ativa', 20, 'Enviar contrato revisado', 2),
    ];
  }

  function dadosExemplo() {
    var e1 = novoId(), e2 = novoId();
    var c = [];
    function col(empresa, nome, cpf, cargo, salario, admissao, extra) {
      var o = {
        id: novoId(), empresa_id: empresa, nome: nome, cpf: cpf, pis: '', data_nascimento: extra.nasc || null,
        email: '', telefone: '', cargo: cargo, departamento: extra.dep || '', salario: salario,
        data_admissao: admissao, tipo_contrato: extra.tipo || 'clt', jornada_semanal: 44,
        status: 'ativo', data_desligamento: null, dependentes: extra.depend || 0, chave_pix: '', observacoes: '',
      };
      c.push(o);
      return o;
    }
    var hoje = new Date();
    var mesAniv = String(hoje.getMonth() + 1).padStart(2, '0');
    col(e1, 'Ana Souza (exemplo)', '529.982.247-25', 'Analista de RH', 4200, dataRelativa(-3, 0, 10), { dep: 'Administrativo', nasc: '1990-' + mesAniv + '-15', depend: 1 });
    col(e1, 'Bruno Lima (exemplo)', '111.444.777-35', 'Auxiliar administrativo', 2300, dataRelativa(-2, 0, 25), { dep: 'Administrativo' });
    col(e1, 'Carla Mendes (exemplo)', '935.411.347-80', 'Vendedora', 2600, dataRelativa(0, 0, -35), { dep: 'Comercial', tipo: 'experiencia' });
    col(e2, 'Diego Rocha (exemplo)', '714.602.380-01', 'Cozinheiro', 2500, dataRelativa(-1, -3, 0), { dep: 'Cozinha' });
    col(e2, 'Elisa Prado (exemplo)', '390.533.447-05', 'Atendente', 1900, dataRelativa(0, -5, 0), { dep: 'Salão' });
    return {
      empresas: [
        { id: e1, razao_social: 'Comércio Exemplo Ltda', nome_fantasia: 'Loja Exemplo', cnpj: '11.222.333/0001-81', endereco: 'Rua das Flores, 100 – Centro, São Paulo/SP – 01000-000', setor_responsavel: 'Departamento Pessoal', regime: 'simples', rat: 0.02, fap: 1, terceiros: 0.058, responsavel: 'Fulano', email: '', telefone: '', ativo: true, observacoes: 'Empresa fictícia de demonstração.' },
        { id: e2, razao_social: 'Restaurante Modelo Ltda', nome_fantasia: 'Restaurante Modelo', cnpj: '12.ABC.345/01DE-35', endereco: 'Av. Exemplo, 2000 – Jardim, São Paulo/SP – 04000-000', setor_responsavel: 'Recursos Humanos', regime: 'normal', rat: 0.02, fap: 1, terceiros: 0.058, responsavel: 'Beltrano', email: '', telefone: '', ativo: true, observacoes: 'Empresa fictícia de demonstração.' },
      ],
      colaboradores: c,
      ferias: [
        { id: novoId(), colaborador_id: c[0].id, periodo_inicio: c[0].data_admissao, inicio: dataRelativa(-2, 0, 20), dias: 30, abono: false, observacoes: '' },
      ],
      negociacoes: negociacoesExemplo(),
      financeiro: financeiroExemplo(e1, e2),
      negociacao_historico: [],
      folha: c.map(function (x, i) {
        var a = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        return {
          id: novoId(), colaborador_id: x.id, empresa_id: x.empresa_id,
          competencia: a.getFullYear() + '-' + String(a.getMonth() + 1).padStart(2, '0'),
          salario: x.salario, faltas: 0, he50: i === 0 ? 6 : 0, he100: 0, adicionais: 0,
          vt: 220, desc_vr: 0, outros_descontos: 0,
          plano_saude: i === 1 ? 150 : 0, adiantamento: i === 1 ? 800 : 0, insalubridade: i === 2 ? 324.2 : 0,
        };
      }),
    };
  }

  function acessosExemplo(d) {
    var lista = [
      { email: 'keygest.rh@gmail.com', nome: 'KeyGest (administrador)', perfil: 'admin', empresa_id: null, colaborador_id: null, ativo: true },
      { email: 'analista@exemplo.com', nome: 'Analista de DP (exemplo)', perfil: 'analista', empresa_id: null, colaborador_id: null, ativo: true },
      { email: 'consulta@exemplo.com', nome: 'Consulta (exemplo)', perfil: 'consulta', empresa_id: null, colaborador_id: null, ativo: true },
    ];
    if (d.empresas[0]) {
      lista.push({ email: 'rh@lojaexemplo.com', nome: 'RH da ' + (d.empresas[0].nome_fantasia || d.empresas[0].razao_social), perfil: 'cliente', empresa_id: d.empresas[0].id, colaborador_id: null, ativo: true });
    }
    var col = d.colaboradores.find(function (c) { return c.empresa_id === (d.empresas[0] || {}).id; });
    if (col) {
      lista.push({ email: 'colaborador@exemplo.com', nome: col.nome, perfil: 'colaborador', empresa_id: null, colaborador_id: col.id, ativo: true });
    }
    return lista;
  }

  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  // Perfil escolhido em "Ver como" (só no modo demonstração)
  var CHAVE_PERFIL = 'keygest-demo-perfil';
  function emailDemo() {
    try { return localStorage.getItem(CHAVE_PERFIL) || 'keygest.rh@gmail.com'; } catch (e) { return 'keygest.rh@gmail.com'; }
  }
  function acessoDemo() {
    var d = carregar();
    return d.acessos.find(function (a) { return a.email === emailDemo() && a.ativo; }) || d.acessos.find(function (a) { return a.perfil === 'admin'; });
  }

  // Imita as regras de segurança do banco (RLS) para o modo demonstração
  function empresaDoAcesso(a, d) {
    if (a.empresa_id) return a.empresa_id;
    var c = d.colaboradores.find(function (x) { return x.id === a.colaborador_id; });
    return c ? c.empresa_id : null;
  }
  function podeVer(tabela, r, a, d) {
    var p = a.perfil;
    if (tabela === 'financeiro') return p === 'admin';
    if (p === 'admin' || p === 'analista' || p === 'consulta') return tabela !== 'acessos' || p === 'admin' || r.email === a.email;
    if (tabela === 'acessos') return r.email === a.email;
    var emp = empresaDoAcesso(a, d);
    if (p === 'cliente') {
      if (tabela === 'empresas') return r.id === emp;
      if (tabela === 'ferias') {
        var c = d.colaboradores.find(function (x) { return x.id === r.colaborador_id; });
        return !!c && c.empresa_id === emp;
      }
      return r.empresa_id === emp;
    }
    if (p === 'colaborador') {
      if (tabela === 'empresas') return r.id === emp;
      if (tabela === 'colaboradores') return r.id === a.colaborador_id;
      return r.colaborador_id === a.colaborador_id;
    }
    return false;
  }
  function podeGravar(tabela, obj, a, d) {
    if (tabela === 'acessos' || tabela === 'financeiro') return a.perfil === 'admin';
    if (a.perfil === 'admin' || a.perfil === 'analista') return true;
    if (tabela === 'folha' && a.perfil === 'cliente') {
      var c = d.colaboradores.find(function (x) { return x.id === obj.colaborador_id; });
      return obj.empresa_id === a.empresa_id && !!c && c.empresa_id === a.empresa_id;
    }
    return false;
  }
  var SEM_PERMISSAO = 'Você não tem permissão para esta ação.';

  var local = {
    modo: 'demo',
    sessao: function () { return Promise.resolve({ user: { email: emailDemo() } }); },
    entrar: function () { return local.sessao(); },
    sair: function () { return Promise.resolve(); },
    meuAcesso: function () { return Promise.resolve(copia(acessoDemo())); },
    perfisDemo: function () { return copia(carregar().acessos.filter(function (a) { return a.ativo; })); },
    verComo: function (email) {
      try { localStorage.setItem(CHAVE_PERFIL, email); } catch (e) { /* modo privado */ }
    },
    listar: function (tabela, filtros) {
      var d = carregar(), a = acessoDemo();
      return Promise.resolve(copia((d[tabela] || []).filter(function (r) {
        return podeVer(tabela, r, a, d) && Object.keys(filtros || {}).every(function (k) { return r[k] === filtros[k]; });
      })));
    },
    obter: function (tabela, id) {
      var d = carregar(), a = acessoDemo(), k = chave(tabela);
      var r = (d[tabela] || []).find(function (x) { return x[k] === id; });
      return Promise.resolve(r && podeVer(tabela, r, a, d) ? copia(r) : null);
    },
    inserir: function (tabela, obj) {
      var d = carregar();
      if (!podeGravar(tabela, obj, acessoDemo(), d)) return Promise.reject(new Error(SEM_PERMISSAO));
      var erro = conferirUnicos(d, tabela, obj, null);
      if (erro) return Promise.reject(new Error(erro));
      var novo = Object.assign(tabela === 'acessos' ? {} : { id: novoId() }, { criado_em: new Date().toISOString() }, obj);
      (d[tabela] = d[tabela] || []).push(novo);
      salvar();
      return Promise.resolve(copia(novo));
    },
    atualizar: function (tabela, id, obj) {
      var d = carregar(), k = chave(tabela), a = acessoDemo();
      var r = (d[tabela] || []).find(function (x) { return x[k] === id; });
      if (!r || !podeVer(tabela, r, a, d) || !podeGravar(tabela, Object.assign({}, r, obj), a, d)) {
        return Promise.reject(new Error(SEM_PERMISSAO));
      }
      var erro = conferirUnicos(d, tabela, obj, id);
      if (erro) return Promise.reject(new Error(erro));
      Object.assign(r, obj, { atualizado_em: new Date().toISOString() });
      salvar();
      return Promise.resolve(copia(r));
    },
    excluir: function (tabela, id) {
      var d = carregar(), k = chave(tabela), a = acessoDemo();
      if (a.perfil !== 'admin' && (tabela === 'acessos' || tabela === 'financeiro' || a.perfil !== 'analista')) return Promise.reject(new Error(SEM_PERMISSAO));
      if (tabela === 'empresas' && d.colaboradores.some(function (c) { return c.empresa_id === id; })) {
        return Promise.reject(new Error(traduzirErro('foreign key')));
      }
      if (tabela === 'colaboradores') {
        d.ferias = d.ferias.filter(function (f) { return f.colaborador_id !== id; });
        d.folha = d.folha.filter(function (f) { return f.colaborador_id !== id; });
        d.acessos = d.acessos.filter(function (x) { return x.colaborador_id !== id; });
      }
      if (tabela === 'negociacoes') {
        d.negociacao_historico = (d.negociacao_historico || []).filter(function (h) { return h.negociacao_id !== id; });
      }
      d[tabela] = (d[tabela] || []).filter(function (x) { return x[k] !== id; });
      salvar();
      return Promise.resolve();
    },
    limpar: function () {
      var adm = carregar().acessos.filter(function (x) { return x.perfil === 'admin'; });
      memoria = { empresas: [], colaboradores: [], ferias: [], folha: [], negociacoes: [], negociacao_historico: [], financeiro: [], acessos: adm };
      local.verComo(adm[0] ? adm[0].email : '');
      salvar();
    },
    restaurarExemplo: function () {
      memoria = dadosExemplo();
      memoria.acessos = acessosExemplo(memoria);
      salvar();
    },
  };

  function conferirUnicos(d, tabela, obj, id) {
    if (tabela === 'empresas' && obj.cnpj) {
      if (d.empresas.some(function (e) { return e.id !== id && e.cnpj === obj.cnpj; })) return traduzirErro('unique cnpj');
    }
    if (tabela === 'acessos' && obj.email && !id) {
      if (d.acessos.some(function (a) { return a.email === obj.email; })) return traduzirErro('unique acessos');
    }
    if (tabela === 'colaboradores' && obj.cpf) {
      if (d.colaboradores.some(function (c) { return c.id !== id && c.cpf === obj.cpf && c.empresa_id === obj.empresa_id; })) return traduzirErro('unique cpf');
    }
    return null;
  }

  window.DB = online ? remoto : local;
})();
