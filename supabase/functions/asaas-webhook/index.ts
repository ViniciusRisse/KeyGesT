// Recebe os avisos de pagamento do Asaas e atualiza a conta do assinante:
//   pagamento confirmado/recebido  → conta ativa e paga até o fim do período
//   pagamento vencido              → pagamento pendente (só consulta, após o período pago)
//   assinatura removida/inativada  → cancelada (liberada até o fim do período pago)
// O Asaas envia o token no cabeçalho "asaas-access-token"; o token fica em asaas_config.
// Publicar sem exigir login (verify_jwt = false): quem chama é o Asaas.
import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = () => new Response('ok', { status: 200 });

function hojeBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Soma meses a uma data AAAA-MM-DD sem pular mês (31/01 + 1 mês = 28 ou 29/02)
function somarMeses(iso: string, meses: number, diasExtras = 0) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo) + diasExtras);
  return alvo.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const token = req.headers.get('asaas-access-token') || '';
  const { data: cfg } = await db.from('asaas_config').select('webhook_token, token_anterior').eq('id', 1).maybeSingle();
  if (!cfg || !token || (token !== cfg.webhook_token && token !== cfg.token_anterior)) {
    return new Response('token invalido', { status: 401 });
  }

  let ev: any;
  try { ev = await req.json(); } catch { return ok(); }
  const pag = ev.payment || null;
  const sub = ev.subscription || null;
  const assinatura = pag?.subscription || sub?.id || null;
  const ref = pag?.externalReference || sub?.externalReference || null;

  let conta: any = null;
  if (assinatura) conta = (await db.from('contas').select('*').eq('asaas_assinatura', assinatura).maybeSingle()).data;
  if (!conta && ref && UUID.test(ref)) conta = (await db.from('contas').select('*').eq('id', ref).maybeSingle()).data;

  // Mesmo aviso chegando de novo: ignora
  const { error: dup } = await db.from('asaas_eventos').insert({
    id: String(ev.id || crypto.randomUUID()), evento: ev.event || null, conta_id: conta?.id || null, payload: ev,
  });
  if (dup) {
    if (dup.code === '23505') return ok();
    console.error(dup);
    return new Response('erro ao registrar', { status: 500 }); // o Asaas tenta de novo
  }
  if (!conta || conta.plataforma) return ok();

  const daAssinaturaAtual = !!assinatura && assinatura === conta.asaas_assinatura;
  let mudanca: Record<string, unknown> | null = null;
  switch (ev.event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      if (!pag?.dueDate) break;
      // Liberado até o próximo vencimento + 3 dias de tolerância
      const ate = somarMeses(pag.dueDate, conta.periodicidade === 'anual' ? 12 : 1, 3);
      mudanca = { situacao: 'ativa', pago_ate: !conta.pago_ate || ate > conta.pago_ate ? ate : conta.pago_ate };
      break;
    }
    case 'PAYMENT_OVERDUE':
      if (daAssinaturaAtual && conta.situacao !== 'cancelada') mudanca = { situacao: 'inadimplente' };
      break;
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED':
      if (daAssinaturaAtual) mudanca = { asaas_assinatura: null, situacao: conta.situacao === 'teste' ? 'teste' : 'cancelada' };
      break;
    case 'PAYMENT_REFUNDED':
      mudanca = { observacoes: `${conta.observacoes ? conta.observacoes + '\n' : ''}Estorno de pagamento no Asaas em ${hojeBR()}.` };
      break;
  }
  if (mudanca) {
    const { error } = await db.from('contas').update(mudanca).eq('id', conta.id);
    if (error) {
      // Apaga o registro para o Asaas reenviar e a mudança ser aplicada na próxima tentativa
      console.error(error);
      await db.from('asaas_eventos').delete().eq('id', String(ev.id));
      return new Response('erro ao atualizar', { status: 500 });
    }
  }

  // Guarda 13 meses de histórico
  await db.from('asaas_eventos').delete().lt('recebido_em', new Date(Date.now() - 400 * 864e5).toISOString());
  return ok();
});
