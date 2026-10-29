// Bloques estándar IEC 61131-3 usados por logica_clasificador_fsm.st.
// Cada FB conserva sus entradas entre llamadas, como en el PLC; `ahora` es el
// reloj monotónico del ciclo en ms (equivalente a la base TIME de CODESYS).

export class TON {
  IN = false;
  PT = 0;
  Q = false;
  ET = 0;
  #inicio = 0;

  ejecutar(entradas, ahora) {
    const flancoIN = entradas.IN && !this.IN;
    Object.assign(this, entradas);
    if (!this.IN) {
      this.Q = false;
      this.ET = 0;
      return;
    }
    if (flancoIN) this.#inicio = ahora;
    this.ET = Math.min(ahora - this.#inicio, this.PT);
    this.Q = this.ET >= this.PT;
  }
}

export class R_TRIG {
  CLK = false;
  Q = false;
  #M = false;

  ejecutar({ CLK }) {
    this.CLK = CLK;
    this.Q = CLK && !this.#M;
    this.#M = CLK;
  }
}
