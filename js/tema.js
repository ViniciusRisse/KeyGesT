/*
 * Modo claro/escuro. Sem escolha salva, segue o tema do Windows/celular.
 * O botão alterna entre claro e escuro e guarda a escolha neste navegador.
 */
(function () {
  'use strict';
  var CHAVE = 'keygest-tema';
  var raiz = document.documentElement;
  var LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function escuroAtivo() {
    var t = raiz.getAttribute('data-tema');
    if (t) return t === 'escuro';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function atualizar(bt) {
    var escuro = escuroAtivo();
    bt.innerHTML = (escuro ? SOL : LUA) + '<span>' + (escuro ? 'Modo claro' : 'Modo escuro') + '</span>';
    bt.setAttribute('aria-label', escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
    bt.title = bt.getAttribute('aria-label');
  }

  function criarBotao() {
    var bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'botao-tema';
    atualizar(bt);
    bt.addEventListener('click', function () {
      var novo = escuroAtivo() ? 'claro' : 'escuro';
      raiz.setAttribute('data-tema', novo);
      try { localStorage.setItem(CHAVE, novo); } catch (e) { /* sem armazenamento */ }
      document.querySelectorAll('.botao-tema').forEach(atualizar);
    });
    return bt;
  }

  function montar() {
    // Site público: no menu do cabeçalho, antes do "Entrar"
    var entrar = document.querySelector('.cabecalho .botao-entrar');
    if (entrar && entrar.closest('li')) {
      var li = document.createElement('li');
      li.appendChild(criarBotao());
      entrar.closest('li').parentNode.insertBefore(li, entrar.closest('li'));
    }
    // Sistema: na área do usuário, antes do "Sair"
    var sair = document.getElementById('sair');
    if (sair) sair.parentNode.insertBefore(criarBotao(), sair);
    // Tela de login
    var rodape = document.querySelector('.login-rodape');
    if (rodape) {
      var b = criarBotao();
      b.classList.add('botao-tema-claro');
      rodape.appendChild(b);
    }
  }

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var aoMudar = function () { document.querySelectorAll('.botao-tema').forEach(atualizar); };
    if (mq.addEventListener) mq.addEventListener('change', aoMudar); else if (mq.addListener) mq.addListener(aoMudar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
