# POLÍTICA DE SEGURANÇA E ARQUITETURA DO CATÁLOGO PÚBLICO (MY BARBER)
**Fase 2.2E — Modelo Oficial de Consistência e Autoridade**

---

## 1. PUBLIC CATALOG POLICY (VITRINES COMERCIAIS)

As projeções públicas de catálogo em:
* `publicPackages/{tenantId}/items/{packageId}`
* `publicPromotions/{tenantId}/items/{promotionId}`
* `publicGallery/{tenantId}/items/{workId}`

constituem **vitrines comerciais abertas** destinadas à divulgação, atração de clientes e experiência de agendamento online.

### Regras Fundamentais de Acesso Público:
1. **Não exige autenticação**: Visitantes anônimos e clientes finais podem consultar serviços, pacotes, promoções e fotos da galeria livremente para agendar horários.
2. **NÃO representa autorização de tenant**: A capacidade de ler um item público sob um `{tenantId}` **não** concede privilégios de gestão nem comprova vínculo formal do visitante com a barbearia.
3. **NÃO armazena dados privados**: Nenhum dado confidencial, margem de lucro, comissão de funcionário, notas internas, relatórios contábeis, chaves ou tokens pode ser publicado nas vitrines públicas.
4. **Visibilidade por identificador**: Caso o identificador público de outro tenant seja conhecido, o catálogo comercial desse outro tenant também poderá ser visualizado por clientes (comportamento inerente a plataformas multi-tenant de vitrine web).
5. **Isolamento de Segurança**: O isolamento de tenant rigoroso e soberano é estritamente mantido em todas as coleções privadas (`packages`, `promotions`, `gallery`, `users`, `appointments`, `financial`) e nas rotas administrativas de mutação.

---

## 2. GOVERNANÇA DE MUTAÇÃO (QUEM PODE ALTERAR E EXCLUIR)

| Coleção Pública | Escrita por Client SDK | Quem pode Publicar / Atualizar | Quem pode Remover |
| :--- | :--- | :--- | :--- |
| `publicPackages` | **BLOQUEADA** (`allow write: if false;`) | Backend Autoritativo via Admin SDK acionado por `manager`, `barbershop_owner` do respectivo tenant ou `super_admin`. | Idem. |
| `publicPromotions` | **BLOQUEADA** (`allow write: if false;`) | Backend Autoritativo via Admin SDK acionado por `manager`, `barbershop_owner` do respectivo tenant ou `super_admin`. | Idem. |
| `publicGallery` | **BLOQUEADA** (`allow write: if false;`) | Backend Autoritativo via Admin SDK acionado por `manager`, `barbershop_owner` do respectivo tenant ou `super_admin`. | Idem. |

---

## 3. COMO A PROJEÇÃO É GERADA (FONTE DA VERDADE)

O backend **NUNCA** aceita um payload arbitrário enviado pelo frontend como fonte da verdade para publicação:
1. O frontend envia apenas a intenção de sincronização informando o `packageId`, `promotionId` ou `workId`.
2. O backend autentica a requisição via Firebase ID Token e inspeciona as **Custom Claims** confiáveis.
3. O backend recupera diretamente o documento oficial na **coleção privada** do Firestore (`packages/{id}`, `promotions/{id}`, `gallery/{id}`).
4. Se o documento privado não existir, a operação é rejeitada imediatamente com HTTP 404 (`CatalogNotFoundError`).
5. O backend valida se o `tenantId` do documento corresponde rigorosamente ao `tenantId` das Custom Claims do usuário (ou se o usuário é `super_admin`). Se houver divergência, retorna HTTP 403 (`CatalogAuthorizationError`).
6. A projeção é sanitizada deterministicamente via funções puras (`toPublicPackage`, `toPublicPromotion`, `toPublicGalleryWork`), expurgando custos, comissões e metadados internos.
7. A gravação é realizada na subcoleção pública de forma **idempotente** utilizando `set(..., { merge: true })` com IDs idênticos.

---

## 4. CURTIDAS NA GALERIA (LIKES AUTORITATIVOS)

* Visitantes anônimos ou clientes **não** podem gravar diretamente na coleção privada `gallery` nem alterar livremente o valor de `likesCount`.
* As curtidas são processadas através do endpoint autoritativo `POST /api/catalog/gallery/:id/like`.
* O endpoint:
  * Aplica rate-limiting baseado em IP/origem (máximo de 30 curtidas por minuto por visitante).
  * Executa uma transação atômica no Firestore (`runTransaction`).
  * Incrementa de forma unitária e segura (`likesCount = currentLikes + 1`).
  * Rejeita valores arbitrários fornecidos pelo cliente.
  * Atualiza atomicamente a coleção privada e a projeção pública.

---

## 5. TRATAMENTO DE FALHAS E RESILIÊNCIA

1. **Idempotência Garantida**: Como os caminhos de destino utilizam chaves determinísticas `{tenantId}/items/{entityId}`, chamadas repetidas de sincronização não duplicam registros nem geram inconsistências.
2. **Exclusões Idempotentes**: A exclusão em `public*` utiliza `delete()`, que é naturalmente idempotente no Firestore (executar múltiplas vezes em documento inexistente é um no-op seguro).
3. **Detecção de Falha**: O frontend monitora a resposta HTTP das chamadas de sincronização e registra avisos explícitos no console se houver rejeição de permissão ou falha de rede, impedindo falso sucesso silencioso.
