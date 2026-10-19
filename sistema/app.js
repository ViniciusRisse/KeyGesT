/* Sistema KeyGest — cadastro de empresas clientes e colaboradores. */
(function () {
  'use strict';

  var C = window.KeyGestCalc;
  var P = window.KEYGEST_CONFIG.parametros;
  var DB = window.DB;
  var brl = C.formatarBRL;
  var vista = document.getElementById('vista');

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

  var MASCARAS = {
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
          { n: 'pis', l: 'PIS/NIS' },
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
      '<div class="topo-vista"><div><h1>Painel</h1><p>Visão geral das empresas e colaboradores atendidos.</p></div>' +
      '<div class="acoes"><a class="botao" href="#/colaboradores/novo">+ Novo colaborador</a></div></div>' +
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
      '<div class="acoes"><a class="botao" href="#/empresas/nova">+ Nova empresa</a></div></div>' +
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
              '<td><a class="botao botao-secundario botao-pequeno" href="#/empresas/' + esc(e.id) + '/editar">Editar</a></td></tr>';
          }).join('') + '</tbody></table>'
        : '<div class="vazio">Nenhuma empresa cadastrada ainda.<br><a class="botao" style="margin-top:14px" href="#/empresas/nova">Cadastrar a primeira empresa</a></div>') +
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
      '<a class="botao" id="novo" href="#/colaboradores/novo">+ Novo colaborador</a></div></div>' +
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
      novo.href = '#/colaboradores/novo' + (filtros.empresa ? '?empresa=' + encodeURIComponent(filtros.empresa) : '');
      document.getElementById('tabela').innerHTML = lista.length
        ? '<table class="lista"><thead><tr><th>Nome</th><th>Empresa</th><th>Cargo</th><th class="num">Salário</th><th>Admissão</th><th>Situação</th></tr></thead><tbody>' +
          lista.map(function (c) {
            return '<tr><td><a href="#/colaboradores/' + esc(c.id) + '">' + esc(c.nome) + '</a></td>' +
              '<td>' + esc(nomeEmpresa(mapaEmp[c.empresa_id])) + '</td><td>' + esc(c.cargo || '—') + '</td>' +
              '<td class="num">' + brl(c.salario) + '</td><td>' + fmtData(c.data_admissao) + '</td><td>' + etiquetaStatus(c.status) + '</td></tr>';
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
    var r = await Promise.all([DB.obter('empresas', c.empresa_id), DB.listar('ferias', { colaborador_id: id })]);
    var emp = r[0];
    var ferias = r[1].sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
    var custo = custoColaborador(c, emp);
    var periodos = periodosFerias(c, ferias);
    var exp = prazosExperiencia(c);
    var adm = lerData(c.data_admissao);
    var meses = Math.max(0, (hoje().getFullYear() - adm.getFullYear()) * 12 + hoje().getMonth() - adm.getMonth());

    function item(rot, val) { return '<div><dt>' + rot + '</dt><dd>' + (val == null || val === '' ? '—' : val) + '</dd></div>'; }

    var abertos = periodos.filter(function (p) { return p.aberto || p.situacao === 'Em aquisição'; });

    vista.innerHTML =
      '<a class="voltar" href="#/colaboradores">← Colaboradores</a>' +
      '<div class="topo-vista"><div><h1>' + esc(c.nome) + '</h1><p>' + esc(c.cargo || 'Sem cargo') + ' · ' + esc(nomeEmpresa(emp)) + ' · ' + etiquetaStatus(c.status) + '</p></div>' +
      '<div class="acoes"><a class="botao" href="#/colaboradores/' + esc(id) + '/editar">Editar</a>' +
      '<button type="button" class="botao botao-perigo" id="excluir">Excluir</button></div></div>' +
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
      '</div><div>' +
      '<section class="painel"><h2>Custo mensal estimado</h2>' +
      '<div class="destaque"><span class="rotulo">Custo para a empresa</span><span class="valor">' + brl(custo.total) + '</span>' +
      '<span class="sub">' + brl(custo.anual) + ' por ano · ' + custo.fator.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '× o salário</span></div>' +
      '<table class="tabela"><tbody>' +
      '<tr><td>Salário</td><td>' + brl(custo.remuneracao) + '</td></tr>' +
      '<tr><td>Encargos sobre o salário<small>' + esc(emp ? REGIMES[emp.regime] : '') + '</small></td><td>' + brl(custo.encargosSobreSalario) + '</td></tr>' +
      '<tr><td>Provisões de 13º e férias</td><td>' + brl(custo.provisoes) + '</td></tr>' +
      '</tbody></table></section>' +
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
          '<button type="button" class="link" data-excluir-ferias="' + esc(f.id) + '">Remover</button></li>';
      }).join('') + '</ul>' : '') +
      (abertos.length ? '<form id="form-ferias" class="form-sistema" style="margin-top:18px" novalidate><fieldset><legend>Registrar férias</legend><div class="campos" style="grid-template-columns:1fr 1fr">' +
        '<div class="campo inteiro"><label for="fe-periodo">Período aquisitivo</label><select id="fe-periodo" name="periodo">' +
        abertos.map(function (p) { return '<option value="' + p.chave + '">' + fmtData(p.inicio) + ' a ' + fmtData(p.fimAquisitivo) + ' (saldo ' + p.saldo + ' dias)</option>'; }).join('') +
        '</select><div class="erro-campo"></div></div>' +
        '<div class="campo"><label for="fe-inicio">Início</label><input type="date" id="fe-inicio" name="inicio"><div class="erro-campo"></div></div>' +
        '<div class="campo"><label for="fe-dias">Dias</label><input type="number" id="fe-dias" name="dias" min="5" max="30" step="1" value="30"><div class="erro-campo"></div></div>' +
        '<div class="campo inteiro"><label class="opcao" style="margin:0"><input type="checkbox" name="abono"><span>Abono pecuniário (vender 10 dias)</span></label></div>' +
        '</div></fieldset><button class="botao botao-pequeno" type="submit">Registrar férias</button></form>' : '') +
      '</section></div></div>';

    document.getElementById('excluir').addEventListener('click', async function () {
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

  function naoEncontrado() {
    vista.innerHTML = '<div class="painel vazio">Registro não encontrado.<br><a href="#/painel">Voltar ao painel</a></div>';
  }

  // ------------------------------------------------------------------
  // Rotas
  // ------------------------------------------------------------------
  async function rotear() {
    var hash = location.hash.replace(/^#\/?/, '') || 'painel';
    var partes = hash.split('?');
    var caminho = partes[0].split('/').filter(Boolean);
    var query = {};
    new URLSearchParams(partes[1] || '').forEach(function (v, k) { query[k] = v; });

    document.querySelectorAll('.nav-sistema a').forEach(function (a) {
      a.classList.toggle('ativo', a.getAttribute('data-rota') === caminho[0]);
    });
    vista.innerHTML = '<div class="carregando">Carregando...</div>';
    window.scrollTo(0, 0);

    try {
      if (caminho[0] === 'empresas') {
        if (caminho[1] === 'nova') await telaFormEmpresa(null);
        else if (caminho[1] && caminho[2] === 'editar') await telaFormEmpresa(caminho[1]);
        else await telaEmpresas();
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
  // Início e login
  // ------------------------------------------------------------------
  function mostrarApp(sessao) {
    document.getElementById('tela-login').hidden = true;
    document.getElementById('app').hidden = false;
    document.getElementById('usuario-email').textContent = DB.modo === 'demo' ? 'Modo demonstração' : sessao.user.email;
    document.getElementById('aviso-demo').hidden = DB.modo !== 'demo';
    document.getElementById('sair').hidden = DB.modo === 'demo';
    rotear();
  }

  function mostrarLogin() {
    document.getElementById('app').hidden = true;
    document.getElementById('tela-login').hidden = false;
    document.getElementById('login-email').focus();
  }

  document.getElementById('form-login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var erro = document.getElementById('login-erro');
    var botao = this.querySelector('button');
    erro.hidden = true;
    botao.disabled = true;
    try {
      var s = await DB.entrar(document.getElementById('login-email').value.trim(), document.getElementById('login-senha').value);
      mostrarApp(s);
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
    }
    botao.disabled = false;
  });

  document.getElementById('sair').addEventListener('click', async function () {
    await DB.sair();
    location.hash = '';
    mostrarLogin();
  });

  document.getElementById('limpar-demo').addEventListener('click', function () {
    if (!confirm('Apagar todos os dados de demonstração deste navegador?')) return;
    DB.limpar();
    aviso('Dados de demonstração apagados.');
    rotear();
  });

  window.addEventListener('hashchange', rotear);

  DB.sessao().then(function (s) {
    if (s) mostrarApp(s);
    else mostrarLogin();
  }).catch(function () { mostrarLogin(); });
})();
