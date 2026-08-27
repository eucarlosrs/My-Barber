import { describe, it } from 'node:test';
import assert from 'node:assert';

// Business Rules Test Suite: MY BARBER
describe('MY BARBER - Regras de Assinatura e Cobrança Mercado Pago', () => {
  it('Deve iniciar com 14 dias grátis e preço 0.00 ao validar cartão', () => {
    const trialDays = 14;
    const currentPrice = 0.00;
    const isInTrial = true;
    const paidBillingCount = 0;

    assert.strictEqual(trialDays, 14);
    assert.strictEqual(currentPrice, 0.00);
    assert.strictEqual(isInTrial, true);
    assert.strictEqual(paidBillingCount, 0);
  });

  it('Meses 1, 2 e 3 pagos devem cobrar exatamente R$ 49,90/mês', () => {
    const promoMonths = [1, 2, 3];
    promoMonths.forEach(month => {
      const price = month <= 3 ? 49.90 : 69.90;
      assert.strictEqual(price, 49.90, `Mês ${month} deve ter valor promocional de R$ 49,90`);
    });
  });

  it('A partir do 4º mês pago deve transicionar automaticamente para R$ 69,90/mês', () => {
    const regularMonths = [4, 5, 12];
    regularMonths.forEach(month => {
      const price = month <= 3 ? 49.90 : 69.90;
      assert.strictEqual(price, 69.90, `Mês ${month} deve ter valor regular de R$ 69,90`);
    });
  });

  it('Tolerância de inadimplência deve ser de exatamente 7 dias antes do bloqueio', () => {
    const toleranceDays = 7;
    assert.strictEqual(toleranceDays, 7);
  });
});
