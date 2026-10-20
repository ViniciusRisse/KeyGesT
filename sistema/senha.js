/*
 * Política de senhas da KeyGest.
 * - Mínimo de 8 caracteres, com letras, números e símbolos.
 * - Não pode conter o próprio e-mail nem ser uma senha comum.
 * - Não pode ter aparecido em vazamentos de dados (consulta anônima ao
 *   serviço Have I Been Pwned: só os 5 primeiros caracteres do hash SHA-1
 *   saem do navegador, nunca a senha).
 */
(function () {
  'use strict';

  var MINIMO = 8;

  var COMUNS = [
    'senha', 'password', 'keygest', 'qwerty', 'abc123', '123456', '12345678', 'admin', 'brasil',
    'mudar', 'trocar', 'teste', 'acesso', 'login', 'bemvindo', 'iloveyou',
  ];

  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Regras exibidas ao usuário enquanto digita
  function avaliar(senha, email) {
    senha = String(senha || '');
    var usuario = semAcento(String(email || '').split('@')[0]).replace(/[^a-z0-9]/g, '');
    var simples = semAcento(senha).replace(/[^a-z0-9]/g, '');
    var regras = [
      { id: 'tamanho', texto: 'Pelo menos ' + MINIMO + ' caracteres', ok: senha.length >= MINIMO },
      { id: 'letra', texto: 'Uma letra', ok: /[A-Za-zÀ-ÿ]/.test(senha) },
      { id: 'numero', texto: 'Um número', ok: /\d/.test(senha) },
      { id: 'simbolo', texto: 'Um símbolo (ex.: ! @ # $ % & * ?)', ok: /[^A-Za-zÀ-ÿ0-9\s]/.test(senha) },
      {
        id: 'pessoal',
        texto: 'Não usar o seu e-mail nem palavras óbvias (senha, keygest, 123456…)',
        ok: senha.length > 0 &&
          !(usuario.length >= 3 && simples.indexOf(usuario) !== -1) &&
          !COMUNS.some(function (p) { return simples.indexOf(p) !== -1; }) &&
          !/(.)\1{3,}/.test(senha),
      },
    ];
    return { regras: regras, valida: regras.every(function (r) { return r.ok; }) };
  }

  async function sha1(texto) {
    var dados = new TextEncoder().encode(texto);
    var hash = await crypto.subtle.digest('SHA-1', dados);
    return Array.prototype.map.call(new Uint8Array(hash), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }

  // true = senha encontrada em vazamentos; false = não encontrada ou consulta indisponível
  async function vazada(senha) {
    if (!window.crypto || !crypto.subtle || !window.fetch) return false;
    try {
      var hash = await sha1(senha);
      var controle = new AbortController();
      var limite = setTimeout(function () { controle.abort(); }, 6000);
      var r = await fetch('https://api.pwnedpasswords.com/range/' + hash.slice(0, 5), {
        headers: { 'Add-Padding': 'true' },
        signal: controle.signal,
      });
      clearTimeout(limite);
      if (!r.ok) return false;
      var resto = hash.slice(5);
      return (await r.text()).split('\n').some(function (linha) {
        var p = linha.trim().split(':');
        return p[0] === resto && parseInt(p[1], 10) > 0;
      });
    } catch (e) {
      return false;
    }
  }

  window.Senha = { MINIMO: MINIMO, avaliar: avaliar, vazada: vazada };
})();
