import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('FASE 4.6B — Code Splitting e Lazy Loading do Frontend', () => {
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf-8');

  it('1. App.tsx importa lazy e Suspense do React', () => {
    assert.match(
      appContent,
      /import\s+React,\s*\{\s*Suspense,\s*lazy\s*\}\s*from\s*['"]react['"]/,
      'App.tsx deve importar Suspense e lazy do React'
    );
  });

  it('2. MasterAdminView é carregada via lazy loading sob demanda', () => {
    assert.match(
      appContent,
      /const\s+MasterAdminView\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/masteradmin\/MasterAdminView['"]\)/,
      'MasterAdminView deve ser importada dinamicamente via lazy'
    );
    assert.doesNotMatch(
      appContent,
      /import\s*\{\s*MasterAdminView\s*\}\s*from/,
      'MasterAdminView não deve possuir import estático'
    );
  });

  it('3. WebAdminView é carregada via lazy loading sob demanda', () => {
    assert.match(
      appContent,
      /const\s+WebAdminView\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/webadmin\/WebAdminView['"]\)/,
      'WebAdminView deve ser importada dinamicamente via lazy'
    );
    assert.doesNotMatch(
      appContent,
      /import\s*\{\s*WebAdminView\s*\}\s*from/,
      'WebAdminView não deve possuir import estático'
    );
  });

  it('4. ProfessionalAppView é carregada via lazy loading sob demanda', () => {
    assert.match(
      appContent,
      /const\s+ProfessionalAppView\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/app\/ProfessionalAppView['"]\)/,
      'ProfessionalAppView deve ser importada dinamicamente via lazy'
    );
    assert.doesNotMatch(
      appContent,
      /import\s*\{\s*ProfessionalAppView\s*\}\s*from/,
      'ProfessionalAppView não deve possuir import estático'
    );
  });

  it('5. ArchitectureView é carregada via lazy loading sob demanda', () => {
    assert.match(
      appContent,
      /const\s+ArchitectureView\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]\.\/components\/architecture\/ArchitectureView['"]\)/,
      'ArchitectureView deve ser importada dinamicamente via lazy'
    );
    assert.doesNotMatch(
      appContent,
      /import\s*\{\s*ArchitectureView\s*\}\s*from/,
      'ArchitectureView não deve possuir import estático'
    );
  });

  it('6. ClientAppView permanece estática e síncrona para boot imediato', () => {
    assert.match(
      appContent,
      /import\s*\{\s*ClientAppView\s*\}\s*from\s*['"]\.\/components\/app\/ClientAppView['"]/,
      'ClientAppView deve permanecer com import estático'
    );
  });

  it('7. AuthLoginView permanece estática e síncrona', () => {
    assert.match(
      appContent,
      /import\s*\{\s*AuthLoginView\s*\}\s*from\s*['"]\.\/components\/auth\/AuthLoginView['"]/,
      'AuthLoginView deve permanecer com import estático'
    );
  });

  it('8. StaffLoginView permanece estática e síncrona', () => {
    assert.match(
      appContent,
      /import\s*\{\s*StaffLoginView\s*\}\s*from\s*['"]\.\/components\/auth\/StaffLoginView['"]/,
      'StaffLoginView deve permanecer com import estático'
    );
  });

  it('9. BarbershopDiscoveryView permanece estática e síncrona', () => {
    assert.match(
      appContent,
      /import\s*\{\s*BarbershopDiscoveryView\s*\}\s*from\s*['"]\.\/components\/discovery\/BarbershopDiscoveryView['"]/,
      'BarbershopDiscoveryView deve permanecer com import estático'
    );
  });

  it('10. Barreira de segurança do MasterAdminView ocorre ANTES de renderizar o chunk lazy', () => {
    const masterAdminCaseMatch = appContent.match(/case 'MASTER_ADMIN':([\s\S]*?)case 'WEBADMIN':/);
    assert.ok(masterAdminCaseMatch, 'Deve existir case MASTER_ADMIN');
    const caseBlock = masterAdminCaseMatch[1];
    assert.match(
      caseBlock,
      /if\s*\(!isSuperAdmin\)\s*\{\s*return\s*<StaffLoginView\s*\/>;\s*\}/,
      'Bloqueio com StaffLoginView deve ocorrer antes de renderizar MasterAdminView'
    );
  });

  it('11. Barreira de segurança do WebAdminView ocorre ANTES de renderizar o chunk lazy', () => {
    const webAdminCaseMatch = appContent.match(/case 'WEBADMIN':([\s\S]*?)case 'PROFISSIONAL_APP':/);
    assert.ok(webAdminCaseMatch, 'Deve existir case WEBADMIN');
    const caseBlock = webAdminCaseMatch[1];
    assert.match(
      caseBlock,
      /if\s*\(effectiveRole\s*!==\s*'PROPRIETARIO'\s*&&\s*effectiveRole\s*!==\s*'GERENTE'\s*&&\s*!isSuperAdmin\)\s*\{\s*return\s*<StaffLoginView\s*\/>;\s*\}/,
      'Bloqueio de gestor deve ocorrer antes de renderizar WebAdminView'
    );
  });

  it('12. Barreira de segurança do ProfessionalAppView ocorre ANTES de renderizar o chunk lazy', () => {
    const profCaseMatch = appContent.match(/case 'PROFISSIONAL_APP':([\s\S]*?)case 'CLIENT_APP':/);
    assert.ok(profCaseMatch, 'Deve existir case PROFISSIONAL_APP');
    const caseBlock = profCaseMatch[1];
    assert.match(
      caseBlock,
      /if\s*\(effectiveRole\s*!==\s*'PROFISSIONAL'\s*&&\s*!isSuperAdmin\)\s*\{\s*return\s*<StaffLoginView\s*\/>;\s*\}/,
      'Bloqueio de profissional deve ocorrer antes de renderizar ProfessionalAppView'
    );
  });

  it('13. LazyLoadingFallback mantém bg-[#0D0D0D], padrão visual elegante sem flash branco', () => {
    assert.match(
      appContent,
      /const\s+LazyLoadingFallback:[\s\S]*?bg-\[#0D0D0D\]/,
      'Fallback de lazy loading deve manter fundo escuro #0D0D0D'
    );
    assert.match(
      appContent,
      /Carregando módulo\.\.\./,
      'Fallback deve informar feedback contextual de carregamento de módulo'
    );
  });

  it('14. InitialLoadingSplash permanece intacto e preservado', () => {
    assert.match(
      appContent,
      /const\s+InitialLoadingSplash:[\s\S]*?Sincronizando dados em tempo real\.\.\./,
      'InitialLoadingSplash não deve ser alterado ou corrompido'
    );
  });
});
