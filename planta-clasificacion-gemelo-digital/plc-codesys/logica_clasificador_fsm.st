(* =============================================================================
   logica_clasificador_fsm.st
   Proyecto : Planta Virtual de Clasificación Gobernada por PLC
   Norma    : IEC 61131-3:2013 · Texto Estructurado
   Modelo   : Máquina de Moore M = (S, Σ, Λ, δ, λ, s0, F)  — docs/01 §3
   Contiene : 3 POU a crear por separado (Agregar objeto > POU):
              [1] FB_Heartbeat        (Bloque de función)
              [2] FB_ClasificadorFSM  (Bloque de función)
              [3] PLC_PRG             (Programa · asignado a MainTask, cíclica T#10MS)
   Depende  : variables_globales.st (E_EstadoClasificador, GVL_IO, GVL_Param)
   ============================================================================= *)


(* ========================================================= [1] FB_Heartbeat == *)
(* τ(k) = TON(IN := ¬τ(k-1), PT).Q ;  h(k+1) = h(k) XOR τ(k)                      *)
(* Periodo efectivo T_h = 2·(PT + 2·T_scan) = 1040 ms con T_scan = 10 ms: un    *)
(* ciclo para ver Q y otro para reiniciar el TON (docs/07 §4.4).                 *)
FUNCTION_BLOCK FB_Heartbeat
VAR_INPUT
    tSemiperiodo : TIME := T#500MS;
END_VAR
VAR_OUTPUT
    xPulso : BOOL;                 (* h *)
END_VAR
VAR
    Heartbeat_Timer : TON;         (* nombre exigido por la especificación *)
END_VAR

Heartbeat_Timer(IN := NOT Heartbeat_Timer.Q, PT := tSemiperiodo);
IF Heartbeat_Timer.Q THEN
    xPulso := NOT xPulso;
END_IF
END_FUNCTION_BLOCK


(* =================================================== [2] FB_ClasificadorFSM == *)
(* Orden de evaluación por ciclo de scan k:                                     *)
(*   (a) detección de flancos m↑, s↑     (R_TRIG, siempre, para no dejar flancos  *)
(*       latentes que provoquen rearranques tras emergencia — propiedad P4)      *)
(*   (b) t = TON_Clasif(IN := s(k) ∈ {S2,S3}).Q                                  *)
(*   (c) s(k+1) = δ(s(k), σ(k))          prioridad Emergencia ≻ Estiba no        *)
(*                                       disponible ≻ Parada ≻ resto (docs/08 §3)*)
(*   (d) Q(k)   = λ(s(k+1))              salida de Moore sobre el estado nuevo   *)
(*   (e) diagnóstico de invariantes P2/P3                                        *)
FUNCTION_BLOCK FB_ClasificadorFSM
VAR_INPUT
    xMarcha         : BOOL;    (* m  *)
    xParada         : BOOL;    (* p  *)
    xEmergencia     : BOOL;    (* e  · TRUE = activa *)
    xSensor         : BOOL;    (* s  *)
    xSelectorB      : BOOL;    (* d  · FALSE = A, TRUE = B *)
    xEstibaLlenaA   : BOOL;    (* ℓA · estiba A no disponible *)
    xEstibaLlenaB   : BOOL;    (* ℓB · estiba B no disponible *)
    tClasificacion  : TIME := T#4S;
END_VAR
VAR_OUTPUT
    xCintaEntrada   : BOOL;    (* Q0 *)
    xDesviador      : BOOL;    (* Q1 *)
    xCintaSalidaA   : BOOL;    (* Q2 *)
    xCintaSalidaB   : BOOL;    (* Q3 *)
    xBaliza         : BOOL;    (* Q4 *)
    xSenalCambioEstiba : BOOL; (* Q6 *)
    eEstado         : E_EstadoClasificador := E_EstadoClasificador.REPOSO;  (* s0 *)
    xFallaCoherencia: BOOL;    (* violación de P2 o P3 (no debería ocurrir nunca) *)
    udiPaquetesA    : UDINT;   (* contadores de diagnóstico, no publicados por Modbus *)
    udiPaquetesB    : UDINT;
END_VAR
VAR
    rtMarcha        : R_TRIG;
    rtSensor        : R_TRIG;
    TON_Clasif      : TON;
END_VAR

(* (a) Flancos ascendentes: x↑(k) = x(k) ∧ ¬x(k-1) *)
rtMarcha(CLK := xMarcha);
rtSensor(CLK := xSensor);

(* (b) Temporizador de clasificación sobre el estado vigente *)
TON_Clasif(IN := (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A)
              OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B),
           PT := tClasificacion);

(* (c) Función de transición δ *)
IF xEmergencia THEN                                             (* T1 · ∀s *)
    eEstado := E_EstadoClasificador.PARADA_EMERGENCIA;
ELSIF (xEstibaLlenaA OR xEstibaLlenaB)
      AND eEstado <> E_EstadoClasificador.PARADA_EMERGENCIA THEN  (* T9 · S0..S3 → S5 (P6) *)
    eEstado := E_EstadoClasificador.ESPERANDO_CAMBIO_ESTIBA;
ELSE
    CASE eEstado OF
    E_EstadoClasificador.REPOSO:
        IF NOT xParada AND rtMarcha.Q THEN                      (* T2 *)
            eEstado := E_EstadoClasificador.EN_MARCHA_ESPERA;
        END_IF

    E_EstadoClasificador.EN_MARCHA_ESPERA:
        IF xParada THEN                                         (* T3 *)
            eEstado := E_EstadoClasificador.REPOSO;
        ELSIF rtSensor.Q THEN                                   (* d se muestrea solo aquí (P5) *)
            IF xSelectorB THEN                                  (* T5 *)
                eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_B;
                udiPaquetesB := udiPaquetesB + 1;
            ELSE                                                (* T4 *)
                eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_A;
                udiPaquetesA := udiPaquetesA + 1;
            END_IF
        END_IF

    E_EstadoClasificador.CLASIFICANDO_RUTA_A,
    E_EstadoClasificador.CLASIFICANDO_RUTA_B:
        IF xParada THEN                                         (* T7 *)
            eEstado := E_EstadoClasificador.REPOSO;
        ELSIF TON_Clasif.Q THEN                                 (* T6 *)
            eEstado := E_EstadoClasificador.EN_MARCHA_ESPERA;
        END_IF                                                  (* s↑ ignorado: hipótesis H1 *)

    E_EstadoClasificador.PARADA_EMERGENCIA:
        IF xParada THEN                                         (* T8 · rearme consciente *)
            eEstado := E_EstadoClasificador.REPOSO;
        END_IF

    E_EstadoClasificador.ESPERANDO_CAMBIO_ESTIBA:
        (* Aquí solo se llega con ambas estibas disponibles: la rama T9 captura ℓ *)
        eEstado := E_EstadoClasificador.REPOSO;                (* T10 · exige Marcha (P7) *)

    ELSE
        (* Valor fuera de dominio (corrupción de memoria): fallo seguro *)
        eEstado := E_EstadoClasificador.PARADA_EMERGENCIA;
    END_CASE
END_IF

(* (d) Función de salida λ (Moore): códigos inyectivos, docs/01 §3.4 *)
xCintaEntrada := (eEstado = E_EstadoClasificador.EN_MARCHA_ESPERA)
              OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A)
              OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B);
xDesviador    :=  eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B;
xCintaSalidaA :=  eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A;
xCintaSalidaB :=  eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B;
xBaliza       :=  eEstado = E_EstadoClasificador.PARADA_EMERGENCIA;
xSenalCambioEstiba := eEstado = E_EstadoClasificador.ESPERANDO_CAMBIO_ESTIBA;

(* (e) Invariantes: P2 □¬(Q2 ∧ Q3) ;  P3 □(Q1 ↔ Q3) *)
xFallaCoherencia := (xCintaSalidaA AND xCintaSalidaB) OR (xDesviador XOR xCintaSalidaB);
END_FUNCTION_BLOCK


(* ================================================================ [3] PLC_PRG == *)
(* Capa de cableado: única POU que accede a GVL_IO. Desacopla la lógica (FB)     *)
(* del direccionamiento físico/Modbus, lo que permite probar el FB de forma      *)
(* aislada (p. ej., con CODESYS Test Manager o forzado de variables).            *)
PROGRAM PLC_PRG
VAR
    fbClasificador : FB_ClasificadorFSM;
    fbHeartbeat    : FB_Heartbeat;
END_VAR

fbHeartbeat(tSemiperiodo := GVL_Param.T_HEARTBEAT);

fbClasificador(
    xMarcha        := GVL_IO.Marcha,
    xParada        := GVL_IO.Parada,
    xEmergencia    := GVL_IO.Emergencia,
    xSensor        := GVL_IO.Sensor_Entrada,
    xSelectorB     := GVL_IO.Selector_Destino,
    xEstibaLlenaA  := GVL_IO.Estiba_Llena_A,
    xEstibaLlenaB  := GVL_IO.Estiba_Llena_B,
    tClasificacion := GVL_Param.T_CLASIFICACION);

(* Escritura de la imagen de salidas %QX *)
GVL_IO.Motor_Cinta_Entrada  := fbClasificador.xCintaEntrada;
GVL_IO.Actuador_Desviador   := fbClasificador.xDesviador;
GVL_IO.Motor_Cinta_Salida_A := fbClasificador.xCintaSalidaA;
GVL_IO.Motor_Cinta_Salida_B := fbClasificador.xCintaSalidaB;
GVL_IO.Baliza_Alarma        := fbClasificador.xBaliza OR fbClasificador.xFallaCoherencia;
GVL_IO.Heartbeat_Out        := fbHeartbeat.xPulso;
GVL_IO.Senal_Cambio_Estiba  := fbClasificador.xSenalCambioEstiba;
END_PROGRAM
