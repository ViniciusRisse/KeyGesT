/*
 * Folha do mês: planilha editável (estilo Excel) com cálculo automático de
 * INSS, IRRF, vale-transporte (6%), líquido, FGTS e custo para a empresa.
 * Salva sozinho a cada alteração.
 */
(function () {
  'use strict';

  var C = window.KeyGestCalc;
  var P = window.KEYGEST_CONFIG.parametros;
  var brl = C.formatarBRL;

  // Colunas editáveis (mesma ordem da tela)
  var ENTRADAS = [
    { k: 'salario', t: 'Salário base', dica: 'Salário mensal do colaborador' },
    { k: 'faltas', t: 'Faltas (dias)', dica: 'Dias de falta sem justificativa' },
    { k: 'he50', t: 'HE 50% (h)', dica: 'Horas extras em dias úteis' },
    { k: 'he100', t: 'HE 100% (h)', dica: 'Horas extras em domingos e feriados' },
    { k: 'adicionais', t: 'Outros proventos', dica: 'Comissões, bônus, adicional noturno, insalubridade' },
    { k: 'vt', t: 'Vale-transporte (mês)', dica: 'Valor total das passagens do mês' },
    { k: 'desc_vr', t: 'Desc. VR/VA', dica: 'Parte do vale-refeição/alimentação paga pelo colaborador' },
    { k: 'outros_descontos', t: 'Outros descontos', dica: 'Adiantamento, plano de saúde, empréstimo etc.' },
  ];

  // Colunas calculadas
  var SAIDAS = [
    { k: 'bruto', t: 'Total bruto' },
    { k: 'inss', t: 'INSS' },
    { k: 'irrf', t: 'IRRF' },
    { k: 'descVt', t: 'Desc. VT (6%)' },
    { k: 'liquido', t: 'Líquido', destaque: true },
    { k: 'fgts', t: 'FGTS (8%)' },
    { k: 'custo', t: 'Custo empresa' },
  ];

  function numBR(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 2.200 = dois mil e duzentos
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function fmtNum(v, inteiro) {
    if (!v) return '';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 });
  }

  function competenciaAtual() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function competenciaAnterior(c) {
    var p = c.split('-');
    var d = new Date(+p[0], +p[1] - 2, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function nomeMes(c) {
    var p = c.split('-');
    var t = new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  var estado = { empresa: '', competencia: competenciaAtual() };

  window.TelaFolha = async function (ctx, query) {
    var DB = ctx.DB, vista = ctx.vista, esc = ctx.esc, aviso = ctx.aviso;
    if (query.empresa) estado.empresa = query.empresa;
    if (query.competencia && /^\d{4}-\d{2}$/.test(query.competencia)) estado.competencia = query.competencia;

    var empresas = (await DB.listar('empresas')).sort(ctx.porNome('razao_social'));
    if (!empresas.length) {
      vista.innerHTML = '<div class="painel vazio">Cadastre uma empresa e seus colaboradores para lançar a folha.<br>' +
        '<a class="botao" style="margin-top:14px" href="#/empresas/nova">Cadastrar empresa</a></div>';
      return;
    }
    if (!empresas.some(function (e) { return e.id === estado.empresa; })) estado.empresa = empresas[0].id;
    var emp = empresas.find(function (e) { return e.id === estado.empresa; });
    var comp = estado.competencia;
    var inicioMes = comp + '-01';

    var r = await Promise.all([
      DB.listar('colaboradores', { empresa_id: emp.id }),
      DB.listar('folha', { empresa_id: emp.id, competencia: comp }),
      DB.listar('folha', { empresa_id: emp.id, competencia: competenciaAnterior(comp) }),
    ]);
    var cols = r[0].filter(function (c) {
      if (c.data_admissao && c.data_admissao.slice(0, 7) > comp) return false;
      return c.status !== 'desligado' || (c.data_desligamento && c.data_desligamento >= inicioMes);
    }).sort(ctx.porNome('nome'));
    var lancados = {}, anteriores = {};
    r[1].forEach(function (f) { lancados[f.colaborador_id] = f; });
    r[2].forEach(function (f) { anteriores[f.colaborador_id] = f; });

    // Uma linha por colaborador. Mês novo: traz salário do cadastro e os
    // valores fixos (VT, VR, outros descontos) do mês anterior.
    var linhas = cols.map(function (c) {
      var l = lancados[c.id];
      var ant = anteriores[c.id] || {};
      var v = {};
      ENTRADAS.forEach(function (e) {
        if (l) v[e.k] = +l[e.k] || 0;
        else if (e.k === 'salario') v[e.k] = +c.salario || 0;
        else if (e.k === 'vt' || e.k === 'desc_vr' || e.k === 'outros_descontos') v[e.k] = +ant[e.k] || 0;
        else v[e.k] = 0;
      });
      return { col: c, id: l ? l.id : null, v: v, salvo: !!l, calc: null, fila: null, repetir: false };
    });

    vista.innerHTML =
      '<div class="topo-vista"><div><h1>Folha do mês</h1><p>Preencha como numa planilha: os cálculos e o salvamento são automáticos.</p></div>' +
      '<div class="acoes"><button type="button" class="botao botao-secundario" id="fl-exportar">Exportar planilha</button>' +
      '<button type="button" class="botao botao-secundario" id="fl-imprimir">Imprimir</button></div></div>' +
      '<div class="filtros filtros-folha">' +
      '<select id="fl-empresa" aria-label="Empresa">' + empresas.map(function (e) {
        return '<option value="' + esc(e.id) + '"' + (e.id === emp.id ? ' selected' : '') + '>' + esc(ctx.nomeEmpresa(e)) + '</option>';
      }).join('') + '</select>' +
      '<input type="month" id="fl-comp" aria-label="Competência" value="' + esc(comp) + '">' +
      '<span class="status-salvo" id="fl-status"></span></div>' +
      '<p class="so-impressao"><strong>' + esc(emp.razao_social) + '</strong>' + (emp.cnpj ? ' · CNPJ ' + esc(emp.cnpj) : '') + ' · Competência: ' + esc(nomeMes(comp)) + '</p>' +
      (linhas.length
        ? '<div class="indicadores resumo-folha">' +
          '<div class="indicador"><span>Total bruto</span><strong data-r="bruto"></strong></div>' +
          '<div class="indicador"><span>Total de descontos</span><strong data-r="descontos"></strong></div>' +
          '<div class="indicador forte"><span>Líquido a pagar</span><strong data-r="liquido"></strong></div>' +
          '<div class="indicador"><span>FGTS a recolher</span><strong data-r="fgts"></strong></div>' +
          '<div class="indicador"><span>Custo total da empresa</span><strong data-r="custo"></strong></div>' +
          '</div>' +
          '<div class="planilha-caixa"><table class="planilha" id="planilha"><thead><tr><th class="fixa">Colaborador</th>' +
          ENTRADAS.map(function (e) { return '<th title="' + esc(e.dica) + '">' + esc(e.t) + '</th>'; }).join('') +
          SAIDAS.map(function (s) { return '<th class="calc' + (s.destaque ? ' forte' : '') + '">' + esc(s.t) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          linhas.map(function (l, i) {
            return '<tr data-i="' + i + '"><th class="fixa" scope="row"><a href="#/colaboradores/' + esc(l.col.id) + '">' + esc(l.col.nome) + '</a>' +
              '<small>' + esc(l.col.cargo || '') + (l.col.dependentes ? ' · ' + l.col.dependentes + ' dep.' : '') + '</small></th>' +
              ENTRADAS.map(function (e, j) {
                var inteiro = e.k === 'faltas' || e.k === 'he50' || e.k === 'he100';
                return '<td><input class="celula" inputmode="decimal" autocomplete="off" data-l="' + i + '" data-c="' + j + '" ' +
                  'aria-label="' + esc(e.t + ' de ' + l.col.nome) + '" value="' + esc(fmtNum(l.v[e.k], inteiro)) + '"></td>';
              }).join('') +
              SAIDAS.map(function (s) { return '<td class="calc' + (s.destaque ? ' forte' : '') + '" data-s="' + s.k + '"></td>'; }).join('') +
              '</tr>';
          }).join('') +
          '</tbody><tfoot><tr><th class="fixa">Totais (' + linhas.length + ')</th>' +
          ENTRADAS.map(function (e) { return '<td data-t="' + e.k + '"></td>'; }).join('') +
          SAIDAS.map(function (s) { return '<td class="calc' + (s.destaque ? ' forte' : '') + '" data-t="' + s.k + '"></td>'; }).join('') +
          '</tr></tfoot></table></div>' +
          '<p class="aviso" style="margin-top:16px"><strong>Dicas:</strong> use Enter ou as setas ↑ ↓ ← → para andar entre as células, como no Excel. ' +
          'Você pode copiar várias células do Excel e colar aqui de uma vez. ' +
          'O desconto do vale-transporte é de até 6% do salário base (se as passagens custarem menos, desconta só o valor delas). ' +
          'Hora extra calculada sobre ' + 'a jornada do cadastro; DSR sobre horas extras e médias não estão incluídos. INSS e IRRF pelas tabelas de ' + P.ano + '.</p>'
        : '<div class="painel vazio">Nenhum colaborador ativo nesta empresa em ' + esc(nomeMes(comp)) + '.<br>' +
          '<a class="botao" style="margin-top:14px" href="#/colaboradores/novo?empresa=' + esc(emp.id) + '">Cadastrar colaborador</a></div>');

    function irPara(empresa, competencia) {
      location.hash = '#/folha?empresa=' + encodeURIComponent(empresa) + '&competencia=' + encodeURIComponent(competencia);
    }
    document.getElementById('fl-empresa').addEventListener('change', function () { irPara(this.value, comp); });
    document.getElementById('fl-comp').addEventListener('change', function () {
      if (/^\d{4}-\d{2}$/.test(this.value)) irPara(emp.id, this.value);
    });
    document.getElementById('fl-imprimir').addEventListener('click', function () { window.print(); });

    if (!linhas.length) {
      document.getElementById('fl-exportar').disabled = true;
      return;
    }

    var tabela = document.getElementById('planilha');
    var status = document.getElementById('fl-status');
    var pendentes = 0;

    function mostrarStatus() {
      var naoSalvas = linhas.filter(function (l) { return !l.salvo; }).length;
      if (pendentes) status.textContent = 'Salvando...';
      else if (naoSalvas === linhas.length) status.textContent = 'Mês ainda não lançado — os valores serão salvos ao editar.';
      else status.textContent = '✓ Salvo';
    }

    function calcular(i) {
      var l = linhas[i];
      l.calc = C.linhaFolha({
        salario: l.v.salario, jornada: l.col.jornada_semanal, dependentes: l.col.dependentes,
        faltas: l.v.faltas, he50: l.v.he50, he100: l.v.he100, adicionais: l.v.adicionais,
        vt: l.v.vt, descVr: l.v.desc_vr, outrosDescontos: l.v.outros_descontos,
      }, emp, P);
      var tr = tabela.querySelector('tr[data-i="' + i + '"]');
      SAIDAS.forEach(function (s) {
        tr.querySelector('[data-s="' + s.k + '"]').textContent = brl(l.calc[s.k]);
      });
      tr.classList.toggle('negativo', l.calc.liquido < 0);
    }

    function totais() {
      ENTRADAS.forEach(function (e) {
        var soma = linhas.reduce(function (s, l) { return s + l.v[e.k]; }, 0);
        var inteiro = e.k === 'faltas' || e.k === 'he50' || e.k === 'he100';
        tabela.querySelector('tfoot [data-t="' + e.k + '"]').textContent = inteiro ? fmtNum(soma, true) : brl(soma);
      });
      SAIDAS.forEach(function (s) {
        var soma = linhas.reduce(function (t, l) { return t + l.calc[s.k]; }, 0);
        tabela.querySelector('tfoot [data-t="' + s.k + '"]').textContent = brl(soma);
      });
      ['bruto', 'descontos', 'liquido', 'fgts', 'custo'].forEach(function (k) {
        var soma = linhas.reduce(function (t, l) { return t + l.calc[k]; }, 0);
        vista.querySelector('[data-r="' + k + '"]').textContent = brl(soma);
      });
    }

    function registro(l) {
      var o = { colaborador_id: l.col.id, empresa_id: emp.id, competencia: comp };
      ENTRADAS.forEach(function (e) { o[e.k] = Math.round(l.v[e.k] * 100) / 100; });
      o.bruto = l.calc.bruto; o.inss = l.calc.inss; o.irrf = l.calc.irrf; o.desc_vt = l.calc.descVt;
      o.liquido = l.calc.liquido; o.fgts = l.calc.fgts; o.custo = l.calc.custo;
      return o;
    }

    // Salva uma linha por vez (evita gravações duplicadas)
    function salvar(l) {
      if (l.fila) { l.repetir = true; return; }
      pendentes++;
      mostrarStatus();
      var dados = registro(l);
      l.fila = (l.id ? DB.atualizar('folha', l.id, dados) : DB.inserir('folha', dados))
        .then(function (salvo) { l.id = salvo.id; l.salvo = true; })
        .catch(function (e) { aviso('Não foi possível salvar: ' + e.message, true); })
        .then(function () {
          l.fila = null;
          pendentes--;
          mostrarStatus();
          if (l.repetir) { l.repetir = false; salvar(l); }
        });
    }

    var timers = {};
    function alterado(i) {
      calcular(i);
      totais();
      clearTimeout(timers[i]);
      status.textContent = 'Alterações não salvas...';
      timers[i] = setTimeout(function () { salvar(linhas[i]); }, 600);
    }

    function celula(l, c) {
      return tabela.querySelector('input[data-l="' + l + '"][data-c="' + c + '"]');
    }

    tabela.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el.classList.contains('celula')) return;
      var i = +el.dataset.l;
      linhas[i].v[ENTRADAS[+el.dataset.c].k] = Math.max(0, numBR(el.value));
      alterado(i);
    });

    // Formata o número ao sair da célula
    tabela.addEventListener('focusout', function (ev) {
      var el = ev.target;
      if (!el.classList.contains('celula')) return;
      var e = ENTRADAS[+el.dataset.c];
      el.value = fmtNum(linhas[+el.dataset.l].v[e.k], e.k === 'faltas' || e.k === 'he50' || e.k === 'he100');
    });

    tabela.addEventListener('focusin', function (ev) {
      if (ev.target.classList.contains('celula')) ev.target.select();
    });

    // Navegação estilo Excel
    tabela.addEventListener('keydown', function (ev) {
      var el = ev.target;
      if (!el.classList.contains('celula')) return;
      var l = +el.dataset.l, c = +el.dataset.c, alvo = null;
      var inicio = el.selectionStart === 0 && el.selectionEnd === 0;
      var fim = el.selectionStart === el.value.length;
      var tudo = el.selectionStart === 0 && el.selectionEnd === el.value.length;
      if (ev.key === 'Enter' || ev.key === 'ArrowDown') alvo = celula(ev.shiftKey && ev.key === 'Enter' ? l - 1 : l + 1, c);
      else if (ev.key === 'ArrowUp') alvo = celula(l - 1, c);
      else if (ev.key === 'ArrowRight' && (fim || tudo)) alvo = celula(l, c + 1);
      else if (ev.key === 'ArrowLeft' && (inicio || tudo)) alvo = celula(l, c - 1);
      if (ev.key === 'Enter' || alvo) ev.preventDefault();
      if (alvo) alvo.focus();
    });

    // Colar várias células copiadas do Excel
    tabela.addEventListener('paste', function (ev) {
      var el = ev.target;
      if (!el.classList.contains('celula')) return;
      var texto = (ev.clipboardData || window.clipboardData).getData('text');
      if (!/[\t\n]/.test(texto.trim())) return;
      ev.preventDefault();
      var l0 = +el.dataset.l, c0 = +el.dataset.c;
      var mudou = {};
      texto.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach(function (linha, dl) {
        linha.split('\t').forEach(function (valor, dc) {
          var alvo = celula(l0 + dl, c0 + dc);
          if (!alvo) return;
          var i = l0 + dl;
          var e = ENTRADAS[c0 + dc];
          linhas[i].v[e.k] = Math.max(0, numBR(valor));
          alvo.value = fmtNum(linhas[i].v[e.k], e.k === 'faltas' || e.k === 'he50' || e.k === 'he100');
          mudou[i] = true;
        });
      });
      Object.keys(mudou).forEach(function (i) { alterado(+i); });
      aviso('Valores colados.');
    });

    document.getElementById('fl-exportar').addEventListener('click', function () {
      var cab = ['Colaborador', 'CPF'].concat(ENTRADAS.map(function (e) { return e.t; }), SAIDAS.map(function (s) { return s.t; }));
      function cel(v) {
        var s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v == null ? '' : v);
        if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }
      var corpo = linhas.map(function (l) {
        return [l.col.nome, l.col.cpf].concat(
          ENTRADAS.map(function (e) { return l.v[e.k]; }),
          SAIDAS.map(function (s) { return l.calc[s.k]; })
        ).map(cel).join(';');
      });
      var csv = '﻿' + cab.map(cel).join(';') + '\n' + corpo.join('\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'folha-' + (emp.nome_fantasia || emp.razao_social).replace(/[^\w-]+/g, '-').toLowerCase() + '-' + comp + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    linhas.forEach(function (l, i) { calcular(i); });
    totais();
    mostrarStatus();
  };
})();
