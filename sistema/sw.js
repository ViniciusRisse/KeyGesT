/*
 * Aplicativo KeyGest: guarda as telas do sistema no celular para abrir rápido.
 * Os dados (Supabase) nunca ficam guardados aqui: sempre vêm da internet.
 * Estratégia: busca primeiro na internet; sem conexão, usa a cópia guardada.
 */
var CACHE = 'keygest-app-v1';
var BASICO = [
  './',
  './index.html',
  './sistema.css',
  './app.js',
  './db.js',
  './folha.js',
  './negociacoes.js',
  './financeiro.js',
  './senha.js',
  './pwa.js',
  '../css/style.css',
  '../js/config.js',
  '../js/encargos.js',
  '../js/tema.js',
  '../assets/logo.png',
  '../assets/app/icone-192.png',
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Um arquivo que falhar não impede a instalação
      return Promise.all(BASICO.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) { return n.indexOf('keygest-app-') === 0 && n !== CACHE; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Só arquivos do próprio site; banco de dados, login e fontes passam direto
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok && resp.type === 'basic') {
        var copia = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return resp;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) {
        if (r) return r;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
