# KeyGest — site institucional

Site da KeyGest (RH, departamento pessoal e folha de pagamento). HTML, CSS e JavaScript puros, sem build: basta publicar a pasta (GitHub Pages, Netlify, Vercel ou qualquer hospedagem).

## Páginas

| Página | O que faz |
| --- | --- |
| `index.html` | Página inicial: serviços, por que terceirizar, como funciona, FAQ |
| `calculadora.html` | Calculadora de folha: cargos, salários, benefícios e serviços → custo trabalhista + honorários |
| `simulador.html` | Simulador de encargos: 13º, férias + 1/3, FGTS, INSS patronal, RAT × FAP, terceiros por regime |
| `contato.html` | Captação de clientes: nome, empresa, CNPJ (inclui o novo CNPJ alfanumérico), telefone, e-mail, LGPD |
| `privacidade.html` | Modelo de política de privacidade (revisar com assessoria jurídica) |

## Configuração — `js/config.js`

Tudo que muda com frequência fica nesse arquivo:

- **Contatos**: e-mail, telefone e WhatsApp (o botão flutuante aparece quando o número é preenchido).
- **Formulário**: em `formulario.endpoint`, coloque a URL de um serviço como o [Formspree](https://formspree.io). Sem endpoint, o formulário abre o e-mail do visitante com a mensagem pronta.
- **Parâmetros legais**: salário mínimo, FGTS, INSS patronal, terceiros, RAT, FAP. Revise todo ano.
- **Honorários**: mensalidade mínima, preço por funcionário por faixa e preço de cada serviço. **Os valores atuais são exemplos.**

## Regras de cálculo — `js/encargos.js`

- Custo mensal médio = remuneração + provisão de 13º (1/12) + provisão de 1/3 de férias (1/36) + encargos sobre o total.
- Encargos por regime: Lucro Presumido/Real (20% + RAT×FAP + terceiros + FGTS); Simples I/II/III/V (só FGTS); Simples IV (20% + RAT×FAP + FGTS); MEI (3% + FGTS).
- Vale-transporte: a empresa paga o valor que exceder 6% do salário.
- Não cobre desoneração da folha (CPRB) nem regras de convenções coletivas.

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Publicar no GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → escolha a branch e a pasta `/ (root)`.

## Sistema de colaboradores — `sistema/`

Área restrita em `sistema/index.html` (link "Área restrita" no rodapé do site) para a equipe KeyGest gerenciar:

- **Empresas clientes**: dados, CNPJ, regime tributário e encargos (RAT, FAP, terceiros).
- **Colaboradores**: dados pessoais (CPF validado), contrato, salário, admissão, situação e desligamento; busca, filtros e exportação para planilha (CSV/Excel).
- **Férias**: períodos aquisitivos e concessivos calculados automaticamente, saldo, alerta de férias vencidas (pagamento em dobro) e registro de férias com abono.
- **Painel**: totais, folha mensal, custo estimado com encargos, prazos de férias e de contrato de experiência (45/90 dias) e aniversariantes do mês.

Sem configuração, o sistema abre em **modo demonstração**: dados de exemplo fictícios, salvos só no navegador. Não use o modo demonstração para dados reais.

### Ativar o banco de dados (Supabase)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e clique em **New project** (região: South America – São Paulo).
2. Abra **SQL Editor**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas e as regras de segurança.
3. Em **Authentication → Users**, clique em **Add user → Create new user**, informe `keygest.rh@gmail.com` e uma senha forte e marque **Auto Confirm User**.
4. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up** (só você cria os acessos).
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole em `js/config.js`, no bloco `supabase`.

A chave *anon* pode ficar no site: o acesso aos dados é protegido pelas regras de segurança (RLS), que só liberam os e-mails cadastrados na tabela `equipe`. Para dar acesso a outra pessoa, crie o usuário (passo 3) e rode no SQL Editor:

```sql
insert into equipe (email, nome) values ('pessoa@exemplo.com', 'Nome da pessoa');
```

> Nunca coloque a chave **service_role** no site.
