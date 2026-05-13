/**
 * Evita avisos del navegador al capturar con html2canvas (getImageData / readback).
 * Efecto secundario único al importar el módulo.
 * made by leavera77
 */
if (typeof HTMLCanvasElement !== 'undefined') {
    const proto = HTMLCanvasElement.prototype;
    if (!proto.__gestornovaWillReadPatch) {
        const orig = proto.getContext;
        proto.getContext = function (type, attrib) {
            if (type === '2d') {
                const a =
                    attrib && typeof attrib === 'object'
                        ? { ...attrib, willReadFrequently: true }
                        : { willReadFrequently: true };
                return orig.call(this, type, a);
            }
            return orig.call(this, type, attrib);
        };
        proto.__gestornovaWillReadPatch = true;
    }
}
