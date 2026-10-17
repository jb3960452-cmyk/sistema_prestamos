import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Este objeto lo copias desde la sección "Configuración del proyecto" en la consola
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "sistema-de-ingresos-54bd2.firebaseapp.com",
  projectId: "sistema-de-ingresos-54bd2",
  storageBucket: "sistema-de-ingresos-54bd2.appspot.com",
  messagingSenderId: "645109122445",
  appId: "TU_APP_ID"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Cloud Firestore y obtener una referencia al servicio
export const db = getFirestore(app);
