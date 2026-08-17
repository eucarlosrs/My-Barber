import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * High-definition, realistic curated photography presets for barbershops.
 * These are realistic photographs of modern barbershop environments, real barbers,
 * genuine haircuts, beard stylings, and professional products.
 */
export const REALISTIC_BARBERSHOP_ASSETS = {
  logos: [
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=300&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=300&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=300&auto=format&fit=crop&q=80'
  ],
  banners: [
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1400&auto=format&fit=crop&q=85'
  ],
  salons: [
    'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?w=1000&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1000&auto=format&fit=crop&q=80'
  ],
  barbers: [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80', // João Carlos (Owner)
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80', // Ricardo (Manager)
    'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&auto=format&fit=crop&q=80', // Marcos (Leader Barber)
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', // Felipe (Barber)
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80', // Lucas (Barber)
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80'  // Bruno (Client)
  ],
  services: {
    corteCabelo: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=600&auto=format&fit=crop&q=80',
    barba: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600&auto=format&fit=crop&q=80',
    combo: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600&auto=format&fit=crop&q=80',
    sobrancelha: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=600&auto=format&fit=crop&q=80',
    platinado: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600&auto=format&fit=crop&q=80',
    visagismo: 'https://images.unsplash.com/photo-1534778356534-d3d45b6df1da?w=600&auto=format&fit=crop&q=80'
  },
  products: {
    pomada: 'https://images.unsplash.com/photo-1597354984706-aec992b7d0d1?w=600&auto=format&fit=crop&q=80',
    oleo: 'https://images.unsplash.com/photo-1608248597359-002d287bfba5?w=600&auto=format&fit=crop&q=80',
    shampoo: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&auto=format&fit=crop&q=80',
    laminas: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600&auto=format&fit=crop&q=80'
  },
  gallery: [
    {
      title: 'Degradê Navalhado High Fade',
      category: 'DEGRADE',
      imageUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800&auto=format&fit=crop&q=80',
      description: 'Transição perfeita da zero com acabamento milimétrico na lâmina.'
    },
    {
      title: 'Barba Terapia com Toalha Quente',
      category: 'BARBA',
      imageUrl: 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop&q=80',
      description: 'Alinhamento completo, hidratação aromática e massagem facial relaxante.'
    },
    {
      title: 'Corte Pompadour Texturizado',
      category: 'SOCIAL',
      imageUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80',
      description: 'Volume no topo com finalização em pomada efeito seco matte.'
    },
    {
      title: 'Combo Executivo Hair & Beard',
      category: 'COMBO',
      imageUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&auto=format&fit=crop&q=80',
      description: 'Harmonização de visagismo completa entre cabelo e desenho de barba.'
    },
    {
      title: 'Platinado Global Nevou',
      category: 'PLATINADO',
      imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&auto=format&fit=crop&q=80',
      description: 'Tom branco acinzentado perfeito sem agressão ao couro cabeludo.'
    },
    {
      title: 'Freestyle Hair Design & Risca',
      category: 'FREESTYLE',
      imageUrl: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop&q=80',
      description: 'Linhas geométricas exclusivas com transição de navalha.'
    }
  ]
};

/**
 * Uploads an image file to Firebase Storage under a designated path.
 * In case of storage quota / network fallback, converts to a Base64 data URL
 * so that custom uploads work immediately in client and admin interfaces.
 */
export async function uploadImageToStorage(file: File, destinationPath: string): Promise<string> {
  try {
    if (storage) {
      const storageRef = ref(storage, destinationPath);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    }
  } catch (error) {
    console.warn('Firebase Storage upload warning (falling back to Base64 local storage):', error);
  }

  // Graceful fallback: convert file to Base64 Data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao processar arquivo de imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro na leitura do arquivo.'));
    reader.readAsDataURL(file);
  });
}
