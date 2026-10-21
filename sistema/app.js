/* Sistema KeyGest — cadastro de empresas clientes e colaboradores. */
(function () {
  'use strict';

  var C = window.KeyGestCalc;
  var P = window.KEYGEST_CONFIG.parametros;
  var DB = window.DB;
  var brl = C.formatarBRL;
  var vista = document.getElementById('vista');

  // Acesso do usuário logado e o que ele pode fazer
  var ACESSO = null;
  var PODE = {};
  var PERFIS = {
    admin: 'Administrador',
    analista: 'Analista (edita)',
    consulta: 'Somente consulta',
    cliente: 'Empresa cliente',
    colaborador: 'Colaborador',
  };

  function definirPermissoes(a) {
    var p = a.perfil;
    PODE = {
      equipe: p === 'admin' || p === 'analista' || p === 'consulta',
      editar: p === 'admin' || p === 'analista',
      folha: p === 'admin' || p === 'analista' || p === 'cliente',
      usuarios: p === 'admin',
      cliente: p === 'cliente',
      colaborador: p === 'colaborador',
    };
  }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function lerData(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function isoData(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtData(v) {
    var d = typeof v === 'string' ? lerData(v) : v;
    return d ? d.toLocaleDateString('pt-BR') : '—';
  }

  function somarDias(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function somarAnos(d, n) {
    return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
  }

  function diasEntre(a, b) {
    return Math.round((b - a) / 864e5);
  }

  function hoje() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function validarCPF(v) {
    var c = String(v || '').replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += +c[i] * (t + 1 - i);
      var dv = ((s * 10) % 11) % 10;
      if (+c[t] !== dv) return false;
    }
    return true;
  }

  // PIS/PASEP/NIT: 11 dígitos com dígito verificador
  function validarPIS(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    var pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var soma = 0;
    for (var i = 0; i < 10; i++) soma += +d[i] * pesos[i];
    var dv = 11 - (soma % 11);
    if (dv >= 10) dv = 0;
    return dv === +d[10];
  }

  var MASCARAS = {
    pis: function (v) {
      var d = v.replace(/\D/g, '').slice(0, 11);
      var o = d.slice(0, 3);
      if (d.length > 3) o += '.' + d.slice(3, 8);
      if (d.length > 8) o += '.' + d.slice(8, 10);
      if (d.length > 10) o += '-' + d.slice(10, 11);
      return o;
    },
    cpf: function (v) {
      var d = v.replace(/\D/g, '').slice(0, 11);
      return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    },
    cnpj: function (v) {
      var x = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
      var o = x.slice(0, 2);
      if (x.length > 2) o += '.' + x.slice(2, 5);
      if (x.length > 5) o += '.' + x.slice(5, 8);
      if (x.length > 8) o += '/' + x.slice(8, 12);
      if (x.length > 12) o += '-' + x.slice(12, 14);
      return o;
    },
    telefone: function (v) {
      var d = v.replace(/\D/g, '').slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
      var corte = d.length === 11 ? 7 : 6;
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, corte) + '-' + d.slice(corte);
    },
  };

  function aviso(texto, erro) {
    var t = document.getElementById('toast');
    t.textContent = texto;
    t.className = 'toast' + (erro ? ' erro' : '');
    t.hidden = false;
    clearTimeout(aviso.timer);
    aviso.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function porNome(campo) {
    return function (a, b) {
      return String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR');
    };
  }

  function nomeEmpresa(e) {
    return e ? e.nome_fantasia || e.razao_social : '—';
  }

  var ICONE_LAPIS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  var STATUS = { ativo: 'Ativo', ferias: 'Em férias', afastado: 'Afastado', desligado: 'Desligado' };
  var CONTRATOS = {
    clt: 'CLT – prazo indeterminado',
    experiencia: 'Contrato de experiência',
    temporario: 'Temporário',
    estagio: 'Estágio',
    aprendiz: 'Jovem aprendiz',
    intermitente: 'Intermitente',
  };
  var REGIMES = {};
  Object.keys(C.REGIMES).forEach(function (k) { REGIMES[k] = C.REGIMES[k].nome; });

  function etiquetaStatus(s) {
    return '<span class="etiqueta ' + esc(s) + '">' + esc(STATUS[s] || s) + '</span>';
  }

  // ------------------------------------------------------------------
  // Regras: custo, férias, experiência
  // ------------------------------------------------------------------
  function custoColaborador(col, emp) {
    return C.custoFuncionario({
      salario: col.salario,
      regime: emp ? emp.regime : 'normal',
      rat: emp ? emp.rat : P.ratPadrao,
      fap: emp ? emp.fap : P.fapPadrao,
      terceiros: emp ? emp.terceiros : P.terceirosPadrao,
    }, P);
  }

  // Períodos aquisitivos (12 meses) e concessivos (12 meses seguintes).
  function periodosFerias(col, ferias) {
    var lista = [];
    var adm = lerData(col.data_admissao);
    if (!adm) return lista;
    var hj = hoje();
    var limite = col.data_desligamento ? lerData(col.data_desligamento) : hj;
    var ini = adm;
    var guarda = 0;
    while (ini <= limite && guarda++ < 80) {
      var fimAq = somarDias(somarAnos(ini, 1), -1);
      var fimConc = somarDias(somarAnos(ini, 2), -1);
      var chave = isoData(ini);
      var regs = ferias.filter(function (f) { return f.periodo_inicio === chave; });
      var usados = regs.reduce(function (s, f) { return s + (+f.dias || 0) + (f.abono ? 10 : 0); }, 0);
      var saldo = Math.max(0, 30 - usados);
      var situacao, classe;
      if (hj <= fimAq) {
        situacao = 'Em aquisição';
        classe = '';
      } else if (saldo === 0) {
        situacao = 'Concluído';
        classe = 'desligado';
      } else if (hj > fimConc) {
        situacao = 'Vencido – pagar em dobro';
        classe = 'alerta-vermelho';
      } else {
        var falta = diasEntre(hj, fimConc);
        situacao = 'Conceder até ' + fmtData(fimConc);
        classe = falta <= 60 ? 'alerta-amarelo' : '';
      }
      lista.push({
        inicio: ini, fimAquisitivo: fimAq, fimConcessivo: fimConc, chave: chave,
        usados: usados, saldo: saldo, situacao: situacao, classe: classe,
        aberto: hj > fimAq && saldo > 0,
      });
      ini = somarAnos(ini, 1);
    }
    return lista;
  }

  function prazosExperiencia(col) {
    if (col.tipo_contrato !== 'experiencia') return null;
    var adm = lerData(col.data_admissao);
    return { primeiro: somarDias(adm, 44), segundo: somarDias(adm, 89) };
  }

  // ------------------------------------------------------------------
  // Formulários genéricos
  // ------------------------------------------------------------------
  var FORM_EMPRESA = [
    {
      titulo: 'Dados da empresa',
      campos: [
        { n: 'razao_social', l: 'Razão social *', req: true, cls: 'dois' },
        { n: 'nome_fantasia', l: 'Nome fantasia' },
        { n: 'cnpj', l: 'CNPJ', mask: 'cnpj', valida: 'cnpj' },
        { n: 'regime', l: 'Regime tributário *', tipo: 'select', ops: REGIMES, req: true },
        { n: 'ativo', l: 'Situação', tipo: 'select', ops: { 'true': 'Ativa', 'false': 'Inativa' }, conv: 'bool' },
      ],
    },
    {
      titulo: 'Encargos (para o custo estimado)',
      campos: [
        { n: 'rat', l: 'RAT', tipo: 'select', ops: { '0.01': '1% – leve', '0.02': '2% – médio', '0.03': '3% – grave' }, conv: 'num' },
        { n: 'fap', l: 'FAP', tipo: 'number', step: '0.0001', conv: 'num' },
        { n: 'terceiros', l: 'Terceiros (%)', tipo: 'number', step: '0.1', conv: 'pct' },
      ],
    },
    {
      titulo: 'Contato',
      campos: [
        { n: 'responsavel', l: 'Responsável' },
        { n: 'email', l: 'E-mail', tipo: 'email', valida: 'email' },
        { n: 'telefone', l: 'Telefone', mask: 'telefone' },
        { n: 'observacoes', l: 'Observações', tipo: 'textarea', cls: 'inteiro' },
      ],
    },
  ];

  function formColaborador(empresas) {
    var opsEmp = {};
    empresas.forEach(function (e) { opsEmp[e.id] = nomeEmpresa(e); });
    return [
      {
        titulo: 'Dados pessoais',
        campos: [
          { n: 'nome', l: 'Nome completo *', req: true, cls: 'dois' },
          { n: 'cpf', l: 'CPF *', req: true, mask: 'cpf', valida: 'cpf' },
          { n: 'data_nascimento', l: 'Data de nascimento', tipo: 'date' },
          { n: 'pis', l: 'PIS/NIS', mask: 'pis', valida: 'pis', max: 14, dica: '11 dígitos' },
          { n: 'dependentes', l: 'Dependentes', tipo: 'number', step: '1', conv: 'int' },
          { n: 'email', l: 'E-mail', tipo: 'email', valida: 'email' },
          { n: 'telefone', l: 'Telefone', mask: 'telefone' },
          { n: 'chave_pix', l: 'Chave PIX / dados bancários' },
        ],
      },
      {
        titulo: 'Contrato de trabalho',
        campos: [
          { n: 'empresa_id', l: 'Empresa *', tipo: 'select', ops: opsEmp, req: true, vazio: 'Selecione' },
          { n: 'cargo', l: 'Cargo' },
          { n: 'departamento', l: 'Departamento' },
          { n: 'salario', l: 'Salário (R$) *', tipo: 'number', step: '0.01', conv: 'num', req: true },
          { n: 'data_admissao', l: 'Data de admissão *', tipo: 'date', req: true },
          { n: 'tipo_contrato', l: 'Tipo de contrato', tipo: 'select', ops: CONTRATOS },
          { n: 'jornada_semanal', l: 'Jornada semanal (horas)', tipo: 'number', step: '1', conv: 'int' },
          { n: 'status', l: 'Situação', tipo: 'select', ops: STATUS },
          { n: 'data_desligamento', l: 'Data de desligamento', tipo: 'date' },
        ],
      },
      {
        titulo: 'Observações',
        campos: [{ n: 'observacoes', l: 'Anotações internas', tipo: 'textarea', cls: 'inteiro' }],
      },
    ];
  }

  function htmlCampo(c, valor) {
    var id = 'f-' + c.n;
    var v = valor;
    if (c.conv === 'pct' && v != null && v !== '') v = Math.round(v * 10000) / 100;
    if (c.conv === 'bool' || c.conv === 'num') v = v == null ? '' : String(v);
    if (v == null) v = '';
    var classe = 'campo ' + (c.cls || '');
    var entrada;
    if (c.tipo === 'select') {
      entrada = '<select id="' + id + '" name="' + c.n + '">' +
        (c.vazio ? '<option value="">' + esc(c.vazio) + '</option>' : '') +
        Object.keys(c.ops).map(function (k) {
          return '<option value="' + esc(k) + '"' + (String(k) === String(v) ? ' selected' : '') + '>' + esc(c.ops[k]) + '</option>';
        }).join('') + '</select>';
    } else if (c.tipo === 'textarea') {
      entrada = '<textarea id="' + id + '" name="' + c.n + '">' + esc(v) + '</textarea>';
    } else {
      var tipo = c.tipo || 'text';
      entrada = '<input id="' + id + '" name="' + c.n + '" type="' + tipo + '" value="' + esc(v) + '"' +
        (c.step ? ' step="' + c.step + '" min="0"' : '') +
        (c.mask ? ' data-mascara="' + c.mask + '"' : '') +
        (c.max ? ' maxlength="' + c.max + '" inputmode="numeric" placeholder="000.00000.00-0"' : '') +
        (tipo === 'number' ? ' inputmode="decimal"' : '') + '>';
    }
    return '<div class="' + classe + '"><label for="' + id + '">' + esc(c.l) + '</label>' + entrada +
      '<div class="erro-campo"></div></div>';
  }

  function htmlFormulario(grupos, dados) {
    return grupos.map(function (g) {
      return '<fieldset><legend>' + esc(g.titulo) + '</legend><div class="campos">' +
        g.campos.map(function (c) { return htmlCampo(c, dados[c.n]); }).join('') + '</div></fieldset>';
    }).join('');
  }

  function ligarMascaras(raiz) {
    raiz.querySelectorAll('[data-mascara]').forEach(function (el) {
      el.addEventListener('input', function () {
        el.value = MASCARAS[el.getAttribute('data-mascara')](el.value);
      });
    });
  }

  function lerFormulario(form, grupos) {
    var obj = {};
    var erros = [];
    form.querySelectorAll('.campo.invalido').forEach(function (el) { el.classList.remove('invalido'); });
    grupos.forEach(function (g) {
      g.campos.forEach(function (c) {
        var el = form.elements[c.n];
        var bruto = el.value.trim();
        var msg = '';
        var v = bruto === '' ? null : bruto;
        if (v != null) {
          if (c.conv === 'num' || c.conv === 'pct') {
            v = parseFloat(bruto.replace(',', '.'));
            if (!isFinite(v)) msg = 'Número inválido.';
            else if (c.conv === 'pct') v = v / 100;
          } else if (c.conv === 'int') {
            v = parseInt(bruto, 10);
            if (!isFinite(v)) msg = 'Número inválido.';
          } else if (c.conv === 'bool') {
            v = bruto === 'true';
          }
          if (c.valida === 'cpf' && !validarCPF(bruto)) msg = 'CPF inválido.';
          if (c.valida === 'pis' && !validarPIS(bruto)) msg = bruto.replace(/\D/g, '').length !== 11 ? 'O PIS deve ter 11 dígitos.' : 'PIS inválido. Confira os números.';
          if (c.valida === 'cnpj' && !C.validarCNPJ(bruto)) msg = 'CNPJ inválido.';
          if (c.valida === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(bruto)) msg = 'E-mail inválido.';
        } else if (c.req) {
          msg = 'Campo obrigatório.';
        }
        if (msg) {
          var campo = el.closest('.campo');
          campo.classList.add('invalido');
          campo.querySelector('.erro-campo').textContent = msg;
          erros.push(el);
        }
        obj[c.n] = v;
      });
    });
    return { dados: obj, erros: erros };
  }

  function marcarErro(form, nome, msg) {
    var el = form.elements[nome];
    var campo = el.closest('.campo');
    campo.classList.add('invalido');
    campo.querySelector('.erro-campo').textContent = msg;
    return el;
  }

  // ------------------------------------------------------------------
  // Telas
  // ------------------------------------------------------------------
  async function telaPainel() {
    var r = await Promise.all([DB.listar('empresas'), DB.listar('colaboradores'), DB.listar('ferias')]);
    var empresas = r[0], cols = r[1], ferias = r[2];
    var mapaEmp = {};
    empresas.forEach(function (e) { mapaEmp[e.id] = e; });
    var ativos = cols.filter(function (c) { return c.status !== 'desligado'; });
    var folha = 0, custo = 0;
    ativos.forEach(function (c) {
      folha += +c.salario || 0;
      custo += custoColaborador(c, mapaEmp[c.empresa_id]).total;
    });

    var alertas = [];
    var hj = hoje();
    ativos.forEach(function (c) {
      var fer = ferias.filter(function (f) { return f.colaborador_id === c.id; });
      periodosFerias(c, fer).forEach(function (p) {
        if (!p.aberto) return;
        var falta = diasEntre(hj, p.fimConcessivo);
        if (falta < 0) {
          alertas.push({ ordem: falta, col: c, titulo: 'Férias vencidas', detalhe: 'Período ' + fmtData(p.inicio) + ' – saldo de ' + p.saldo + ' dias', classe: 'alerta-vermelho', etiqueta: 'Vencidas' });
        } else if (falta <= 60) {
          alertas.push({ ordem: falta, col: c, titulo: 'Férias a vencer', detalhe: 'Conceder até ' + fmtData(p.fimConcessivo) + ' – saldo de ' + p.saldo + ' dias', classe: 'alerta-amarelo', etiqueta: falta + ' dias' });
        }
      });
      var exp = prazosExperiencia(c);
      if (exp) {
        [['1º prazo da experiência (45 dias)', exp.primeiro], ['Fim do contrato de experiência (90 dias)', exp.segundo]].forEach(function (x) {
          var falta = diasEntre(hj, x[1]);
          if (falta >= 0 && falta <= 15) {
            alertas.push({ ordem: falta, col: c, titulo: x[0], detalhe: 'Vence em ' + fmtData(x[1]) + ' – decidir prorrogação ou efetivação', classe: 'alerta-amarelo', etiqueta: falta + ' dias' });
          }
        });
      }
    });
    alertas.sort(function (a, b) { return a.ordem - b.ordem; });

    var mes = hj.getMonth();
    var aniversariantes = ativos.filter(function (c) {
      var d = lerData(c.data_nascimento);
      return d && d.getMonth() === mes;
    }).sort(function (a, b) { return lerData(a.data_nascimento).getDate() - lerData(b.data_nascimento).getDate(); });

    vista.innerHTML =
      '<div class="topo-vista"><div><h1>Painel' + (PODE.cliente && empresas[0] ? ' – ' + esc(nomeEmpresa(empresas[0])) : '') + '</h1>' +
      '<p>' + (PODE.cliente ? 'Visão geral dos colaboradores da sua empresa.' : 'Visão geral das empresas e colaboradores atendidos.') + '</p></div>' +
      '<div class="acoes">' + (PODE.folha ? '<a class="botao botao-secundario" href="#/folha">Lançar folha do mês</a>' : '') +
      (PODE.editar ? '<a class="botao" href="#/colaboradores/novo">+ Novo colaborador</a>' : '') + '</div></div>' +
      '<div class="indicadores">' +
      '<div class="indicador"><span>Empresas ativas</span><strong>' + empresas.filter(function (e) { return e.ativo !== false; }).length + '</strong></div>' +
      '<div class="indicador"><span>Colaboradores ativos</span><strong>' + ativos.length + '</strong></div>' +
      '<div class="indicador"><span>Folha mensal (salários)</span><strong>' + brl(folha) + '</strong></div>' +
      '<div class="indicador"><span>Custo mensal estimado</span><strong>' + brl(custo) + '</strong></div>' +
      '</div>' +
      '<div class="grade-ficha">' +
      '<section class="painel"><h2>Alertas e prazos</h2>' +
      (alertas.length
        ? '<ul class="alertas">' + alertas.map(function (a) {
          return '<li><div><a href="#/colaboradores/' + esc(a.col.id) + '">' + esc(a.col.nome) + '</a>' +
            '<small>' + esc(a.titulo) + ' · ' + esc(a.detalhe) + ' · ' + esc(nomeEmpresa(mapaEmp[a.col.empresa_id])) + '</small></div>' +
            '<span class="etiqueta ' + a.classe + '">' + esc(a.etiqueta) + '</span></li>';
        }).join('') + '</ul>'
        : '<p class="ajuda">Nenhum prazo de férias ou de experiência nos próximos dias.</p>') +
      '</section>' +
      '<section class="painel"><h2>Aniversariantes do mês</h2>' +
      (aniversariantes.length
        ? '<ul class="alertas">' + aniversariantes.map(function (c) {
          return '<li><div><a href="#/colaboradores/' + esc(c.id) + '">' + esc(c.nome) + '</a><small>' + esc(nomeEmpresa(mapaEmp[c.empresa_id])) + '</small></div>' +
            '<span>' + lerData(c.data_nascimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + '</span></li>';
        }).join('') + '</ul>'
        : '<p class="ajuda">Nenhum aniversariante este mês.</p>') +
      '</section></div>';
  }

  // ---------- Empresas ----------
  async function telaEmpresas() {
    var r = await Promise.all([DB.listar('empresas'), DB.listar('colaboradores')]);
    var empresas = r[0].sort(porNome('razao_social'));
    var cols = r[1];

    vista.innerHTML =
      '<div class="topo-vista"><div><h1>Empresas clientes</h1><p>' + empresas.length + ' empresa(s) cadastrada(s).</p></div>' +
      '<div class="acoes">' + (PODE.editar ? '<a class="botao" href="#/empresas/nova">+ Nova empresa</a>' : '') + '</div></div>' +
      '<div class="caixa-lista">' +
      (empresas.length
        ? '<table class="lista"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Regime</th><th class="num">Colaboradores</th><th class="num">Folha mensal</th><th>Situação</th><th></th></tr></thead><tbody>' +
          empresas.map(function (e) {
            var doEmp = cols.filter(function (c) { return c.empresa_id === e.id && c.status !== 'desligado'; });
            var folha = doEmp.reduce(function (s, c) { return s + (+c.salario || 0); }, 0);
            return '<tr><td><a href="#/colaboradores?empresa=' + esc(e.id) + '">' + esc(nomeEmpresa(e)) + '</a><br><small style="color:var(--texto-suave)">' + esc(e.razao_social) + '</small></td>' +
              '<td>' + esc(e.cnpj || '—') + '</td><td>' + esc(REGIMES[e.regime] || e.regime) + '</td>' +
              '<td class="num">' + doEmp.length + '</td><td class="num">' + brl(folha) + '</td>' +
              '<td>' + (e.ativo === false ? '<span class="etiqueta desligado">Inativa</span>' : '<span class="etiqueta">Ativa</span>') + '</td>' +
              '<td><div class="acoes" style="flex-wrap:nowrap"><a class="botao botao-secundario botao-pequeno" href="#/folha?empresa=' + esc(e.id) + '">Folha</a>' +
              (PODE.editar ? '<a class="botao botao-secundario botao-pequeno" href="#/empresas/' + esc(e.id) + '/editar">Editar</a>' : '') + '</div></td></tr>';
          }).join('') + '</tbody></table>'
        : '<div class="vazio">Nenhuma empresa cadastrada ainda.' + (PODE.editar ? '<br><a class="botao" style="margin-top:14px" href="#/empresas/nova">Cadastrar a primeira empresa</a>' : '') + '</div>') +
      '</div>';
  }

  async function telaFormEmpresa(id) {
    var dados = { regime: 'simples', rat: P.ratPadrao, fap: P.fapPadrao, terceiros: P.terceirosPadrao, ativo: true };
    if (id) {
      dados = await DB.obter('empresas', id);
      if (!dados) return naoEncontrado();
    }
    vista.innerHTML =
      '<a class="voltar" href="#/empresas">← Empresas</a>' +
      '<div class="topo-vista"><h1>' + (id ? 'Editar empresa' : 'Nova empresa') + '</h1></div>' +
      '<form class="painel form-sistema" id="form" novalidate>' + htmlFormulario(FORM_EMPRESA, dados) +
      '<div class="acoes"><button class="botao" type="submit">Salvar</button>' +
      '<a class="botao botao-secundario" href="#/empresas">Cancelar</a>' +
      (id ? '<button type="button" class="botao botao-perigo" id="excluir" style="margin-left:auto">Excluir empresa</button>' : '') +
      '</div></form>';

    var form = document.getElementById('form');
    ligarMascaras(form);
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var r = lerFormulario(form, FORM_EMPRESA);
      if (r.erros.length) { r.erros[0].focus(); return; }
      if (r.dados.fap != null && (r.dados.fap < 0.5 || r.dados.fap > 2)) {
        marcarErro(form, 'fap', 'O FAP vai de 0,5 a 2,0.').focus();
        return;
      }
      if (r.dados.cnpj) r.dados.cnpj = r.dados.cnpj.toUpperCase();
      if (r.dados.ativo == null) r.dados.ativo = true;
      if (r.dados.rat == null) r.dados.rat = P.ratPadrao;
      if (r.dados.fap == null) r.dados.fap = P.fapPadrao;
      if (r.dados.terceiros == null) r.dados.terceiros = P.terceirosPadrao;
      try {
        if (id) await DB.atualizar('empresas', id, r.dados);
        else await DB.inserir('empresas', r.dados);
        aviso('Empresa salva.');
        location.hash = '#/empresas';
      } catch (e) { aviso(e.message, true); }
    });
    var bt = document.getElementById('excluir');
    if (bt) bt.addEventListener('click', async function () {
      if (!confirm('Excluir esta empresa? Esta ação não pode ser desfeita.')) return;
      try {
        await DB.excluir('empresas', id);
        aviso('Empresa excluída.');
        location.hash = '#/empresas';
      } catch (e) { aviso(e.message, true); }
    });
  }

  // ---------- Colaboradores ----------
  var filtros = { busca: '', empresa: '', status: 'ativos' };

  async function telaColaboradores(query) {
    if (query.empresa != null) filtros.empresa = query.empresa;
    var r = await Promise.all([DB.listar('empresas'), DB.listar('colaboradores')]);
    var empresas = r[0].sort(porNome('razao_social'));
    var cols = r[1].sort(porNome('nome'));
    var mapaEmp = {};
    empresas.forEach(function (e) { mapaEmp[e.id] = e; });

    vista.innerHTML =
      '<div class="topo-vista"><div><h1>Colaboradores</h1><p>Cadastro de funcionários das empresas clientes.</p></div>' +
      '<div class="acoes"><button type="button" class="botao botao-secundario" id="exportar">Exportar planilha</button>' +
      (PODE.editar ? '<a class="botao" id="novo" href="#/colaboradores/novo">+ Novo colaborador</a>' : '') + '</div></div>' +
      '<div class="filtros">' +
      '<input type="text" id="busca" placeholder="Buscar por nome, CPF ou cargo" aria-label="Buscar" value="' + esc(filtros.busca) + '">' +
      '<select id="f-empresa" aria-label="Empresa"><option value="">Todas as empresas</option>' +
      empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (filtros.empresa === e.id ? ' selected' : '') + '>' + esc(nomeEmpresa(e)) + '</option>'; }).join('') +
      '</select>' +
      '<select id="f-status" aria-label="Situação">' +
      [['ativos', 'Ativos (sem desligados)'], ['', 'Todas as situações']].concat(Object.keys(STATUS).map(function (k) { return [k, STATUS[k]]; }))
        .map(function (o) { return '<option value="' + o[0] + '"' + (filtros.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="caixa-lista" id="tabela"></div>';

    function filtrados() {
      var b = filtros.busca.toLowerCase();
      var bNum = b.replace(/\D/g, '');
      return cols.filter(function (c) {
        if (filtros.empresa && c.empresa_id !== filtros.empresa) return false;
        if (filtros.status === 'ativos' && c.status === 'desligado') return false;
        if (filtros.status && filtros.status !== 'ativos' && c.status !== filtros.status) return false;
        if (b) {
          var texto = (c.nome + ' ' + (c.cargo || '') + ' ' + (c.departamento || '')).toLowerCase();
          var cpf = String(c.cpf || '').replace(/\D/g, '');
          if (texto.indexOf(b) === -1 && !(bNum && cpf.indexOf(bNum) !== -1)) return false;
        }
        return true;
      });
    }

    function desenhar() {
      var lista = filtrados();
      var total = lista.reduce(function (s, c) { return s + (+c.salario || 0); }, 0);
      var novo = document.getElementById('novo');
      if (novo) novo.href = '#/colaboradores/novo' + (filtros.empresa ? '?empresa=' + encodeURIComponent(filtros.empresa) : '');
      document.getElementById('tabela').innerHTML = lista.length
        ? '<table class="lista"><thead><tr><th>Nome</th><th>Empresa</th><th>Cargo</th><th class="num">Salário</th><th>Admissão</th><th>Situação</th>' +
          (PODE.editar ? '<th class="col-acoes"><span class="sr-only">Ações</span></th>' : '') + '</tr></thead><tbody>' +
          lista.map(function (c) {
            return '<tr><td><a href="#/colaboradores/' + esc(c.id) + '">' + esc(c.nome) + '</a></td>' +
              '<td>' + esc(nomeEmpresa(mapaEmp[c.empresa_id])) + '</td><td>' + esc(c.cargo || '—') + '</td>' +
              '<td class="num">' + brl(c.salario) + '</td><td>' + fmtData(c.data_admissao) + '</td><td>' + etiquetaStatus(c.status) + '</td>' +
              (PODE.editar ? '<td class="col-acoes"><a class="icone-editar" href="#/colaboradores/' + esc(c.id) + '/editar" title="Editar ' + esc(c.nome) + '" aria-label="Editar ' + esc(c.nome) + '">' + ICONE_LAPIS + '</a></td>' : '') +
              '</tr>';
          }).join('') + '</tbody></table>' +
          '<div class="rodape-lista"><span>' + lista.length + ' colaborador(es)</span><span>Total de salários: <strong>' + brl(total) + '</strong></span></div>'
        : '<div class="vazio">' + (cols.length ? 'Nenhum colaborador encontrado com esses filtros.' : 'Nenhum colaborador cadastrado ainda.') + '</div>';
      return lista;
    }

    document.getElementById('busca').addEventListener('input', function () { filtros.busca = this.value; desenhar(); });
    document.getElementById('f-empresa').addEventListener('change', function () { filtros.empresa = this.value; desenhar(); });
    document.getElementById('f-status').addEventListener('change', function () { filtros.status = this.value; desenhar(); });
    document.getElementById('exportar').addEventListener('click', function () {
      exportarCSV(filtrados(), mapaEmp);
    });
    desenhar();
  }

  function exportarCSV(lista, mapaEmp) {
    var cab = ['Nome', 'CPF', 'PIS', 'Nascimento', 'E-mail', 'Telefone', 'Empresa', 'CNPJ', 'Cargo', 'Departamento', 'Salário', 'Admissão', 'Contrato', 'Jornada', 'Situação', 'Desligamento', 'Dependentes'];
    function cel(v) {
      var s = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas no Excel
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var linhas = lista.map(function (c) {
      var e = mapaEmp[c.empresa_id] || {};
      return [c.nome, c.cpf, c.pis, fmtData(c.data_nascimento), c.email, c.telefone, nomeEmpresa(e), e.cnpj, c.cargo, c.departamento,
        String(c.salario).replace('.', ','), fmtData(c.data_admissao), CONTRATOS[c.tipo_contrato], c.jornada_semanal, STATUS[c.status],
        c.data_desligamento ? fmtData(c.data_desligamento) : '', c.dependentes].map(cel).join(';');
    });
    var csv = '﻿' + cab.map(cel).join(';') + '\n' + linhas.join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'colaboradores-keygest-' + isoData(hoje()) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  async function telaFormColaborador(id, query) {
    var empresas = (await DB.listar('empresas')).sort(porNome('razao_social'));
    if (!empresas.length) {
      vista.innerHTML = '<div class="painel vazio">Cadastre uma empresa antes de incluir colaboradores.<br>' +
        '<a class="botao" style="margin-top:14px" href="#/empresas/nova">Cadastrar empresa</a></div>';
      return;
    }
    var dados = { tipo_contrato: 'clt', jornada_semanal: 44, status: 'ativo', dependentes: 0, empresa_id: query.empresa || (empresas.length === 1 ? empresas[0].id : '') };
    if (id) {
      dados = await DB.obter('colaboradores', id);
      if (!dados) return naoEncontrado();
    }
    var grupos = formColaborador(empresas);
    var voltar = id ? '#/colaboradores/' + id : '#/colaboradores';
    vista.innerHTML =
      '<a class="voltar" href="' + esc(voltar) + '">← Voltar</a>' +
      '<div class="topo-vista"><h1>' + (id ? 'Editar colaborador' : 'Novo colaborador') + '</h1></div>' +
      '<form class="painel form-sistema" id="form" novalidate>' + htmlFormulario(grupos, dados) +
      '<p class="aviso">Dados pessoais protegidos pela LGPD: cadastre somente o necessário para a prestação do serviço.</p>' +
      '<div class="acoes"><button class="botao" type="submit">Salvar</button>' +
      '<a class="botao botao-secundario" href="' + esc(voltar) + '">Cancelar</a></div></form>';

    var form = document.getElementById('form');
    ligarMascaras(form);
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var r = lerFormulario(form, grupos);
      var d = r.dados;
      if (!r.erros.length) {
        if (d.status === 'desligado' && !d.data_desligamento) r.erros.push(marcarErro(form, 'data_desligamento', 'Informe a data de desligamento.'));
        if (d.data_desligamento && d.data_admissao && d.data_desligamento < d.data_admissao) r.erros.push(marcarErro(form, 'data_desligamento', 'Deve ser depois da admissão.'));
        if (d.salario != null && d.salario < P.salarioMinimo && (d.jornada_semanal || 44) >= 44 && d.tipo_contrato !== 'estagio' &&
          !confirm('O salário está abaixo do mínimo nacional de ' + brl(P.salarioMinimo) + '. Salvar mesmo assim?')) return;
      }
      if (r.erros.length) { r.erros[0].focus(); return; }
      if (d.jornada_semanal == null) d.jornada_semanal = 44;
      if (d.dependentes == null) d.dependentes = 0;
      if (!d.tipo_contrato) d.tipo_contrato = 'clt';
      if (!d.status) d.status = 'ativo';
      try {
        var salvo = id ? await DB.atualizar('colaboradores', id, d) : await DB.inserir('colaboradores', d);
        aviso('Colaborador salvo.');
        location.hash = '#/colaboradores/' + salvo.id;
      } catch (e) { aviso(e.message, true); }
    });
  }

  async function telaFicha(id) {
    var c = await DB.obter('colaboradores', id);
    if (!c) return naoEncontrado();
    var r = await Promise.all([DB.obter('empresas', c.empresa_id), DB.listar('ferias', { colaborador_id: id }), DB.listar('folha', { colaborador_id: id })]);
    var emp = r[0];
    var holerites = holeritesVisiveis(r[2]);
    var ferias = r[1].sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
    var custo = custoColaborador(c, emp);
    var periodos = periodosFerias(c, ferias);
    var exp = prazosExperiencia(c);
    var adm = lerData(c.data_admissao);
    var meses = Math.max(0, (hoje().getFullYear() - adm.getFullYear()) * 12 + hoje().getMonth() - adm.getMonth());

    function item(rot, val) { return '<div><dt>' + rot + '</dt><dd>' + (val == null || val === '' ? '—' : val) + '</dd></div>'; }

    var abertos = periodos.filter(function (p) { return p.aberto || p.situacao === 'Em aquisição'; });

    vista.innerHTML =
      (PODE.colaborador ? '' : '<a class="voltar" href="#/colaboradores">← Colaboradores</a>') +
      '<div class="topo-vista"><div><h1>' + (PODE.colaborador ? 'Olá, ' + esc(String(c.nome).split(' ')[0]) : esc(c.nome)) + '</h1><p>' + esc(c.cargo || 'Sem cargo') + ' · ' + esc(nomeEmpresa(emp)) + ' · ' + etiquetaStatus(c.status) + '</p></div>' +
      '<div class="acoes">' +
      (PODE.colaborador ? '<a class="botao" href="#/holerites">Ver meus holerites</a>' :
        '<a class="botao botao-secundario" target="_blank" rel="noopener" href="' + esc(linkSimulador(c, emp)) + '">Simular 13º e férias ↗</a>') +
      (PODE.usuarios ? '<a class="botao botao-secundario" href="#/usuarios/novo?perfil=colaborador&colaborador=' + encodeURIComponent(id) +
        '&email=' + encodeURIComponent(c.email || '') + '&nome=' + encodeURIComponent(c.nome) + '">Dar acesso ao portal</a>' : '') +
      (PODE.editar ? '<a class="botao" href="#/colaboradores/' + esc(id) + '/editar">Editar</a>' +
        '<button type="button" class="botao botao-perigo" id="excluir">Excluir</button>' : '') + '</div></div>' +
      '<div class="grade-ficha"><div>' +
      '<section class="painel"><h2>Dados pessoais</h2><dl class="dados">' +
      item('CPF', esc(c.cpf)) + item('PIS/NIS', esc(c.pis)) +
      item('Nascimento', c.data_nascimento ? fmtData(c.data_nascimento) : '') + item('Dependentes', esc(c.dependentes)) +
      item('E-mail', esc(c.email)) + item('Telefone', esc(c.telefone)) + item('PIX / banco', esc(c.chave_pix)) +
      '</dl></section>' +
      '<section class="painel"><h2>Contrato</h2><dl class="dados">' +
      item('Empresa', esc(emp ? emp.razao_social : '')) + item('Departamento', esc(c.departamento)) +
      item('Salário', brl(c.salario)) + item('Admissão', fmtData(c.data_admissao) + ' (' + Math.floor(meses / 12) + 'a ' + (meses % 12) + 'm de casa)') +
      item('Tipo de contrato', esc(CONTRATOS[c.tipo_contrato])) + item('Jornada semanal', esc(c.jornada_semanal) + 'h') +
      (exp ? item('Experiência', '45 dias: ' + fmtData(exp.primeiro) + '<br>90 dias: ' + fmtData(exp.segundo)) : '') +
      (c.data_desligamento ? item('Desligamento', fmtData(c.data_desligamento)) : '') +
      '</dl>' + (c.observacoes ? '<p class="aviso" style="margin-top:16px;white-space:pre-line">' + esc(c.observacoes) + '</p>' : '') + '</section>' +
      (PODE.colaborador ? '' : htmlListaHolerites(holerites)) +
      '</div><div>' +
      (PODE.colaborador ? '' : '<section class="painel"><h2>Custo mensal estimado</h2>' +
      '<div class="destaque"><span class="rotulo">Custo para a empresa</span><span class="valor">' + brl(custo.total) + '</span>' +
      '<span class="sub">' + brl(custo.anual) + ' por ano · ' + custo.fator.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '× o salário</span></div>' +
      '<table class="tabela"><tbody>' +
      '<tr><td>Salário</td><td>' + brl(custo.remuneracao) + '</td></tr>' +
      '<tr><td>Encargos sobre o salário<small>' + esc(emp ? REGIMES[emp.regime] : '') + '</small></td><td>' + brl(custo.encargosSobreSalario) + '</td></tr>' +
      '<tr><td>Provisões de 13º e férias</td><td>' + brl(custo.provisoes) + '</td></tr>' +
      '</tbody></table></section>') +
      '<section class="painel"><h2>Férias</h2>' +
      '<table class="tabela"><thead><tr><th>Período aquisitivo</th><th>Saldo</th><th>Situação</th></tr></thead><tbody>' +
      (periodos.length ? periodos.slice().reverse().map(function (p) {
        return '<tr><td>' + fmtData(p.inicio) + ' a ' + fmtData(p.fimAquisitivo) + '</td><td>' + p.saldo + ' dias</td>' +
          '<td><span class="etiqueta ' + p.classe + '">' + esc(p.situacao) + '</span></td></tr>';
      }).join('') : '<tr><td colspan="3">Sem períodos.</td></tr>') +
      '</tbody></table>' +
      (ferias.length ? '<h3 style="font-size:.95rem">Férias registradas</h3><ul class="alertas">' + ferias.map(function (f) {
        var fim = somarDias(lerData(f.inicio), f.dias - 1);
        return '<li><div>' + fmtData(f.inicio) + ' a ' + fmtData(fim) + ' (' + f.dias + ' dias' + (f.abono ? ' + abono de 10 dias' : '') + ')' +
          '<small>Período aquisitivo de ' + fmtData(f.periodo_inicio) + '</small></div>' +
          (PODE.editar ? '<button type="button" class="link" data-excluir-ferias="' + esc(f.id) + '">Remover</button>' : '') + '</li>';
      }).join('') + '</ul>' : '') +
      (abertos.length && PODE.editar ? '<form id="form-ferias" class="form-sistema" style="margin-top:18px" novalidate><fieldset><legend>Registrar férias</legend><div class="campos" style="grid-template-columns:1fr 1fr">' +
        '<div class="campo inteiro"><label for="fe-periodo">Período aquisitivo</label><select id="fe-periodo" name="periodo">' +
        abertos.map(function (p) { return '<option value="' + p.chave + '">' + fmtData(p.inicio) + ' a ' + fmtData(p.fimAquisitivo) + ' (saldo ' + p.saldo + ' dias)</option>'; }).join('') +
        '</select><div class="erro-campo"></div></div>' +
        '<div class="campo"><label for="fe-inicio">Início</label><input type="date" id="fe-inicio" name="inicio"><div class="erro-campo"></div></div>' +
        '<div class="campo"><label for="fe-dias">Dias</label><input type="number" id="fe-dias" name="dias" min="5" max="30" step="1" value="30"><div class="erro-campo"></div></div>' +
        '<div class="campo inteiro"><label class="opcao" style="margin:0"><input type="checkbox" name="abono"><span>Abono pecuniário (vender 10 dias)</span></label></div>' +
        '</div></fieldset><button class="botao botao-pequeno" type="submit">Registrar férias</button></form>' : '') +
      '</section></div></div>';

    var btExcluir = document.getElementById('excluir');
    if (btExcluir) btExcluir.addEventListener('click', async function () {
      if (!confirm('Excluir ' + c.nome + ' e todo o histórico de férias? Para quem saiu da empresa, prefira marcar como "Desligado".')) return;
      try {
        await DB.excluir('colaboradores', id);
        aviso('Colaborador excluído.');
        location.hash = '#/colaboradores';
      } catch (e) { aviso(e.message, true); }
    });

    vista.querySelectorAll('[data-excluir-ferias]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Remover este registro de férias?')) return;
        try {
          await DB.excluir('ferias', b.getAttribute('data-excluir-ferias'));
          aviso('Registro removido.');
          telaFicha(id);
        } catch (e) { aviso(e.message, true); }
      });
    });

    var ff = document.getElementById('form-ferias');
    if (ff) ff.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      ff.querySelectorAll('.invalido').forEach(function (x) { x.classList.remove('invalido'); });
      var periodo = periodos.find(function (p) { return p.chave === ff.periodo.value; });
      var dias = parseInt(ff.dias.value, 10);
      var abono = ff.abono.checked;
      var erro = null;
      if (!ff.inicio.value) erro = marcarErro(ff, 'inicio', 'Informe a data de início.');
      if (!(dias >= 5 && dias <= 30)) erro = erro || marcarErro(ff, 'dias', 'Entre 5 e 30 dias.');
      else if (dias + (abono ? 10 : 0) > periodo.saldo) erro = erro || marcarErro(ff, 'dias', 'Ultrapassa o saldo de ' + periodo.saldo + ' dias.');
      if (erro) { erro.focus(); return; }
      try {
        await DB.inserir('ferias', { colaborador_id: id, periodo_inicio: periodo.chave, inicio: ff.inicio.value, dias: dias, abono: abono });
        aviso('Férias registradas.');
        telaFicha(id);
      } catch (e) { aviso(e.message, true); }
    });
  }

  // Abre o simulador do site já preenchido com os dados do colaborador.
  function linkSimulador(c, emp) {
    var adm = lerData(c.data_admissao);
    var hj = hoje();
    var meses = 12;
    if (adm && adm.getFullYear() === hj.getFullYear()) {
      meses = Math.max(1, hj.getMonth() - adm.getMonth() + (adm.getDate() <= 15 ? 1 : 0));
    }
    var q = new URLSearchParams({ salario: c.salario, meses: meses });
    if (emp) {
      q.set('regime', emp.regime);
      q.set('rat', emp.rat);
      q.set('fap', emp.fap);
      q.set('terceiros', Math.round(emp.terceiros * 10000) / 100);
    }
    return '../simulador.html?' + q.toString();
  }

  // ------------------------------------------------------------------
  // Holerites
  // ------------------------------------------------------------------
  function competenciaAtual() {
    var d = hoje();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function nomeCompetencia(c) {
    var p = String(c).split('-');
    var t = new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // O colaborador só vê holerites de meses já encerrados
  function holeritesVisiveis(lista) {
    var atual = competenciaAtual();
    return lista.filter(function (f) { return !PODE.colaborador || f.competencia < atual; })
      .sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; });
  }

  function htmlListaHolerites(lista) {
    return '<section class="painel"><h2>Holerites</h2>' +
      (lista.length
        ? '<ul class="alertas">' + lista.map(function (f) {
          return '<li><div><a href="#/holerite/' + esc(f.id) + '">' + esc(nomeCompetencia(f.competencia)) + '</a>' +
            '<small>Bruto ' + brl(f.bruto) + '</small></div><strong>' + brl(f.liquido) + '</strong></li>';
        }).join('') + '</ul>'
        : '<p class="ajuda">' + (PODE.colaborador ? 'Seus holerites aparecem aqui depois do fechamento de cada mês.' : 'Nenhuma folha lançada para este colaborador.') + '</p>') +
      '</section>';
  }

  async function telaHolerites() {
    var lista = holeritesVisiveis(await DB.listar('folha', { colaborador_id: ACESSO.colaborador_id }));
    vista.innerHTML = '<div class="topo-vista"><div><h1>Meus holerites</h1><p>Recibos de pagamento dos meses fechados.</p></div></div>' +
      '<div style="max-width:640px">' + htmlListaHolerites(lista) + '</div>';
  }

  var MARCA = '<img class="marca-dagua" src="../assets/marca-dagua.png" alt="" aria-hidden="true">';

  function calcularLancamento(f, c, emp) {
    return C.linhaFolha({
      salario: f.salario, jornada: c.jornada_semanal, dependentes: c.dependentes, faltas: f.faltas,
      he50: f.he50, he100: f.he100, adicionais: f.adicionais, vt: f.vt, descVr: f.desc_vr, outrosDescontos: f.outros_descontos,
    }, emp, P);
  }

  function cabecalhoDocumento(titulo, emp, competencia) {
    return '<header class="doc-topo"><div class="doc-marca"><img src="../assets/logo.png" alt="" width="40" height="40"><div><strong>KeyGest</strong><small>Gestão inteligente de pessoas</small></div></div>' +
      '<div class="doc-titulo"><strong>' + esc(titulo) + '</strong><span>' + esc(nomeCompetencia(competencia)) + '</span></div></header>' +
      '<div class="doc-empresa"><strong>' + esc(emp ? emp.razao_social : '') + '</strong>' +
      (emp && emp.cnpj ? '<span>CNPJ ' + esc(emp.cnpj) + '</span>' : '') +
      (emp ? '<span>' + esc(REGIMES[emp.regime] || '') + '</span>' : '') + '</div>';
  }

  // Recibo de pagamento (holerite) de um colaborador
  function htmlHolerite(f, c, emp) {
    var calc = calcularLancamento(f, c, emp);
    var vh = calc.valorHora;
    var linhas = [
      ['Salário base', '30 dias', +f.salario, 0],
      ['Horas extras 50%', fmtQtd(f.he50) + 'h', vh * 1.5 * f.he50, 0],
      ['Horas extras 100%', fmtQtd(f.he100) + 'h', vh * 2 * f.he100, 0],
      ['Outros proventos', '', +f.adicionais, 0],
      ['Faltas', fmtQtd(f.faltas) + ' dia(s)', 0, calc.descFaltas],
      ['INSS', '', 0, calc.inss],
      ['IRRF', c.dependentes ? c.dependentes + ' dep.' : '', 0, calc.irrf],
      ['Vale-transporte', '6%', 0, calc.descVt],
      ['Vale-refeição / alimentação', '', 0, +f.desc_vr],
      ['Outros descontos', '', 0, +f.outros_descontos],
    ].filter(function (l) { return l[2] > 0.004 || l[3] > 0.004; });
    var prov = linhas.reduce(function (s, l) { return s + l[2]; }, 0);
    var desc = linhas.reduce(function (s, l) { return s + l[3]; }, 0);
    return '<article class="painel documento holerite">' + MARCA +
      cabecalhoDocumento('Recibo de pagamento de salário', emp, f.competencia) +
      '<dl class="dados holerite-dados">' +
      '<div><dt>Colaborador</dt><dd>' + esc(c.nome) + '</dd></div><div><dt>CPF</dt><dd>' + esc(c.cpf) + '</dd></div>' +
      '<div><dt>Cargo</dt><dd>' + esc(c.cargo || '—') + '</dd></div><div><dt>Admissão</dt><dd>' + fmtData(c.data_admissao) + '</dd></div>' +
      '</dl>' +
      '<table class="tabela holerite-tabela"><thead><tr><th>Descrição</th><th>Referência</th><th>Proventos</th><th>Descontos</th></tr></thead><tbody>' +
      linhas.map(function (l) {
        return '<tr><td>' + l[0] + '</td><td>' + esc(l[1]) + '</td><td>' + (l[2] ? brl(l[2]) : '') + '</td><td>' + (l[3] ? brl(l[3]) : '') + '</td></tr>';
      }).join('') +
      '<tr class="sub-total"><td>Totais</td><td></td><td>' + brl(prov) + '</td><td>' + brl(desc) + '</td></tr>' +
      '<tr class="total"><td>Valor líquido</td><td></td><td></td><td>' + brl(prov - desc) + '</td></tr>' +
      '</tbody></table>' +
      '<div class="holerite-bases"><span>Salário base: <strong>' + brl(f.salario) + '</strong></span>' +
      '<span>Base INSS: <strong>' + brl(Math.min(calc.bruto, P.inssFaixas[P.inssFaixas.length - 1].ate)) + '</strong></span>' +
      '<span>Base FGTS: <strong>' + brl(calc.bruto) + '</strong></span>' +
      '<span>FGTS do mês: <strong>' + brl(calc.fgts) + '</strong></span></div>' +
      '<div class="doc-assinaturas"><div><span></span>Data</div><div><span></span>Assinatura do colaborador</div></div>' +
      '<p class="doc-rodape">Declaro ter recebido a importância líquida discriminada neste recibo. · Documento gerado pelo sistema KeyGest.</p>' +
      '</article>';
  }

  async function telaHolerite(id) {
    var f = await DB.obter('folha', id);
    if (!f || (PODE.colaborador && f.competencia >= competenciaAtual())) return naoEncontrado();
    var r = await Promise.all([DB.obter('colaboradores', f.colaborador_id), DB.obter('empresas', f.empresa_id)]);
    var c = r[0], emp = r[1];
    if (!c) return naoEncontrado();
    var voltar = PODE.colaborador ? '#/holerites' : '#/colaboradores/' + c.id;
    vista.innerHTML =
      '<a class="voltar" href="' + esc(voltar) + '">← Voltar</a>' +
      '<div class="topo-vista"><h1>Holerite</h1><div class="acoes"><button type="button" class="botao" id="imprimir-doc">Imprimir / salvar PDF</button></div></div>' +
      htmlHolerite(f, c, emp);
    document.getElementById('imprimir-doc').addEventListener('click', function () { window.print(); });
  }

  // Dados de uma empresa num mês: lançamentos com colaborador e cálculo
  async function dadosDoMes(empresaId, competencia) {
    var r = await Promise.all([
      DB.obter('empresas', empresaId),
      DB.listar('colaboradores', { empresa_id: empresaId }),
      DB.listar('folha', { empresa_id: empresaId, competencia: competencia }),
    ]);
    var emp = r[0];
    var mapa = {};
    r[1].forEach(function (c) { mapa[c.id] = c; });
    var itens = r[2].filter(function (f) { return mapa[f.colaborador_id]; }).map(function (f) {
      var c = mapa[f.colaborador_id];
      return { f: f, c: c, calc: calcularLancamento(f, c, emp) };
    }).sort(function (a, b) { return String(a.c.nome).localeCompare(String(b.c.nome), 'pt-BR'); });
    var lancados = {};
    itens.forEach(function (i) { lancados[i.c.id] = true; });
    var inicio = competencia + '-01';
    var faltando = r[1].filter(function (c) {
      if (lancados[c.id]) return false;
      if (c.data_admissao && c.data_admissao.slice(0, 7) > competencia) return false;
      return c.status !== 'desligado' || (c.data_desligamento && c.data_desligamento >= inicio);
    });
    return { emp: emp, itens: itens, faltando: faltando };
  }

  function topoDocumentos(titulo, query) {
    return '<a class="voltar" href="#/folha?empresa=' + encodeURIComponent(query.empresa || '') + '&competencia=' + encodeURIComponent(query.competencia || '') + '">← Folha do mês</a>' +
      '<div class="topo-vista"><div><h1>' + esc(titulo) + '</h1><p>Confira e use "Imprimir / salvar PDF" para gerar o documento.</p></div>' +
      '<div class="acoes"><button type="button" class="botao" id="imprimir-doc">Imprimir / salvar PDF</button></div></div>';
  }

  // Todos os holerites da empresa no mês, um por página
  async function telaHoleritesLote(query) {
    var d = await dadosDoMes(query.empresa, query.competencia);
    if (!d.emp) return naoEncontrado();
    vista.innerHTML = topoDocumentos('Holerites – ' + nomeEmpresa(d.emp), query) +
      (d.faltando.length ? '<p class="aviso">Sem lançamento neste mês (não entram no lote): ' + esc(d.faltando.map(function (c) { return c.nome; }).join(', ')) + '.</p>' : '') +
      (d.itens.length
        ? '<div class="lote-holerites">' + d.itens.map(function (i) { return htmlHolerite(i.f, i.c, d.emp); }).join('') + '</div>'
        : '<div class="painel vazio">Nenhum lançamento nesta competência. Preencha a folha do mês primeiro.</div>');
    document.getElementById('imprimir-doc').addEventListener('click', function () { window.print(); });
  }

  // Relatório da folha de pagamento para a empresa cliente
  async function telaRelatorio(query) {
    var d = await dadosDoMes(query.empresa, query.competencia);
    if (!d.emp) return naoEncontrado();
    var t = { salario: 0, bruto: 0, inss: 0, irrf: 0, outros: 0, liquido: 0, fgts: 0, patronal: 0, custo: 0 };
    d.itens.forEach(function (i) {
      t.salario += +i.f.salario || 0;
      t.bruto += i.calc.bruto;
      t.inss += i.calc.inss;
      t.irrf += i.calc.irrf;
      t.outros += i.calc.descVt + (+i.f.desc_vr || 0) + (+i.f.outros_descontos || 0);
      t.liquido += i.calc.liquido;
      t.fgts += i.calc.fgts;
      t.patronal += i.calc.patronal;
      t.custo += i.calc.custo;
    });
    var linhas = d.itens.map(function (i) {
      var outros = i.calc.descVt + (+i.f.desc_vr || 0) + (+i.f.outros_descontos || 0);
      return '<tr><td>' + esc(i.c.nome) + '<small>' + esc(i.c.cargo || '') + '</small></td>' +
        '<td>' + brl(i.f.salario) + '</td><td>' + brl(i.calc.bruto) + '</td><td>' + brl(i.calc.inss) + '</td>' +
        '<td>' + brl(i.calc.irrf) + '</td><td>' + brl(outros) + '</td><td class="forte">' + brl(i.calc.liquido) + '</td><td>' + brl(i.calc.fgts) + '</td></tr>';
    }).join('');
    vista.innerHTML = topoDocumentos('Relatório da folha – ' + nomeEmpresa(d.emp), query) +
      (d.faltando.length ? '<p class="aviso">Sem lançamento neste mês: ' + esc(d.faltando.map(function (c) { return c.nome; }).join(', ')) + '.</p>' : '') +
      '<article class="painel documento relatorio">' + MARCA +
      cabecalhoDocumento('Relatório da folha de pagamento', d.emp, query.competencia) +
      (d.itens.length
        ? '<div class="doc-resumo">' +
          '<div class="forte"><span>Líquido a pagar aos colaboradores</span><strong>' + brl(t.liquido) + '</strong></div>' +
          '<div><span>FGTS a recolher (FGTS Digital)</span><strong>' + brl(t.fgts) + '</strong></div>' +
          '<div><span>INSS a recolher (DCTFWeb)</span><strong>' + brl(t.inss + t.patronal) + '</strong><small>Colaboradores ' + brl(t.inss) + ' + empresa ' + brl(t.patronal) + '</small></div>' +
          '<div><span>IRRF a recolher (DCTFWeb)</span><strong>' + brl(t.irrf) + '</strong></div>' +
          '<div><span>Custo total da empresa no mês</span><strong>' + brl(t.custo) + '</strong><small>Inclui vale-transporte pago pela empresa</small></div>' +
          '</div>' +
          '<table class="tabela doc-tabela"><thead><tr><th>Colaborador</th><th>Salário base</th><th>Proventos</th><th>INSS</th><th>IRRF</th><th>Outros desc.</th><th>Líquido</th><th>FGTS</th></tr></thead><tbody>' +
          linhas +
          '<tr class="total"><td>Totais (' + d.itens.length + ')</td><td>' + brl(t.salario) + '</td><td>' + brl(t.bruto) + '</td><td>' + brl(t.inss) + '</td><td>' + brl(t.irrf) + '</td><td>' + brl(t.outros) + '</td><td>' + brl(t.liquido) + '</td><td>' + brl(t.fgts) + '</td></tr>' +
          '</tbody></table>' +
          '<p class="doc-nota">Outros descontos: vale-transporte (até 6% do salário), vale-refeição/alimentação e demais descontos lançados. ' +
          'Valores calculados a partir dos lançamentos do mês com as tabelas de INSS e IRRF de ' + P.ano + '; os valores oficiais são os das guias emitidas no FGTS Digital e na DCTFWeb.</p>' +
          '<div class="doc-assinaturas"><div><span></span>KeyGest – responsável pela folha</div><div><span></span>' + esc(d.emp.razao_social) + '</div></div>'
        : '<div class="vazio">Nenhum lançamento nesta competência. Preencha a folha do mês primeiro.</div>') +
      '<p class="doc-rodape">Documento gerado pelo sistema KeyGest em ' + hoje().toLocaleDateString('pt-BR') + '.</p>' +
      '</article>';
    document.getElementById('imprimir-doc').addEventListener('click', function () { window.print(); });
  }

  function fmtQtd(v) {
    return (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  // ------------------------------------------------------------------
  // Usuários e permissões (somente administrador)
  // ------------------------------------------------------------------
  async function telaUsuarios() {
    var r = await Promise.all([DB.listar('acessos'), DB.listar('empresas'), DB.listar('colaboradores')]);
    var mapaEmp = {}, mapaCol = {};
    r[1].forEach(function (e) { mapaEmp[e.id] = e; });
    r[2].forEach(function (c) { mapaCol[c.id] = c; });
    var ordem = ['admin', 'analista', 'consulta', 'cliente', 'colaborador'];
    var lista = r[0].sort(function (a, b) {
      return ordem.indexOf(a.perfil) - ordem.indexOf(b.perfil) || String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'pt-BR');
    });
    vista.innerHTML =
      '<div class="topo-vista"><div><h1>Usuários e permissões</h1><p>Quem pode entrar no sistema e o que cada um vê.</p></div>' +
      '<div class="acoes"><a class="botao" href="#/usuarios/novo">+ Novo acesso</a></div></div>' +
      '<div class="caixa-lista"><table class="lista"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Vínculo</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map(function (a) {
        var vinculo = a.perfil === 'cliente' ? nomeEmpresa(mapaEmp[a.empresa_id]) :
          a.perfil === 'colaborador' ? (mapaCol[a.colaborador_id] ? mapaCol[a.colaborador_id].nome : '—') : 'Equipe KeyGest';
        return '<tr><td>' + esc(a.nome || '—') + '</td><td>' + esc(a.email) + '</td><td>' + esc(PERFIS[a.perfil]) + '</td>' +
          '<td>' + esc(vinculo) + '</td><td>' + (a.ativo ? '<span class="etiqueta">Ativo</span>' : '<span class="etiqueta desligado">Bloqueado</span>') + '</td>' +
          '<td><a class="botao botao-secundario botao-pequeno" href="#/usuarios/editar?email=' + encodeURIComponent(a.email) + '">Editar</a></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<section class="painel" style="margin-top:20px"><h2>O que cada perfil pode fazer</h2><table class="tabela permissoes"><thead><tr><th>Perfil</th><th>Vê</th><th>Pode alterar</th></tr></thead><tbody>' +
      '<tr><td>Administrador</td><td>Tudo</td><td>Tudo, inclusive usuários e permissões</td></tr>' +
      '<tr><td>Analista</td><td>Todas as empresas e colaboradores</td><td>Cadastros, férias e folha</td></tr>' +
      '<tr><td>Somente consulta</td><td>Todas as empresas e colaboradores</td><td>Nada</td></tr>' +
      '<tr><td>Empresa cliente</td><td>Só a própria empresa e seus colaboradores</td><td>Lançamentos da folha do mês</td></tr>' +
      '<tr><td>Colaborador</td><td>Só os próprios dados, férias e holerites</td><td>Nada</td></tr>' +
      '</tbody></table></section>';
  }

  async function telaFormUsuario(email, query) {
    var r = await Promise.all([DB.listar('empresas'), DB.listar('colaboradores')]);
    var empresas = r[0].sort(porNome('razao_social'));
    var cols = r[1].sort(porNome('nome'));
    var mapaEmp = {};
    empresas.forEach(function (e) { mapaEmp[e.id] = e; });
    var a = { perfil: query.perfil || 'analista', ativo: true, email: query.email || '', nome: query.nome || '', colaborador_id: query.colaborador || null, empresa_id: query.empresa || null };
    if (email) {
      a = await DB.obter('acessos', email);
      if (!a) return naoEncontrado();
    }
    var proprio = !!email && email === ACESSO.email;

    vista.innerHTML =
      '<a class="voltar" href="#/usuarios">← Usuários</a>' +
      '<div class="topo-vista"><h1>' + (email ? 'Editar acesso' : 'Novo acesso') + '</h1></div>' +
      '<form class="painel form-sistema" id="form" novalidate style="max-width:760px"><fieldset><legend>Dados de acesso</legend><div class="campos" style="grid-template-columns:1fr 1fr">' +
      '<div class="campo"><label for="u-nome">Nome</label><input id="u-nome" name="nome" value="' + esc(a.nome || '') + '"><div class="erro-campo"></div></div>' +
      '<div class="campo"><label for="u-email">E-mail (login) *</label><input id="u-email" name="email" type="email" autocapitalize="none" spellcheck="false" value="' + esc(a.email) + '"' + (email ? ' disabled' : '') + '>' +
      '<small>É o login da pessoa e o endereço que recebe o link de recuperação de senha.</small><div class="erro-campo"></div></div>' +
      '<div class="campo"><label for="u-perfil">Perfil *</label><select id="u-perfil" name="perfil"' + (proprio ? ' disabled' : '') + '>' +
      Object.keys(PERFIS).map(function (k) { return '<option value="' + k + '"' + (a.perfil === k ? ' selected' : '') + '>' + PERFIS[k] + '</option>'; }).join('') +
      '</select><div class="erro-campo"></div></div>' +
      '<div class="campo"><label for="u-ativo">Situação</label><select id="u-ativo" name="ativo"' + (proprio ? ' disabled' : '') + '>' +
      '<option value="true"' + (a.ativo ? ' selected' : '') + '>Ativo</option><option value="false"' + (a.ativo ? '' : ' selected') + '>Bloqueado</option></select><div class="erro-campo"></div></div>' +
      '<div class="campo inteiro" id="campo-empresa"><label for="u-empresa">Empresa *</label><select id="u-empresa" name="empresa_id"><option value="">Selecione</option>' +
      empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (a.empresa_id === e.id ? ' selected' : '') + '>' + esc(nomeEmpresa(e)) + '</option>'; }).join('') +
      '</select><div class="erro-campo"></div></div>' +
      '<div class="campo inteiro" id="campo-colaborador"><label for="u-colaborador">Colaborador *</label><select id="u-colaborador" name="colaborador_id"><option value="">Selecione</option>' +
      cols.map(function (c) { return '<option value="' + esc(c.id) + '"' + (a.colaborador_id === c.id ? ' selected' : '') + '>' + esc(c.nome + ' — ' + nomeEmpresa(mapaEmp[c.empresa_id])) + '</option>'; }).join('') +
      '</select><div class="erro-campo"></div></div>' +
      '</div></fieldset>' +
      '<p class="aviso" id="u-descricao"></p>' +
      (proprio ? '<p class="aviso">Você não pode mudar o próprio perfil nem se bloquear, para não perder o acesso de administrador.</p>' : '') +
      '<div class="acoes"><button class="botao" type="submit">Salvar acesso</button><a class="botao botao-secundario" href="#/usuarios">Cancelar</a>' +
      (email && !proprio ? '<button type="button" class="botao botao-secundario" id="reenviar">Ver mensagem de convite</button>' +
        '<button type="button" class="botao botao-perigo" id="excluir" style="margin-left:auto">Remover acesso</button>' : '') +
      '</div></form><div id="convite"></div>';

    var form = document.getElementById('form');
    var DESCR = {
      admin: 'Acesso total, inclusive para criar e bloquear usuários.',
      analista: 'Vê todas as empresas e pode cadastrar, editar e lançar a folha.',
      consulta: 'Vê todas as empresas e colaboradores, sem poder alterar nada.',
      cliente: 'Vê só a empresa escolhida e seus colaboradores, e pode lançar a folha do mês dessa empresa.',
      colaborador: 'Vê só os próprios dados, férias e holerites dos meses fechados.',
    };
    function ajustar() {
      var p = form.perfil.value;
      document.getElementById('campo-empresa').hidden = p !== 'cliente';
      document.getElementById('campo-colaborador').hidden = p !== 'colaborador';
      document.getElementById('u-descricao').textContent = DESCR[p];
    }
    form.perfil.addEventListener('change', ajustar);
    ajustar();

    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      form.querySelectorAll('.invalido').forEach(function (x) { x.classList.remove('invalido'); });
      var d = {
        nome: form.nome.value.trim() || null,
        perfil: form.perfil.value,
        ativo: form.ativo.value === 'true',
        empresa_id: form.perfil.value === 'cliente' ? form.empresa_id.value || null : null,
        colaborador_id: form.perfil.value === 'colaborador' ? form.colaborador_id.value || null : null,
      };
      var novoEmail = form.email.value.trim().toLowerCase();
      var erro = null;
      if (!email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(novoEmail)) erro = marcarErro(form, 'email', 'Informe um e-mail válido.');
      if (d.perfil === 'cliente' && !d.empresa_id) erro = erro || marcarErro(form, 'empresa_id', 'Escolha a empresa.');
      if (d.perfil === 'colaborador' && !d.colaborador_id) erro = erro || marcarErro(form, 'colaborador_id', 'Escolha o colaborador.');
      if (erro) { erro.focus(); return; }
      try {
        if (email) {
          await DB.atualizar('acessos', email, d);
          aviso('Acesso salvo.');
          location.hash = '#/usuarios';
          return;
        }
        await DB.inserir('acessos', Object.assign({ email: novoEmail }, d));
        aviso('Acesso salvo.');
        mostrarConvite(novoEmail, d.nome);
      } catch (e) { aviso(e.message, true); }
    });

    var btReenviar = document.getElementById('reenviar');
    if (btReenviar) btReenviar.addEventListener('click', function () { mostrarConvite(email, a.nome); });

    var bt = document.getElementById('excluir');
    if (bt) bt.addEventListener('click', async function () {
      if (!confirm('Remover o acesso de ' + email + '? A pessoa não conseguirá mais ver os dados.')) return;
      try {
        await DB.excluir('acessos', email);
        aviso('Acesso removido.');
        location.hash = '#/usuarios';
      } catch (e) { aviso(e.message, true); }
    });
  }

  // Mensagem pronta para enviar à pessoa que recebeu acesso
  function mostrarConvite(email, nome) {
    var link = location.origin + location.pathname + '?acesso=primeiro&email=' + encodeURIComponent(email);
    var texto = 'Olá' + (nome ? ', ' + String(nome).split(' ')[0] : '') + '! Seu acesso ao sistema da KeyGest foi liberado.\n\n' +
      '1. Acesse: ' + link + '\n' +
      '2. Use o e-mail ' + email + ' e crie a sua senha\n' +
      '3. Pronto! Nas próximas vezes, entre com o seu e-mail e a sua senha.';
    document.getElementById('form').hidden = true;
    document.getElementById('convite').innerHTML =
      '<div class="painel" style="max-width:760px"><div class="alerta sucesso"><strong>Acesso liberado!</strong> Envie a mensagem abaixo para a pessoa criar a senha.</div>' +
      '<div class="resumo-estimativa" id="texto-convite">' + esc(texto) + '</div>' +
      '<div class="acoes"><button type="button" class="botao" id="copiar-convite">Copiar mensagem</button>' +
      '<a class="botao botao-secundario" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(texto) + '">Enviar pelo WhatsApp</a>' +
      '<a class="botao botao-secundario" href="mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent('Seu acesso ao sistema KeyGest') + '&body=' + encodeURIComponent(texto) + '">Enviar por e-mail</a>' +
      '<button type="button" class="botao botao-secundario" id="outro-acesso">Criar outro acesso</button>' +
      '<a class="botao botao-secundario" href="#/usuarios">Voltar aos usuários</a></div></div>';
    document.getElementById('outro-acesso').addEventListener('click', function () {
      if (location.hash === '#/usuarios/novo') rotear();
      else location.hash = '#/usuarios/novo';
    });
    document.getElementById('copiar-convite').addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(texto).then(function () { aviso('Mensagem copiada.'); });
      } catch (e) { aviso('Selecione o texto e copie manualmente.', true); }
    });
  }

  function naoEncontrado() {
    vista.innerHTML = '<div class="painel vazio">Registro não encontrado.<br><a href="#/painel">Voltar ao painel</a></div>';
  }

  // ------------------------------------------------------------------
  // Rotas
  // ------------------------------------------------------------------
  function rotaPermitida(c) {
    var tela = c[0];
    var formulario = c[1] === 'novo' || c[1] === 'nova' || c[2] === 'editar';
    if (PODE.colaborador) return tela === 'meus-dados' || tela === 'holerites' || tela === 'holerite';
    if (tela === 'meus-dados' || tela === 'holerites') return false;
    if (tela === 'usuarios') return PODE.usuarios;
    if (PODE.cliente && tela === 'empresas') return false;
    if (formulario && !PODE.editar) return false;
    return true;
  }

  function montarMenu() {
    var itens = PODE.colaborador
      ? [['meus-dados', 'Meus dados'], ['holerites', 'Meus holerites']]
      : [['painel', 'Painel']]
        .concat(PODE.equipe ? [['empresas', 'Empresas']] : [])
        .concat([['colaboradores', 'Colaboradores'], ['folha', 'Folha do mês']])
        .concat(PODE.usuarios ? [['usuarios', 'Usuários']] : []);
    document.getElementById('menu-sistema').innerHTML = itens.map(function (i) {
      return '<a href="#/' + i[0] + '" data-rota="' + i[0] + '">' + i[1] + '</a>';
    }).join('');
    document.querySelectorAll('.so-equipe').forEach(function (el) { el.hidden = PODE.colaborador; });
  }
  async function rotear() {
    var inicial = PODE.colaborador ? 'meus-dados' : 'painel';
    var hash = location.hash.replace(/^#\/?/, '') || inicial;
    var partes = hash.split('?');
    var caminho = partes[0].split('/').filter(Boolean);
    if (!rotaPermitida(caminho)) {
      location.replace('#/' + inicial);
      return;
    }
    var query = {};
    new URLSearchParams(partes[1] || '').forEach(function (v, k) { query[k] = v; });

    document.querySelectorAll('.nav-sistema a').forEach(function (a) {
      var rota = a.getAttribute('data-rota');
      a.classList.toggle('ativo', rota === caminho[0] || (rota === 'holerites' && caminho[0] === 'holerite') ||
        (rota === 'folha' && (caminho[0] === 'relatorio' || caminho[0] === 'holerites-lote')));
    });
    vista.innerHTML = '<div class="carregando">Carregando...</div>';
    window.scrollTo(0, 0);

    try {
      if (caminho[0] === 'empresas') {
        if (caminho[1] === 'nova') await telaFormEmpresa(null);
        else if (caminho[1] && caminho[2] === 'editar') await telaFormEmpresa(caminho[1]);
        else await telaEmpresas();
      } else if (caminho[0] === 'folha') {
        await window.TelaFolha({ DB: DB, vista: vista, esc: esc, aviso: aviso, porNome: porNome, nomeEmpresa: nomeEmpresa, somenteLeitura: !PODE.folha }, query);
      } else if (caminho[0] === 'meus-dados') {
        await telaFicha(ACESSO.colaborador_id);
      } else if (caminho[0] === 'holerites') {
        await telaHolerites();
      } else if (caminho[0] === 'holerite') {
        await telaHolerite(caminho[1]);
      } else if (caminho[0] === 'relatorio') {
        await telaRelatorio(query);
      } else if (caminho[0] === 'holerites-lote') {
        await telaHoleritesLote(query);
      } else if (caminho[0] === 'usuarios') {
        if (caminho[1] === 'novo') await telaFormUsuario(null, query);
        else if (caminho[1] === 'editar') await telaFormUsuario(query.email, query);
        else await telaUsuarios();
      } else if (caminho[0] === 'colaboradores') {
        if (caminho[1] === 'novo') await telaFormColaborador(null, query);
        else if (caminho[1] && caminho[2] === 'editar') await telaFormColaborador(caminho[1], query);
        else if (caminho[1]) await telaFicha(caminho[1]);
        else await telaColaboradores(query);
      } else {
        await telaPainel();
      }
    } catch (e) {
      vista.innerHTML = '<div class="alerta erro"><strong>Não foi possível carregar os dados.</strong> ' + esc(e.message) + '</div>';
    }
  }

  // ------------------------------------------------------------------
  // Início, login e permissões
  // ------------------------------------------------------------------
  var telaLogin = document.getElementById('tela-login');
  var formLogin = document.getElementById('form-login');
  var msgLogin = document.getElementById('login-msg');
  var modoLogin = 'entrar';
  var recuperando = false;

  var MODOS = {
    entrar: { titulo: 'Entrar', texto: 'Use o e-mail e a senha cadastrados.', botao: 'Entrar', email: true, senha: true, senha2: false },
    primeiro: { titulo: 'Primeiro acesso', texto: 'Use o e-mail liberado pela KeyGest e crie uma senha forte e exclusiva, que você não usa em nenhum outro site.', botao: 'Criar senha e entrar', email: true, senha: true, senha2: true },
    esqueci: { titulo: 'Esqueci a senha', texto: 'Informe o seu e-mail de login. Enviaremos um link para você criar uma nova senha.', botao: 'Enviar link', email: true, senha: false, senha2: false },
    nova: { titulo: 'Nova senha', texto: 'Crie uma senha forte, diferente das anteriores e que você não usa em nenhum outro site.', botao: 'Salvar nova senha', email: false, senha: true, senha2: true },
    bloqueado: { titulo: 'Acesso não liberado', texto: '', botao: '', email: false, senha: false, senha2: false },
  };

  function mensagemLogin(texto, tipo) {
    msgLogin.textContent = texto || '';
    msgLogin.className = 'alerta ' + (tipo || 'erro');
    msgLogin.hidden = !texto;
  }

  function definirModoLogin(m, texto) {
    modoLogin = m;
    var c = MODOS[m];
    document.getElementById('login-titulo').textContent = c.titulo;
    document.getElementById('login-texto').textContent = texto || c.texto;
    document.getElementById('campo-login-email').hidden = !c.email;
    document.getElementById('campo-login-senha').hidden = !c.senha;
    document.getElementById('campo-login-senha2').hidden = !c.senha2;
    document.getElementById('regras-senha').hidden = !c.senha2;
    document.getElementById('mostrar-senha-rotulo').hidden = !c.senha;
    document.getElementById('login-senha').value = '';
    document.getElementById('login-senha2').value = '';
    atualizarRegras();
    document.getElementById('login-enviar').hidden = !c.botao;
    document.getElementById('login-enviar').textContent = c.botao;
    document.getElementById('login-sair').hidden = m !== 'bloqueado' && m !== 'nova';
    document.getElementById('login-abas').hidden = m === 'bloqueado' || m === 'nova';
    document.getElementById('login-senha').autocomplete = m === 'entrar' ? 'current-password' : 'new-password';
    document.querySelectorAll('#login-abas button').forEach(function (b) {
      b.classList.toggle('ativa', b.dataset.modo === m);
      b.setAttribute('aria-selected', b.dataset.modo === m ? 'true' : 'false');
    });
    mensagemLogin('');
  }

  // Lista de regras da senha, atualizada enquanto a pessoa digita
  var emailSessao = '';
  function atualizarRegras() {
    var senha = document.getElementById('login-senha').value;
    var email = document.getElementById('login-email').value || emailSessao;
    var r = window.Senha.avaliar(senha, email);
    document.getElementById('regras-senha').innerHTML = r.regras.map(function (x) {
      return '<li class="' + (x.ok ? 'ok' : '') + '"><span aria-hidden="true">' + (x.ok ? '✓' : '•') + '</span> ' + esc(x.texto) +
        '<span class="sr-only">' + (x.ok ? ' (cumprida)' : ' (pendente)') + '</span></li>';
    }).join('');
    return r;
  }
  document.getElementById('login-senha').addEventListener('input', atualizarRegras);
  document.getElementById('login-email').addEventListener('input', atualizarRegras);
  document.getElementById('mostrar-senha').addEventListener('change', function () {
    var tipo = this.checked ? 'text' : 'password';
    document.getElementById('login-senha').type = tipo;
    document.getElementById('login-senha2').type = tipo;
  });

  function mostrarLogin(modo, texto) {
    document.getElementById('app').hidden = true;
    telaLogin.hidden = false;
    definirModoLogin(modo || 'entrar', texto);
    var foco = telaLogin.querySelector('input:not([hidden])');
    if (foco && !foco.closest('[hidden]')) foco.focus();
  }

  async function iniciarSessao(sessao) {
    try {
      ACESSO = await DB.meuAcesso(sessao);
    } catch (e) {
      ACESSO = null;
    }
    if (!ACESSO || !ACESSO.ativo) {
      mostrarLogin('bloqueado', 'O e-mail ' + sessao.user.email + ' ainda não tem acesso ao sistema ou foi bloqueado. Fale com a KeyGest para liberar.');
      return;
    }
    definirPermissoes(ACESSO);
    montarMenu();
    telaLogin.hidden = true;
    document.getElementById('app').hidden = false;
    document.getElementById('usuario-email').innerHTML = esc(ACESSO.nome || ACESSO.email) + '<br><small>' + esc(PERFIS[ACESSO.perfil]) + '</small>';
    document.getElementById('aviso-demo').hidden = DB.modo !== 'demo';
    document.getElementById('sair').hidden = DB.modo === 'demo';
    if (DB.modo === 'demo') montarVerComo();
    rotear();
  }

  // Modo demonstração: trocar de perfil para testar as permissões
  function montarVerComo() {
    var sel = document.getElementById('ver-como');
    sel.innerHTML = DB.perfisDemo().map(function (a) {
      return '<option value="' + esc(a.email) + '"' + (a.email === ACESSO.email ? ' selected' : '') + '>' + esc(PERFIS[a.perfil] + ' — ' + (a.nome || a.email)) + '</option>';
    }).join('');
  }

  document.getElementById('ver-como').addEventListener('change', function () {
    DB.verComo(this.value);
    location.hash = '';
    DB.sessao().then(iniciarSessao);
  });

  document.getElementById('login-abas').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-modo]');
    if (b) mostrarLogin(b.dataset.modo);
  });

  formLogin.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var email = document.getElementById('login-email').value.trim().toLowerCase();
    var senha = document.getElementById('login-senha').value;
    var senha2 = document.getElementById('login-senha2').value;
    var c = MODOS[modoLogin];
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return mensagemLogin('Informe um e-mail válido.');
    if (c.senha && !senha) return mensagemLogin('Informe a senha.');
    if (c.senha2 && !atualizarRegras().valida) return mensagemLogin('A senha ainda não cumpre todas as regras da lista.');
    if (c.senha2 && senha !== senha2) return mensagemLogin('As senhas não são iguais.');
    var botao = document.getElementById('login-enviar');
    var textoBotao = botao.textContent;
    botao.disabled = true;
    try {
      if (c.senha2) {
        botao.textContent = 'Verificando a senha...';
        if (await window.Senha.vazada(senha)) {
          botao.textContent = textoBotao;
          botao.disabled = false;
          return mensagemLogin('Esta senha já apareceu em vazamentos de dados na internet e pode ser descoberta facilmente. Crie outra senha, exclusiva para a KeyGest.');
        }
        botao.textContent = textoBotao;
      }
      if (modoLogin === 'entrar') {
        await iniciarSessao(await DB.entrar(email, senha));
      } else if (modoLogin === 'primeiro') {
        var r = await DB.cadastrar(email, senha);
        if (r && r.session) await iniciarSessao(r.session);
        else {
          definirModoLogin('entrar');
          document.getElementById('login-email').value = email;
          mensagemLogin('Senha criada! Agora entre com o seu e-mail e a nova senha.', 'sucesso');
        }
      } else if (modoLogin === 'esqueci') {
        await DB.recuperar(email);
        mensagemLogin('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.', 'sucesso');
      } else if (modoLogin === 'nova') {
        await DB.novaSenha(senha);
        recuperando = false;
        mensagemLogin('Senha alterada!', 'sucesso');
        await iniciarSessao(await DB.sessao());
      }
    } catch (e) {
      mensagemLogin(e.message);
    }
    botao.textContent = textoBotao;
    botao.disabled = false;
  });

  async function sair() {
    await DB.sair();
    ACESSO = null;
    PODE = {};
    location.hash = '';
    mostrarLogin('entrar');
  }
  document.getElementById('sair').addEventListener('click', sair);
  document.getElementById('login-sair').addEventListener('click', sair);

  document.getElementById('limpar-demo').addEventListener('click', function () {
    if (!confirm('Apagar todos os dados de demonstração deste navegador?')) return;
    DB.limpar();
    aviso('Dados de demonstração apagados.');
    DB.sessao().then(iniciarSessao);
  });

  window.addEventListener('hashchange', function () {
    if (ACESSO && ACESSO.ativo) rotear();
  });

  // Links de confirmação de e-mail e de nova senha
  if (DB.aoMudarLogin) {
    DB.aoMudarLogin(function (evento) {
      if (evento === 'PASSWORD_RECOVERY') {
        recuperando = true;
        emailSessao = (arguments[1] && arguments[1].user && arguments[1].user.email) || '';
        mostrarLogin('nova');
      }
    });
  }

  DB.sessao().then(function (s) {
    if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
    if (recuperando) return;
    var q = new URLSearchParams(location.search);
    var pedido = q.get('acesso');
    if (s) return iniciarSessao(s);
    mostrarLogin(pedido === 'primeiro' || pedido === 'esqueci' ? pedido : 'entrar');
    if (q.get('email')) {
      document.getElementById('login-email').value = q.get('email');
      document.getElementById('login-senha').focus();
    }
  }).catch(function () { mostrarLogin('entrar'); });
})();
