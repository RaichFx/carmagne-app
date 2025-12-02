import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// *** IMPORTANTE: PEGA AQUÍ TUS CREDENCIALES DE FIREBASE ***
// Copia el objeto firebaseConfig de tu consola de Firebase
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);