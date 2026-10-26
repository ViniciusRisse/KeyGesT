/* Calculadora de folha de pagamento. */
(function () {
  'use strict';

  var C = window.KeyGestCalc;
  var cfg = window.KEYGEST_CONFIG;
  var p = cfg.parametros;
  var brl = C.formatarBRL;
  var esc = window.KG.escapar;

  var form = document.getElementById('form-calc');
  var listaCargos = document.getElementById('cargos');
  var listaServicos = document.getElementById('servicos');
  var saida = document.getElementById('resultado');
  var contador = 0;

  // Serviços vindos do config
  cfg.honorarios.servicos.forEach(function (s) {
    var preco =
      s.tipo === 'porFuncionario' ? '+ ' + brl(s.valor) + '/func.'
      : s.tipo === 'fixo' ? '+ ' + brl(s.valor) + '/mês'
      : s.tipo === 'consulta' ? 'Sob consulta'
      : 'Incluso';
    var label = document.createElement('label');
    label.className = 'opcao' + (s.obrigatorio ? ' travada' : '');
    label.innerHTML =
      '<input type="checkbox" name="servico" value="' + esc(s.id) + '"' +
      (s.obrigatorio ? ' checked disabled' : '') + '>' +
      '<div><strong>' + esc(s.nome) + '</strong><span>' + esc(s.descricao) + '</span></div>' +
      '<em>' + preco + '</em>';
    listaServicos.appendChild(label);
  });

  function adicionarCargo(nome, qtd, salario) {
    contador++;
    var id = 'c' + contador;
    var linha = document.createElement('div');
    linha.className = 'cargo';
    linha.innerHTML =
      '<div class="campo"><label for="' + id + 'n">Cargo</label>' +
      '<input type="text" id="' + id + 'n" data-f="nome" value="' + esc(nome || '') + '" placeholder="Ex.: Auxiliar administrativo"></div>' +
      '<div class="campo"><label for="' + id + 'q">Qtd.</label>' +
      '<input type="number" id="' + id + 'q" data-f="qtd" min="0" step="1" value="' + (qtd || 1) + '"></div>' +
      '<div class="campo"><label for="' + id + 's">Salário mensal</label>' +
      '<div class="prefixo"><span>R$</span><input type="number" id="' + id + 's" data-f="salario" min="0" step="0.01" inputmode="decimal" value="' + (salario || '') + '"></div></div>' +
      '<button type="button" class="remover" aria-label="Remover cargo">×</button>';
    linha.querySelector('.remover').addEventListener('click', function () {
      if (listaCargos.children.length > 1) {
        linha.remove();
        calcular();
      }
    });
    listaCargos.appendChild(linha);
  }

  function lerCargos() {
    return Array.prototype.map.call(listaCargos.children, function (l) {
      return {
        nome: l.querySelector('[data-f=nome]').value.trim() || 'Cargo',
        qtd: Math.max(0, Math.round(C.num(l.querySelector('[data-f=qtd]').value))),
        salario: Math.max(0, C.num(l.querySelector('[data-f=salario]').value)),
      };
    }).filter(function (c) {
      return c.qtd > 0 && c.salario > 0;
    });
  }

  function calcular() {
    var regime = form.regime.value;
    var opcoes = {
      regime: regime,
      rat: C.num(form.rat.value, p.ratPadrao),
      fap: Math.min(2, Math.max(0.5, C.num(form.fap.value, p.fapPadrao))),
      terceiros: C.num(form.terceiros.value, p.terceirosPadrao * 100) / 100,
      incluirMultaFgts: form.multa.checked,
    };
    var benef = {
      vt: form.vt.value, vr: form.vr.value, saude: form.saude.value, outros: form.outros.value,
    };
    var cargos = lerCargos();
    var t = { n: 0, salarios: 0, encargos: 0, provisoes: 0, beneficios: 0, total: 0 };
    var abaixoMinimo = false;

    cargos.forEach(function (c) {
      var r = C.custoFuncionario({ salario: c.salario, regime: regime, rat: opcoes.rat, fap: opcoes.fap, terceiros: opcoes.terceiros, incluirMultaFgts: opcoes.incluirMultaFgts }, p);
      var b = C.custoBeneficios({ salario: c.salario, vt: benef.vt, vr: benef.vr, saude: benef.saude, outros: benef.outros }, p);
      t.n += c.qtd;
      t.salarios += r.remuneracao * c.qtd;
      t.encargos += r.encargosSobreSalario * c.qtd;
      t.provisoes += r.provisoes * c.qtd;
      t.beneficios += b.total * c.qtd;
      if (c.salario < p.salarioMinimo) abaixoMinimo = true;
    });
    t.total = t.salarios + t.encargos + t.provisoes + t.beneficios;

    var selecionados = Array.prototype.map.call(
      form.querySelectorAll('input[name=servico]:checked'),
      function (i) { return i.value; }
    );
    var h = C.honorarios(cfg.honorarios, t.n, selecionados);

    if (!t.n) {
      saida.innerHTML =
        '<h2>Resultado</h2><p class="ajuda">Preencha a quantidade e o salário de pelo menos um cargo para ver a estimativa.</p>';
      return;
    }

    var html = '';
    html += '<div class="destaque"><span class="rotulo">Custo total mensal estimado</span>' +
      '<span class="valor">' + brl(t.total) + '</span>' +
      '<span class="sub">' + brl(t.total * 12) + ' por ano · ' + brl(t.total / t.n) + ' por funcionário</span></div>';

    html += '<div class="mini-numeros">' +
      '<div><span>Funcionários</span><strong>' + t.n + '</strong></div>' +
      '<div><span>Custo / salários</span><strong>' + (t.total / t.salarios).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '×</strong></div>' +
      '</div>';

    if (abaixoMinimo) {
      html += '<p class="aviso">Há salários abaixo do salário mínimo de ' + p.ano + ' (' + brl(p.salarioMinimo) + '). Para jornada integral, confira o valor informado.</p>';
    }
    if (regime === 'mei' && t.n > 1) {
      html += '<p class="aviso">O MEI pode ter apenas 1 empregado. Com mais funcionários, a empresa precisa migrar de regime.</p>';
    }

    html += '<table class="tabela"><caption>Custos trabalhistas (mensal)</caption><tbody>' +
      '<tr><td>Salários</td><td>' + brl(t.salarios) + '</td></tr>' +
      '<tr><td>Encargos sobre a folha<small>' + (regime === 'domestico' ? 'INSS do empregador 8%, GILRAT 0,8%, FGTS 8% e indenização compensatória 3,2% (DAE)' : 'INSS patronal, RAT, terceiros e FGTS') + '</small></td><td>' + brl(t.encargos) + '</td></tr>' +
      '<tr><td>Provisões de 13º e férias<small>Inclui 1/3 de férias e encargos</small></td><td>' + brl(t.provisoes) + '</td></tr>' +
      '<tr><td>Benefícios (custo da empresa)</td><td>' + brl(t.beneficios) + '</td></tr>' +
      '<tr class="total"><td>Total</td><td>' + brl(t.total) + '</td></tr>' +
      '</tbody></table>';

    html += '<table class="tabela"><caption>Honorários KeyGest (mensal)</caption><tbody>';
    h.itens.forEach(function (i) {
      html += '<tr><td>' + esc(i.nome) + '<small>' + esc(i.detalhe) + '</small></td><td>' + brl(i.valor) + '</td></tr>';
    });
    html += '<tr class="total"><td>Total de honorários</td><td>' + brl(h.total) + '</td></tr></tbody></table>';
    if (h.sobConsulta.length) {
      html += '<p class="aviso">' + esc(h.sobConsulta.join(', ')) + ': valor sob consulta, incluído na proposta.</p>';
    }

    html += '<p class="aviso">Estimativa com base em regras gerais de ' + p.ano + '. Convenções coletivas, adicionais e a situação de cada empresa podem alterar os valores.</p>';
    html += '<button type="button" class="botao" id="pedir-proposta" style="width:100%">Receber proposta com esta estimativa</button>' +
      '<button type="button" class="botao botao-secundario" id="imprimir" style="width:100%;margin-top:10px">Imprimir / salvar PDF</button>';
    saida.innerHTML = html;

    var regimeNome = C.REGIMES[regime].nome;
    var resumo =
      'Estimativa da calculadora de folha\n' +
      'Regime: ' + regimeNome + '\n' +
      'Funcionários: ' + t.n + '\n' +
      cargos.map(function (c) { return '• ' + c.qtd + '× ' + c.nome + ' – ' + brl(c.salario); }).join('\n') + '\n' +
      'Custo trabalhista mensal: ' + brl(t.total) + '\n' +
      'Serviços: ' + h.itens.map(function (i) { return i.nome; }).concat(h.sobConsulta).join(', ') + '\n' +
      'Honorários estimados: ' + brl(h.total) + '/mês';

    document.getElementById('pedir-proposta').addEventListener('click', function () {
      window.KG.guardar('keygest-estimativa', {
        origem: 'calculadora',
        resumo: resumo,
        funcionarios: t.n,
        servicos: selecionados.concat(['folha']),
      });
      window.location.href = 'contato.html?origem=calculadora';
    });
    document.getElementById('imprimir').addEventListener('click', function () {
      window.print();
    });
  }

  document.getElementById('add-cargo').addEventListener('click', function () {
    adicionarCargo('', 1, '');
    listaCargos.lastElementChild.querySelector('input').focus();
  });

  form.addEventListener('input', calcular);
  form.addEventListener('change', calcular);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  adicionarCargo('Auxiliar administrativo', 3, 2200);
  adicionarCargo('Analista', 1, 4500);
  calcular();
})();
