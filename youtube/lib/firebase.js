import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBRdtXFny3M1w-8eG0rRq7ggdfB637OW_E",
  authDomain: "fir-3c44e.firebaseapp.com",
  projectId: "fir-3c44e",
  storageBucket: "fir-3c44e.firebasestorage.app",
  messagingSenderId: "756296575745",
  appId: "1:756296575745:web:7fc8c889236cfe3d18c900",
  measurementId: "G-LQCRKMKSHR",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
export { auth, provider };
