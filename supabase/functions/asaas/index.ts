// Cobrança da assinatura KeyGest pelo Asaas.
// Chamada pelo sistema (usuário logado). Ações:
//   situacao   – dados da assinatura e cobrança em aberto
//   assinar    – cria (ou muda) a assinatura e devolve o link de pagamento
//   cancelar   – cancela a assinatura (a conta segue liberada até o fim do período pago)
//   configurar – só a KeyGest: liga os avisos de pagamento do Asaas (webhook)
// Segredo necessário no Supabase: ASAAS_API_KEY (chave da API do Asaas).
import { createClient } from 'npm:@supabase/supabase-js@2';

// Preços conferidos no servidor (o navegador não decide o valor)
const PLANOS: Record<string, { nome: string; mensal: number; anual: number; colaboradores: number; empresas: number }> = {
  domestico: { nome: 'Doméstico', mensal: 29, anual: 290, colaboradores: 2, empresas: 1 },
  empresa: { nome: 'Empresa', mensal: 89, anual: 890, colaboradores: 15, empresas: 1 },
  escritorio: { nome: 'Escritório de RH', mensal: 249, anual: 2490, colaboradores: 100, empresas: 1000 },
};
const EVENTOS = [
  'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED',
  'SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CHAVE = (Deno.env.get('ASAAS_API_KEY') || '').trim();
const SANDBOX = CHAVE.includes('_hmlg_');
const BASE = SANDBOX ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

class ErroAsaas extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}
class ErroUso extends Error {
  codigo: string;
  constructor(codigo: string) { super(codigo); this.codigo = codigo; }
}

function resposta(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function asaas(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { access_token: CHAVE, 'Content-Type': 'application/json', 'User-Agent': 'KeyGest' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let dados: any = {};
  try { dados = texto ? JSON.parse(texto) : {}; } catch { dados = { texto }; }
  if (!r.ok) {
    const msg = (dados.errors || []).map((e: any) => e.description).join(' ') || `Asaas respondeu ${r.status}`;
    throw new ErroAsaas(msg, r.status);
  }
  return dados;
}

// Atualização: o Asaas usa PUT; versões antigas da API aceitavam POST
async function atualizarNoAsaas(caminho: string, corpo: unknown) {
  try { return await asaas('PUT', caminho, corpo); } catch (e) {
    if (e instanceof ErroAsaas && (e.status === 404 || e.status === 405)) return await asaas('POST', caminho, corpo);
    throw e;
  }
}

function hojeBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function soDigitos(s: unknown) { return String(s || '').replace(/\D/g, ''); }
function formatarDoc(d: string) {
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

async function cobrancaEmAberto(assinatura: string) {
  const r = await asaas('GET', `/subscriptions/${assinatura}/payments?limit=20`);
  const abertas = (r.data || [])
    .filter((p: any) => p.status === 'PENDING' || p.status === 'OVERDUE')
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const p = abertas[0];
  return p ? { url: p.invoiceUrl, vencimento: p.dueDate, valor: p.value, vencida: p.status === 'OVERDUE' } : null;
}

async function situacao(db: any, conta: any) {
  const base: any = { pagamentoOnline: !!CHAVE, sandbox: SANDBOX };
  if (conta.plataforma) {
    const { data: cfg } = await db.from('asaas_config').select('webhook_id, ambiente, atualizado_em').eq('id', 1).maybeSingle();
    return { ...base, avisosLigados: !!(cfg && cfg.webhook_id), ambienteAvisos: cfg?.ambiente || null, avisosDesde: cfg?.atualizado_em || null };
  }
  if (!CHAVE || !conta.asaas_assinatura) return { ...base, assinatura: null, pendente: null };
  try {
    const s = await asaas('GET', `/subscriptions/${conta.asaas_assinatura}`);
    const ativa = !s.deleted && s.status === 'ACTIVE';
    return {
      ...base,
      assinatura: ativa ? { valor: s.value, ciclo: s.cycle, proximoVencimento: s.nextDueDate } : null,
      pendente: ativa ? await cobrancaEmAberto(conta.asaas_assinatura) : null,
    };
  } catch {
    return { ...base, assinatura: null, pendente: null };
  }
}

async function assinar(db: any, conta: any, email: string, corpo: any) {
  const plano = PLANOS[corpo.plano];
  const per = corpo.periodicidade === 'anual' ? 'anual' : corpo.periodicidade === 'mensal' ? 'mensal' : '';
  if (!plano || !per) throw new ErroUso('KG_PLANO_INVALIDO');

  // O plano novo precisa caber no que a conta já usa
  const { count: colab } = await db.from('colaboradores').select('id', { count: 'exact', head: true })
    .eq('conta_id', conta.id).neq('status', 'desligado');
  const { count: emps } = await db.from('empresas').select('id', { count: 'exact', head: true }).eq('conta_id', conta.id);
  if ((colab || 0) > plano.colaboradores || (emps || 0) > plano.empresas) throw new ErroUso('KG_PLANO_PEQUENO');

  const doc = soDigitos(corpo.documento || conta.documento);
  if (doc.length !== 11 && doc.length !== 14) throw new ErroUso('KG_DOCUMENTO');

  const dadosCliente: any = {
    name: conta.nome,
    cpfCnpj: doc,
    email: conta.email_dono || email,
    externalReference: conta.id,
  };
  const tel = soDigitos(conta.telefone);
  if (tel.length >= 10) dadosCliente.mobilePhone = tel;

  let cliente = conta.asaas_cliente;
  if (!cliente) cliente = (await asaas('POST', '/customers', dadosCliente)).id;
  else if (soDigitos(corpo.documento) && soDigitos(corpo.documento) !== soDigitos(conta.documento)) {
    await atualizarNoAsaas(`/customers/${cliente}`, dadosCliente);
  }

  const valor = plano[per];
  const ciclo = per === 'anual' ? 'YEARLY' : 'MONTHLY';
  const descricao = `Sistema KeyGest - plano ${plano.nome} (${per})`;

  let assinatura: any = null;
  if (conta.asaas_assinatura) {
    try {
      const s = await asaas('GET', `/subscriptions/${conta.asaas_assinatura}`);
      if (!s.deleted && s.status === 'ACTIVE') assinatura = s;
    } catch { /* assinatura antiga não existe mais */ }
  }
  if (assinatura) {
    if (Number(assinatura.value) !== valor || assinatura.cycle !== ciclo) {
      assinatura = await atualizarNoAsaas(`/subscriptions/${assinatura.id}`, {
        value: valor, cycle: ciclo, description: descricao, updatePendingPayments: true,
      });
    }
  } else {
    // Primeira cobrança: no fim do teste grátis ou do período já pago; senão, hoje
    const hoje = hojeBR();
    let venc = hoje;
    if (conta.situacao === 'teste' && conta.teste_ate && conta.teste_ate > venc) venc = conta.teste_ate;
    if (conta.pago_ate && conta.pago_ate > venc) venc = conta.pago_ate;
    assinatura = await asaas('POST', '/subscriptions', {
      customer: cliente,
      billingType: 'UNDEFINED', // o cliente escolhe Pix, boleto ou cartão
      value: valor,
      nextDueDate: venc,
      cycle: ciclo,
      description: descricao,
      externalReference: conta.id,
    });
  }

  const mudanca: any = { asaas_cliente: cliente, asaas_assinatura: assinatura.id, plano: corpo.plano, periodicidade: per };
  if (!conta.documento) mudanca.documento = formatarDoc(doc);
  const { error } = await db.from('contas').update(mudanca).eq('id', conta.id);
  if (error) throw error;

  return { ...(await cobrancaEmAberto(assinatura.id) || {}), valor, plano: corpo.plano, periodicidade: per };
}

async function cancelar(db: any, conta: any) {
  if (conta.asaas_assinatura) {
    try { await asaas('DELETE', `/subscriptions/${conta.asaas_assinatura}`); } catch (e) {
      if (!(e instanceof ErroAsaas && e.status === 404)) throw e;
    }
  }
  const { error } = await db.from('contas').update({
    asaas_assinatura: null,
    situacao: conta.situacao === 'teste' ? 'teste' : 'cancelada',
  }).eq('id', conta.id);
  if (error) throw error;
  return { pagoAte: conta.pago_ate || null };
}

async function configurar(db: any, email: string) {
  const { data: cfg } = await db.from('asaas_config').select('*').eq('id', 1).maybeSingle();
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  // Guarda o token novo antes (o antigo continua valendo até o Asaas trocar)
  await db.from('asaas_config').upsert({ id: 1, webhook_id: cfg?.webhook_id || null, webhook_token: token, token_anterior: cfg?.webhook_token || null, ambiente: cfg?.ambiente || null });
  const corpo = {
    name: 'Sistema KeyGest',
    url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/asaas-webhook`,
    email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: token,
    sendType: 'SEQUENTIALLY',
    events: EVENTOS,
  };
  let hook: any = null;
  if (cfg?.webhook_id && cfg?.ambiente === (SANDBOX ? 'sandbox' : 'producao')) {
    try { hook = await atualizarNoAsaas(`/webhooks/${cfg.webhook_id}`, corpo); } catch { hook = null; }
  }
  if (!hook) hook = await asaas('POST', '/webhooks', corpo);
  await db.from('asaas_config').update({ webhook_id: hook.id, ambiente: SANDBOX ? 'sandbox' : 'producao', atualizado_em: new Date().toISOString() }).eq('id', 1);
  return { ok: true, sandbox: SANDBOX };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'KG_ACAO' }, 405);
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(jwt);
    const email = String(u?.user?.email || '').toLowerCase();
    if (!email) return resposta({ erro: 'KG_SEM_LOGIN' }, 401);

    const { data: acesso } = await db.from('acessos').select('perfil, conta_id, ativo').eq('email', email).maybeSingle();
    if (!acesso || !acesso.ativo || acesso.perfil !== 'admin') return resposta({ erro: 'KG_SO_ADMIN' }, 403);
    const { data: conta } = await db.from('contas').select('*').eq('id', acesso.conta_id).single();
    if (!conta) return resposta({ erro: 'KG_SO_ADMIN' }, 403);

    const corpo = await req.json().catch(() => ({}));
    if (corpo.acao === 'situacao') return resposta(await situacao(db, conta));
    if (!CHAVE) return resposta({ erro: 'KG_ASAAS_SEM_CHAVE' }, 503);
    if (corpo.acao === 'configurar') {
      if (!conta.plataforma) return resposta({ erro: 'KG_SO_ADMIN' }, 403);
      return resposta(await configurar(db, email));
    }
    if (conta.plataforma) return resposta({ erro: 'KG_PLATAFORMA' }, 400);
    if (corpo.acao === 'assinar') return resposta(await assinar(db, conta, email, corpo));
    if (corpo.acao === 'cancelar') return resposta(await cancelar(db, conta));
    return resposta({ erro: 'KG_ACAO' }, 400);
  } catch (e) {
    if (e instanceof ErroUso) return resposta({ erro: e.codigo }, 400);
    console.error(e);
    if (e instanceof ErroAsaas) return resposta({ erro: 'KG_ASAAS', mensagem: e.message }, 502);
    return resposta({ erro: 'KG_ERRO', mensagem: String((e as Error)?.message || e) }, 500);
  }
});
