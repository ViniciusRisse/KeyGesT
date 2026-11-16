/*
 * Aplicativo KeyGest (PWA): registra o modo app e mostra o botão "Instalar app".
 * Android/Chrome/Edge: instala direto. iPhone/iPad: mostra o passo a passo do Safari.
 */
(function () {
  'use strict';

  var instalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (instalado) document.documentElement.classList.add('modo-app');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sem o modo app: o sistema funciona igual */ });
    });
  }
  if (instalado) return;

  var ua = navigator.userAgent || '';
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var pedido = null;
  var ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/></svg>';

  function criarBotao(extra) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'botao-tema botao-instalar' + (extra ? ' ' + extra : '');
    b.innerHTML = ICONE + '<span>Instalar app</span>';
    b.setAttribute('aria-label', 'Instalar o aplicativo KeyGest no celular');
    b.title = 'Instalar o aplicativo KeyGest';
    b.hidden = true;
    b.addEventListener('click', instalar);
    return b;
  }

  var botoes = [];
  function montar() {
    var sair = document.getElementById('sair');
    if (sair) { var b1 = criarBotao(); sair.parentNode.insertBefore(b1, sair); botoes.push(b1); }
    var rodape = document.querySelector('.login-rodape');
    if (rodape) { var b2 = criarBotao('botao-tema-claro'); rodape.appendChild(b2); botoes.push(b2); }
    if (ios) mostrar(true);
  }
  function mostrar(sim) { botoes.forEach(function (b) { b.hidden = !sim; }); }

  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    pedido = ev;
    mostrar(true);
  });
  window.addEventListener('appinstalled', function () {
    pedido = null;
    mostrar(false);
  });

  function instalar() {
    if (pedido) {
      pedido.prompt();
      pedido.userChoice.then(function () { pedido = null; mostrar(false); }).catch(function () {});
      return;
    }
    if (ios) return passoAPassoIOS();
  }

  function passoAPassoIOS() {
    var dlg = document.createElement('dialog');
    dlg.className = 'janela janela-instalar';
    dlg.innerHTML = '<form method="dialog">' +
      '<div class="janela-topo"><div><h2>Instalar no iPhone</h2><p>Leva menos de 1 minuto.</p></div>' +
      '<button class="janela-fechar" aria-label="Fechar">×</button></div>' +
      '<ol class="passos-instalar">' +
      '<li>Abra esta página no <strong>Safari</strong>.</li>' +
      '<li>Toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima, na barra de baixo).</li>' +
      '<li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>' +
      '<li>Toque em <strong>Adicionar</strong>. O ícone da KeyGest aparece junto com os seus apps.</li>' +
      '</ol>' +
      '<div class="acoes"><button class="botao">Entendi</button></div></form>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.showModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
