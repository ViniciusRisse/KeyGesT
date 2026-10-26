/* Comportamentos comuns a todas as páginas. */
(function () {
  'use strict';

  var cfg = window.KEYGEST_CONFIG || {};
  var empresa = cfg.empresa || {};

  // Menu mobile
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var aberto = menu.classList.toggle('aberto');
      toggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });
  }

  // Ano no rodapé
  document.querySelectorAll('[data-ano]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // Dados de contato vindos do config.js
  document.querySelectorAll('[data-contato]').forEach(function (el) {
    var tipo = el.getAttribute('data-contato');
    var valor = empresa[tipo];
    if (!valor) {
      el.closest('li') ? (el.closest('li').hidden = true) : (el.hidden = true);
      return;
    }
    if (tipo === 'email') {
      el.textContent = valor;
      el.href = 'mailto:' + valor;
    } else if (tipo === 'telefone') {
      el.textContent = valor;
      el.href = 'tel:' + valor.replace(/\D/g, '');
    } else if (tipo === 'whatsapp') {
      el.href = linkWhatsApp('Olá! Gostaria de saber mais sobre os serviços da KeyGest.');
    } else {
      el.textContent = valor;
    }
  });

  // Identificação da empresa no rodapé (razão social, CNPJ e endereço)
  document.querySelectorAll('[data-identificacao]').forEach(function (el) {
    var partes = [empresa.razaoSocial, empresa.cnpj ? 'CNPJ ' + empresa.cnpj : '', empresa.endereco].filter(Boolean);
    el.textContent = partes.join(' · ');
    el.hidden = !partes.length;
  });

  // Botão flutuante de WhatsApp
  if (empresa.whatsapp) {
    var a = document.createElement('a');
    a.className = 'whatsapp';
    a.href = linkWhatsApp('Olá! Gostaria de saber mais sobre os serviços da KeyGest.');
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Falar com a KeyGest pelo WhatsApp');
    a.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg>';
    document.body.appendChild(a);
  }

  function linkWhatsApp(texto) {
    return (
      'https://wa.me/' +
      String(empresa.whatsapp || '').replace(/\D/g, '') +
      '?text=' +
      encodeURIComponent(texto)
    );
  }

  // Armazenamento seguro (pode falhar em modo privado)
  function guardar(chave, valor) {
    try {
      sessionStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  function ler(chave) {
    try {
      var v = sessionStorage.getItem(chave);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }

  window.KG = {
    cfg: cfg,
    linkWhatsApp: linkWhatsApp,
    guardar: guardar,
    ler: ler,
    escapar: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
  };
})();
