// www/js/authService.js
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
let usuarioActual = null;

// Inicializamos el plugin para que también funcione si lo pruebas en navegador Web
if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    GoogleAuth.initialize();
}

export async function iniciarSesion() {
    try {
        console.log("Intentando iniciar sesión nativa...");
        
        // 1. Abrimos el menú nativo de Google en Android
        const googleUser = await GoogleAuth.signIn();

        // 2. Extraemos el Token que nos dio Google y lo convertimos para Firebase
        const credential = firebase.auth.GoogleAuthProvider.credential(googleUser.authentication.idToken);
        
        // 3. Iniciamos sesión en Firebase silenciosamente con esa credencial
        const result = await firebase.auth().signInWithCredential(credential);
        
        usuarioActual = result.user;
        console.log("✅ Usuario autenticado:", usuarioActual.displayName);
        return usuarioActual;
        
    } catch (error) {
        console.error("❌ Error en login nativo:", error);
        alert("No se pudo iniciar sesión. Por favor intenta de nuevo.");
        throw error;
    }
}

export async function cerrarSesion() {
    try {
        // Cerramos sesión en ambos lados para evitar cuentas pegadas
        await GoogleAuth.signOut();
        await firebase.auth().signOut();
        
        usuarioActual = null;
        console.log("Sesión cerrada");
        window.location.reload(); 
    } catch (error) {
        console.error("❌ Error cerrando sesión:", error);
    }
}

// ... Las funciones getUsuario y monitorEstadoAuth se quedan exactamente igual ...
export function getUsuario() {
    return usuarioActual;
}

export function monitorEstadoAuth(callback) {
    // 3. Usamos firebase.auth() directo
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