"use client";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, provider } from "./firebase";
import axiosInstance from "./axiosInstance";

const userContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const storedUser = window.localStorage.getItem("user");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      window.localStorage.removeItem("user");
      console.error("Unable to restore the saved user session", error);
    }
  }, []);

  const logIn = (userdata) => {
    setUser(userdata);
    window.localStorage.setItem("user", JSON.stringify(userdata));
  };

  const logOut = async () => {
    setUser(null);
    window.localStorage.removeItem("user");
    await signOut(auth);
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const payload = {
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        image:
          firebaseUser.photoURL || "https://via.placeholder.com/150/771796",
      };
      const response = await axiosInstance.post("/user/login", payload);
      logIn(response.data.result);
    } catch (error) {
      console.log(error);
    }
  };
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const payload = {
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            image:
              firebaseUser.photoURL || "https://via.placeholder.com/150/771796",
          };
          const response = await axiosInstance.post("/user/login", payload);
          logIn(response.data.result);
        } catch (error) {
          console.log(error);
          logOut();
        }
      }
    });
    return unsubscribe;
  }, []);

  return (
    <userContext.Provider value={{ user, logIn, logOut, handleGoogleSignIn }}>
      {children}
    </userContext.Provider>
  );
};

export const useUser = () => useContext(userContext);
