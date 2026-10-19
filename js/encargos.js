/*
 * Regras de cálculo de encargos, provisões, benefícios e honorários.
 * Funções puras: funcionam no navegador (window.KeyGestCalc) e no Node (testes).
 */
(function (root) {
  'use strict';

  var REGIMES = {
    normal: {
      nome: 'Lucro Presumido ou Lucro Real',
      inss: true,
      rat: true,
      terceiros: true,
    },
    simples: {
      nome: 'Simples Nacional (Anexos I, II, III e V)',
      inss: false,
      rat: false,
      terceiros: false,
    },
    'simples-iv': {
      nome: 'Simples Nacional – Anexo IV',
      inss: true,
      rat: true,
      terceiros: false,
    },
    mei: {
      nome: 'MEI (até 1 empregado)',
      inss: false,
      rat: false,
      terceiros: false,
      mei: true,
    },
  };

  function num(v, padrao) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : padrao || 0;
  }

  // Alíquotas aplicadas sobre a remuneração conforme o regime tributário.
  function aliquotas(op, p) {
    var r = REGIMES[op.regime] || REGIMES.normal;
    var fgts = p.fgts;
    return {
      inss: r.mei ? p.meiCpp : r.inss ? p.inssPatronal : 0,
      rat: r.rat ? num(op.rat, p.ratPadrao) * num(op.fap, p.fapPadrao) : 0,
      terceiros: r.terceiros ? num(op.terceiros, p.terceirosPadrao) : 0,
      fgts: fgts,
      multaFgts: op.incluirMultaFgts ? fgts * p.multaFgts : 0,
    };
  }

  function somaPagos(a) {
    return a.inss + a.rat + a.terceiros + a.fgts;
  }

  /*
   * Custo mensal médio de um funcionário.
   * O salário das férias já está nos 12 salários do ano; por isso a provisão
   * mensal considera 1/12 de 13º e 1/12 do adicional de 1/3 de férias.
   */
  function custoFuncionario(op, p) {
    var remuneracao = num(op.salario) + num(op.adicionais);
    var a = aliquotas(op, p);
    var prov13 = remuneracao / 12;
    var provTerco = remuneracao / 36;
    var base = remuneracao + prov13 + provTerco;

    var r = {
      remuneracao: remuneracao,
      prov13: prov13,
      provTerco: provTerco,
      fgts: base * a.fgts,
      inss: base * a.inss,
      rat: base * a.rat,
      terceiros: base * a.terceiros,
      multaFgts: base * a.multaFgts,
      aliquotas: a,
    };
    r.encargos = r.fgts + r.inss + r.rat + r.terceiros + r.multaFgts;
    r.encargosSobreSalario = remuneracao * (somaPagos(a) + a.multaFgts);
    r.provisoes = prov13 + provTerco + (r.encargos - r.encargosSobreSalario);
    r.total = base + r.encargos;
    r.fator = remuneracao > 0 ? r.total / remuneracao : 0;
    r.anual = r.total * 12;
    return r;
  }

  // 13º e férias proporcionais aos meses trabalhados (avos), com encargos.
  function valoresPeriodo(op, p) {
    var remuneracao = num(op.salario) + num(op.adicionais);
    var meses = Math.min(12, Math.max(0, Math.round(num(op.meses, 12))));
    var a = aliquotas(op, p);
    var taxaEnc = somaPagos(a);

    var decimo = (remuneracao * meses) / 12;
    var ferias = (remuneracao * meses) / 12;
    var terco = ferias / 3;
    return {
      meses: meses,
      decimo: decimo,
      decimo1Parcela: decimo / 2,
      decimoEncargos: decimo * taxaEnc,
      decimoFgts: decimo * a.fgts,
      ferias: ferias,
      terco: terco,
      feriasTotal: ferias + terco,
      feriasEncargos: (ferias + terco) * taxaEnc,
      feriasFgts: (ferias + terco) * a.fgts,
      taxaEncargos: taxaEnc,
    };
  }

  // Custo de benefícios para a empresa (VT já descontado em até 6% do salário).
  function custoBeneficios(op, p) {
    var salario = num(op.salario);
    var vt = num(op.vt);
    var vtEmpresa = vt > 0 ? Math.max(0, vt - salario * p.descontoMaxVt) : 0;
    var vr = num(op.vr);
    var saude = num(op.saude);
    var outros = num(op.outros);
    return {
      vtEmpresa: vtEmpresa,
      vr: vr,
      saude: saude,
      outros: outros,
      total: vtEmpresa + vr + saude + outros,
    };
  }

  function precoPorFuncionario(h, n) {
    for (var i = 0; i < h.faixas.length; i++) {
      if (n <= h.faixas[i].ate) return h.faixas[i].porFuncionario;
    }
    return h.faixas[h.faixas.length - 1].porFuncionario;
  }

  function honorarios(h, funcionarios, selecionados) {
    var n = Math.max(0, Math.round(num(funcionarios)));
    var unit = precoPorFuncionario(h, Math.max(1, n));
    var baseCalc = unit * n;
    var base = Math.max(h.minimoMensal, baseCalc);
    var itens = [];
    var sobConsulta = [];
    var total = 0;

    h.servicos.forEach(function (s) {
      var ativo = s.obrigatorio || selecionados.indexOf(s.id) !== -1;
      if (!ativo) return;
      var valor = 0;
      var detalhe = '';
      if (s.tipo === 'base') {
        valor = base;
        detalhe =
          baseCalc < h.minimoMensal
            ? 'Mensalidade mínima'
            : n + ' × ' + formatarBRL(unit);
      } else if (s.tipo === 'porFuncionario') {
        valor = s.valor * n;
        detalhe = n + ' × ' + formatarBRL(s.valor);
      } else if (s.tipo === 'fixo') {
        valor = s.valor;
        detalhe = 'Valor mensal fixo';
      } else {
        sobConsulta.push(s.nome);
        return;
      }
      total += valor;
      itens.push({ id: s.id, nome: s.nome, detalhe: detalhe, valor: valor });
    });

    return { itens: itens, sobConsulta: sobConsulta, total: total, porFuncionario: unit };
  }

  function formatarBRL(v) {
    return num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarPct(v, casas) {
    return (
      (num(v) * 100).toLocaleString('pt-BR', {
        minimumFractionDigits: casas == null ? 1 : casas,
        maximumFractionDigits: casas == null ? 2 : casas,
      }) + '%'
    );
  }

  /*
   * Valida CNPJ numérico e o novo CNPJ alfanumérico (a partir de julho/2026):
   * 12 caracteres [0-9A-Z] + 2 dígitos verificadores numéricos.
   */
  function validarCNPJ(valor) {
    var c = String(valor || '')
      .toUpperCase()
      .replace(/[.\/\-\s]/g, '');
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
    if (/^(\w)\1{13}$/.test(c)) return false;

    function dv(trecho) {
      var pesos = trecho.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var soma = 0;
      for (var i = 0; i < trecho.length; i++) {
        soma += (trecho.charCodeAt(i) - 48) * pesos[i];
      }
      var resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    }

    var d1 = dv(c.slice(0, 12));
    var d2 = dv(c.slice(0, 12) + d1);
    return c.slice(12) === String(d1) + String(d2);
  }

  var api = {
    REGIMES: REGIMES,
    aliquotas: aliquotas,
    custoFuncionario: custoFuncionario,
    valoresPeriodo: valoresPeriodo,
    custoBeneficios: custoBeneficios,
    honorarios: honorarios,
    formatarBRL: formatarBRL,
    formatarPct: formatarPct,
    validarCNPJ: validarCNPJ,
    num: num,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KeyGestCalc = api;
})(typeof window !== 'undefined' ? window : this);
