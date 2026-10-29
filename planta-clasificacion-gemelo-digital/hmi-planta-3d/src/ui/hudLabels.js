// Etiquetas sobre cada equipo con su dirección de E/S y su estado en vivo, para
// leer la planta 3D igual que la tabla de mapeo (docs/02 §3).
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// definiciones: [{ clave, punto (Vector3 del mundo), direccion, titulo }]
export function crearEtiquetas(escena, definiciones) {
  const etiquetas = new Map();
  for (const { clave, punto, direccion, titulo } of definiciones) {
    const elemento = document.createElement('div');
    elemento.className = 'etiqueta';
    for (const [clase, texto] of [['etiqueta-direccion', direccion], ['etiqueta-titulo', titulo], ['etiqueta-valor', '']]) {
      const linea = document.createElement('span');
      linea.className = clase;
      linea.textContent = texto;
      elemento.append(linea);
    }
    const objeto = new CSS2DObject(elemento);
    objeto.position.copy(punto);
    escena.add(objeto);
    etiquetas.set(clave, { objeto, elemento, valor: elemento.lastElementChild });
  }

  return {
    // valores: { clave: { texto, nivel: 'on' | 'off' | 'alarma' | 'nd' } }
    actualizar(valores) {
      for (const [clave, { texto, nivel }] of Object.entries(valores)) {
        const etiqueta = etiquetas.get(clave);
        if (!etiqueta) continue;
        if (etiqueta.valor.textContent !== texto) etiqueta.valor.textContent = texto;
        if (etiqueta.elemento.dataset.nivel !== nivel) etiqueta.elemento.dataset.nivel = nivel;
      }
    },
    setVisibles(visibles) {
      for (const { objeto } of etiquetas.values()) objeto.visible = visibles;
    },
  };
}
