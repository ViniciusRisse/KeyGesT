/* Formulário de captação de clientes. */
(function () {
  'use strict';

  var C = window.KeyGestCalc;
  var cfg = window.KEYGEST_CONFIG;
  var esc = window.KG.escapar;
  var form = document.getElementById('form-contato');
  var msg = document.getElementById('mensagem');
  var listaServicos = document.getElementById('servicos');

  cfg.honorarios.servicos.forEach(function (s) {
    var l = document.createElement('label');
    l.className = 'opcao';
    l.innerHTML = '<input type="checkbox" name="servicos" value="' + esc(s.nome) + '" data-id="' + esc(s.id) + '"><div><strong>' + esc(s.nome) + '</strong></div>';
    listaServicos.appendChild(l);
  });

  // Estimativa vinda da calculadora/simulador
  var params = new URLSearchParams(window.location.search);
  var est = window.KG.ler('keygest-estimativa');
  if (est && params.get('origem')) {
    document.getElementById('bloco-estimativa').hidden = false;
    document.getElementById('resumo-estimativa').textContent = est.resumo;
    (est.servicos || []).forEach(function (id) {
      var cb = listaServicos.querySelector('[data-id="' + id + '"]');
      if (cb) cb.checked = true;
    });
    var n = est.funcionarios || 0;
    var faixa = n <= 5 ? 1 : n <= 20 ? 2 : n <= 50 ? 3 : n <= 100 ? 4 : n <= 300 ? 5 : 6;
    if (n) form.funcionarios.selectedIndex = faixa;
  } else {
    est = null;
  }

  // Empresa (CNPJ) ou empregador doméstico (pessoa física, CPF)
  function domestico() { return form.tipo.value === 'domestico'; }

  function validarCPF(v) {
    var c = String(v).replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (var t = 9; t < 11; t++) {
      var soma = 0;
      for (var i = 0; i < t; i++) soma += +c[i] * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== +c[t]) return false;
    }
    return true;
  }

  function aplicarTipo() {
    var dom = domestico();
    var campoEmpresa = document.getElementById('campo-empresa');
    campoEmpresa.hidden = dom;
    form.empresa.required = !dom;
    campoEmpresa.classList.remove('invalido');
    document.getElementById('rotulo-documento').textContent = dom ? 'CPF do empregador *' : 'CNPJ *';
    document.getElementById('erro-documento').textContent = dom ? 'CPF inválido. Confira os números.' : 'CNPJ inválido. Confira os números.';
    document.getElementById('rotulo-funcionarios').textContent = dom ? 'Número de empregados domésticos' : 'Número de funcionários';
    form.cnpj.placeholder = dom ? '000.000.000-00' : '00.000.000/0000-00';
    form.cnpj.maxLength = dom ? 14 : 18;
    form.cnpj.inputMode = dom ? 'numeric' : 'text';
    form.cnpj.value = '';
    form.cnpj.closest('.campo').classList.remove('invalido');
    form.mensagem.placeholder = dom
      ? 'Conte um pouco sobre os empregados (função, jornada, se dorme no emprego) e o que precisa.'
      : 'Conte um pouco sobre a sua empresa e o que precisa.';
  }
  Array.prototype.forEach.call(form.querySelectorAll('input[name=tipo]'), function (r) {
    r.addEventListener('change', aplicarTipo);
  });

  // Máscaras
  form.cnpj.addEventListener('input', function () {
    if (domestico()) {
      var d = this.value.replace(/\D/g, '').slice(0, 11);
      var o = d.slice(0, 3);
      if (d.length > 3) o += '.' + d.slice(3, 6);
      if (d.length > 6) o += '.' + d.slice(6, 9);
      if (d.length > 9) o += '-' + d.slice(9, 11);
      this.value = o;
      return;
    }
    var v = this.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
    var out = v.slice(0, 2);
    if (v.length > 2) out += '.' + v.slice(2, 5);
    if (v.length > 5) out += '.' + v.slice(5, 8);
    if (v.length > 8) out += '/' + v.slice(8, 12);
    if (v.length > 12) out += '-' + v.slice(12, 14);
    this.value = out;
  });

  form.telefone.addEventListener('input', function () {
    var d = this.value.replace(/\D/g, '').slice(0, 11);
    var out = d;
    if (d.length > 2) out = '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 6) {
      var corte = d.length === 11 ? 7 : 6;
      out = '(' + d.slice(0, 2) + ') ' + d.slice(2, corte) + '-' + d.slice(corte);
    }
    this.value = out;
  });

  var regras = {
    nome: function (v) { return v.trim().length >= 3; },
    empresa: function (v) { return domestico() || v.trim().length >= 2; },
    cnpj: function (v) { return domestico() ? validarCPF(v) : C.validarCNPJ(v); },
    telefone: function (v) { return v.replace(/\D/g, '').length >= 10; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
    lgpd: function (v, el) { return el.checked; },
  };

  function validar(nome) {
    var el = form.elements[nome];
    var ok = regras[nome](el.value, el);
    el.closest('.campo').classList.toggle('invalido', !ok);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    return ok;
  }

  Object.keys(regras).forEach(function (nome) {
    form.elements[nome].addEventListener('blur', function () { validar(nome); });
    form.elements[nome].addEventListener('change', function () {
      if (this.closest('.campo').classList.contains('invalido')) validar(nome);
    });
  });

  function dados() {
    var servicos = Array.prototype.map.call(
      form.querySelectorAll('input[name=servicos]:checked'),
      function (i) { return i.value; }
    );
    var dom = domestico();
    return {
      tipo: dom ? 'Empregador doméstico (pessoa física)' : 'Empresa',
      nome: form.nome.value.trim(),
      empresa: dom ? '' : form.empresa.value.trim(),
      cnpj: dom ? '' : form.cnpj.value.trim(),
      cpf: dom ? form.cnpj.value.trim() : '',
      telefone: form.telefone.value.trim(),
      email: form.email.value.trim(),
      funcionarios: form.funcionarios.value,
      servicos: servicos.join(', '),
      mensagem: form.mensagem.value.trim(),
      estimativa: est ? est.resumo : '',
      origem: params.get('origem') || 'site',
      _subject: 'Nova solicitação de proposta – ' + (dom ? 'Empregador doméstico – ' + form.nome.value.trim() : form.empresa.value.trim()),
    };
  }

  function textoEmail(d) {
    return [
      'Tipo: ' + d.tipo,
      'Nome: ' + d.nome,
      d.cpf ? 'CPF do empregador: ' + d.cpf : 'Empresa: ' + d.empresa,
      d.cpf ? '' : 'CNPJ: ' + d.cnpj,
      'Telefone: ' + d.telefone,
      'E-mail: ' + d.email,
      'Funcionários: ' + (d.funcionarios || '-'),
      'Serviços: ' + (d.servicos || '-'),
      '',
      d.mensagem,
      d.estimativa ? '\n' + d.estimativa : '',
    ].join('\n');
  }

  function mostrar(tipo, html) {
    msg.innerHTML = '<div class="alerta ' + tipo + '">' + html + '</div>';
    msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form._gotcha.value) return; // robô

    var invalidos = Object.keys(regras).filter(function (n) { return !validar(n); });
    if (invalidos.length) {
      form.elements[invalidos[0]].focus();
      return;
    }

    var d = dados();
    var endpoint = (cfg.formulario || {}).endpoint;
    var botao = form.querySelector('[type=submit]');

    if (!endpoint) {
      // Sem servidor configurado: abre o e-mail com a mensagem pronta.
      var href = 'mailto:' + cfg.empresa.email +
        '?subject=' + encodeURIComponent(d._subject) +
        '&body=' + encodeURIComponent(textoEmail(d));
      window.location.href = href;
      mostrar('sucesso', '<strong>Quase lá!</strong> Abrimos o seu aplicativo de e-mail com a mensagem pronta. É só enviar. ' +
        'Se nada abriu, escreva para <a href="mailto:' + esc(cfg.empresa.email) + '">' + esc(cfg.empresa.email) + '</a>.');
      return;
    }

    // Campos com nomes legíveis para o e-mail que chega no Gmail
    var envio = {
      'Tipo de contratante': d.tipo,
      'Nome': d.nome,
      'Empresa': d.empresa || '-',
      'CNPJ': d.cnpj || '-',
      'CPF do empregador': d.cpf || '-',
      'Telefone / WhatsApp': d.telefone,
      'E-mail': d.email,
      'Número de funcionários': d.funcionarios || '-',
      'Serviços de interesse': d.servicos || '-',
      'Mensagem': d.mensagem || '-',
      'Estimativa do site': d.estimativa || '-',
      'Origem': d.origem,
      _subject: d._subject,
      _replyto: d.email,
      _template: 'table',
      _captcha: 'false',
    };

    botao.disabled = true;
    botao.textContent = 'Enviando...';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(/formsubmit\.co/.test(endpoint) ? envio : d),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(function () { return {}; });
      })
      .then(function (resposta) {
        if (resposta && (resposta.success === false || resposta.success === 'false')) {
          throw new Error(resposta.message || 'Envio recusado');
        }
        form.reset();
        aplicarTipo();
        form.hidden = true;
        try { sessionStorage.removeItem('keygest-estimativa'); } catch (err) { /* ignora */ }
        mostrar('sucesso', '<strong>Solicitação enviada!</strong> Obrigado, ' + esc(d.nome.split(' ')[0]) +
          '. Nossa equipe vai entrar em contato em até 1 dia útil.');
      })
      .catch(function () {
        mostrar('erro', '<strong>Não foi possível enviar agora.</strong> Tente novamente ou escreva para <a href="mailto:' +
          esc(cfg.empresa.email) + '">' + esc(cfg.empresa.email) + '</a>.');
      })
      .then(function () {
        botao.disabled = false;
        botao.textContent = 'Enviar solicitação';
      });
  });
})();
