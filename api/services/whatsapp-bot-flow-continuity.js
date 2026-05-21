/**
 * Continuidad del flujo de alta por WhatsApp: no cortar la conversación mientras
 * el pedido se persiste (INSERT lento, geocodificación, etc.).
 * made by leavera77
 */

/** Paso de sesión mientras corre crearPedidoDesdeWhatsappBot en segundo plano. */
export const STEP_FINALIZING_PEDIDO = "finalizing_pedido";

export const MSG_REGISTRANDO_PEDIDO =
  "Estamos *registrando* tu reclamo en el sistema. En unos segundos te enviamos el *número de pedido*.\n\n" +
  "Podés seguir escribiendo; si hace falta, te respondemos enseguida.";

export const MSG_YA_FINALIZANDO =
  "Seguimos *registrando* tu reclamo. En breve te llega el número de pedido por este chat.";

export const MSG_DURANTE_FINALIZACION =
  "Tu reclamo se está *guardando* en el sistema. En unos segundos te confirmamos el *número* por acá.";

export const MSG_MENU_DURANTE_FINALIZACION =
  "Seguimos guardando tu reclamo en segundo plano; cuando termine, te llega el número por este chat.\n\n";

export const MSG_ERROR_REINTENTAR_CONFIRMACION =
  "No pudimos registrar el pedido en este momento (puede ser una demora del servidor).\n\n" +
  "Respondé *SI* o *1* para *reintentar* el registro con los mismos datos, *atrás* para corregir calle/número, o *menú* para salir.";

export const MSG_ERROR_SIN_USUARIO_REINTENTAR =
  "No pudimos asociar el reclamo a un usuario del sistema (falta personal cargado o configuración). Avisá a la cooperativa/municipio.\n\n" +
  "Cuando esté resuelto, respondé *SI* para reintentar o *menú* para salir.";

export function esPasoFinalizandoPedido(step) {
  return step === STEP_FINALIZING_PEDIDO;
}

/** Marca la sesión como «guardando»; devuelve true si ya estaba en ese paso. */
export function marcarSesionFinalizandoPedido(sess, sk, sessions) {
  if (!sess || !sk || !sessions) return false;
  if (esPasoFinalizandoPedido(sess.step)) return true;
  sess.step = STEP_FINALIZING_PEDIDO;
  sessions.set(sk, sess);
  return false;
}

/** Vuelve al resumen para que el vecino pueda reintentar SI sin perder el borrador. */
export function restaurarSesionTrasErrorFinalizacion(sess, sk, sessions) {
  if (!sess || !sk || !sessions) return;
  const cur = sessions.get(sk);
  if (!cur) return;
  if (!esPasoFinalizandoPedido(cur.step)) return;
  cur.step = "awaiting_confirmar_resumen";
  sessions.set(sk, cur);
}

export function mensajeErrorFinalizacionPorCodigo(codigoMsg) {
  const m = String(codigoMsg || "");
  if (m === "sin_usuario_admin_tenant" || m === "sin_usuario_para_pedido_whatsapp") {
    return MSG_ERROR_SIN_USUARIO_REINTENTAR;
  }
  return MSG_ERROR_REINTENTAR_CONFIRMACION;
}
