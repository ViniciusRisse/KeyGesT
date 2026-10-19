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

  // Máscaras
  form.cnpj.addEventListener('input', function () {
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
    empresa: function (v) { return v.trim().length >= 2; },
    cnpj: function (v) { return C.validarCNPJ(v); },
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
    return {
      nome: form.nome.value.trim(),
      empresa: form.empresa.value.trim(),
      cnpj: form.cnpj.value.trim(),
      telefone: form.telefone.value.trim(),
      email: form.email.value.trim(),
      funcionarios: form.funcionarios.value,
      servicos: servicos.join(', '),
      mensagem: form.mensagem.value.trim(),
      estimativa: est ? est.resumo : '',
      origem: params.get('origem') || 'site',
      _subject: 'Nova solicitação de proposta – ' + form.empresa.value.trim(),
    };
  }

  function textoEmail(d) {
    return [
      'Nome: ' + d.nome,
      'Empresa: ' + d.empresa,
      'CNPJ: ' + d.cnpj,
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

    botao.disabled = true;
    botao.textContent = 'Enviando...';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(d),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        form.reset();
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
