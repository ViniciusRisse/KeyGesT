/* Página inicial: abas "Por dentro do sistema", preços dos planos e formulário rápido. */
(function () {
  'use strict';

  var planos = ((window.KEYGEST_CONFIG || {}).saas || {}).planos || {};

  function reais(v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  // Abas: mostra a tela de exemplo de cada recurso (setas do teclado também funcionam)
  var abas = Array.prototype.slice.call(document.querySelectorAll('.ini-aba'));
  var palco = document.getElementById('ini-palco');
  function mostrar(aba, focar) {
    abas.forEach(function (a) {
      var sel = a === aba;
      a.setAttribute('aria-selected', sel ? 'true' : 'false');
      a.tabIndex = sel ? 0 : -1;
    });
    palco.querySelectorAll('[data-painel]').forEach(function (p) { p.hidden = p.dataset.painel !== aba.dataset.tela; });
    palco.setAttribute('aria-labelledby', aba.id);
    if (focar) aba.focus();
  }
  abas.forEach(function (a, i) {
    a.addEventListener('click', function () { mostrar(a); });
    a.addEventListener('keydown', function (e) {
      var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      mostrar(abas[(i + d + abas.length) % abas.length], true);
    });
  });

  // Preços e limites vêm do config.js (os mesmos do sistema)
  var botoes = document.querySelectorAll('[data-cobranca]');
  function cobranca(tipo) {
    botoes.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.cobranca === tipo ? 'true' : 'false'); });
    document.querySelectorAll('.ini-plano').forEach(function (card) {
      var el = card.querySelector('[data-plano-preco]');
      var p = planos[el.dataset.planoPreco];
      if (!p) return;
      el.textContent = reais(tipo === 'anual' ? p.anual : p.mensal);
      card.querySelector('[data-unidade]').textContent = tipo === 'anual' ? '/ano' : '/mês';
      card.querySelector('[data-plano-nota]').textContent = tipo === 'anual'
        ? 'equivale a ' + reais(Math.round(p.anual / 12 * 100) / 100) + ' por mês'
        : '';
    });
  }
  botoes.forEach(function (b) { b.addEventListener('click', function () { cobranca(b.dataset.cobranca); }); });
  document.querySelectorAll('[data-plano-limite]').forEach(function (el) {
    var p = planos[el.dataset.planoLimite];
    if (p && p.colaboradores) el.textContent = p.colaboradores;
  });
  document.querySelectorAll('[data-periodo="mensal"]').forEach(function (el) {
    var p = planos[el.dataset.planoPreco];
    if (p) el.textContent = reais(p.mensal);
  });
  cobranca('mensal');

  // Formulário rápido: leva os dados para a página de contato, que confirma e envia
  var form = document.getElementById('form-rapido');
  if (form) {
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
  }
})();
