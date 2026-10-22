/*
 * Financeiro da KeyGest: receitas, despesas e lucro.
 * Somente o administrador vê e edita (regra também garantida no banco).
 */
(function () {
  'use strict';

  var CAT_RECEITA = {
    honorarios: 'Honorários mensais', implantacao: 'Implantação', avulsos: 'Serviços avulsos (admissão, rescisão…)',
    consultoria: 'Consultoria', outras_receitas: 'Outras receitas',
  };
  var CAT_DESPESA = {
    impostos: 'Impostos (DAS e outros)', prolabore: 'Pró-labore', salarios: 'Salários e encargos', aluguel: 'Aluguel e condomínio',
    sistemas: 'Sistemas e software', contabilidade: 'Contabilidade', marketing: 'Marketing e anúncios',
    internet: 'Internet e telefone', material: 'Material e escritório', transporte: 'Transporte', taxas: 'Taxas bancárias',
    outras_despesas: 'Outras despesas',
  };
  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var COR_RECEITA = '#1f8f6c';
  var COR_DESPESA = '#8a5bb5';

  function compAtual() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function compAnterior(c) {
    var p = c.split('-');
    var d = new Date(+p[0], +p[1] - 2, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function nomeMes(c) {
    var p = c.split('-');
    var t = new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  var estado = { competencia: compAtual() };

  window.TelaFinanceiro = async function (ctx, query) {
    var DB = ctx.DB, vista = ctx.vista, esc = ctx.esc, aviso = ctx.aviso, brl = ctx.brl, fmtData = ctx.fmtData;
    if (query.competencia && /^\d{4}-\d{2}$/.test(query.competencia)) estado.competencia = query.competencia;
    var comp = estado.competencia;
    var ano = comp.slice(0, 4);

    var r = await Promise.all([DB.listar('financeiro'), DB.listar('empresas')]);
    var todos = r[0];
    var empresas = r[1].sort(ctx.porNome('razao_social'));
    var mapaEmp = {};
    empresas.forEach(function (e) { mapaEmp[e.id] = e; });

    function soma(lista) { return lista.reduce(function (s, x) { return s + (+x.valor || 0); }, 0); }
    function doTipo(lista, t) { return lista.filter(function (x) { return x.tipo === t; }); }
    function pct(v) { return isFinite(v) ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—'; }

    var doMes = todos.filter(function (x) { return x.competencia === comp; });
    var recMes = doTipo(doMes, 'receita'), despMes = doTipo(doMes, 'despesa');
    var totRec = soma(recMes), totDesp = soma(despMes), lucro = totRec - totDesp;
    var aReceber = soma(recMes.filter(function (x) { return !x.quitado; }));
    var aPagar = soma(despMes.filter(function (x) { return !x.quitado; }));

    // Ano: 12 meses
    var meses = MESES.map(function (m, i) {
      var c = ano + '-' + String(i + 1).padStart(2, '0');
      var l = todos.filter(function (x) { return x.competencia === c; });
      var rec = soma(doTipo(l, 'receita')), desp = soma(doTipo(l, 'despesa'));
      return { c: c, nome: m, rec: rec, desp: desp, lucro: rec - desp, tem: l.length > 0 };
    });
    var anoRec = meses.reduce(function (s, m) { return s + m.rec; }, 0);
    var anoDesp = meses.reduce(function (s, m) { return s + m.desp; }, 0);

    // Por cliente e por categoria (ano)
    var doAno = todos.filter(function (x) { return x.competencia.slice(0, 4) === ano; });
    var porCliente = {}, porCategoria = {};
    doTipo(doAno, 'receita').forEach(function (x) {
      var k = x.empresa_id && mapaEmp[x.empresa_id] ? ctx.nomeEmpresa(mapaEmp[x.empresa_id]) : 'Sem cliente vinculado';
      porCliente[k] = (porCliente[k] || 0) + (+x.valor || 0);
    });
    doTipo(doAno, 'despesa').forEach(function (x) {
      var k = CAT_DESPESA[x.categoria] || 'Outras despesas';
      porCategoria[k] = (porCategoria[k] || 0) + (+x.valor || 0);
    });

    function barrasH(obj, cor) {
      var itens = Object.keys(obj).map(function (k) { return [k, obj[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      if (!itens.length) return '<p class="ajuda">Sem lançamentos neste ano.</p>';
      var max = itens[0][1] || 1;
      return '<ul class="fin-barras">' + itens.map(function (i) {
        return '<li><div class="fin-barras-rot"><span>' + esc(i[0]) + '</span><b>' + brl(i[1]) + '</b></div>' +
          '<div class="fin-barras-trilho"><span style="width:' + Math.max(1, i[1] / max * 100).toFixed(1) + '%;background:' + cor + '"></span></div></li>';
      }).join('') + '</ul>';
    }

    function tabelaLanc(lista, tipo) {
      var cats = tipo === 'receita' ? CAT_RECEITA : CAT_DESPESA;
      var rotQuit = tipo === 'receita' ? ['Recebido', 'A receber'] : ['Pago', 'A pagar'];
      lista = lista.slice().sort(function (a, b) { return (+b.valor || 0) - (+a.valor || 0); });
      return '<table class="tabela fin-tabela"><thead><tr><th>Descrição</th><th>Valor</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
        (lista.length ? lista.map(function (x) {
          var detalhe = [cats[x.categoria], x.empresa_id && mapaEmp[x.empresa_id] ? ctx.nomeEmpresa(mapaEmp[x.empresa_id]) : '', x.recorrente ? 'Fixo mensal' : ''].filter(Boolean).join(' · ');
          return '<tr><td>' + esc(x.descricao) + '<small>' + esc(detalhe) + '</small></td>' +
            '<td class="num">' + brl(+x.valor || 0) + '</td>' +
            '<td><button type="button" class="fin-status' + (x.quitado ? ' ok' : '') + '" data-quitar="' + esc(x.id) + '" title="Clique para alterar">' +
            (x.quitado ? '✓ ' + rotQuit[0] : rotQuit[1]) + '</button></td>' +
            '<td class="col-acoes"><div class="acoes-linha"><button type="button" class="icone-editar" data-editar="' + esc(x.id) + '" aria-label="Editar">' + ctx.ICONE_LAPIS + '</button>' +
            '<button type="button" class="icone-excluir" data-excluir="' + esc(x.id) + '" aria-label="Excluir">' + ctx.ICONE_LIXEIRA + '</button></div></td></tr>';
        }).join('') : '<tr><td colspan="4" class="ajuda">Nenhum lançamento neste mês.</td></tr>') +
        '</tbody><tfoot><tr><td>Total</td><td class="num">' + brl(soma(lista)) + '</td><td colspan="2"></td></tr></tfoot></table>';
    }

    // Gráfico de barras agrupadas (receitas x despesas por mês)
    function grafico() {
      var W = 960, H = 260, esq = 70, dir = 10, topo = 14, base = 30;
      var max = Math.max.apply(null, meses.map(function (m) { return Math.max(m.rec, m.desp); }).concat([1]));
      var passo = Math.pow(10, Math.floor(Math.log10(max)));
      var escala = Math.ceil(max / passo) * passo;
      if (escala / passo < 3) { passo = passo / 2; }
      var ticks = [];
      for (var v = 0; v <= escala + 0.001; v += passo) ticks.push(v);
      var largura = (W - esq - dir) / 12;
      var barra = Math.min(22, largura * 0.32);
      function y(v) { return topo + (H - topo - base) * (1 - v / escala); }
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="fin-grafico" role="img" aria-label="Receitas e despesas por mês em ' + ano + '">' +
        ticks.map(function (t) {
          return '<line x1="' + esq + '" x2="' + (W - dir) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="fin-grade"/>' +
            '<text x="' + (esq - 8) + '" y="' + (y(t) + 4) + '" class="fin-eixo" text-anchor="end">' + (t >= 1000 ? (t / 1000).toLocaleString('pt-BR') + ' mil' : t.toLocaleString('pt-BR')) + '</text>';
        }).join('') +
        meses.map(function (m, i) {
          var cx = esq + largura * i + largura / 2;
          function rect(val, x, cor) {
            if (val <= 0) return '';
            var yy = y(val), h = H - base - yy;
            var r = Math.min(4, h / 2);
            // topo arredondado, base reta
            return '<path fill="' + cor + '" d="M' + x + ',' + (H - base) + 'V' + (yy + r) + 'Q' + x + ',' + yy + ' ' + (x + r) + ',' + yy +
              'H' + (x + barra - r) + 'Q' + (x + barra) + ',' + yy + ' ' + (x + barra) + ',' + (yy + r) + 'V' + (H - base) + 'Z"/>';
          }
          return '<g class="fin-mes' + (m.c === comp ? ' atual' : '') + '" data-i="' + i + '">' +
            '<rect class="fin-alvo" x="' + (esq + largura * i) + '" y="' + topo + '" width="' + largura + '" height="' + (H - topo - base) + '"/>' +
            rect(m.rec, cx - barra - 1, COR_RECEITA) + rect(m.desp, cx + 1, COR_DESPESA) +
            '<text x="' + cx + '" y="' + (H - 10) + '" class="fin-eixo' + (m.c === comp ? ' forte' : '') + '" text-anchor="middle">' + m.nome + '</text></g>';
        }).join('') +
        '<line x1="' + esq + '" x2="' + (W - dir) + '" y1="' + (H - base) + '" y2="' + (H - base) + '" class="fin-base"/>' +
        '</svg>';
      return '<div class="fin-grafico-caixa">' + svg + '<div class="fin-dica" hidden></div></div>';
    }

    vista.innerHTML =
      '<div class="topo-vista"><div><h1>Financeiro</h1><p>Receitas, despesas e lucro da KeyGest. Visível somente para o administrador.</p></div>' +
      '<div class="acoes"><button type="button" class="botao" data-novo="receita">+ Receita</button><button type="button" class="botao botao-secundario" data-novo="despesa">+ Despesa</button></div></div>' +
      '<div class="fin-barra"><input type="month" id="fin-comp" value="' + esc(comp) + '" aria-label="Mês">' +
      '<button type="button" class="botao botao-secundario botao-pequeno" id="fin-copiar">Copiar fixos de ' + esc(nomeMes(compAnterior(comp)).split(' de ')[0].toLowerCase()) + '</button></div>' +
      '<div class="indicadores fin-indicadores">' +
      '<div class="indicador"><span>Receitas do mês</span><strong>' + brl(totRec) + '</strong><small>' + (aReceber ? brl(aReceber) + ' a receber' : 'Tudo recebido') + '</small></div>' +
      '<div class="indicador"><span>Despesas do mês</span><strong>' + brl(totDesp) + '</strong><small>' + (aPagar ? brl(aPagar) + ' a pagar' : 'Tudo pago') + '</small></div>' +
      '<div class="indicador fin-lucro' + (lucro < 0 ? ' negativo' : '') + '"><span>Lucro do mês</span><strong>' + brl(lucro) + '</strong><small>Receitas − despesas</small></div>' +
      '<div class="indicador"><span>Margem de lucro</span><strong>' + (totRec ? pct(lucro / totRec) : '—') + '</strong><small>Lucro ÷ receitas</small></div>' +
      '<div class="indicador"><span>Lucro acumulado em ' + ano + '</span><strong>' + brl(anoRec - anoDesp) + '</strong><small>' + (anoRec ? 'Margem ' + pct((anoRec - anoDesp) / anoRec) : '') + '</small></div>' +
      '</div>' +
      '<h2 class="fin-titulo">Lançamentos de ' + esc(nomeMes(comp).toLowerCase()) + '</h2>' +
      '<div class="fin-colunas">' +
      '<section class="painel fin-bloco"><h3><span class="fin-ponto" style="background:' + COR_RECEITA + '"></span>Receitas</h3>' + tabelaLanc(recMes, 'receita') + '</section>' +
      '<section class="painel fin-bloco"><h3><span class="fin-ponto" style="background:' + COR_DESPESA + '"></span>Despesas</h3>' + tabelaLanc(despMes, 'despesa') + '</section>' +
      '</div>' +
      '<h2 class="fin-titulo">Resultado de ' + ano + '</h2>' +
      '<section class="painel fin-ano">' +
      '<div class="fin-legenda"><span><i style="background:' + COR_RECEITA + '"></i>Receitas</span><span><i style="background:' + COR_DESPESA + '"></i>Despesas</span>' +
      '<small>Passe o mouse sobre um mês para ver os valores · clique para abrir o mês</small></div>' +
      grafico() +
      '<div class="doc-rolagem"><table class="tabela fin-tabela-ano"><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Lucro</th><th>Margem</th></tr></thead><tbody>' +
      meses.map(function (m) {
        return '<tr' + (m.c === comp ? ' class="atual"' : '') + '><td><a href="#/financeiro?competencia=' + m.c + '">' + m.nome + '</a></td>' +
          '<td>' + (m.tem ? brl(m.rec) : '—') + '</td><td>' + (m.tem ? brl(m.desp) : '—') + '</td>' +
          '<td class="' + (m.lucro < 0 ? 'neg' : '') + '">' + (m.tem ? brl(m.lucro) : '—') + '</td><td>' + (m.tem && m.rec ? pct(m.lucro / m.rec) : '—') + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td>Total do ano</td><td>' + brl(anoRec) + '</td><td>' + brl(anoDesp) + '</td><td class="' + (anoRec - anoDesp < 0 ? 'neg' : '') + '">' + brl(anoRec - anoDesp) + '</td>' +
      '<td>' + (anoRec ? pct((anoRec - anoDesp) / anoRec) : '—') + '</td></tr></tfoot></table></div>' +
      '</section>' +
      '<div class="fin-colunas">' +
      '<section class="painel"><h3>Receita por cliente em ' + ano + '</h3>' + barrasH(porCliente, COR_RECEITA) + '</section>' +
      '<section class="painel"><h3>Despesas por categoria em ' + ano + '</h3>' + barrasH(porCategoria, COR_DESPESA) + '</section>' +
      '</div>';

    function ir(c) { location.hash = '#/financeiro?competencia=' + c; }
    document.getElementById('fin-comp').addEventListener('change', function () { if (/^\d{4}-\d{2}$/.test(this.value)) ir(this.value); });

    // Dica do gráfico
    var caixa = vista.querySelector('.fin-grafico-caixa');
    var dica = caixa.querySelector('.fin-dica');
    caixa.querySelectorAll('.fin-mes').forEach(function (g) {
      var m = meses[+g.dataset.i];
      g.addEventListener('mouseenter', function () {
        dica.innerHTML = '<b>' + esc(nomeMes(m.c)) + '</b>' +
          '<div><i style="background:' + COR_RECEITA + '"></i>Receitas <span>' + brl(m.rec) + '</span></div>' +
          '<div><i style="background:' + COR_DESPESA + '"></i>Despesas <span>' + brl(m.desp) + '</span></div>' +
          '<div class="fin-dica-lucro">Lucro <span>' + brl(m.lucro) + '</span></div>';
        dica.hidden = false;
        var gb = g.getBoundingClientRect(), cb = caixa.getBoundingClientRect();
        var x = gb.left - cb.left + gb.width / 2;
        dica.style.left = Math.min(Math.max(x, 90), cb.width - 90) + 'px';
      });
      g.addEventListener('mouseleave', function () { dica.hidden = true; });
      g.addEventListener('click', function () { ir(m.c); });
    });

    document.getElementById('fin-copiar').addEventListener('click', async function () {
      var ant = todos.filter(function (x) { return x.competencia === compAnterior(comp) && x.recorrente; });
      var jaTem = {};
      doMes.forEach(function (x) { jaTem[x.tipo + '|' + x.descricao] = true; });
      var novos = ant.filter(function (x) { return !jaTem[x.tipo + '|' + x.descricao]; });
      if (!ant.length) { aviso('O mês anterior não tem lançamentos marcados como fixos mensais.', true); return; }
      if (!novos.length) { aviso('Os lançamentos fixos do mês anterior já estão neste mês.'); return; }
      if (!confirm('Copiar ' + novos.length + ' lançamento(s) fixo(s) para ' + nomeMes(comp) + '? Eles entram como "a receber" / "a pagar".')) return;
      try {
        for (var i = 0; i < novos.length; i++) {
          var x = novos[i];
          await DB.inserir('financeiro', {
            tipo: x.tipo, competencia: comp, data: x.data ? comp + x.data.slice(7) : null, descricao: x.descricao, categoria: x.categoria,
            empresa_id: x.empresa_id, valor: x.valor, quitado: false, recorrente: true, observacoes: x.observacoes || null,
          });
        }
        aviso(novos.length + ' lançamento(s) copiado(s).');
        ctx.rotear();
      } catch (e) { aviso(e.message, true); }
    });

    vista.querySelectorAll('[data-novo]').forEach(function (b) {
      b.addEventListener('click', function () { janela({ tipo: b.dataset.novo, competencia: comp, data: null, quitado: false, recorrente: b.dataset.novo === 'receita' }); });
    });
    vista.querySelectorAll('[data-editar]').forEach(function (b) {
      b.addEventListener('click', function () { janela(todos.find(function (x) { return x.id === b.dataset.editar; })); });
    });
    vista.querySelectorAll('[data-quitar]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var x = todos.find(function (y) { return y.id === b.dataset.quitar; });
        try { await DB.atualizar('financeiro', x.id, { quitado: !x.quitado }); ctx.rotear(); } catch (e) { aviso(e.message, true); }
      });
    });
    vista.querySelectorAll('[data-excluir]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var x = todos.find(function (y) { return y.id === b.dataset.excluir; });
        if (!confirm('Excluir "' + x.descricao + '" (' + brl(+x.valor || 0) + ')?')) return;
        try { await DB.excluir('financeiro', x.id); aviso('Lançamento excluído.'); ctx.rotear(); } catch (e) { aviso(e.message, true); }
      });
    });

    function numBR(v) {
      var s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
      if (!s) return NaN;
      if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
      else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      return parseFloat(s);
    }

    function janela(x) {
      var receita = x.tipo === 'receita';
      var cats = receita ? CAT_RECEITA : CAT_DESPESA;
      var dlg = document.createElement('dialog');
      dlg.className = 'janela';
      dlg.innerHTML = '<form method="dialog" class="form-sistema" novalidate>' +
        '<div class="janela-topo"><div><h2>' + (x.id ? 'Editar ' : 'Nova ') + (receita ? 'receita' : 'despesa') + '</h2><p>' + esc(nomeMes(x.competencia)) + '</p></div>' +
        '<button type="button" class="janela-fechar" aria-label="Fechar">×</button></div>' +
        '<div class="campos janela-campos">' +
        '<div class="campo dois"><label for="fl-desc">Descrição *</label><input type="text" id="fl-desc" name="descricao" value="' + esc(x.descricao || '') + '" placeholder="' + (receita ? 'Ex.: Honorários – Empresa X' : 'Ex.: Aluguel da sala') + '"><div class="erro-campo"></div></div>' +
        '<div class="campo"><label for="fl-cat">Categoria</label><select id="fl-cat" name="categoria">' +
        Object.keys(cats).map(function (k) { return '<option value="' + k + '"' + (x.categoria === k ? ' selected' : '') + '>' + esc(cats[k]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="campo"><label for="fl-valor">Valor (R$) *</label><input type="text" id="fl-valor" name="valor" inputmode="decimal" value="' +
        (x.valor ? (+x.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '') + '"><div class="erro-campo"></div></div>' +
        (receita ? '<div class="campo dois"><label for="fl-emp">Cliente</label><select id="fl-emp" name="empresa_id"><option value="">Nenhum</option>' +
          empresas.map(function (e) { return '<option value="' + esc(e.id) + '"' + (x.empresa_id === e.id ? ' selected' : '') + '>' + esc(ctx.nomeEmpresa(e)) + '</option>'; }).join('') + '</select></div>' : '') +
        '<div class="campo"><label for="fl-comp">Mês de referência</label><input type="month" id="fl-comp" name="competencia" value="' + esc(x.competencia) + '"></div>' +
        '<div class="campo"><label for="fl-data">' + (receita ? 'Data do recebimento' : 'Data do pagamento') + '</label><input type="date" id="fl-data" name="data" value="' + esc(x.data || '') + '"></div>' +
        '<label class="fin-check"><input type="checkbox" name="quitado"' + (x.quitado ? ' checked' : '') + '> ' + (receita ? 'Já recebido' : 'Já pago') + '</label>' +
        '<label class="fin-check"><input type="checkbox" name="recorrente"' + (x.recorrente ? ' checked' : '') + '> Fixo mensal (copiar para o próximo mês)</label>' +
        '<div class="campo inteiro"><label for="fl-obs">Observações</label><textarea id="fl-obs" name="observacoes" rows="2">' + esc(x.observacoes || '') + '</textarea></div>' +
        '</div>' +
        '<div class="acoes"><button type="submit" class="botao">Salvar</button><button type="button" class="botao botao-secundario janela-cancelar">Cancelar</button></div></form>';
      document.body.appendChild(dlg);
      var form = dlg.querySelector('form');
      function fechar() { dlg.close(); dlg.remove(); }
      dlg.querySelector('.janela-fechar').addEventListener('click', fechar);
      dlg.querySelector('.janela-cancelar').addEventListener('click', fechar);
      dlg.addEventListener('cancel', function () { setTimeout(function () { dlg.remove(); }, 0); });
      form.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        form.querySelectorAll('.invalido').forEach(function (c) { c.classList.remove('invalido'); });
        var desc = form.descricao.value.trim();
        var valor = numBR(form.valor.value);
        var erro = null;
        if (!desc) { erro = form.descricao; erro.closest('.campo').classList.add('invalido'); erro.closest('.campo').querySelector('.erro-campo').textContent = 'Informe a descrição.'; }
        if (!(valor > 0)) { var c = form.valor.closest('.campo'); c.classList.add('invalido'); c.querySelector('.erro-campo').textContent = 'Informe um valor maior que zero.'; erro = erro || form.valor; }
        if (erro) { erro.focus(); return; }
        var dados = {
          tipo: x.tipo, descricao: desc, categoria: form.categoria.value, valor: Math.round(valor * 100) / 100,
          competencia: /^\d{4}-\d{2}$/.test(form.competencia.value) ? form.competencia.value : x.competencia,
          data: form.data.value || null, quitado: form.quitado.checked, recorrente: form.recorrente.checked,
          empresa_id: receita ? form.empresa_id.value || null : null, observacoes: form.observacoes.value.trim() || null,
        };
        try {
          if (x.id) await DB.atualizar('financeiro', x.id, dados); else await DB.inserir('financeiro', dados);
          fechar();
          aviso((receita ? 'Receita' : 'Despesa') + ' salva.');
          ctx.rotear();
        } catch (e) { aviso(e.message, true); }
      });
      dlg.showModal();
      form.descricao.focus();
    }
  };
})();
