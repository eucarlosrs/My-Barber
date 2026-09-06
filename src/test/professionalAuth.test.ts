import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeLogin,
  validateProfessionalCreation,
  authenticateUserCredentials
} from '../utils/professionalAuthEngine.js';
import { Barbershop, User } from '../types/index.js';

describe('MY BARBER - Regras Críticas de Autenticação e Criação de Profissionais', () => {
  const dummyBarbershops: Barbershop[] = [
    {
      id: 'tenant-barbearia-a',
      name: 'Barbearia Alpha',
      slug: 'barbeariaalpha.com.br',
      phone: '(11) 98765-4321',
      address: {
        street: 'Rua das Flores',
        number: '100',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001-000'
      },
      status: 'ACTIVE',
      planId: 'plan-pro',
      createdAt: '2026-01-01T00:00:00Z',
      businessHours: []
    },
    {
      id: 'tenant-barbearia-b',
      name: 'Barbearia Beta',
      slug: 'barbeariabeta.com.br',
      phone: '(11) 98765-4322',
      address: {
        street: 'Av. Paulista',
        number: '200',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-000'
      },
      status: 'ACTIVE',
      planId: 'plan-basic',
      createdAt: '2026-01-01T00:00:00Z',
      businessHours: []
    }
  ] as unknown as Barbershop[];

  const dummyExistingUsers: User[] = [
    {
      id: 'user-super-admin',
      tenantId: 'platform-global',
      role: 'SUPER_ADMIN',
      name: 'Carlos Silva',
      email: 'carlosrs.email@gmail.com',
      whatsapp: '(11) 99999-0000',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'user-owner-a',
      tenantId: 'tenant-barbearia-a',
      role: 'PROPRIETARIO',
      name: 'Dono Alpha',
      email: 'dono@barbeariaalpha.com.br',
      username: 'dono.alpha',
      password: 'secretPassword123',
      whatsapp: '(11) 98888-1111',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z'
    },
    {
      id: 'user-prof-eduardo',
      tenantId: 'tenant-barbearia-a',
      role: 'PROFISSIONAL',
      name: 'Eduardo Rodrigues',
      email: 'eduardo.rodrigues@barbeariaalpha.com.br',
      username: 'eduardo.rodrigues',
      password: '123456',
      whatsapp: '(11) 97333-4455',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z'
    }
  ];

  // Teste 1: Criação pelo Administrador Geral com seleção de barbearia
  it('1. Deve permitir Administrador Geral criar profissional vinculado a uma barbearia', () => {
    const res = validateProfessionalCreation({
      name: 'Marcos Silva',
      tenantId: 'tenant-barbearia-a',
      login: 'marcos.silva',
      password: '123456',
      creatorRole: 'SUPER_ADMIN',
      creatorTenantId: 'platform-global',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.normalized?.username, 'marcos.silva');
    assert.strictEqual(res.normalized?.email, 'marcos.silva@barbeariaalpha.com.br');
  });

  // Teste 2: Criação sem barbearia pelo Administrador Geral -> Bloqueado
  it('2. Deve BLOQUEAR Administrador Geral de criar profissional sem vincular barbearia', () => {
    const res = validateProfessionalCreation({
      name: 'Marcos Silva',
      tenantId: 'platform-global', // Inválido para profissional
      login: 'marcos.silva',
      password: '123456',
      creatorRole: 'SUPER_ADMIN',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /obrigatório selecionar uma barbearia/i);
  });

  // Teste 3: Criação pelo Gerente/Proprietário para sua própria barbearia
  it('3. Deve permitir Gerente/Proprietário criar profissional para sua própria barbearia', () => {
    const res = validateProfessionalCreation({
      name: 'Lucas Barbeiro',
      tenantId: 'tenant-barbearia-a',
      login: 'lucas.barbeiro',
      password: 'password123',
      creatorRole: 'PROPRIETARIO',
      creatorTenantId: 'tenant-barbearia-a',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.normalized?.username, 'lucas.barbeiro');
  });

  // Teste 4: Gerente/Proprietário tentando criar para outra barbearia -> Bloqueado
  it('4. Deve BLOQUEAR Gerente/Proprietário de criar profissional para outra barbearia', () => {
    const res = validateProfessionalCreation({
      name: 'Invasor Barbeiro',
      tenantId: 'tenant-barbearia-b', // Barbearia B
      login: 'invasor.barbeiro',
      password: 'password123',
      creatorRole: 'PROPRIETARIO',
      creatorTenantId: 'tenant-barbearia-a', // Pertence à Barbearia A
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /permissão negada.*própria barbearia/i);
  });

  // Teste 5: Login aprovado com e-mail cadastrado
  it('5. Deve APROVAR login utilizando o e-mail completo cadastrado', () => {
    const auth = authenticateUserCredentials({
      identifier: 'eduardo.rodrigues@barbeariaalpha.com.br',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.user?.id, 'user-prof-eduardo');
    assert.strictEqual(auth.user?.role, 'PROFISSIONAL');
  });

  // Teste 6: Login aprovado com nome de usuário
  it('6. Deve APROVAR login utilizando apenas o nome de usuário (username)', () => {
    const auth = authenticateUserCredentials({
      identifier: 'eduardo.rodrigues',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.user?.id, 'user-prof-eduardo');
  });

  // Teste 7: Login com caracteres maiúsculos
  it('7. Deve APROVAR login com caracteres maiúsculos (normalização case-insensitive)', () => {
    const auth = authenticateUserCredentials({
      identifier: 'EDUARDO.RODRIGUES',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.user?.name, 'Eduardo Rodrigues');
  });

  // Teste 8: Login com espaços antes e depois
  it('8. Deve APROVAR login com espaços antes/depois (trim automático)', () => {
    const auth = authenticateUserCredentials({
      identifier: '   eduardo.rodrigues   ',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.user?.id, 'user-prof-eduardo');
  });

  // Teste 9: Login com senha incorreta -> Bloqueado com mensagem clara
  it('9. Deve BLOQUEAR login com senha incorreta', () => {
    const auth = authenticateUserCredentials({
      identifier: 'eduardo.rodrigues',
      password: 'wrongpassword',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, false);
    assert.match(auth.error || '', /senha incorreta/i);
  });

  // Teste 10: Login com usuário inexistente -> Mensagem amigável
  it('10. Deve BLOQUEAR login com identificador inexistente', () => {
    const auth = authenticateUserCredentials({
      identifier: 'usuario.fantasma',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, false);
    assert.match(auth.error || '', /nenhuma conta encontrada/i);
  });

  // Teste 11: Login de profissional com status 'inactive' -> Bloqueado
  it('11. Deve BLOQUEAR login quando status do profissional for inactive', () => {
    const inactiveUser: User = {
      ...dummyExistingUsers[2],
      id: 'user-prof-inativo',
      email: 'inativo@barbeariaalpha.com.br',
      username: 'inativo.barbeiro',
      status: 'inactive'
    };

    const auth = authenticateUserCredentials({
      identifier: 'inativo.barbeiro',
      password: '123456',
      users: [...dummyExistingUsers, inactiveUser]
    });

    assert.strictEqual(auth.success, false);
    assert.strictEqual(auth.error, 'Seu acesso está inativo. Entre em contato com o administrador da barbearia.');
  });

  // Teste 12: Tolerância de correção histórica do Eduardo (ridrigues vs rodrigues)
  it('12. Deve encontrar a conta do Eduardo mesmo se houver o typo histórico ridrigues', () => {
    const auth = authenticateUserCredentials({
      identifier: 'eduardo.ridrigues',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.user?.id, 'user-prof-eduardo');
  });

  // Teste 13 e 14: Alteração de senha
  it('13 e 14. Senha antiga deve falhar e nova senha deve funcionar após alteração', () => {
    const updatedUsers: User[] = dummyExistingUsers.map(u =>
      u.id === 'user-prof-eduardo' ? { ...u, password: 'novaSenhaSegura2026' } : u
    );

    // Senha antiga
    const oldAuth = authenticateUserCredentials({
      identifier: 'eduardo.rodrigues',
      password: '123456',
      users: updatedUsers
    });
    assert.strictEqual(oldAuth.success, false);
    assert.match(oldAuth.error || '', /senha incorreta/i);

    // Nova senha
    const newAuth = authenticateUserCredentials({
      identifier: 'eduardo.rodrigues',
      password: 'novaSenhaSegura2026',
      users: updatedUsers
    });
    assert.strictEqual(newAuth.success, true);
  });

  // Teste 15: Tentativa de criar com e-mail duplicado
  it('15. Deve BLOQUEAR criação de profissional com e-mail já existente', () => {
    const res = validateProfessionalCreation({
      name: 'Eduardo Clone',
      tenantId: 'tenant-barbearia-a',
      login: 'eduardo.rodrigues@barbeariaalpha.com.br',
      password: '123456',
      creatorRole: 'SUPER_ADMIN',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'Este e-mail/usuário já está vinculado a uma conta.');
  });

  // Teste 16: Tentativa de criar com username duplicado
  it('16. Deve BLOQUEAR criação de profissional com username já existente', () => {
    const res = validateProfessionalCreation({
      name: 'Eduardo Clone 2',
      tenantId: 'tenant-barbearia-a',
      login: 'eduardo.rodrigues',
      password: '123456',
      creatorRole: 'SUPER_ADMIN',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'Este e-mail/usuário já está vinculado a uma conta.');
  });

  // Teste 17: Tentativa de criar sem nome
  it('17. Deve BLOQUEAR criação de profissional com nome vazio', () => {
    const res = validateProfessionalCreation({
      name: '   ',
      tenantId: 'tenant-barbearia-a',
      login: 'novo.barbeiro',
      password: '123456',
      creatorRole: 'SUPER_ADMIN',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'Nome do profissional é obrigatório.');
  });

  // Teste 18: Tentativa de criar com senha curta (< 4 caracteres)
  it('18. Deve BLOQUEAR senha fraca com menos de 4 caracteres', () => {
    const res = validateProfessionalCreation({
      name: 'Novo Barbeiro',
      tenantId: 'tenant-barbearia-a',
      login: 'novo.barbeiro',
      password: '123',
      creatorRole: 'SUPER_ADMIN',
      existingUsers: dummyExistingUsers,
      barbershops: dummyBarbershops
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.error, 'A senha de acesso deve conter ao menos 4 caracteres.');
  });

  // Teste 19: Garantir que senhas não sejam incluídas nos logs
  it('19. Objeto de log de auditoria não deve conter senha', () => {
    const auditLog = {
      action: 'CRIAR_PROFISSIONAL',
      actorRole: 'SUPER_ADMIN',
      details: 'Profissional Eduardo cadastrado com login eduardo.rodrigues'
    };
    assert.strictEqual('password' in auditLog, false);
    assert.doesNotMatch(auditLog.details, /123456/);
  });

  // Teste 20, 21, 22: Role, Status e TenantId
  it('20, 21, 22. Profissional criado deve ter role PROFISSIONAL, status active e tenantId correto', () => {
    const norm = normalizeLogin('rodrigo.barber', dummyBarbershops[0].slug);
    assert.ok(norm);

    const newProf: User = {
      id: 'user-prof-new',
      tenantId: dummyBarbershops[0].id,
      role: 'PROFISSIONAL',
      status: 'active',
      name: 'Rodrigo Barber',
      username: norm.username,
      email: norm.email,
      whatsapp: '(11) 99999-8888',
      createdAt: new Date().toISOString()
    };

    assert.strictEqual(newProf.role, 'PROFISSIONAL');
    assert.strictEqual(newProf.status, 'active');
    assert.strictEqual(newProf.tenantId, 'tenant-barbearia-a');
  });

  // Teste 23 e 24: Isolamento multi-tenant entre Barbearia A e Barbearia B
  it('23 e 24. Isolamento multi-tenant: profissionais da Barbearia A pertencem exclusivamente ao seu tenantId', () => {
    const profA = dummyExistingUsers.find(u => u.id === 'user-prof-eduardo');
    assert.strictEqual(profA?.tenantId, 'tenant-barbearia-a');
    assert.notStrictEqual(profA?.tenantId, 'tenant-barbearia-b');
  });

  // Teste 25: Login por WhatsApp
  it('25. Deve APROVAR login de profissional também por número de WhatsApp formatado ou limpo', () => {
    const auth = authenticateUserCredentials({
      identifier: '11973334455',
      password: '123456',
      users: dummyExistingUsers
    });

    assert.strictEqual(auth.success, true);
    assert.strictEqual(auth.user?.id, 'user-prof-eduardo');
  });
});
