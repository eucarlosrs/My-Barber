import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  getAppCheckEnvironment,
  getAppCheckStatus,
  initAppCheck
} from '../lib/appCheck';

describe('ETAPA 2.2K — Implementação do Firebase App Check com Preservação do Agendamento Público', () => {
  const appCheckCodePath = path.resolve(process.cwd(), 'src/lib/appCheck.ts');
  const firebaseCodePath = path.resolve(process.cwd(), 'src/lib/firebase.ts');
  const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
  const firestoreRulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const authMiddlewarePath = path.resolve(process.cwd(), 'src/server/authMiddleware.ts');

  const appCheckCode = fs.readFileSync(appCheckCodePath, 'utf8');
  const firebaseCode = fs.readFileSync(firebaseCodePath, 'utf8');
  const appContextCode = fs.readFileSync(appContextPath, 'utf8');
  const firestoreRules = fs.readFileSync(firestoreRulesPath, 'utf8');
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  const authMiddlewareCode = fs.readFileSync(authMiddlewarePath, 'utf8');

  // =========================================================================
  // 1. FIREBASE APP CHECK INICIALIZADO CORRETAMENTE
  // =========================================================================
  it('1. Firebase App Check deve ser exportado e inicializado no cliente em src/lib/firebase.ts', () => {
    assert.ok(
      firebaseCode.includes("import { initAppCheck } from './appCheck';"),
      'firebase.ts deve importar initAppCheck de ./appCheck'
    );
    assert.ok(
      firebaseCode.includes('export const appCheck = initAppCheck(app);'),
      'firebase.ts deve exportar appCheck inicializado antes dos serviços Firestore/Storage'
    );

    // No ambiente Node (onde roda a suíte de testes), deve retornar null seguramente sem quebrar
    const testInstance = initAppCheck();
    assert.strictEqual(testInstance, null, 'No ambiente de teste (Node), initAppCheck não deve tentar carregar DOM ou reCAPTCHA');
  });

  // =========================================================================
  // 2. AMBIENTE DE DESENVOLVIMENTO NÃO QUEBRA O APP
  // =========================================================================
  it('2. Ambiente de desenvolvimento suporta Debug Token e fallback resiliente sem quebrar a execução', () => {
    assert.ok(
      appCheckCode.includes('FIREBASE_APPCHECK_DEBUG_TOKEN'),
      'appCheck.ts deve suportar FIREBASE_APPCHECK_DEBUG_TOKEN para desenvolvedores'
    );
    assert.ok(
      appCheckCode.includes('CustomProvider') || appCheckCode.includes('ReCaptchaV3Provider'),
      'appCheck.ts deve suportar provider para testes e desenvolvimento local'
    );

    // Verifica que erros em desenvolvimento são tratados sem quebrar
    assert.ok(
      appCheckCode.includes('catch (devError)'),
      'appCheck.ts deve capturar possíveis exceções no ambiente de desenvolvimento'
    );
  });

  // =========================================================================
  // 3. AMBIENTE DE PRODUÇÃO UTILIZA CONFIGURAÇÃO SEGURA
  // =========================================================================
  it('3. Ambiente de produção desativa estritamente o Debug Token e requer provider oficial', () => {
    // Garante que o bloco de produção define FIREBASE_APPCHECK_DEBUG_TOKEN = false
    assert.ok(
      appCheckCode.includes('if (env === \'production\')'),
      'Seção de produção deve existir em appCheck.ts'
    );
    assert.ok(
      appCheckCode.includes('FIREBASE_APPCHECK_DEBUG_TOKEN = false'),
      'Em produção, FIREBASE_APPCHECK_DEBUG_TOKEN deve ser explicitamente desativado (false)'
    );
    assert.ok(
      appCheckCode.includes('new ReCaptchaV3Provider(siteKey)'),
      'Em produção com chave, deve utilizar ReCaptchaV3Provider oficial'
    );
  });

  // =========================================================================
  // 4. USUÁRIO AUTENTICADO CONTINUA FUNCIONANDO
  // =========================================================================
  it('4. Firebase Authentication e Custom Claims continuam soberanos para RBAC e identidade', () => {
    // App Check não substitui authMiddleware nem Custom Claims
    assert.ok(
      authMiddlewareCode.includes('verifyFirebaseIdToken'),
      'authMiddleware deve continuar validando tokens Firebase Authentication via verifyFirebaseIdToken'
    );
    assert.ok(
      authMiddlewareCode.includes('isSuperAdmin') && authMiddlewareCode.includes('tenantId'),
      'authMiddleware deve continuar verificando Custom Claims de autorização'
    );
  });

  // =========================================================================
  // 5. AGENDAMENTO PÚBLICO SEM LOGIN CONTINUA FUNCIONAL
  // =========================================================================
  it('5. Agendamento público sem login permanece acessível e compatível', () => {
    // Confirma que addAppointment em AppContext.tsx não exige login
    assert.ok(
      appContextCode.includes('const addAppointment = (newApp: Omit<Appointment,'),
      'addAppointment deve existir no AppContext'
    );

    // Verifica que firestore.rules permite criação anônima de agendamentos com validações estritas
    const appMatch = firestoreRules.match(/match \/appointments\/\{appointmentId\} \{([\s\S]*?)\}/);
    assert.ok(appMatch, 'Regra de appointments deve existir em firestore.rules');
    assert.ok(
      appMatch[0].includes("request.resource.data.status == 'AGENDADO'"),
      'firestore.rules deve permitir criação de agendamento com status AGENDADO sem exigir login'
    );
  });

  // =========================================================================
  // 6. DADOS PÚBLICOS CONTINUAM ACESSÍVEIS CONFORME ARQUITETURA ATUAL
  // =========================================================================
  it('6. Projeções públicas continuam acessíveis publicamente no Firestore', () => {
    const publicProjections = [
      'publicBarbershops',
      'publicServices',
      'publicAvailability',
      'publicProfessionalProfiles',
      'publicSchedules',
      'publicCommunications',
      'publicRaffles'
    ];

    for (const proj of publicProjections) {
      const matchRegex = new RegExp(`match \\/${proj}\\/\\{[a-zA-Z0-9_]+\\}\\s*\\{[\\s\\S]*?allow read:\\s*if\\s+true;`);
      assert.ok(
        matchRegex.test(firestoreRules),
        `Projeção ${proj} deve permitir leitura pública irrestrita no Firestore Rules`
      );
    }
  });

  // =========================================================================
  // 7. NÃO EXISTE BYPASS POR LOCALSTORAGE
  // =========================================================================
  it('7. appCheck.ts NÃO utiliza localStorage para bypass, identidade ou desativação de proteção', () => {
    assert.strictEqual(
      appCheckCode.includes('localStorage.getItem'),
      false,
      'appCheck.ts NÃO deve ler localStorage'
    );
    assert.strictEqual(
      appCheckCode.includes('localStorage.setItem'),
      false,
      'appCheck.ts NÃO deve escrever em localStorage'
    );
  });

  // =========================================================================
  // 8. NÃO EXISTE BYPASS POR BODY / QUERY
  // =========================================================================
  it('8. Não existe bypass de App Check ou segurança baseado em query params ou body', () => {
    assert.strictEqual(
      appCheckCode.includes('window.location.search'),
      false,
      'appCheck.ts NÃO deve inspecionar query params para burlar proteção'
    );
    assert.strictEqual(
      serverCode.includes('req.body.bypassAppCheck') || serverCode.includes('req.query.bypassAppCheck'),
      false,
      'server.ts NÃO deve aceitar flags de bypass por body ou query'
    );
  });

  // =========================================================================
  // 9. NÃO EXISTE FLAG INSEGURA PARA DESATIVAR APP CHECK EM PRODUÇÃO
  // =========================================================================
  it('9. Não existe flag para desabilitar silenciosamente a proteção em produção', () => {
    assert.strictEqual(
      appCheckCode.includes('DISABLE_APP_CHECK=true') || appCheckCode.includes('BYPASS_APP_CHECK'),
      false,
      'Nenhuma flag de desativação insegura deve existir'
    );

    const status = getAppCheckStatus();
    assert.strictEqual(
      status.isEnforced,
      false,
      'Enforcement destrutivo automático deve ser false até aprovação de métricas na nuvem'
    );
    assert.strictEqual(
      status.publicBookingSupported,
      true,
      'Suporte a agendamento público deve ser garantido'
    );
  });

  // =========================================================================
  // 10. NÃO EXISTE ALTERAÇÃO INDEVIDA NAS REGRAS DE RBAC
  // =========================================================================
  it('10. Regras de RBAC e Custom Claims continuam inalteradas e soberanas', () => {
    assert.ok(
      firestoreRules.includes('function isSuperAdmin()'),
      'firestore.rules deve manter isSuperAdmin()'
    );
    assert.ok(
      firestoreRules.includes('function isOwnerOfTenant(tenantId)'),
      'firestore.rules deve manter isOwnerOfTenant()'
    );
    assert.ok(
      firestoreRules.includes('function isManagerOrOwnerOfTenant(tenantId)'),
      'firestore.rules deve manter isManagerOrOwnerOfTenant()'
    );
    assert.ok(
      firestoreRules.includes('function isMemberOfTenant(tenantId)'),
      'firestore.rules deve manter isMemberOfTenant()'
    );
  });
});
