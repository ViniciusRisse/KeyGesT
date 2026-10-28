/*
 * Configurações da KeyGest.
 * Edite este arquivo para trocar contatos, preços e parâmetros legais
 * sem precisar mexer no restante do site.
 */
window.KEYGEST_CONFIG = {
  empresa: {
    nome: 'KeyGest',
    email: 'KeyGest.rh@gmail.com',
    telefone: '(11) 94308-0263',
    // Somente números, com DDI e DDD. Ex.: '5511999999999'. Vazio esconde o botão.
    whatsapp: '5511943080263',
    cidade: 'Brasil',
    // Identificação exigida pelo Código de Defesa do Consumidor (aparece no rodapé).
    // Preencha quando tiver os dados; vazio não aparece.
    razaoSocial: '',
    cnpj: '',
    endereco: '',
  },

  // Banco de dados do sistema de colaboradores (Supabase).
  // Preencha com os dados de Project Settings → API do seu projeto.
  // Vazio = modo demonstração (os dados ficam só no navegador).
  supabase: {
    url: 'https://jkfhpttabwbhcvtxzzvb.supabase.co',
    // Chave pública (publishable): pode ficar no site. Nunca coloque aqui a chave secreta.
    anonKey: 'sb_publishable_eiPgvkYmFUlNfemkAqF_LA_EvMya21b',
  },

  // Sistema vendido por assinatura (SaaS)
  saas: {
    // Liga a aba "Criar conta" no login. Só ative depois de aplicar no Supabase a parte
    // "SaaS: contas de assinantes" do arquivo supabase/schema.sql.
    cadastroAberto: false,
    testeDias: 14,
    // Preços (R$). Anual = 10 mensalidades (2 meses grátis).
    planos: {
      domestico: { nome: 'Doméstico', mensal: 29, anual: 290, colaboradores: 2, empresas: 1,
        para: 'Empregador doméstico (pessoa física) com até 2 empregados' },
      empresa: { nome: 'Empresa', mensal: 89, anual: 890, colaboradores: 15, empresas: 1,
        para: 'Uma empresa com até 15 funcionários' },
      escritorio: { nome: 'Escritório de RH', mensal: 249, anual: 2490, colaboradores: 100, empresas: null,
        para: 'Escritórios de RH e contabilidade: várias empresas clientes, até 100 colaboradores' },
    },
  },

  formulario: {
    // Os pedidos de proposta são enviados pelo FormSubmit direto para o Gmail.
    // No primeiro envio, o FormSubmit manda um e-mail de ativação para esse endereço:
    // basta clicar em "Activate Form" uma única vez.
    // Se ficar vazio, o formulário abre o e-mail do visitante com a mensagem pronta.
    endpoint: 'https://formsubmit.co/ajax/KeyGest.rh@gmail.com',
  },

  // Parâmetros de referência. Confira a cada ano com a legislação vigente.
  parametros: {
    ano: 2026,
    salarioMinimo: 1621.0,
    fgts: 0.08,
    inssPatronal: 0.2,
    terceirosPadrao: 0.058, // Sistema S + salário-educação (varia por FPAS)
    ratPadrao: 0.02,
    fapPadrao: 1.0,
    meiCpp: 0.03,
    descontoMaxVt: 0.06, // desconto máximo do vale-transporte no salário
    multaFgts: 0.4,
    // Empregador doméstico (LC 150/2015, recolhido no DAE do eSocial Doméstico)
    domesticoInss: 0.08,
    domesticoGilrat: 0.008,
    domesticoIndenizacao: 0.032,

    // INSS do empregado (Portaria Interministerial MPS/MF nº 13/2026) — progressivo.
    inssFaixas: [
      { ate: 1621.0, aliquota: 0.075 },
      { ate: 2902.84, aliquota: 0.09 },
      { ate: 4354.27, aliquota: 0.12 },
      { ate: 8475.55, aliquota: 0.14 },
    ],

    // IRRF mensal (Lei 15.191/2025) + redução da Lei 15.270/2025.
    irrfFaixas: [
      { ate: 2428.8, aliquota: 0, deduzir: 0 },
      { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
      { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
    ],
    irrfDependente: 189.59,
    irrfSimplificado: 607.2,
    irrfMinimo: 10,
    irrfReducao: { isencaoAte: 5000, maximo: 312.89, limite: 7350, a: 978.62, b: 0.133145 },
  },

  // Tabela de honorários (VALORES DE EXEMPLO — ajuste para os seus preços).
  honorarios: {
    minimoMensal: 390,
    // Preço por funcionário conforme o tamanho total da folha.
    faixas: [
      { ate: 5, porFuncionario: 75 },
      { ate: 20, porFuncionario: 60 },
      { ate: 50, porFuncionario: 50 },
      { ate: 100, porFuncionario: 42 },
      { ate: Infinity, porFuncionario: 35 },
    ],
    servicos: [
      {
        id: 'folha',
        nome: 'Folha de pagamento e eSocial',
        descricao: 'Cálculo mensal, 13º, férias, guias (FGTS Digital, DCTFWeb) e eSocial.',
        tipo: 'base',
        obrigatorio: true,
      },
      {
        id: 'admissao',
        nome: 'Admissões e rescisões',
        descricao: 'Documentação, contratos, cálculos rescisórios e homologações.',
        tipo: 'porFuncionario',
        valor: 10,
      },
      {
        id: 'ponto',
        nome: 'Gestão de ponto e jornada',
        descricao: 'Tratamento de ponto, horas extras, banco de horas e escalas.',
        tipo: 'porFuncionario',
        valor: 8,
      },
      {
        id: 'beneficios',
        nome: 'Gestão de benefícios',
        descricao: 'VT, VR/VA, plano de saúde e conferência de faturas.',
        tipo: 'porFuncionario',
        valor: 6,
      },
      {
        id: 'sst',
        nome: 'Apoio em SST',
        descricao: 'Controle de ASOs, PGR/PCMSO e eventos de SST no eSocial.',
        tipo: 'porFuncionario',
        valor: 7,
      },
      {
        id: 'consultoria',
        nome: 'Consultoria trabalhista',
        descricao: 'Atendimento consultivo para dúvidas e decisões trabalhistas.',
        tipo: 'fixo',
        valor: 350,
      },
      {
        id: 'recrutamento',
        nome: 'Recrutamento e seleção',
        descricao: 'Divulgação de vagas, triagem e entrevistas.',
        tipo: 'consulta',
      },
    ],
  },
};
