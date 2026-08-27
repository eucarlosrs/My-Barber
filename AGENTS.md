# REGRAS GLOBAIS DO PROJETO (MY BARBER)

1. **Regra Principal**: NÃO altere nenhuma funcionalidade, layout, lógica ou fluxo que não tenha sido explicitamente solicitado pelo usuário.
2. **Sugestões vs. Aplicação**: Qualquer melhoria, otimização ou correção NÃO solicitada deve ser apenas sugerida, NUNCA aplicada diretamente.
3. **Esclarecimento Prévio**: Se algo não estiver claro, pergunte antes de executar qualquer modificação.
4. **Formato Obrigatório de Resposta**: Responda sempre listando:
   1. O que será alterado
   2. O que NÃO será alterado
   3. Confirmação de que nenhuma outra parte foi modificada
5. **Aplicação Universal**: Estas regras se aplicam a todas as interações. Se uma solicitação violar estas regras ou gerar ambiguidades colaterais, apontar antes de executar.

---

# REGRA PERMANENTE — SEGURANÇA, AUTENTICAÇÃO E ÁREA ADMINISTRATIVA DO SaaS

## 1. AUTENTICAÇÃO
- Utilizar o Firebase Authentication como mecanismo oficial de autenticação dos usuários.
- NUNCA implementar autenticação administrativa através de comparação direta no frontend (senhas fixas no código, booleanos em localStorage/sessionStorage, parâmetros de URL ou checagem de string solta).
- A senha nunca deve ser armazenada ou comparada diretamente pelo código do frontend.

## 2. ÁREA ADMINISTRATIVA E AUTORIZAÇÃO
- A área administrativa do SaaS deve ser protegida por AUTORIZAÇÃO no backend, e não apenas por autenticação.
- Estar logado NÃO significa possuir acesso administrativo.
- O sistema deve verificar a role real do usuário através de fonte confiável do backend (Firebase Custom Claims / Firestore validado com Security Rules).
- A role principal do proprietário global do SaaS é: `super_admin`.

## 3. ROLES DO SISTEMA
- `super_admin`
- `barbershop_owner`
- `manager`
- `barber`
- `customer`
- Princípio de menor privilégio: cada role possui somente as permissões necessárias para sua função.

## 4. SUPER ADMIN
- O `super_admin` é o administrador global do SaaS com permissão para gerenciar todas as barbearias, planos, logs e configurações globais.
- A autorização final é baseada na role/claim confiável e verificada nas Firebase Security Rules.

## 5. MULTI-TENANT — BARBEARIAS ISOLADAS
- Cada barbearia possui um identificador único `barbershopId` / `tenantId`.
- Usuários de uma barbearia NÃO podem acessar, consultar, editar ou excluir dados de outra barbearia.
- As Firebase Security Rules são a camada soberana que valida e bloqueia qualquer violação de tenant no backend.

## 6. FIREBASE SECURITY RULES
- Camada obrigatória de segurança. Negar acesso por padrão e liberar apenas o explicitamente permitido.
- Bloquear leituras e escritas não autorizadas mesmo que rotas do frontend sejam acessadas diretamente.

## 7. FRONTEND
- Utilizado apenas para experiência visual (menus, rotas, botões). Toda permissão crítica é validada nas regras do Firebase e backend.

## 8. SENHAS E SEGREDOS
- Nunca armazenar credenciais mestres ou chaves privadas no código client-side.

## 9. ADMIN SDK
- Privilégios administrativos só podem ser atribuídos por ambiente seguro de backend.

## 10. NÃO QUEBRAR O SISTEMA
- Toda evolução deve ser integrada à arquitetura existente preservando dados, cadastros e rotas das barbearias ativas.

---

# GESTÃO DE VERSÕES, ISSUES E DEPLOYS (GITHUB & AGENTS)

## 1. FLUXO DE ISSUES E PULL REQUESTS (PRs)
- **Toda Tarefa** (Correção `fix:`, Melhoria `refactor:`/`perf:` ou Nova Função `feat:`) deve estar associada a uma Issue.
- Todo deploy e mesclagem de código deve ser realizado via Pull Request (PR).
- O PR **deve obrigatoriamente mencionar a Issue correspondente** no corpo da descrição (ex: `Closes #123` ou `Relacionado a #123`).
- Padrão de Branch: `feature/nome-da-tarefa`, `fix/descricao-do-bug` ou `chore/nome-da-tarefa`.

## 2. MOTION PRINCIPLES (UI/UX)
- Todas as telas e componentes devem utilizar transições fluidas e respeitar os princípios de animação:
  - **Skeletons pulsantes** durante carregamento de dados (listagens, cards, tabelas) em vez de telas em branco.
  - **Transições suaves de entrada e saída** (`fade-in`, `scale-up` com curvas como `easeOutExpo` via Motion / Tailwind).
  - Feedback visual imediato e estados de progresso em ações assíncronas (pagamentos, agendamentos, cadastros).

## 3. QUALIDADE DE CÓDIGO & OBSERVABILIDADE
- **Linting & Type Safety**: `npm run lint` (`tsc --noEmit`) deve passar com zero erros em todas as alterações.
- **Testes Automatizados**: Manter e rodar a suíte de testes (`npm test`) para garantir integridade das regras financeiras do Mercado Pago e isolamento multi-tenant.
- **Error Boundary Global**: Interceptar exceções de renderização no cliente sem quebrar a sessão do usuário.


