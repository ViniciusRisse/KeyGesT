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
    domestico: {
      nome: 'Empregador doméstico (pessoa física)',
      inss: false,
      rat: false,
      terceiros: false,
      domestico: true,
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
    if (r.domestico) {
      // eSocial Doméstico (DAE): INSS do empregador 8%, GILRAT 0,8%, FGTS 8% e
      // indenização compensatória 3,2% (substitui a multa de 40% do FGTS).
      return {
        inss: p.domesticoInss,
        rat: p.domesticoGilrat,
        terceiros: 0,
        fgts: fgts,
        indenizacao: p.domesticoIndenizacao,
        multaFgts: 0,
        domestico: true,
      };
    }
    return {
      inss: r.mei ? p.meiCpp : r.inss ? p.inssPatronal : 0,
      rat: r.rat ? num(op.rat, p.ratPadrao) * num(op.fap, p.fapPadrao) : 0,
      terceiros: r.terceiros ? num(op.terceiros, p.terceirosPadrao) : 0,
      fgts: fgts,
      indenizacao: 0,
      multaFgts: op.incluirMultaFgts ? fgts * p.multaFgts : 0,
    };
  }

  function somaPagos(a) {
    return a.inss + a.rat + a.terceiros + a.fgts + (a.indenizacao || 0);
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
      indenizacao: base * (a.indenizacao || 0),
      multaFgts: base * a.multaFgts,
      aliquotas: a,
    };
    r.encargos = r.fgts + r.inss + r.rat + r.terceiros + r.indenizacao + r.multaFgts;
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

  function arred(v) {
    return Math.round((v + (v >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  }

  // INSS do empregado: progressivo por faixas, limitado ao teto.
  function inssEmpregado(base, p) {
    var total = 0;
    var anterior = 0;
    for (var i = 0; i < p.inssFaixas.length; i++) {
      var f = p.inssFaixas[i];
      if (base <= anterior) break;
      total += (Math.min(base, f.ate) - anterior) * f.aliquota;
      anterior = f.ate;
    }
    return arred(total);
  }

  /*
   * IRRF mensal: usa a dedução mais vantajosa (INSS + dependentes + pensão ou
   * desconto simplificado) e aplica a redução de 2026 para rendimentos até
   * R$ 7.350. op.semSimplificado: não usa o desconto simplificado (13º salário).
   */
  function irrfMensal(bruto, inss, dependentes, p, op) {
    op = op || {};
    function imposto(base) {
      for (var i = 0; i < p.irrfFaixas.length; i++) {
        var f = p.irrfFaixas[i];
        if (base <= f.ate) return Math.max(0, base * f.aliquota - f.deduzir);
      }
      return 0;
    }
    var baseLegal = bruto - inss - num(dependentes) * p.irrfDependente - num(op.pensao);
    var legal = imposto(baseLegal);
    var ir = legal;
    irrfMensal.base = Math.max(0, baseLegal);
    if (!op.semSimplificado) {
      var baseSimples = bruto - p.irrfSimplificado;
      var simples = imposto(baseSimples);
      if (simples < legal) {
        ir = simples;
        irrfMensal.base = Math.max(0, baseSimples);
      }
    }
    var r = p.irrfReducao;
    var reducao = 0;
    if (bruto <= r.isencaoAte) reducao = r.maximo;
    else if (bruto <= r.limite) reducao = Math.max(0, r.a - r.b * bruto);
    ir = arred(Math.max(0, ir - Math.min(ir, reducao)));
    return ir < p.irrfMinimo ? 0 : ir;
  }

  /*
   * Campos de um lançamento da folha (nomes das colunas no banco).
   * tipo: provento ou desconto; un: R$, h (horas) ou d (dias);
   * extra: coluna que fica escondida na planilha até ser usada.
   */
  var CAMPOS_FOLHA = [
    { k: 'salario', t: 'Salário base', tipo: 'provento', un: 'R$', dica: 'Salário mensal do colaborador' },
    { k: 'he50', t: 'HE 50% (h)', tipo: 'provento', un: 'h', dica: 'Horas extras em dias úteis' },
    { k: 'he100', t: 'HE 100% (h)', tipo: 'provento', un: 'h', dica: 'Horas extras em domingos e feriados' },
    { k: 'adicional_noturno', t: 'Adicional noturno', tipo: 'provento', un: 'R$', extra: true, dica: 'Valor do adicional noturno do mês' },
    { k: 'insalubridade', t: 'Insalubridade', tipo: 'provento', un: 'R$', extra: true, dica: 'Adicional insalubridade' },
    { k: 'periculosidade', t: 'Periculosidade', tipo: 'provento', un: 'R$', extra: true, dica: 'Adicional de periculosidade (30% do salário)' },
    { k: 'comissoes', t: 'Comissões', tipo: 'provento', un: 'R$', extra: true, dica: 'Comissões sobre vendas' },
    { k: 'gratificacoes', t: 'Gratificações', tipo: 'provento', un: 'R$', extra: true, dica: 'Gratificações e prêmios' },
    { k: 'dsr', t: 'DSR', tipo: 'provento', un: 'R$', extra: true, dica: 'Descanso semanal remunerado sobre horas extras, comissões e adicionais' },
    { k: 'ferias', t: 'Férias', tipo: 'provento', un: 'R$', extra: true, dica: 'Salário dos dias de férias pagos no mês' },
    { k: 'terco_ferias', t: '1/3 de férias', tipo: 'provento', un: 'R$', extra: true, dica: 'Adicional de 1/3 sobre as férias' },
    { k: 'decimo_terceiro', t: '13º salário', tipo: 'provento', un: 'R$', extra: true, dica: '13º pago no mês (INSS e IRRF calculados em separado)' },
    { k: 'adicionais', t: 'Outros proventos', tipo: 'provento', un: 'R$', dica: 'Bônus e outros valores a receber' },
    { k: 'faltas', t: 'Faltas (dias)', tipo: 'desconto', un: 'd', dica: 'Dias de falta sem justificativa', nota: 'Aceita meio dia: 0,5' },
    { k: 'valor_faltas', t: 'Faltas – valor manual', tipo: 'desconto', un: 'R$', extra: true, dica: 'Valor do desconto de faltas digitado à mão (substitui o cálculo pelos dias)', nota: 'Opcional: preencha só se quiser um valor diferente do calculado pelos dias' },
    { k: 'atrasos', t: 'Atrasos (h)', tipo: 'desconto', un: 'h', extra: true, dica: 'Horas de atraso descontadas' },
    { k: 'vt', t: 'Vale-transporte (mês)', tipo: 'desconto', un: 'R$', dica: 'Valor total das passagens do mês (desconto de até 6% do salário)' },
    { k: 'desc_vr', t: 'Desc. VR/VA', tipo: 'desconto', un: 'R$', dica: 'Parte do vale-refeição/alimentação paga pelo colaborador' },
    { k: 'plano_saude', t: 'Plano de saúde', tipo: 'desconto', un: 'R$', extra: true, dica: 'Plano de saúde ou odontológico' },
    { k: 'adiantamento', t: 'Adiantamento', tipo: 'desconto', un: 'R$', extra: true, dica: 'Adiantamento salarial (vale) já pago' },
    { k: 'pensao', t: 'Pensão alimentícia', tipo: 'desconto', un: 'R$', extra: true, dica: 'Pensão judicial (deduz da base do IRRF)' },
    { k: 'outros_descontos', t: 'Outros descontos', tipo: 'desconto', un: 'R$', dica: 'Empréstimo, convênios e outros' },
  ];

  /*
   * Uma linha da folha do mês.
   * e: campos de CAMPOS_FOLHA + jornada e dependentes do colaborador
   *    (aceita também descVr e outrosDescontos, nomes antigos).
   * emp: empresa (regime, rat, fap, terceiros) para os encargos.
   * Proventos e descontos saem detalhados (com código) para o holerite e o relatório.
   */
  function linhaFolha(e, emp, p) {
    function v(k, antigo) {
      var x = e[k];
      if ((x == null || x === '') && antigo) x = e[antigo];
      return Math.max(0, num(x));
    }
    var salario = v('salario');
    var horasMes = (num(e.jornada) || 44) * 5;
    var valorHora = horasMes ? salario / horasMes : 0;
    var proventos = [], descontos = [];
    function item(lista, codigo, nome, ref, unidade, valor) {
      valor = arred(valor);
      if (valor > 0.004) lista.push({ codigo: codigo, nome: nome, ref: ref, unidade: unidade, valor: valor });
      return valor;
    }

    // Proventos
    var he50 = item(proventos, '0150', 'Horas extras 50%', v('he50'), 'Horas', valorHora * 1.5 * v('he50'));
    var he100 = item(proventos, '0200', 'Horas extras 100%', v('he100'), 'Horas', valorHora * 2 * v('he100'));
    item(proventos, '0010', 'Salário mensal', 30, 'Dias', salario);
    proventos.unshift(proventos.pop()); // salário em primeiro
    var fixos = [
      ['0250', 'Adicional noturno', 'adicional_noturno'],
      ['0260', 'Adicional insalubridade', 'insalubridade'],
      ['0270', 'Adicional periculosidade', 'periculosidade'],
      ['0280', 'Comissões', 'comissoes'],
      ['0290', 'Gratificações', 'gratificacoes'],
      ['0295', 'DSR (repouso remunerado)', 'dsr'],
      ['0400', 'Férias', 'ferias'],
      ['0410', '1/3 de férias', 'terco_ferias'],
      ['0300', 'Outros proventos', 'adicionais'],
    ];
    var outrosMes = 0;
    fixos.forEach(function (f) { outrosMes += item(proventos, f[0], f[1], '', 'Valor', v(f[2])); });
    var d13 = item(proventos, '0500', '13º salário', '', 'Valor', v('decimo_terceiro'));
    var ferias = arred(v('ferias') + v('terco_ferias'));

    // Base do mês (sem o 13º, que tem tributação exclusiva)
    var descFaltas = v('valor_faltas') > 0 ? arred(v('valor_faltas')) : arred((salario / 30) * v('faltas'));
    var descAtrasos = arred(valorHora * v('atrasos'));
    var proventosMes = arred(salario + he50 + he100 + outrosMes);
    var baseMes = arred(Math.max(0, proventosMes - descFaltas - descAtrasos));
    var bruto = arred(proventosMes + d13);

    var pensao = v('pensao');
    var inssMes = inssEmpregado(baseMes, p);
    var irrfMes = irrfMensal(baseMes, inssMes, e.dependentes, p, { pensao: pensao });
    var baseIrrf = arred(irrfMensal.base);
    var inss13 = d13 ? inssEmpregado(d13, p) : 0;
    var irrf13 = d13 ? irrfMensal(d13, inss13, e.dependentes, p, { semSimplificado: true }) : 0;
    var baseIrrf13 = d13 ? arred(irrfMensal.base) : 0;

    // Descontos
    var vt = v('vt');
    var descVt = arred(Math.min(vt, salario * p.descontoMaxVt));
    function pct(a, b) { return b ? arred(a / b * 100) : 0; }
    item(descontos, '2030', 'Faltas', v('faltas') || '', v('faltas') ? 'Dias' : 'Valor', descFaltas);
    item(descontos, '2040', 'Atrasos', v('atrasos'), 'Horas', descAtrasos);
    item(descontos, '0314', 'INSS sobre salário', pct(inssMes, baseMes), '%', inssMes);
    item(descontos, '0316', 'INSS sobre 13º salário', pct(inss13, d13), '%', inss13);
    item(descontos, '0315', 'IRRF sobre salário', pct(irrfMes, baseIrrf), '%', irrfMes);
    item(descontos, '0317', 'IRRF sobre 13º salário', pct(irrf13, baseIrrf13), '%', irrf13);
    item(descontos, '0507', 'Vale-transporte', vt, 'Valor', descVt);
    item(descontos, '2807', 'Vale-refeição/alimentação', '', 'Valor', v('desc_vr', 'descVr'));
    item(descontos, '2810', 'Plano de saúde/odonto', '', 'Valor', v('plano_saude'));
    item(descontos, '2820', 'Adiantamento salarial', '', 'Valor', v('adiantamento'));
    item(descontos, '2830', 'Pensão alimentícia', '', 'Valor', pensao);
    item(descontos, '2900', 'Outros descontos', '', 'Valor', v('outros_descontos', 'outrosDescontos'));
    var totalDescontos = arred(descontos.reduce(function (s, d) { return s + d.valor; }, 0));

    // Encargos da empresa (não são descontados do colaborador)
    var a = aliquotas({
      regime: emp ? emp.regime : 'normal',
      rat: emp ? emp.rat : p.ratPadrao,
      fap: emp ? emp.fap : p.fapPadrao,
      terceiros: emp ? emp.terceiros : p.terceirosPadrao,
    }, p);
    var baseEncargos = arred(baseMes + d13);
    var fgts = arred(baseEncargos * a.fgts);
    var inssPatronal = arred(baseEncargos * a.inss);
    var rat = arred(baseEncargos * a.rat);
    var terceiros = arred(baseEncargos * a.terceiros);
    var indenizacao = arred(baseEncargos * (a.indenizacao || 0));
    var patronal = arred(inssPatronal + rat + terceiros);

    // Provisões mensais (1/12 de 13º e 1/12 de férias + 1/3) sobre a remuneração do mês
    var baseProvisao = Math.max(0, baseMes - ferias);
    var prov13 = arred(baseProvisao / 12);
    var provFerias = arred(baseProvisao / 12 * 4 / 3);
    var provEncargos = arred((prov13 + provFerias) * (a.fgts + a.inss + a.rat + a.terceiros + (a.indenizacao || 0)));
    var vtEmpresa = arred(vt - descVt);
    var custo = arred(baseEncargos + fgts + patronal + indenizacao + vtEmpresa);

    return {
      valorHora: valorHora,
      descFaltas: descFaltas,
      descAtrasos: descAtrasos,
      horasExtras: arred(he50 + he100),
      proventos: proventos,
      descontosLista: descontos,
      bruto: bruto,
      baseMes: baseMes,
      decimoTerceiro: d13,
      baseIrrf: baseIrrf,
      baseInss: arred(Math.min(baseMes, p.inssFaixas[p.inssFaixas.length - 1].ate)),
      inssMes: inssMes,
      inss13: inss13,
      irrfMes: irrfMes,
      irrf13: irrf13,
      inss: arred(inssMes + inss13),
      irrf: arred(irrfMes + irrf13),
      descVt: descVt,
      descontos: totalDescontos,
      liquido: arred(bruto - totalDescontos),
      baseFgts: baseEncargos,
      fgts: fgts,
      inssPatronal: inssPatronal,
      rat: rat,
      terceiros: terceiros,
      patronal: patronal,
      indenizacao: indenizacao,
      encargos: arred(fgts + patronal + indenizacao),
      prov13: prov13,
      provFerias: provFerias,
      provEncargos: provEncargos,
      provisoes: arred(prov13 + provFerias + provEncargos),
      aliquotas: a,
      vtEmpresa: vtEmpresa,
      custo: custo,
    };
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
    inssEmpregado: inssEmpregado,
    irrfMensal: irrfMensal,
    linhaFolha: linhaFolha,
    CAMPOS_FOLHA: CAMPOS_FOLHA,
    num: num,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KeyGestCalc = api;
})(typeof window !== 'undefined' ? window : this);
