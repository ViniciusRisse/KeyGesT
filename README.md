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
