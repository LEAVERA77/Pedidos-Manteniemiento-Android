/**
 * Procesa la cola offline en segundo plano (clon JSON) para aliviar el hilo principal.
 * La ejecución SQL sigue en app.js; aquí solo se valida/serializa la cola.
 */
self.onmessage = (e) => {
    const { id, queue } = e.data || {};
    const raw = Array.isArray(queue) ? queue : [];
    try {
        const clone = JSON.parse(JSON.stringify(raw));
        self.postMessage({ id, ok: true, queue: clone });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err), queue: raw });
    }
};
