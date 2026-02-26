// js/subscriptionService.js

// Todo el mundo es "Premium" ahora, la app es gratis.
export function isUserPremium() {
    return true; 
}

// Transformamos tu antigua validación
export async function verificarEstadoPremium(uid) {
    // Ya no bloqueamos nada en la base de datos, 
    // pero puedes dejar esta función vacía para que no rompa app.js
    console.log("Modo comunitario: Todas las funciones gratuitas activadas.");
}

// Transformamos el antiguo paywall en un modal amigable de donación
export function mostrarMensajeIndie() {
    // Verificamos si el modal ya existe, si no, lo inyectamos
    let modal = document.getElementById('modal-donacion');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-donacion';
        modal.className = 'modal-overlay'; // Asumiendo que usas tu clase CSS habitual
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center; max-width: 400px; padding: 25px; border-radius: 15px; background: white;">
                <h2 style="color: #0056b3; margin-top: 0;">¡Rutas Koox es 100% Gratis! 🎉</h2>
                <p style="color: #444; font-size: 0.95em; line-height: 1.5;">
                    Decidí liberar todas las funciones avanzadas (como la navegación GPS y el escáner) para que todo Campeche pueda moverse mejor.
                </p>
                <p style="color: #444; font-size: 0.95em; line-height: 1.5;">
                    Este proyecto es independiente y lo desarrollo yo solo sin apoyo de ninguna institución. Si la app te ha salvado de perderte, <strong>puedes apoyarme con una donación voluntaria</strong> para pagar los servidores.
                </p>
                <div style="margin-top: 25px; display: flex; flex-direction: column; gap: 10px;">
                    <button id="btn-donar-cafe" class="btn-primario" style="background-color: #E69500; font-size: 1.1em; padding: 12px;">
                        ☕ Invítame un café ($20)
                    </button>
                    <button id="btn-donar-kilo" class="btn-primario" style="background-color: #28a745; font-size: 1.1em; padding: 12px;">
                        🌮 Invítame unos tacos ($50)
                    </button>
                    <button id="btn-cerrar-donacion" class="btn-secundario" style="background: none; color: #666; border: none; padding: 10px; margin-top: 5px;">
                        Quizás después, gracias
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Los listeners de los botones
        document.getElementById('btn-cerrar-donacion').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        document.getElementById('btn-donar-cafe').addEventListener('click', () => {
            // Aquí pones tu link de MercadoPago, Stripe o PayPal de $20
            window.open('https://link.mercadopago.com.mx/tu-link-de-20', '_blank');
            modal.style.display = 'none';
        });

        document.getElementById('btn-donar-kilo').addEventListener('click', () => {
            // Aquí pones tu link de $50
            window.open('https://link.mercadopago.com.mx/tu-link-de-50', '_blank');
            modal.style.display = 'none';
        });
    }

    // Mostramos el modal
    modal.style.display = 'flex';
}