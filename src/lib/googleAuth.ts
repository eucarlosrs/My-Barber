import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

export interface GoogleAuthResult {
  success: boolean;
  user?: {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
  };
  error?: string;
}

/**
 * Triggers the official Google Identity / Firebase Authentication popup
 */
export async function triggerGooglePopupLogin(): Promise<GoogleAuthResult> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const userCredential = await signInWithPopup(auth, provider);
    const u = userCredential.user;
    return {
      success: true,
      user: {
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Cliente'),
        photoURL: u.photoURL || undefined
      }
    };
  } catch (error: any) {
    console.error('Firebase Google popup error:', error);
    let msg = 'Não foi possível autenticar com o Google.';
    if (error?.code === 'auth/popup-closed-by-user') {
      msg = 'O pop-up de login do Google foi fechado antes de concluir a autenticação.';
    } else if (error?.code === 'auth/popup-blocked') {
      msg = 'O pop-up de login foi bloqueado pelo seu navegador. Por favor, permita pop-ups para fazer login com o Google.';
    } else if (error?.code === 'auth/unauthorized-domain') {
      msg = 'Domínio de execução em autorização no Firebase Authentication.';
    } else if (error?.message) {
      msg = error.message;
    }
    return {
      success: false,
      error: msg
    };
  }
}
