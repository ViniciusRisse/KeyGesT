/*
 * Negociações: clientes em prospecção, do primeiro contato ao fechamento.
 * Quadro por etapa (arrastar e soltar), lista, ficha com histórico de
 * contatos e próximo passo, e conversão em empresa cliente.
 */
(function () {
  'use strict';

  var ETAPAS = [
    { k: 'contato', t: 'Primeiro contato' },
    { k: 'reuniao', t: 'Reunião / diagnóstico' },
    { k: 'proposta', t: 'Proposta enviada' },
    { k: 'negociacao', t: 'Em negociação' },
    { k: 'ganho', t: 'Ganha', fim: true },
    { k: 'perdido', t: 'Perdida', fim: true },
  ];
  var NOME_ETAPA = {};
  ETAPAS.forEach(function (e) { NOME_ETAPA[e.k] = e.t; });
  var ABERTAS = ETAPAS.filter(function (e) { return !e.fim; });

  var ORIGENS = {
    site: 'Site (formulário)', indicacao: 'Indicação', whatsapp: 'WhatsApp', instagram: 'Instagram / redes sociais',
    prospeccao: 'Prospecção ativa', evento: 'Evento', outro: 'Outro',
  };
  var TIPOS = {
    ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião', proposta: 'Proposta enviada',
    anotacao: 'Anotação', etapa: 'Etapa', criacao: 'Criação',
  };
  var MOTIVOS = ['Preço', 'Escolheu outro fornecedor', 'Sem resposta', 'Não era o momento', 'Vai fazer internamente', 'Outro'];
  var CHAVE_VISAO = 'keygest-negociacoes-visao';

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function hojeIso() { return iso(new Date()); }
  function dias(desde) {
    if (!desde) return null;
    var a = new Date(desde + 'T00:00:00'), b = new Date(hojeIso() + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  window.TelaNegociacoes = function (ctx) {
    var DB = ctx.DB, vista = ctx.vista, esc = ctx.esc, aviso = ctx.aviso, brl = ctx.brl, fmtData = ctx.fmtData;
    var PODE = ctx.PODE;
    var autor = ctx.autor;

    function valor(v) { return v ? brl(+v) : '—'; }

    function etiquetaEtapa(k) {
      return '<span class="neg-etapa neg-' + esc(k) + '">' + esc(NOME_ETAPA[k] || k) + '</span>';
    }

    // Situação do próximo passo: atrasado, hoje ou futuro
    function passo(n, curto) {
      if (!n.proximo_passo && !n.proximo_data) return curto ? '' : '<span class="ajuda">Nenhum próximo passo definido.</span>';
      var d = n.proximo_data ? dias(n.proximo_data) : null; // positivo = já passou
      var cls = d == null ? '' : d > 0 ? ' atrasado' : d === 0 ? ' hoje' : '';
      var quando = d == null ? '' : d > 0 ? 'Atrasado ' + d + (d === 1 ? ' dia' : ' dias') : d === 0 ? 'Hoje' : fmtData(n.proximo_data);
      return '<div class="neg-passo' + cls + '">' + (quando ? '<b>' + esc(quando) + '</b>' : '') + (n.proximo_passo ? '<span>' + esc(n.proximo_passo) + '</span>' : '') + '</div>';
    }

    async function registrar(negId, tipo, descricao, data) {
      return DB.inserir('negociacao_historico', {
        negociacao_id: negId, tipo: tipo, descricao: descricao, data: data || hojeIso(), autor: autor(),
      });
    }

    async function mudarEtapa(n, nova, extra) {
      if (n.etapa === nova && !extra) return n;
      var dados = Object.assign({ etapa: nova }, extra || {});
      if (nova === 'ganho' || nova === 'perdido') dados.fechado_em = dados.fechado_em || hojeIso();
      else dados.fechado_em = null;
      var salvo = await DB.atualizar('negociacoes', n.id, dados);
      await registrar(n.id, 'etapa', NOME_ETAPA[n.etapa] + ' → ' + NOME_ETAPA[nova] +
        (nova === 'perdido' && dados.motivo_perda ? ' (motivo: ' + dados.motivo_perda + ')' : ''));
      return salvo;
    }

    // ------------------------------------------------------------
    // Quadro e lista
    // ------------------------------------------------------------
    async function telaLista(query) {
      var lista = await DB.listar('negociacoes');
      var visao = 'quadro';
      try { if (localStorage.getItem(CHAVE_VISAO) === 'lista') visao = 'lista'; } catch (e) { /* sem armazenamento */ }
      var filtro = { busca: query.busca || '', etapa: '' };

      var abertas = lista.filter(function (n) { return n.etapa !== 'ganho' && n.etapa !== 'perdido'; });
      var mes = hojeIso().slice(0, 7);
      var ganhasMes = lista.filter(function (n) { return n.etapa === 'ganho' && String(n.fechado_em || '').slice(0, 7) === mes; });
      var fechadas = lista.filter(function (n) { return n.etapa === 'ganho' || n.etapa === 'perdido'; });
      var taxa = fechadas.length ? Math.round(lista.filter(function (n) { return n.etapa === 'ganho'; }).length / fechadas.length * 100) : null;
      var atrasadas = abertas.filter(function (n) { return n.proximo_data && dias(n.proximo_data) > 0; });
      function soma(arr) { return arr.reduce(function (s, n) { return s + (+n.valor_mensal || 0); }, 0); }

      vista.innerHTML =
        '<div class="topo-vista"><div><h1>Negociações</h1><p>Clientes em prospecção, do primeiro contato ao fechamento.</p></div>' +
        '<div class="acoes">' + (PODE.editar ? '<a class="botao" href="#/negociacoes/nova">+ Nova negociação</a>' : '') + '</div></div>' +
        '<div class="indicadores neg-indicadores">' +
        '<div class="indicador"><span>Em andamento</span><strong>' + abertas.length + '</strong></div>' +
        '<div class="indicador"><span>Honorários mensais em negociação</span><strong>' + brl(soma(abertas)) + '</strong></div>' +
        '<div class="indicador"><span>Ganhas neste mês</span><strong>' + ganhasMes.length + '</strong><small>' + brl(soma(ganhasMes)) + ' por mês</small></div>' +
        '<div class="indicador"><span>Taxa de fechamento</span><strong>' + (taxa == null ? '—' : taxa + '%') + '</strong><small>' + fechadas.length + ' encerrada(s)</small></div>' +
        '<div class="indicador' + (atrasadas.length ? ' indicador-alerta' : '') + '"><span>Retornos atrasados</span><strong>' + atrasadas.length + '</strong></div>' +
        '</div>' +
        '<div class="neg-filtros">' +
        '<input type="search" id="neg-busca" placeholder="Buscar empresa, contato ou CNPJ" value="' + esc(filtro.busca) + '" aria-label="Buscar">' +
        '<select id="neg-etapa" aria-label="Etapa"' + (visao === 'quadro' ? ' hidden' : '') + '><option value="">Todas as etapas</option>' +
        ETAPAS.map(function (e) { return '<option value="' + e.k + '">' + esc(e.t) + '</option>'; }).join('') + '</select>' +
        '<div class="folha-modo" role="group" aria-label="Forma de exibição">' +
        '<button type="button" data-visao="quadro" aria-pressed="' + (visao === 'quadro') + '">Quadro</button>' +
        '<button type="button" data-visao="lista" aria-pressed="' + (visao === 'lista') + '">Lista</button></div>' +
        '</div>' +
        '<div id="neg-corpo"></div>';

      var corpo = document.getElementById('neg-corpo');

      function filtradas() {
        var b = filtro.busca.trim().toLowerCase();
        var bNum = b.replace(/\D/g, '');
        return lista.filter(function (n) {
          if (filtro.etapa && n.etapa !== filtro.etapa) return false;
          if (!b) return true;
          return [n.empresa, n.contato, n.email, n.responsavel].some(function (x) { return String(x || '').toLowerCase().indexOf(b) !== -1; }) ||
            (bNum && String(n.cnpj || '').replace(/\D/g, '').indexOf(bNum) !== -1);
        });
      }

      function cartao(n) {
        var d = dias(n.data_contato);
        return '<article class="neg-card"' + (PODE.editar && !n.etapa.match(/ganho|perdido/) ? ' draggable="true"' : '') + ' data-id="' + esc(n.id) + '">' +
          '<a class="neg-card-titulo" href="#/negociacoes/' + esc(n.id) + '">' + esc(n.empresa) + '</a>' +
          '<small>' + esc([n.contato, ORIGENS[n.origem]].filter(Boolean).join(' · ')) + '</small>' +
          '<div class="neg-card-valores">' + (n.valor_mensal ? '<b>' + brl(+n.valor_mensal) + '</b>/mês' : '<span class="ajuda">Sem valor</span>') +
          (n.funcionarios ? '<span>' + n.funcionarios + ' func.</span>' : '') + '</div>' +
          (n.etapa === 'ganho' || n.etapa === 'perdido'
            ? '<div class="neg-card-fim">' + etiquetaEtapa(n.etapa) + (n.fechado_em ? ' <small>' + fmtData(n.fechado_em) + '</small>' : '') + '</div>'
            : passo(n, true) + (d != null ? '<small class="neg-idade">' + (d === 0 ? 'Desde hoje' : 'Há ' + d + (d === 1 ? ' dia' : ' dias')) + '</small>' : '')) +
          '</article>';
      }

      function desenharQuadro() {
        var itens = filtradas();
        var limite = new Date(); limite.setDate(limite.getDate() - 90);
        var limiteIso = iso(limite);
        var colunas = ABERTAS.map(function (e) {
          return { k: e.k, t: e.t, itens: itens.filter(function (n) { return n.etapa === e.k; }) };
        });
        colunas.push({
          k: 'encerradas', t: 'Encerradas (90 dias)', fim: true,
          itens: itens.filter(function (n) { return (n.etapa === 'ganho' || n.etapa === 'perdido') && (!n.fechado_em || n.fechado_em >= limiteIso); }),
        });
        corpo.innerHTML = '<div class="neg-quadro">' + colunas.map(function (c) {
          c.itens.sort(function (a, b) { return String(a.proximo_data || '9999') < String(b.proximo_data || '9999') ? -1 : 1; });
          return '<section class="neg-coluna' + (c.fim ? ' neg-coluna-fim' : '') + '" data-etapa="' + c.k + '">' +
            '<header><strong>' + esc(c.t) + '</strong><span>' + c.itens.length + '</span>' +
            (c.fim ? '' : '<small>' + brl(soma(c.itens)) + '/mês</small>') + '</header>' +
            '<div class="neg-coluna-itens">' + (c.itens.map(cartao).join('') || '<p class="neg-vazio">' + (c.fim ? 'Nenhuma' : 'Arraste um cartão para cá') + '</p>') + '</div>' +
            '</section>';
        }).join('') + '</div>' +
        (PODE.editar ? '<p class="ajuda neg-dica">Arraste os cartões entre as colunas para mudar a etapa. Para encerrar como ganha ou perdida, abra a negociação.</p>' : '');
        if (PODE.editar) ligarArrastar();
      }

      function desenharLista() {
        var itens = filtradas().sort(function (a, b) { return String(b.atualizado_em || b.criado_em || '') < String(a.atualizado_em || a.criado_em || '') ? -1 : 1; });
        corpo.innerHTML = itens.length
          ? '<div class="painel" style="padding:0"><table class="lista"><thead><tr><th>Empresa</th><th>Etapa</th><th>Honorário/mês</th><th>Funcionários</th><th>Próximo passo</th><th>Responsável</th><th>Primeiro contato</th></tr></thead><tbody>' +
            itens.map(function (n) {
              return '<tr><td><a href="#/negociacoes/' + esc(n.id) + '"><strong>' + esc(n.empresa) + '</strong></a><small style="display:block">' + esc(n.contato || '') + '</small></td>' +
                '<td>' + etiquetaEtapa(n.etapa) + '</td><td>' + valor(n.valor_mensal) + '</td><td>' + (n.funcionarios || '—') + '</td>' +
                '<td>' + (n.etapa === 'ganho' || n.etapa === 'perdido' ? '—' : passo(n, true) || '—') + '</td>' +
                '<td>' + esc(n.responsavel || '—') + '</td><td>' + (n.data_contato ? fmtData(n.data_contato) : '—') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="painel vazio">Nenhuma negociação encontrada.' + (PODE.editar && !lista.length ? '<br><a class="botao" style="margin-top:14px" href="#/negociacoes/nova">Cadastrar a primeira negociação</a>' : '') + '</div>';
      }

      function desenhar() {
        vista.querySelectorAll('[data-visao]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.visao === visao)); });
        document.getElementById('neg-etapa').hidden = visao === 'quadro';
        if (visao === 'quadro') desenharQuadro(); else desenharLista();
      }

      function ligarArrastar() {
        var arrastando = null;
        corpo.querySelectorAll('.neg-card[draggable]').forEach(function (c) {
          c.addEventListener('dragstart', function (ev) {
            arrastando = c.dataset.id;
            c.classList.add('arrastando');
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', arrastando);
          });
          c.addEventListener('dragend', function () {
            c.classList.remove('arrastando');
            corpo.querySelectorAll('.neg-coluna.alvo').forEach(function (x) { x.classList.remove('alvo'); });
          });
        });
        corpo.querySelectorAll('.neg-coluna:not(.neg-coluna-fim)').forEach(function (col) {
          col.addEventListener('dragover', function (ev) {
            if (!arrastando) return;
            ev.preventDefault();
            col.classList.add('alvo');
          });
          col.addEventListener('dragleave', function (ev) {
            if (!col.contains(ev.relatedTarget)) col.classList.remove('alvo');
          });
          col.addEventListener('drop', async function (ev) {
            ev.preventDefault();
            col.classList.remove('alvo');
            var id = arrastando;
            arrastando = null;
            var n = lista.find(function (x) { return x.id === id; });
            var nova = col.dataset.etapa;
            if (!n || n.etapa === nova) return;
            try {
              var salvo = await mudarEtapa(n, nova);
              Object.assign(n, salvo || { etapa: nova });
              desenharQuadro();
              aviso(n.empresa + ': ' + NOME_ETAPA[nova] + '.');
            } catch (e) { aviso(e.message, true); }
          });
        });
      }

      document.getElementById('neg-busca').addEventListener('input', function () { filtro.busca = this.value; desenhar(); });
      document.getElementById('neg-etapa').addEventListener('change', function () { filtro.etapa = this.value; desenhar(); });
      vista.querySelector('.neg-filtros .folha-modo').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-visao]');
        if (!b) return;
        visao = b.dataset.visao;
        if (visao === 'quadro') filtro.etapa = '';
        document.getElementById('neg-etapa').value = filtro.etapa;
        try { localStorage.setItem(CHAVE_VISAO, visao); } catch (e) { /* sem armazenamento */ }
        desenhar();
      });
      desenhar();
    }

    // ------------------------------------------------------------
    // Formulário
    // ------------------------------------------------------------
    function formNegociacao() {
      var etapas = {};
      ETAPAS.forEach(function (e) { etapas[e.k] = e.t; });
      return [
        {
          titulo: 'Empresa',
          campos: [
            { n: 'empresa', l: 'Nome da empresa *', req: true, cls: 'dois' },
            { n: 'cnpj', l: 'CNPJ', mask: 'cnpj', valida: 'cnpj' },
            { n: 'funcionarios', l: 'Nº de funcionários', tipo: 'number', step: '1', conv: 'int' },
            { n: 'regime', l: 'Regime tributário', tipo: 'select', ops: ctx.REGIMES, vazio: 'Não informado' },
            { n: 'servicos', l: 'Serviços de interesse', cls: 'dois' },
          ],
        },
        {
          titulo: 'Contato',
          campos: [
            { n: 'contato', l: 'Nome do contato' },
            { n: 'cargo_contato', l: 'Cargo do contato' },
            { n: 'telefone', l: 'Telefone / WhatsApp', mask: 'telefone' },
            { n: 'email', l: 'E-mail', tipo: 'email', valida: 'email' },
            { n: 'origem', l: 'Como chegou até nós', tipo: 'select', ops: ORIGENS, vazio: 'Selecione' },
          ],
        },
        {
          titulo: 'Proposta',
          campos: [
            { n: 'valor_mensal', l: 'Honorário mensal proposto (R$)', tipo: 'number', step: '0.01', conv: 'num' },
            { n: 'valor_implantacao', l: 'Taxa de implantação (R$)', tipo: 'number', step: '0.01', conv: 'num' },
            { n: 'etapa', l: 'Etapa', tipo: 'select', ops: etapas },
            { n: 'responsavel', l: 'Responsável na KeyGest' },
            { n: 'data_contato', l: 'Data do primeiro contato', tipo: 'date' },
          ],
        },
        {
          titulo: 'Próximo passo',
          campos: [
            { n: 'proximo_passo', l: 'O que fazer', cls: 'dois' },
            { n: 'proximo_data', l: 'Até quando', tipo: 'date' },
          ],
        },
        {
          titulo: 'Observações',
          campos: [{ n: 'observacoes', l: 'Anotações gerais', tipo: 'textarea', cls: 'inteiro' }],
        },
      ];
    }

    async function telaForm(id) {
      var dados = { etapa: 'contato', data_contato: hojeIso(), responsavel: autor() };
      if (id) {
        dados = await DB.obter('negociacoes', id);
        if (!dados) return ctx.naoEncontrado();
      }
      var antes = Object.assign({}, dados);
      var grupos = formNegociacao();
      var voltar = id ? '#/negociacoes/' + id : '#/negociacoes';
      vista.innerHTML =
        '<a class="voltar" href="' + voltar + '">← ' + (id ? esc(dados.empresa) : 'Negociações') + '</a>' +
        '<div class="topo-vista"><h1>' + (id ? 'Editar negociação' : 'Nova negociação') + '</h1>' +
        '<div class="acoes"><a class="botao botao-secundario" href="../calculadora.html" target="_blank" rel="noopener">Calcular honorários ↗</a></div></div>' +
        '<form class="painel form-sistema" id="form" novalidate>' + ctx.htmlFormulario(grupos, dados) +
        '<div class="acoes"><button class="botao" type="submit">Salvar</button><a class="botao botao-secundario" href="' + voltar + '">Cancelar</a></div></form>';
      var form = document.getElementById('form');
      ctx.ligarMascaras(form);
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var r = ctx.lerFormulario(form, grupos);
        if (r.erros.length) { r.erros[0].focus(); return; }
        var d = r.dados;
        if ((d.etapa === 'ganho' || d.etapa === 'perdido') && antes.etapa !== d.etapa) d.fechado_em = hojeIso();
        if (d.etapa !== 'ganho' && d.etapa !== 'perdido') d.fechado_em = null;
        var bt = form.querySelector('[type=submit]');
        bt.disabled = true;
        try {
          var salvo;
          if (id) {
            salvo = await DB.atualizar('negociacoes', id, d);
            if (antes.etapa !== d.etapa) await registrar(id, 'etapa', NOME_ETAPA[antes.etapa] + ' → ' + NOME_ETAPA[d.etapa]);
          } else {
            salvo = await DB.inserir('negociacoes', d);
            await registrar(salvo.id, 'criacao', 'Negociação cadastrada' + (d.origem ? ' (origem: ' + ORIGENS[d.origem] + ')' : '') + '.', d.data_contato || hojeIso());
          }
          aviso('Negociação salva.');
          location.hash = '#/negociacoes/' + salvo.id;
        } catch (e) {
          aviso(e.message, true);
          bt.disabled = false;
        }
      });
    }

    // ------------------------------------------------------------
    // Ficha da negociação
    // ------------------------------------------------------------
    async function telaFicha(id) {
      var r = await Promise.all([DB.obter('negociacoes', id), DB.listar('negociacao_historico', { negociacao_id: id })]);
      var n = r[0];
      if (!n) return ctx.naoEncontrado();
      var hist = r[1].sort(function (a, b) {
        if (a.data !== b.data) return a.data < b.data ? 1 : -1;
        return String(a.criado_em || '') < String(b.criado_em || '') ? 1 : -1;
      });
      var fim = n.etapa === 'ganho' || n.etapa === 'perdido';
      var ed = PODE.editar;
      var tel = String(n.telefone || '').replace(/\D/g, '');
      var idade = dias(n.data_contato);

      function item(rot, val) { return '<div><dt>' + rot + '</dt><dd>' + (val == null || val === '' ? '—' : val) + '</dd></div>'; }

      var indiceAtual = ABERTAS.findIndex(function (e) { return e.k === n.etapa; });
      var trilha = '<ol class="neg-trilha">' + ABERTAS.map(function (e, i) {
        var cls = fim ? (n.etapa === 'ganho' ? 'feito' : '') : i < indiceAtual ? 'feito' : i === indiceAtual ? 'atual' : '';
        return '<li class="' + cls + '">' + (ed && !fim ? '<button type="button" data-ir="' + e.k + '">' + esc(e.t) + '</button>' : '<span>' + esc(e.t) + '</span>') + '</li>';
      }).join('') +
        '<li class="' + (n.etapa === 'ganho' ? 'ganho' : n.etapa === 'perdido' ? 'perdido' : '') + '"><span>' + (n.etapa === 'perdido' ? 'Perdida' : 'Ganha') + '</span></li></ol>';

      var faixaFim = '';
      if (n.etapa === 'ganho') {
        faixaFim = '<div class="aviso aviso-acao neg-faixa-ganho"><div><strong>Negociação ganha' + (n.fechado_em ? ' em ' + fmtData(n.fechado_em) : '') + '.</strong> ' +
          (n.empresa_id ? 'Esta negociação já virou empresa cliente.' : 'Cadastre a empresa para começar a lançar colaboradores e a folha.') + '</div>' +
          '<div class="acoes">' + (n.empresa_id ? '<a class="botao botao-pequeno" href="#/empresas/' + esc(n.empresa_id) + '/editar">Ver empresa cliente</a>'
            : ed ? '<button type="button" class="botao botao-pequeno" id="neg-converter">Cadastrar como empresa cliente</button>' : '') +
          (ed ? '<button type="button" class="botao botao-secundario botao-pequeno" id="neg-reabrir">Reabrir</button>' : '') + '</div></div>';
      } else if (n.etapa === 'perdido') {
        faixaFim = '<div class="aviso aviso-acao neg-faixa-perdido"><div><strong>Negociação perdida' + (n.fechado_em ? ' em ' + fmtData(n.fechado_em) : '') + '.</strong> ' +
          (n.motivo_perda ? 'Motivo: ' + esc(n.motivo_perda) + '.' : '') + '</div>' +
          (ed ? '<div class="acoes"><button type="button" class="botao botao-secundario botao-pequeno" id="neg-reabrir">Reabrir negociação</button></div>' : '') + '</div>';
      }

      vista.innerHTML =
        '<a class="voltar" href="#/negociacoes">← Negociações</a>' +
        '<div class="topo-vista"><div><h1>' + esc(n.empresa) + '</h1><p>' + etiquetaEtapa(n.etapa) +
        (idade != null && !fim ? ' <span class="ajuda">· ' + (idade <= 0 ? 'primeiro contato hoje' : 'em negociação há ' + idade + (idade === 1 ? ' dia' : ' dias')) + '</span>' : '') + '</p></div>' +
        '<div class="acoes">' +
        (ed && !fim ? '<button type="button" class="botao" id="neg-ganhou">Marcar como ganha</button>' +
          '<button type="button" class="botao botao-perigo" id="neg-perdeu">Marcar como perdida</button>' : '') +
        (ed ? '<a class="botao botao-secundario" href="#/negociacoes/' + esc(n.id) + '/editar">' + ctx.ICONE_LAPIS + ' Editar</a>' : '') +
        '</div></div>' +
        trilha + faixaFim +
        '<div class="neg-ficha">' +
        '<div class="neg-ficha-esq">' +
        '<section class="painel"><h2>Dados da negociação</h2><dl class="dados">' +
        item('Contato', esc(n.contato) + (n.cargo_contato ? ' <small>(' + esc(n.cargo_contato) + ')</small>' : '')) +
        item('Telefone', n.telefone ? esc(n.telefone) + (tel.length >= 10 ? ' · <a href="https://wa.me/55' + tel + '" target="_blank" rel="noopener">WhatsApp ↗</a>' : '') : '') +
        item('E-mail', n.email ? '<a href="mailto:' + esc(n.email) + '">' + esc(n.email) + '</a>' : '') +
        item('CNPJ', esc(n.cnpj)) +
        item('Funcionários', n.funcionarios) +
        item('Regime', esc(ctx.REGIMES[n.regime] || '')) +
        item('Serviços de interesse', esc(n.servicos)) +
        item('Origem', esc(ORIGENS[n.origem] || '')) +
        item('Honorário mensal', valor(n.valor_mensal)) +
        item('Taxa de implantação', valor(n.valor_implantacao)) +
        item('Valor no 1º ano', n.valor_mensal || n.valor_implantacao ? brl((+n.valor_mensal || 0) * 12 + (+n.valor_implantacao || 0)) : '') +
        item('Responsável', esc(n.responsavel)) +
        item('Primeiro contato', n.data_contato ? fmtData(n.data_contato) : '') +
        '</dl>' + (n.observacoes ? '<p class="neg-obs">' + esc(n.observacoes) + '</p>' : '') + '</section>' +
        (fim ? '' :
          '<section class="painel"><h2>Próximo passo</h2>' + passo(n) +
          (ed ? '<form id="neg-passo" class="neg-form-linha">' +
            '<input type="text" name="texto" placeholder="Ex.: enviar proposta, ligar para confirmar" value="' + esc(n.proximo_passo || '') + '" aria-label="Próximo passo">' +
            '<input type="date" name="data" value="' + esc(n.proximo_data || '') + '" aria-label="Data do próximo passo">' +
            '<button type="submit" class="botao botao-secundario botao-pequeno">Salvar</button>' +
            (n.proximo_passo ? '<button type="button" class="botao botao-pequeno" id="neg-passo-feito">Concluído</button>' : '') +
            '</form>' : '') + '</section>') +
        (ed ? '<p class="neg-excluir"><button type="button" class="link link-perigo" id="neg-excluir">Excluir esta negociação</button></p>' : '') +
        '</div>' +
        '<section class="painel neg-historico"><h2>Histórico de contatos</h2>' +
        (ed ? '<form id="neg-hist" class="neg-hist-form">' +
          '<div class="neg-hist-linha"><select name="tipo" aria-label="Tipo de contato">' +
          ['ligacao', 'whatsapp', 'email', 'reuniao', 'proposta', 'anotacao'].map(function (k) { return '<option value="' + k + '">' + TIPOS[k] + '</option>'; }).join('') +
          '</select><input type="date" name="data" value="' + hojeIso() + '" aria-label="Data"></div>' +
          '<textarea name="descricao" rows="3" placeholder="O que foi conversado? Ex.: cliente pediu proposta para 12 funcionários, retorno na sexta." aria-label="Descrição"></textarea>' +
          '<button type="submit" class="botao botao-pequeno">Registrar contato</button></form>' : '') +
        (hist.length ? '<ol class="neg-linha-tempo">' + hist.map(function (h) {
          return '<li class="neg-h-' + esc(h.tipo) + '"><div class="neg-h-topo"><b>' + esc(TIPOS[h.tipo] || h.tipo) + '</b><span>' + fmtData(h.data) + (h.autor ? ' · ' + esc(h.autor) : '') + '</span>' +
            (ed && h.tipo !== 'criacao' ? '<button type="button" class="neg-h-excluir" data-excluir-h="' + esc(h.id) + '" aria-label="Apagar registro" title="Apagar registro">×</button>' : '') + '</div>' +
            '<p>' + esc(h.descricao) + '</p></li>';
        }).join('') + '</ol>' : '<p class="ajuda">Nenhum contato registrado ainda.</p>') +
        '</section></div>';

      function recarregar() { ctx.rotear(); }

      vista.querySelectorAll('[data-ir]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try { await mudarEtapa(n, b.dataset.ir); aviso('Etapa: ' + NOME_ETAPA[b.dataset.ir] + '.'); recarregar(); } catch (e) { aviso(e.message, true); }
        });
      });

      var fPasso = document.getElementById('neg-passo');
      if (fPasso) fPasso.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        try {
          await DB.atualizar('negociacoes', n.id, { proximo_passo: fPasso.texto.value.trim() || null, proximo_data: fPasso.data.value || null });
          aviso('Próximo passo salvo.');
          recarregar();
        } catch (e) { aviso(e.message, true); }
      });
      var btFeito = document.getElementById('neg-passo-feito');
      if (btFeito) btFeito.addEventListener('click', async function () {
        try {
          await registrar(n.id, 'anotacao', 'Concluído: ' + n.proximo_passo);
          await DB.atualizar('negociacoes', n.id, { proximo_passo: null, proximo_data: null });
          aviso('Passo concluído e registrado no histórico. Defina o próximo.');
          recarregar();
        } catch (e) { aviso(e.message, true); }
      });

      var fHist = document.getElementById('neg-hist');
      if (fHist) fHist.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var txt = fHist.descricao.value.trim();
        if (!txt) { fHist.descricao.focus(); return; }
        try {
          await registrar(n.id, fHist.tipo.value, txt, fHist.data.value || hojeIso());
          if (fHist.tipo.value === 'proposta' && (n.etapa === 'contato' || n.etapa === 'reuniao')) await mudarEtapa(n, 'proposta');
          aviso('Contato registrado.');
          recarregar();
        } catch (e) { aviso(e.message, true); }
      });

      vista.querySelectorAll('[data-excluir-h]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!confirm('Apagar este registro do histórico?')) return;
          try { await DB.excluir('negociacao_historico', b.dataset.excluirH); recarregar(); } catch (e) { aviso(e.message, true); }
        });
      });

      var btGanhou = document.getElementById('neg-ganhou');
      if (btGanhou) btGanhou.addEventListener('click', async function () {
        try {
          await mudarEtapa(n, 'ganho', { proximo_passo: null, proximo_data: null });
          aviso('Parabéns! Negociação ganha.');
          recarregar();
        } catch (e) { aviso(e.message, true); }
      });

      var btPerdeu = document.getElementById('neg-perdeu');
      if (btPerdeu) btPerdeu.addEventListener('click', function () { janelaPerda(n); });

      var btReabrir = document.getElementById('neg-reabrir');
      if (btReabrir) btReabrir.addEventListener('click', async function () {
        try { await mudarEtapa(n, 'negociacao', { motivo_perda: null }); aviso('Negociação reaberta.'); recarregar(); } catch (e) { aviso(e.message, true); }
      });

      var btConv = document.getElementById('neg-converter');
      if (btConv) btConv.addEventListener('click', async function () {
        btConv.disabled = true;
        try {
          var cnpjOk = n.cnpj && window.KeyGestCalc.validarCNPJ(n.cnpj);
          var emp = await DB.inserir('empresas', {
            razao_social: n.empresa, nome_fantasia: null, cnpj: cnpjOk ? n.cnpj : null,
            regime: ctx.REGIMES[n.regime] ? n.regime : 'simples', responsavel: n.contato || null, email: n.email || null,
            telefone: n.telefone || null, ativo: true,
            observacoes: 'Cliente vindo da negociação fechada em ' + fmtData(n.fechado_em || hojeIso()) + '.' +
              (n.valor_mensal ? ' Honorário mensal combinado: ' + brl(+n.valor_mensal) + '.' : ''),
          });
          await DB.atualizar('negociacoes', n.id, { empresa_id: emp.id });
          await registrar(n.id, 'anotacao', 'Cadastrada como empresa cliente.');
          aviso('Empresa cadastrada. Confira e complete os dados.');
          location.hash = '#/empresas/' + emp.id + '/editar';
        } catch (e) {
          aviso(e.message, true);
          btConv.disabled = false;
        }
      });

      var btExcluir = document.getElementById('neg-excluir');
      if (btExcluir) btExcluir.addEventListener('click', async function () {
        if (!confirm('Excluir a negociação com ' + n.empresa + ' e todo o histórico? Não dá para desfazer.')) return;
        try { await DB.excluir('negociacoes', n.id); aviso('Negociação excluída.'); location.hash = '#/negociacoes'; } catch (e) { aviso(e.message, true); }
      });
    }

    function janelaPerda(n) {
      var dlg = document.createElement('dialog');
      dlg.className = 'janela';
      dlg.innerHTML = '<form method="dialog" class="form-sistema" novalidate>' +
        '<div class="janela-topo"><div><h2>Marcar como perdida</h2><p>' + esc(n.empresa) + '</p></div><button type="button" class="janela-fechar" aria-label="Fechar">×</button></div>' +
        '<div class="campo"><label for="perda-motivo">Motivo</label><select id="perda-motivo" name="motivo">' +
        MOTIVOS.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></div>' +
        '<div class="campo"><label for="perda-obs">Detalhes (opcional)</label><textarea id="perda-obs" name="obs" rows="3"></textarea></div>' +
        '<div class="acoes"><button type="submit" class="botao botao-perigo">Marcar como perdida</button><button type="button" class="botao botao-secundario janela-cancelar">Cancelar</button></div></form>';
      document.body.appendChild(dlg);
      var form = dlg.querySelector('form');
      function fechar() { dlg.close(); dlg.remove(); }
      dlg.querySelector('.janela-fechar').addEventListener('click', fechar);
      dlg.querySelector('.janela-cancelar').addEventListener('click', fechar);
      dlg.addEventListener('cancel', function () { setTimeout(function () { dlg.remove(); }, 0); });
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var motivo = form.motivo.value + (form.obs.value.trim() ? ' – ' + form.obs.value.trim() : '');
        try {
          await mudarEtapa(n, 'perdido', { motivo_perda: motivo, proximo_passo: null, proximo_data: null });
          fechar();
          aviso('Negociação marcada como perdida.');
          ctx.rotear();
        } catch (e) { aviso(e.message, true); }
      });
      dlg.showModal();
    }

    return { lista: telaLista, form: telaForm, ficha: telaFicha };
  };
})();
