// www/js/authService.js
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

let usuarioActual = null;

// 🚀 INICIALIZACIÓN GLOBAL OBLIGATORIA (Con tu ID real)
GoogleAuth.initialize({
    clientId: '332778953247-fh2jgd1beihlqs4fkiddrer2c3vkhadu.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    grantOfflineAccess: true,
});

export async function iniciarSesion() {
    try {
        console.log("Intentando iniciar sesión...");
        const auth = firebase.auth();

        if (Capacitor.isNativePlatform()) {
            // 📱 --- MODO ANDROID NATIVO ---
            console.log("Entorno nativo detectado. Abriendo selector de Google...");
            
            // 🛡️ BLINDAJE EXTRA: Forzamos la creación del cliente justo antes de abrirlo
            await GoogleAuth.initialize({
                clientId: '332778953247-fh2jgd1beihlqs4fkiddrer2c3vkhadu.apps.googleusercontent.com',
                scopes: ['profile', 'email'],
                grantOfflineAccess: true,
            });
            
            const googleUser = await GoogleAuth.signIn();
            
            const credential = firebase.auth.GoogleAuthProvider.credential(googleUser.authentication.idToken);
            const result = await auth.signInWithCredential(credential);
            usuarioActual = result.user;
            
        } else {
            // 💻 --- MODO WEB ---
            console.log("Entorno web detectado. Usando Popup tradicional...");
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await auth.signInWithPopup(provider);
            usuarioActual = result.user;
        }

        console.log("✅ Usuario autenticado:", usuarioActual.displayName);
        return usuarioActual;

    } catch (error) {
        console.error("❌ Error en login:", error);
        alert("No se pudo iniciar sesión. Por favor intenta de nuevo.");
        throw error;
    }
}

export async function cerrarSesion() {
    try {
        if (Capacitor.isNativePlatform()) {
            await GoogleAuth.signOut();
        }
        await firebase.auth().signOut();
        
        usuarioActual = null;
        console.log("Sesión cerrada");
        window.location.reload(); 
    } catch (error) {
        console.error("❌ Error al cerrar sesión:", error);
    }
}

export function getUsuario() {
    return usuarioActual;
}

export function monitorEstadoAuth(callback) {
    firebase.auth().onAuthStateChanged((user) => {
        usuarioActual = user;
        if (user) {
            console.log("🔄 Sesión restaurada:", user.displayName);
        } else {
            console.log("⚪ Modo invitado (sin sesión)");
        }
        callback(user);
    });
}