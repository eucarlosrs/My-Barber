import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Gift,
  Plus,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Users,
  Phone,
  Trash2,
  Clock,
  Camera,
  Image as ImageIcon,
  Sparkles
} from 'lucide-react';
import { Raffle } from '../../types';
import { AppImage } from '../common/AppImage';

const PRESET_RAFFLE_BANNERS = [
  'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&auto=format&fit=crop&q=80'
];

export const RafflesTab: React.FC = () => {
  const {
    raffles,
    clients,
    createRaffle,
    updateRaffle,
    executeRaffle,
    deleteRaffle,
    isClientEligibleForRaffle,
    currentBarbershop
  } = useApp();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prize, setPrize] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [imageUrl, setImageUrl] = useState(PRESET_RAFFLE_BANNERS[0]);
  const [showInHighlights, setShowInHighlights] = useState(true);
  const [highlightTag, setHighlightTag] = useState('SORTEIO');

  // Live Draw Celebration Modal state
  const [drawResult, setDrawResult] = useState<{
    open: boolean;
    raffleTitle: string;
    winnerName: string;
    winnerWhatsApp?: string;
    prize: string;
    eligibleCount: number;
  } | null>(null);

  // Calculate eligible clients count in current tenant for 60-day rule
  const eligibleClients = clients.filter(c => isClientEligibleForRaffle(c.id).eligible);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createRaffle({
      tenantId: currentBarbershop.id,
      title: title.trim(),
      description: description.trim(),
      prize: prize.trim(),
      drawDate: drawDate,
      showInHighlights,
      highlightTag: highlightTag.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined
    });

    setShowCreateModal(false);
    setTitle('');
    setDescription('');
    setPrize('');
    setDrawDate('');
    setShowInHighlights(true);
    setHighlightTag('SORTEIO');
  };

  const handleExecute = (raffle: Raffle) => {
    const result = executeRaffle(raffle.id);
    if (result.success && result.winnerName) {
      const winnerClient = clients.find(c => c.id === result.winnerId || c.name === result.winnerName);
      setDrawResult({
        open: true,
        raffleTitle: raffle.title,
        winnerName: result.winnerName,
        winnerWhatsApp: winnerClient?.whatsapp,
        prize: raffle.prize,
        eligibleCount: result.eligibleCount
      });
    } else {
      alert(result.message);
    }
  };

  const activeRaffles = raffles.filter(r => r.status === 'ATIVO');
  const pastRaffles = raffles.filter(r => r.status === 'REALIZADO');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-neutral-100 text-lg font-heading flex items-center gap-2">
            <Gift className="w-5 h-5 text-orange-500" />
            Central de Sorteios & Fidelização (Regra dos 60 Dias)
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Crie sorteios exclusivos e realize os sorteios com verificação de agendamento nos últimos 2 meses.
          </p>
        </div>

        <button
          onClick={() => {
            // Default draw date: 30 days from now
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 20);
            setDrawDate(defaultDate.toISOString().split('T')[0]);
            setImageUrl(PRESET_RAFFLE_BANNERS[0]);
            setShowCreateModal(true);
          }}
          className="px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black flex items-center gap-2 shadow-md active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Novo Sorteio</span>
        </button>
      </div>

      {/* 60-Day Eligibility Info Banner */}
      <div className="bg-gradient-to-r from-orange-500/15 via-neutral-900 to-neutral-900 border border-orange-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-neutral-100">
              Regra de Elegibilidade dos 60 Dias (2 Meses)
            </h4>
            <p className="text-xs text-neutral-300 mt-0.5 max-w-2xl leading-relaxed">
              O sistema analisa automaticamente o histórico de agendamentos. Apenas clientes que cortaram o cabelo ou realizaram serviços nos últimos <strong>60 dias</strong> estão aptos para participar. Quando o sorteio é criado, ele aparece na área logada do cliente para ele confirmar a participação.
            </p>
          </div>
        </div>

        <div className="bg-neutral-950/80 p-3 rounded-xl border border-neutral-800 shrink-0 text-center">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Clientes Aptos Hoje</div>
          <div className="text-xl font-black text-orange-400 font-mono mt-0.5">
            {eligibleClients.length} clientes
          </div>
          <div className="text-[9px] text-neutral-500">com corte nos últimos 60 dias</div>
        </div>
      </div>

      {/* Active Raffles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-neutral-100 text-sm font-heading flex items-center gap-2">
            <span>Sorteios Ativos</span>
            <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/20">
              {activeRaffles.length} ativos
            </span>
          </h4>
        </div>

        {activeRaffles.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-neutral-400">
            <Gift className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
            <p className="text-xs font-semibold">Nenhum sorteio ativo no momento.</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Clique em "Cadastrar Novo Sorteio" para lançar uma premiação para seus clientes!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRaffles.map(raffle => (
              <div
                key={raffle.id}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-neutral-700 transition-all shadow-xl"
              >
                {/* Raffle Banner Image */}
                <div className="h-40 relative bg-neutral-950">
                  <AppImage
                    src={raffle.imageUrl || PRESET_RAFFLE_BANNERS[0]}
                    alt={raffle.title}
                    fallbackType="banner"
                    className="w-full h-full object-cover opacity-80"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    <div className="bg-orange-500 text-neutral-950 font-black text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider shadow">
                      EM ANDAMENTO
                    </div>
                    {raffle.showInHighlights && (
                      <span className="bg-amber-400 text-neutral-950 font-black text-[9px] px-2 py-0.5 rounded-lg flex items-center gap-0.5 shadow">
                        <Trophy className="w-2.5 h-2.5" />
                        NO DESTAQUE
                      </span>
                    )}
                  </div>
                  <div className="absolute top-3 right-3 bg-neutral-950/80 backdrop-blur-sm text-neutral-200 text-[11px] font-mono px-2.5 py-1 rounded-lg border border-neutral-800">
                    Sorteio: {raffle.drawDate.split('-').reverse().join('/')}
                  </div>
                  <div className="absolute bottom-3 left-4 right-4">
                    <h4 className="font-extrabold text-white text-base font-heading drop-shadow-md">
                      {raffle.title}
                    </h4>
                  </div>
                </div>

                {/* Raffle Details */}
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-300 leading-relaxed">{raffle.description}</p>

                    <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 block">Prêmio do Sorteio:</span>
                      <strong className="text-xs text-orange-400 font-bold mt-0.5 block">{raffle.prize}</strong>
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-neutral-500" />
                        Inscrições confirmadas: <strong className="text-neutral-200">{raffle.participants.length}</strong>
                      </span>
                      <span className="text-[11px] text-emerald-400">
                        {eligibleClients.length} clientes aptos na base
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-neutral-800 flex items-center gap-2">
                    <button
                      onClick={() => handleExecute(raffle)}
                      className="flex-1 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
                    >
                      <Trophy className="w-4 h-4" />
                      <span>🎲 Realizar Sorteio Agora</span>
                    </button>

                    <button
                      onClick={() => updateRaffle(raffle.id, { showInHighlights: !raffle.showInHighlights })}
                      className={`px-2.5 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 ${
                        raffle.showInHighlights
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-neutral-200'
                      }`}
                      title="Exibir nos destaques do app"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm('Deseja excluir este sorteio?')) {
                          deleteRaffle(raffle.id);
                        }
                      }}
                      className="p-2.5 bg-neutral-950 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 rounded-xl border border-neutral-800 transition-colors"
                      title="Excluir Sorteio"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past / Completed Raffles */}
      {pastRaffles.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-neutral-800">
          <h4 className="font-bold text-neutral-100 text-sm font-heading flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Histórico de Sorteios Realizados</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pastRaffles.map(raffle => (
              <div
                key={raffle.id}
                className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-5 space-y-3 relative overflow-hidden"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-lg uppercase">
                      SORTEIO REALIZADO
                    </span>
                    <h5 className="font-bold text-neutral-100 text-sm mt-1">{raffle.title}</h5>
                  </div>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {raffle.winnerDrawnAt ? new Date(raffle.winnerDrawnAt).toLocaleDateString('pt-BR') : raffle.drawDate}
                  </span>
                </div>

                <div className="bg-emerald-950/40 border border-emerald-500/30 p-3 rounded-xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-emerald-300">Ganhador(a) Sorteado:</div>
                    <div className="text-sm font-black text-white">{raffle.winnerClientName}</div>
                    <div className="text-[11px] text-neutral-300 mt-0.5">Prêmio: {raffle.prize}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => updateRaffle(raffle.id, { showInHighlights: !raffle.showInHighlights })}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors ${
                      raffle.showInHighlights
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-neutral-200'
                    }`}
                    title="Exibir este resultado de sorteio na vitrine de destaques do app do cliente"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{raffle.showInHighlights ? 'Divulgado no Destaque' : 'Divulgar no Destaque'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm('Deseja remover este histórico de sorteio?')) {
                        deleteRaffle(raffle.id);
                      }
                    }}
                    className="text-xs text-neutral-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover registro</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Raffle Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 text-neutral-100 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black font-heading text-neutral-100 mb-1">
              Cadastrar Novo Sorteio
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Defina o prêmio, data e imagem. O sorteio ficará visível na área logada dos clientes para adesão.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Título do Sorteio</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Sorteio de Aniversário da Barbearia"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Prêmio (O que o cliente ganha?)</label>
                <input
                  type="text"
                  required
                  value={prize}
                  onChange={e => setPrize(e.target.value)}
                  placeholder="Ex: 1 Ano de Cortes Grátis + Kit Completo Pomada & Óleo"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Data do Sorteio</label>
                <input
                  type="date"
                  required
                  value={drawDate}
                  onChange={e => setDrawDate(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">Descrição / Regulamento</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Participe do sorteio exclusivo! Válido para clientes com agendamento realizado nos últimos 60 dias."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Banner Selector */}
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-orange-400" />
                  Imagem / Banner de Divulgação
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="URL da imagem do prêmio"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-orange-500 mb-2"
                />
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {PRESET_RAFFLE_BANNERS.map((url, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setImageUrl(url)}
                      className={`w-16 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                        imageUrl === url ? 'border-orange-500 ring-2 ring-orange-500/40 scale-105' : 'border-neutral-800 opacity-60'
                      }`}
                    >
                      <AppImage src={url} alt="Preset" fallbackType="banner" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Destaque no App do Cliente */}
              <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800/90 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-bold text-neutral-200">Exibir nos Destaques do App</div>
                      <div className="text-[11px] text-neutral-400">Aparecer na vitrine de propaganda do cliente</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showInHighlights}
                    onChange={e => setShowInHighlights(e.target.checked)}
                    className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                  />
                </label>

                {showInHighlights && (
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Etiqueta do Destaque
                    </label>
                    <input
                      type="text"
                      value={highlightTag}
                      onChange={e => setHighlightTag(e.target.value.toUpperCase())}
                      placeholder="Ex: SORTEIO, SORTEIO ATIVO, GRANDE PRÊMIO"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-400 uppercase font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-neutral-950 rounded-xl text-xs font-black shadow-md"
                >
                  Publicar Sorteio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Winner Celebration Modal */}
      {drawResult && drawResult.open && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950 border-2 border-orange-500 rounded-3xl max-w-md w-full p-6 text-neutral-100 shadow-2xl text-center relative overflow-hidden">
            {/* Glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-orange-500/20 blur-3xl rounded-full" />

            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center mx-auto mb-4 text-orange-400 shadow-lg">
              <Trophy className="w-8 h-8" />
            </div>

            <span className="text-[10px] font-black bg-orange-500 text-neutral-950 px-3 py-1 rounded-full uppercase tracking-wider">
              TEMOS UM GANHADOR! 🎉
            </span>

            <h3 className="text-2xl font-black font-heading text-white mt-3">
              {drawResult.winnerName}
            </h3>

            {drawResult.winnerWhatsApp && (
              <p className="text-xs font-mono text-neutral-400 mt-0.5">
                {drawResult.winnerWhatsApp}
              </p>
            )}

            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 my-4 text-left space-y-1.5">
              <div className="text-[10px] uppercase font-bold text-neutral-400">Sorteio:</div>
              <div className="text-xs font-bold text-neutral-200">{drawResult.raffleTitle}</div>
              <div className="text-[10px] uppercase font-bold text-neutral-400 pt-1">Prêmio Conquistado:</div>
              <div className="text-xs font-black text-orange-400">{drawResult.prize}</div>
              <div className="text-[10px] text-neutral-500 pt-1">
                Concorreu entre {drawResult.eligibleCount} clientes aptos com agendamento nos últimos 60 dias.
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {drawResult.winnerWhatsApp && (
                <a
                  href={`https://wa.me/55${drawResult.winnerWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Parabéns ${drawResult.winnerName}! Você acabou de ser sorteado(a) no ${drawResult.raffleTitle} da ${currentBarbershop.name} e ganhou: ${drawResult.prize}! Entre em contato para resgatar seu prêmio.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span>Notificar Ganhador no WhatsApp</span>
                </a>
              )}

              <button
                onClick={() => setDrawResult(null)}
                className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition-colors"
              >
                Fechar e Salvar Resultado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
