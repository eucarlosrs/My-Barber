import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { User, UserRole } from '../types';

export interface AuthSessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * Inscreve um listener global no Firebase Auth (onAuthStateChanged).
 * O Firebase Auth é a ÚNICA fonte de verdade soberana da identidade autenticada.
 */
export function subscribeToAuthChanges(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Retorna o usuário atualmente autenticado no Firebase Auth.
 */
export function getFirebaseCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}

/**
 * Encerra a sessão ativa no Firebase Authentication.
 */
export async function logoutFromFirebaseAuth(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.warn('Erro ao deslogar do Firebase Auth:', error);
  }
}

/**
 * Autentica com e-mail e senha diretamente no Firebase Authentication.
 */
export async function signInWithEmail(email: string, password: string): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    return {
      success: true,
      user: cred.user
    };
  } catch (error: any) {
    let msg = 'Falha ao autenticar com e-mail e senha.';
    if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found') {
      msg = 'E-mail ou senha incorretos.';
    } else if (error?.code === 'auth/invalid-email') {
      msg = 'Formato de e-mail inválido.';
    } else if (error?.code === 'auth/user-disabled') {
      msg = 'Este usuário foi desativado no sistema.';
    } else if (error?.message) {
      msg = error.message;
    }
    return {
      success: false,
      error: msg
    };
  }
}

/**
 * Cria um novo usuário no Firebase Authentication.
 * NENHUMA senha é enviada para o Firestore.
 */
export async function createAuthUser(email: string, password: string, displayName?: string): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
    if (displayName && cred.user) {
      try {
        await updateProfile(cred.user, { displayName });
      } catch {
        // non-blocking
      }
    }
    return {
      success: true,
      user: cred.user
    };
  } catch (error: any) {
    let msg = 'Erro ao criar conta no Firebase Authentication.';
    if (error?.code === 'auth/email-already-in-use') {
      msg = 'Este e-mail já está cadastrado no sistema.';
    } else if (error?.code === 'auth/weak-password') {
      msg = 'A senha deve ter pelo menos 6 caracteres.';
    } else if (error?.code === 'auth/invalid-email') {
      msg = 'E-mail inválido.';
    } else if (error?.message) {
      msg = error.message;
    }
    return {
      success: false,
      error: msg
    };
  }
}

/**
 * Envia e-mail de recuperação de senha oficial do Firebase Authentication.
 */
export async function sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { success: true };
  } catch (error: any) {
    let msg = 'Erro ao enviar e-mail de redefinição.';
    if (error?.code === 'auth/user-not-found') {
      msg = 'Nenhum usuário encontrado com este e-mail.';
    } else if (error?.message) {
      msg = error.message;
    }
    return { success: false, error: msg };
  }
}

/**
 * Sanitiza o documento de perfil para salvar no Firestore (users/{uid}).
 * REGRA CRÍTICA: NUNCA armazena senhas, tokens ou segredos no Firestore.
 */
export function sanitizeUserProfileForFirestore(user: Partial<User> & { uid?: string }): Record<string, any> {
  const cleanUser = { ...(user as any) };
  delete cleanUser.password;
  delete cleanUser._password;
  delete cleanUser.token;
  delete cleanUser.refreshToken;

  // Garante que o documento tenha os campos canônicos da especificação
  const result: Record<string, any> = {
    ...cleanUser,
    id: user.id || user.uid,
    role: user.role || 'CLIENTE',
    tenantId: user.tenantId || 'tenant-barbearia-do-joao',
    name: user.name || 'Usuário',
    email: user.email || '',
    whatsapp: user.whatsapp || '',
    phone: user.phone || user.whatsapp || '',
    status: user.status || 'active',
    updatedAt: new Date().toISOString()
  };

  // Vínculo canônico: apenas define UID se realmente autenticado pelo Firebase
  if (user.uid) {
    result.uid = user.uid;
  }

  return result;
}

/**
 * Salva ou atualiza o perfil de autorização e dados de negócio do usuário no Firestore em users/{uid}.
 * NÃO armazena senhas.
 */
export async function syncUserProfile(uid: string, profileData: Partial<User>): Promise<void> {
  try {
    const clean = sanitizeUserProfileForFirestore({ ...profileData, uid });
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, clean, { merge: true });
  } catch (error) {
    console.warn(`Erro ao sincronizar perfil do usuário ${uid} no Firestore:`, error);
  }
}

/**
 * Busca o perfil de negócio do usuário diretamente no Firestore pelo UID do Firebase Auth.
 */
export async function fetchUserProfileByUid(uid: string): Promise<User | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        ...data,
        id: snap.id,
        uid: snap.id
      } as User;
    }
  } catch (error) {
    console.warn(`Erro ao buscar perfil Firestore para UID ${uid}:`, error);
  }
  return null;
}

/**
 * Migrador não-destrutivo: tenta criar ou sincronizar a credencial no Firebase Auth
 * para usuários legados em segundo plano quando eles autenticam via login tradicional.
 */
export async function tryMigrateUserToFirebaseAuth(
  email: string,
  password?: string,
  displayName?: string
): Promise<FirebaseUser | null> {
  if (!email || !password || password.length < 6) return null;
  const cleanEmail = email.trim().toLowerCase();

  // Proteção contra colisão de sessão: Não migra se outra identidade já estiver ativa no Firebase Auth
  if (auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() !== cleanEmail) {
    console.warn(`[Migração Segura]: Sessão ativa de outro usuário detectada (${auth.currentUser.email}). Migração evitada para não sobrescrever sessão.`);
    return null;
  }

  try {
    // Tenta autenticar primeiro no Firebase Auth se já existir
    try {
      const loginResult = await signInWithEmailAndPassword(auth, cleanEmail, password.trim());
      return loginResult.user;
    } catch (err: any) {
      // Se não existir, tenta criar
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        try {
          const createResult = await createUserWithEmailAndPassword(auth, cleanEmail, password.trim());
          if (displayName && createResult.user) {
            try {
              await updateProfile(createResult.user, { displayName });
            } catch {
              // non-blocking
            }
          }
          return createResult.user;
        } catch (createErr: any) {
          if (createErr?.code === 'auth/email-already-in-use') {
            console.warn(`[Migração Segura]: O e-mail ${cleanEmail} já possui conta no Firebase Auth com outro provedor ou credencial.`);
          }
          return null;
        }
      }
    }
  } catch (err) {
    console.warn('Nota de migração de identidade Firebase Auth (não-bloqueante):', err);
  }
  return null;
}

/**
 * Obtém o Firebase ID Token atual de forma segura, com opção de refresh forçado.
 */
export async function getIdTokenFromCurrentUser(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (error) {
    console.warn('Erro ao obter ID Token do Firebase:', error);
    return null;
  }
}
