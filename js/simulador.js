/* Simulador de encargos e provisões. */
(function () {
  'use strict';

  var C = window.KeyGestCalc;
  var p = window.KEYGEST_CONFIG.parametros;
  var brl = C.formatarBRL;
  var pct = C.formatarPct;

  var form = document.getElementById('form-sim');
  var saida = document.getElementById('resultado');
  var nota = document.getElementById('nota-regime');

  for (var m = 12; m >= 1; m--) {
    var o = document.createElement('option');
    o.value = m;
    o.textContent = m === 12 ? '12 meses (ano completo)' : m + (m === 1 ? ' mês' : ' meses');
    form.meses.appendChild(o);
  }

  // Preenche a partir do link (ex.: vindo do sistema de colaboradores).
  var url = new URLSearchParams(window.location.search);
  ['salario', 'adicionais', 'quantidade', 'meses', 'regime', 'rat', 'fap', 'terceiros'].forEach(function (k) {
    var v = url.get(k);
    if (v == null || !form[k]) return;
    if (form[k].tagName === 'SELECT' && !form[k].querySelector('option[value="' + CSS.escape(v) + '"]')) return;
    form[k].value = v;
  });

  var NOTAS = {
    normal: 'Lucro Presumido/Real: INSS patronal de 20%, RAT × FAP, terceiros e FGTS de 8%.',
    simples: 'Simples Nacional (Anexos I, II, III e V): a contribuição patronal está incluída no DAS. A empresa recolhe à parte apenas o FGTS de 8%.',
    'simples-iv': 'Simples Nacional – Anexo IV: a empresa recolhe INSS patronal de 20% e RAT × FAP fora do DAS, além do FGTS. Não há contribuição a terceiros.',
    mei: 'MEI: contribuição patronal de 3% sobre o salário do empregado e FGTS de 8%. O MEI pode ter apenas 1 empregado.',
    domestico: 'Empregador doméstico: guia única (DAE do eSocial Doméstico) com INSS do empregador de 8%, GILRAT de 0,8%, FGTS de 8% e indenização compensatória de 3,2%, que substitui a multa de 40% do FGTS.',
  };

  function linha(rotulo, valor, detalhe, classe) {
    return '<tr' + (classe ? ' class="' + classe + '"' : '') + '><td>' + rotulo +
      (detalhe ? '<small>' + detalhe + '</small>' : '') + '</td><td>' + valor + '</td></tr>';
  }

  function calcular() {
    var regime = form.regime.value;
    var dom = regime === 'domestico';
    var semRat = regime === 'simples' || regime === 'mei' || dom;
    var semTerceiros = regime !== 'normal';
    form.rat.disabled = semRat;
    form.fap.disabled = semRat;
    form.terceiros.disabled = semTerceiros;
    form.multa.disabled = dom;
    nota.textContent = NOTAS[regime];

    var op = {
      salario: Math.max(0, C.num(form.salario.value)),
      adicionais: Math.max(0, C.num(form.adicionais.value)),
      regime: regime,
      rat: C.num(form.rat.value, p.ratPadrao),
      fap: Math.min(2, Math.max(0.5, C.num(form.fap.value, p.fapPadrao))),
      terceiros: C.num(form.terceiros.value, p.terceirosPadrao * 100) / 100,
      incluirMultaFgts: form.multa.checked,
      meses: C.num(form.meses.value, 12),
    };
    var qtd = Math.max(1, Math.round(C.num(form.quantidade.value, 1)));

    if (!op.salario) {
      saida.innerHTML = '<h2>Resultado</h2><p class="ajuda">Informe o salário para ver a simulação.</p>';
      return;
    }

    var r = C.custoFuncionario(op, p);
    var v = C.valoresPeriodo(op, p);
    var a = r.aliquotas;
    var x = function (valor) { return brl(valor * qtd); };
    var sufixo = qtd > 1 ? ' (' + qtd + ' funcionários)' : '';

    var html = '';
    html += '<div class="destaque"><span class="rotulo">Custo mensal médio' + (qtd > 1 ? ' total' : ' por funcionário') + '</span>' +
      '<span class="valor">' + x(r.total) + '</span>' +
      '<span class="sub">' + x(r.anual) + ' por ano · ' +
      r.fator.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '× a remuneração</span></div>';

    html += '<div class="mini-numeros">' +
      '<div><span>Reserva mensal (provisões)</span><strong>' + x(r.provisoes) + '</strong></div>' +
      '<div><span>Encargos mensais sobre salário</span><strong>' + x(r.encargosSobreSalario) + '</strong></div>' +
      '</div>';

    if (op.salario < p.salarioMinimo) {
      html += '<p class="aviso">Salário abaixo do mínimo nacional de ' + p.ano + ' (' + brl(p.salarioMinimo) + '). Confira se a jornada é parcial.</p>';
    }

    html += '<table class="tabela"><caption>Composição do custo mensal' + sufixo + '</caption><tbody>';
    html += linha('Remuneração', x(r.remuneracao), op.adicionais ? 'Salário + adicionais' : '');
    html += linha('Provisão de 13º salário', x(r.prov13), '1/12 da remuneração');
    html += linha('Provisão de 1/3 de férias', x(r.provTerco), '1/36 da remuneração');
    html += linha('FGTS', x(r.fgts), pct(a.fgts, 0));
    if (a.inss) html += linha(regime === 'mei' ? 'INSS patronal (MEI)' : a.domestico ? 'INSS do empregador doméstico' : 'INSS patronal', x(r.inss), pct(a.inss, 0));
    if (a.rat) html += linha(a.domestico ? 'GILRAT (seguro contra acidentes)' : 'RAT × FAP', x(r.rat), pct(a.rat, a.domestico ? 1 : 2));
    if (a.indenizacao) html += linha('Indenização compensatória', x(r.indenizacao), pct(a.indenizacao, 1) + ' – substitui a multa de 40% do FGTS');
    if (a.terceiros) html += linha('Terceiros', x(r.terceiros), pct(a.terceiros, 1));
    if (a.multaFgts) html += linha('Provisão multa do FGTS', x(r.multaFgts), '40% do FGTS');
    html += linha('Total mensal', x(r.total), '', 'total');
    html += '</tbody></table>';

    var periodo = v.meses === 12 ? 'ano completo' : v.meses + '/12 avos';
    html += '<table class="tabela"><caption>13º salário (' + periodo + ')' + sufixo + '</caption><tbody>';
    html += linha('Valor bruto do 13º', x(v.decimo));
    html += linha('1ª parcela', x(v.decimo1Parcela), 'Até 30 de novembro, sem descontos');
    html += linha('2ª parcela (bruta)', x(v.decimo - v.decimo1Parcela), 'Até 20 de dezembro, com INSS e IRRF do funcionário');
    html += linha('Encargos da empresa', x(v.decimoEncargos), 'FGTS ' + x(v.decimoFgts) + (v.decimoEncargos > v.decimoFgts ? ' + contribuições patronais' : ''));
    html += linha('Custo total do 13º', x(v.decimo + v.decimoEncargos), '', 'total');
    html += '</tbody></table>';

    html += '<table class="tabela"><caption>Férias com 1/3 (' + periodo + ')' + sufixo + '</caption><tbody>';
    html += linha('Férias', x(v.ferias), v.meses === 12 ? '30 dias' : Math.round(v.meses * 2.5) + ' dias proporcionais');
    html += linha('Adicional de 1/3', x(v.terco));
    html += linha('Férias + 1/3', x(v.feriasTotal), '', 'sub-total');
    html += linha('Encargos da empresa', x(v.feriasEncargos), 'FGTS ' + x(v.feriasFgts) + (v.feriasEncargos > v.feriasFgts ? ' + contribuições patronais' : ''));
    html += linha('Custo total das férias', x(v.feriasTotal + v.feriasEncargos), '', 'total');
    html += '</tbody></table>';

    html += '<p class="aviso">Estimativa com base em regras gerais de ' + p.ano + '. Não substitui o cálculo oficial da folha.</p>';
    html += '<a class="botao" href="contato.html?origem=simulador" id="pedir" style="width:100%">Quero que a KeyGest cuide disso</a>';
    saida.innerHTML = html;

    document.getElementById('pedir').addEventListener('click', function () {
      window.KG.guardar('keygest-estimativa', {
        origem: 'simulador',
        funcionarios: qtd,
        resumo:
          'Estimativa do simulador de encargos\n' +
          'Regime: ' + C.REGIMES[regime].nome + '\n' +
          'Funcionários: ' + qtd + ' com remuneração de ' + brl(r.remuneracao) + '\n' +
          'Custo mensal médio: ' + x(r.total) + '\n' +
          'Provisões mensais: ' + x(r.provisoes),
      });
    });
  }

  form.addEventListener('input', calcular);
  form.addEventListener('change', calcular);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  calcular();
})();
