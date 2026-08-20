import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  MapPin,
  Compass,
  Navigation,
  Scissors,
  Phone,
  ChevronRight,
  Sparkles,
  Building2,
  CheckCircle2,
  Clock,
  Star,
  Layers,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { Barbershop } from '../../types';
import { AppImage } from '../common/AppImage';

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const BarbershopDiscoveryView: React.FC = () => {
  const { barbershops, setActiveTenantId, setViewMode, allServices, users } = useApp();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('TODAS');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [sortByProximity, setSortByProximity] = useState(false);

  // Available unique cities
  const availableCities = useMemo(() => {
    const cities: string[] = Array.from(
      new Set(barbershops.map(b => b.address?.city?.trim()).filter((c): c is string => Boolean(c)))
    );
    return ['TODAS', ...cities.sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [barbershops]);

  // Handle Geolocation request
  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocalização não é suportada por este navegador.');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      position => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setSortByProximity(true);
        setIsLocating(false);
      },
      error => {
        setIsLocating(false);
        setSortByProximity(false);
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Permissão de localização não concedida. Você ainda pode pesquisar por nome ou cidade.');
        } else {
          setLocationError('Não foi possível obter sua localização atual no momento.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Filter and sort barbershops
  const filteredBarbershops = useMemo(() => {
    return barbershops
      .filter(barbershop => {
        // Name and address search
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch =
          !term ||
          barbershop.name.toLowerCase().includes(term) ||
          barbershop.address.city.toLowerCase().includes(term) ||
          barbershop.address.neighborhood.toLowerCase().includes(term) ||
          barbershop.slug.toLowerCase().includes(term);

        // City filter
        const matchesCity =
          selectedCity === 'TODAS' ||
          barbershop.address.city.toLowerCase() === selectedCity.toLowerCase();

        return matchesSearch && matchesCity;
      })
      .map(barbershop => {
        let distance: number | null = null;
        if (userLocation) {
          const lat = barbershop.coordinates?.latitude ?? (barbershop.address.city === 'São Paulo' ? -23.5505 : -22.9068);
          const lng = barbershop.coordinates?.longitude ?? (barbershop.address.city === 'São Paulo' ? -46.6333 : -43.1729);
          distance = calculateDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            lat,
            lng
          );
        }
        return {
          ...barbershop,
          distance
        };
      })
      .sort((a, b) => {
        if (sortByProximity && a.distance !== null && b.distance !== null) {
          return a.distance - b.distance;
        }
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [barbershops, searchTerm, selectedCity, userLocation, sortByProximity]);

  const handleSelectBarbershop = (barbershopId: string) => {
    setActiveTenantId(barbershopId);
    setViewMode('CLIENT_APP');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20 selection:bg-orange-500 selection:text-neutral-950">
      {/* Top Banner & Platform Brand */}
      <div className="bg-gradient-to-b from-neutral-900 via-neutral-900/90 to-neutral-950 border-b border-neutral-800/80 pt-8 pb-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase shadow-inner">
            <Scissors className="w-3.5 h-3.5" />
            <span>PLATAFORMA MY BARBER</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold font-heading text-neutral-100 tracking-tight">
            Encontre a Barbearia Ideal
          </h1>

          <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto leading-relaxed">
            Descubra os melhores estabelecimentos, conheça serviços, profissionais e agende seu horário com total comodidade.
          </p>

          {/* Search Controls Container */}
          <div className="mt-6 bg-neutral-900/90 border border-neutral-800 p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl mx-auto space-y-3">
            {/* 🔎 1. Buscar por nome */}
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="search-barbershop-name"
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="🔎 Buscar por nome da barbearia ou bairro..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl sm:rounded-2xl pl-10 pr-4 py-3 text-xs sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-orange-500 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-800 px-2 py-0.5 rounded-md"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Quick Filter Row: 🏙️ Buscar por cidade & 📍 Mais próximas */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
              {/* 🏙️ Buscar por cidade */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                <span className="text-xs text-neutral-400 font-semibold shrink-0 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Cidade:</span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {availableCities.map(city => (
                    <button
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        selectedCity === city
                          ? 'bg-orange-500 text-neutral-950 shadow-md shadow-orange-500/20'
                          : 'bg-neutral-950 text-neutral-300 border border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              {/* 📍 Mais próximas (Geolocalização) */}
              <button
                type="button"
                onClick={handleRequestLocation}
                disabled={isLocating}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shrink-0 border cursor-pointer ${
                  sortByProximity && userLocation
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                    : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-200 hover:text-orange-400'
                }`}
                title="Ordenar pelas barbearias mais próximas"
              >
                <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin text-orange-400' : 'text-orange-400'}`} />
                <span>
                  {isLocating
                    ? 'Localizando...'
                    : sortByProximity && userLocation
                    ? '📍 Ordenado por proximidade'
                    : '📍 Mais próximas'}
                </span>
              </button>
            </div>

            {/* Location Notice / Error */}
            {locationError && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span className="leading-tight">{locationError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Results Section */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-neutral-100 font-heading">
              Barbearias Cadastradas
            </h2>
            <span className="text-xs bg-neutral-900 border border-neutral-800 text-neutral-400 px-2.5 py-0.5 rounded-full font-mono font-bold">
              {filteredBarbershops.length}
            </span>
          </div>

          <span className="text-xs text-neutral-400">
            {selectedCity !== 'TODAS' ? `Filtrando por ${selectedCity}` : 'Exibindo todas as regiões'}
          </span>
        </div>

        {/* Barbershops Cards Grid */}
        {filteredBarbershops.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {filteredBarbershops.map(barbershop => {
              const shopServices = allServices.filter(s => s.tenantId === barbershop.id);
              const shopPros = users.filter(u => u.tenantId === barbershop.id && u.role === 'PROFISSIONAL');

              return (
                <div
                  key={barbershop.id}
                  className="bg-neutral-900 border border-neutral-800 hover:border-orange-500/50 rounded-3xl overflow-hidden transition-all duration-200 flex flex-col group hover:shadow-xl hover:shadow-orange-500/5"
                >
                  {/* Cover Banner */}
                  <div className="h-36 sm:h-40 w-full relative overflow-hidden bg-neutral-950">
                    <AppImage
                      src={barbershop.bannerUrl || barbershop.salonImages[0]}
                      alt={barbershop.name}
                      fallbackType="banner"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent" />

                    {/* Proximity Distance Tag */}
                    {barbershop.distance !== null && (
                      <div className="absolute top-3 left-3 bg-neutral-950/90 backdrop-blur-md border border-emerald-500/40 text-emerald-400 px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1 shadow-lg">
                        <MapPin className="w-3 h-3 text-emerald-400" />
                        <span>{barbershop.distance < 1 ? `${Math.round(barbershop.distance * 1000)} m` : `${barbershop.distance.toFixed(1)} km`} de você</span>
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-3 right-3 bg-neutral-950/90 backdrop-blur-md border border-neutral-800 text-neutral-300 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>ABERTO AGORA</span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between -mt-8 relative z-10">
                    <div>
                      {/* Logo and Title Row */}
                      <div className="flex items-start gap-3.5 mb-3">
                        <AppImage
                          src={barbershop.logoUrl}
                          alt={barbershop.name}
                          fallbackType="logo"
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-orange-500 shadow-xl bg-neutral-950 shrink-0"
                        />
                        <div className="flex-1 min-w-0 pt-1">
                          <h3 className="text-base sm:text-lg font-black text-neutral-100 group-hover:text-orange-400 transition-colors truncate">
                            {barbershop.name}
                          </h3>
                          <div className="flex items-center gap-1 text-xs text-neutral-400 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <span className="truncate">
                              {barbershop.address.neighborhood}, {barbershop.address.city} - {barbershop.address.state}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-3">
                        {barbershop.about}
                      </p>

                      {/* Highlights / Services preview pills */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {shopServices.slice(0, 3).map(srv => (
                          <span
                            key={srv.id}
                            className="text-[10px] font-semibold bg-neutral-950 border border-neutral-800 text-neutral-300 px-2 py-0.5 rounded-lg"
                          >
                            {srv.name.split(' ')[0]} • R$ {srv.price.toFixed(0)}
                          </span>
                        ))}
                        {shopPros.length > 0 && (
                          <span className="text-[10px] font-semibold bg-neutral-950 border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded-lg">
                            {shopPros.length} barbeiro{shopPros.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleSelectBarbershop(barbershop.id)}
                      className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-black rounded-2xl text-xs sm:text-sm transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Ver Barbearia & Agendar</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-3xl p-8 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto text-neutral-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-neutral-200">Nenhuma barbearia encontrada</h3>
            <p className="text-xs text-neutral-400">
              Tente buscar com outros termos, selecione outra cidade ou limpe os filtros de pesquisa.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCity('TODAS');
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-orange-400 rounded-xl text-xs font-bold transition-colors inline-block mt-2"
            >
              Ver Todas as Barbearias
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
