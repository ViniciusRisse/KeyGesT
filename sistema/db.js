/*
 * Camada de dados do sistema.
 * - Com Supabase configurado em js/config.js: usa o banco online.
 * - Sem configuração: modo demonstração, com dados salvos só neste navegador.
 */
(function () {
  'use strict';

  var cfg = (window.KEYGEST_CONFIG || {}).supabase || {};
  var online = !!(cfg.url && cfg.anonKey && window.supabase);
  var sb = online ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  function traduzirErro(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/duplicate key|unique/i.test(m)) {
      if (/cnpj/i.test(m)) return 'Já existe uma empresa com este CNPJ.';
      if (/cpf/i.test(m)) return 'Este CPF já está cadastrado nesta empresa.';
      return 'Registro duplicado.';
    }
    if (/foreign key|violates.*restrict/i.test(m)) return 'Não é possível excluir: existem colaboradores ligados a esta empresa.';
    if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme o seu e-mail antes de entrar (veja a sua caixa de entrada).';
    if (/row-level security|permission denied/i.test(m)) return 'Seu usuário não tem permissão. Peça para incluir seu e-mail na tabela "equipe".';
    return m;
  }

  // ---------------- Supabase ----------------
  var remoto = {
    modo: 'online',
    sessao: function () {
      return sb.auth.getSession().then(function (r) { return r.data.session; });
    },
    entrar: function (email, senha) {
      return sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
        if (r.error) throw new Error(traduzirErro(r.error));
        return r.data.session;
      });
    },
    sair: function () { return sb.auth.signOut(); },
    listar: function (tabela, filtros) {
      var q = sb.from(tabela).select('*');
      Object.keys(filtros || {}).forEach(function (k) { q = q.eq(k, filtros[k]); });
      return q.then(function (r) {
        if (r.error) throw new Error(traduzirErro(r.error));
        return r.data;
      });
    },
    obter: function (tabela, id) {
      return sb.from(tabela).select('*').eq('id', id).maybeSingle().then(function (r) {
        if (r.error) throw new Error(traduzirErro(r.error));
        return r.data;
      });
    },
    inserir: function (tabela, obj) {
      return sb.from(tabela).insert(obj).select().single().then(function (r) {
        if (r.error) throw new Error(traduzirErro(r.error));
        return r.data;
      });
    },
    atualizar: function (tabela, id, obj) {
      return sb.from(tabela).update(obj).eq('id', id).select().single().then(function (r) {
        if (r.error) throw new Error(traduzirErro(r.error));
        return r.data;
      });
    },
    excluir: function (tabela, id) {
      return sb.from(tabela).delete().eq('id', id).then(function (r) {
        if (r.error) throw new Error(traduzirErro(r.error));
      });
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
    ['empresas', 'colaboradores', 'ferias', 'folha'].forEach(function (t) {
      if (!Array.isArray(memoria[t])) memoria[t] = [];
    });
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
        { id: e1, razao_social: 'Comércio Exemplo Ltda', nome_fantasia: 'Loja Exemplo', cnpj: '11.222.333/0001-81', regime: 'simples', rat: 0.02, fap: 1, terceiros: 0.058, responsavel: 'Fulano', email: '', telefone: '', ativo: true, observacoes: 'Empresa fictícia de demonstração.' },
        { id: e2, razao_social: 'Restaurante Modelo Ltda', nome_fantasia: 'Restaurante Modelo', cnpj: '12.ABC.345/01DE-35', regime: 'normal', rat: 0.02, fap: 1, terceiros: 0.058, responsavel: 'Beltrano', email: '', telefone: '', ativo: true, observacoes: 'Empresa fictícia de demonstração.' },
      ],
      colaboradores: c,
      ferias: [
        { id: novoId(), colaborador_id: c[0].id, periodo_inicio: c[0].data_admissao, inicio: dataRelativa(-2, 0, 20), dias: 30, abono: false, observacoes: '' },
      ],
    };
  }

  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  var local = {
    modo: 'demo',
    sessao: function () { return Promise.resolve({ user: { email: 'demonstracao' } }); },
    entrar: function () { return local.sessao(); },
    sair: function () { return Promise.resolve(); },
    listar: function (tabela, filtros) {
      var dados = carregar()[tabela] || [];
      return Promise.resolve(copia(dados.filter(function (r) {
        return Object.keys(filtros || {}).every(function (k) { return r[k] === filtros[k]; });
      })));
    },
    obter: function (tabela, id) {
      var r = (carregar()[tabela] || []).find(function (x) { return x.id === id; });
      return Promise.resolve(r ? copia(r) : null);
    },
    inserir: function (tabela, obj) {
      var d = carregar();
      var erro = conferirUnicos(d, tabela, obj, null);
      if (erro) return Promise.reject(new Error(erro));
      var novo = Object.assign({ id: novoId(), criado_em: new Date().toISOString() }, obj);
      d[tabela].push(novo);
      salvar();
      return Promise.resolve(copia(novo));
    },
    atualizar: function (tabela, id, obj) {
      var d = carregar();
      var erro = conferirUnicos(d, tabela, obj, id);
      if (erro) return Promise.reject(new Error(erro));
      var r = d[tabela].find(function (x) { return x.id === id; });
      if (!r) return Promise.reject(new Error('Registro não encontrado.'));
      Object.assign(r, obj, { atualizado_em: new Date().toISOString() });
      salvar();
      return Promise.resolve(copia(r));
    },
    excluir: function (tabela, id) {
      var d = carregar();
      if (tabela === 'empresas' && d.colaboradores.some(function (c) { return c.empresa_id === id; })) {
        return Promise.reject(new Error(traduzirErro('foreign key')));
      }
      if (tabela === 'colaboradores') {
        d.ferias = d.ferias.filter(function (f) { return f.colaborador_id !== id; });
        d.folha = d.folha.filter(function (f) { return f.colaborador_id !== id; });
      }
      d[tabela] = d[tabela].filter(function (x) { return x.id !== id; });
      salvar();
      return Promise.resolve();
    },
    limpar: function () {
      memoria = { empresas: [], colaboradores: [], ferias: [], folha: [] };
      salvar();
    },
    restaurarExemplo: function () {
      memoria = dadosExemplo();
      salvar();
    },
  };

  function conferirUnicos(d, tabela, obj, id) {
    if (tabela === 'empresas' && obj.cnpj) {
      if (d.empresas.some(function (e) { return e.id !== id && e.cnpj === obj.cnpj; })) return traduzirErro('unique cnpj');
    }
    if (tabela === 'colaboradores' && obj.cpf) {
      if (d.colaboradores.some(function (c) { return c.id !== id && c.cpf === obj.cpf && c.empresa_id === obj.empresa_id; })) return traduzirErro('unique cpf');
    }
    return null;
  }

  window.DB = online ? remoto : local;
})();
