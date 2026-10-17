import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDy9bIIr_ZUKOlf9F_eDSOQ6vIICRP7TKg",
  authDomain: "sistema-de-ingresos-54bd2.firebaseapp.com",
  projectId: "sistema-de-ingresos-54bd2",
  storageBucket: "sistema-de-ingresos-54bd2.firebasestorage.app",
  messagingSenderId: "645109122445",
  appId: "1:645109122445:web:143f819d6d29741aeee9c4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);