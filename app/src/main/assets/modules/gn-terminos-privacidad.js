/**
 * Términos de uso y política de privacidad (modales centrados, estilo panel).
 * made by leavera77
 */

const MODAL_TERMS_ID = 'gn-modal-terminos';
const MODAL_PRIV_ID = 'gn-modal-privacidad';

function legalModalHtml(id, title, icon, bodyHtml) {
    return `
<div id="${id}" class="mo gn-trust-legal-modal" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
  <div class="mc gn-trust-legal-mc">
    <div class="mh gn-trust-legal-mh">
      <h3 id="${id}-title"><i class="fas ${icon}" aria-hidden="true"></i> ${title}</h3>
      <button type="button" class="cm" data-gn-legal-close aria-label="Cerrar"><i class="fas fa-times"></i></button>
    </div>
    <div class="mb gn-trust-legal-body">${bodyHtml}</div>
    <div class="gn-trust-legal-ft">
      <button type="button" class="bp gn-trust-legal-close-btn" data-gn-legal-close><i class="fas fa-check"></i> Entendido</button>
    </div>
  </div>
</div>`;
}

const TERMS_BODY = `
<p class="gn-trust-legal-lead">GestorNova es un sistema de gestión de pedidos y reclamos para cooperativas eléctricas, municipios y organizaciones de servicios.</p>
<h4>Uso autorizado</h4>
<p>El acceso está limitado a usuarios habilitados por su organización. No comparta su usuario ni contraseña.</p>
<h4>Datos operativos</h4>
<p>Los reclamos, ubicaciones, fotos y mensajes que cargue forman parte de la operación de su entidad y deben tratarse según las políticas internas de la cooperativa o municipio.</p>
<h4>Disponibilidad</h4>
<p>El servicio depende de conexión a internet y de los proveedores de infraestructura (hosting, base de datos, mensajería). Pueden existir ventanas de mantenimiento.</p>
<h4>Responsabilidad</h4>
<p>Las decisiones operativas (asignación, cierre, derivaciones) son responsabilidad del personal autorizado de cada organización usuaria del sistema.</p>
`;

const PRIV_BODY = `
<p class="gn-trust-legal-lead">Resumen de cómo GestorNova trata la información en el panel web y la app de cuadrillas.</p>
<h4>Qué datos se procesan</h4>
<p>Identificación de usuario, datos de reclamos (domicilio, coordenadas, fotos, avances), catálogo de socios cuando la organización lo utiliza, y registros técnicos necesarios para soporte y seguridad.</p>
<h4>Dónde se almacenan</h4>
<p>La información operativa reside en servicios en la nube contratados para la instalación (base de datos, archivos, API). Las credenciales de acceso no deben exponerse en el navegador más allá del token de sesión propio de la aplicación.</p>
<h4>Comunicaciones</h4>
<p>Si su organización activa WhatsApp u otros canales, los avisos al vecino se envían desde el servidor de la API, no desde el código visible en el navegador.</p>
<h4>Conservación</h4>
<p>Los plazos de conservación y borrado los define cada organización usuaria conforme a su normativa interna y obligaciones legales.</p>
<h4>Contacto</h4>
<p>Para ejercer derechos o consultas sobre datos personales, contacte al administrador de su cooperativa o municipio, que es el responsable del tratamiento frente a los titulares.</p>
`;

function traerModalLegalAlFrente(el) {
    if (!el) return;
    try {
        if (typeof window.gnForceModalZFront === 'function') {
            window.gnForceModalZFront(el);
            return;
        }
    } catch (_) {}
    try {
        if (typeof window.gnBumpOverlayElement === 'function') {
            window.gnBumpOverlayElement(el);
        }
    } catch (_) {}
}

function cerrarModalLegal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    const anyOpen = document.querySelector('.gn-trust-legal-modal.active');
    if (!anyOpen) {
        try {
            document.body.style.overflow = '';
        } catch (_) {}
    }
}

function abrirModalLegal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    document.querySelectorAll('.gn-trust-legal-modal.active').forEach((m) => {
        if (m.id !== id) m.classList.remove('active');
    });
    el.classList.add('active');
    traerModalLegalAlFrente(el);
    try {
        document.body.style.overflow = 'hidden';
    } catch (_) {}
    requestAnimationFrame(() => traerModalLegalAlFrente(el));
}

function wireLegalModal(el) {
    if (!el || el.dataset.gnLegalWired === '1') return;
    el.dataset.gnLegalWired = '1';
    el.querySelectorAll('[data-gn-legal-close]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = btn.closest('.mo');
            if (modal?.id) cerrarModalLegal(modal.id);
        });
    });
    el.addEventListener('click', (e) => {
        if (e.target === el) cerrarModalLegal(el.id);
    });
}

function ensureLegalModals() {
    if (document.getElementById(MODAL_TERMS_ID)) return;
    const wrap = document.createElement('div');
    wrap.innerHTML =
        legalModalHtml(MODAL_TERMS_ID, 'Términos de uso', 'fa-file-contract', TERMS_BODY) +
        legalModalHtml(MODAL_PRIV_ID, 'Política de privacidad', 'fa-user-shield', PRIV_BODY);
    document.body.appendChild(wrap);
    wrap.querySelectorAll('.gn-trust-legal-modal').forEach(wireLegalModal);
}

export function abrirTerminosGestorNova() {
    ensureLegalModals();
    abrirModalLegal(MODAL_TERMS_ID);
}

export function abrirPrivacidadGestorNova() {
    ensureLegalModals();
    abrirModalLegal(MODAL_PRIV_ID);
}

function onEscapeLegal(e) {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.gn-trust-legal-modal.active');
    if (open?.id) cerrarModalLegal(open.id);
}

function initGnTerminosPrivacidad() {
    ensureLegalModals();
    document.addEventListener('keydown', onEscapeLegal);
    if (typeof window !== 'undefined') {
        window.abrirTerminosGestorNova = abrirTerminosGestorNova;
        window.abrirPrivacidadGestorNova = abrirPrivacidadGestorNova;
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGnTerminosPrivacidad, { once: true });
    } else initGnTerminosPrivacidad();
}
