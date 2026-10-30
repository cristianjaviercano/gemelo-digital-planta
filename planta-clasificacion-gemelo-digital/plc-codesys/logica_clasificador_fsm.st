(* =============================================================================
   logica_clasificador_fsm.st
   Proyecto : Planta Virtual de Clasificación Gobernada por PLC
   Norma    : IEC 61131-3:2013 · Texto Estructurado
   Modelo   : Máquina de Moore M = (S, Σ, Λ, δ, λ, s0, F) — Contrato v1.2.0
   Contiene : 3 POU a crear por separado (Agregar objeto > POU):
              [1] FB_Heartbeat        (Bloque de función)
              [2] FB_ClasificadorFSM  (Bloque de función)
              [3] PLC_PRG             (Programa · asignado a MainTask, cíclica T#10MS)
   Depende  : variables_globales.st (E_EstadoClasificador, E_ModoRuteo, GVL_IO, GVL_Param)
   ============================================================================= *)


(* ========================================================= [1] FB_Heartbeat == *)
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
(*   (a) detección de flancos m↑, s↑, sA↑, sB↑ (R_TRIG, siempre — propiedad P4) *)
(*   (b) t = TON_Clasif(IN := s(k) ∈ {S2,S3}, PT := tClasificacion).Q            *)
(*   (c) s(k+1) = δ(s(k), σ(k))                                                 *)
(*       Prioridad: Emergencia ≻ Estiba no disponible ≻ Parada ≻ Proceso         *)
(*   (d) Q(k) = λ(s(k+1))              salida de Moore inyectiva                *)
(*   (e) diagnóstico de invariantes P2/P3 y código de falla                     *)
FUNCTION_BLOCK FB_ClasificadorFSM
VAR_INPUT
    xMarcha         : BOOL;    (* m  · %IX0.0 *)
    xParada         : BOOL;    (* p  · %IX0.1 *)
    xEmergencia     : BOOL;    (* e  · %IX0.2 TRUE = activa *)
    xSensor         : BOOL;    (* s  · %IX0.3 fotocelda entrada *)
    xSelectorB      : BOOL;    (* d  · %IX0.4 FALSE = A, TRUE = B *)
    xEstibaLlenaA   : BOOL;    (* ℓA · %IX0.5 *)
    xEstibaLlenaB   : BOOL;    (* ℓB · %IX0.6 *)
    xSensorSalidaA  : BOOL;    (* sA · %IX0.7 fotocelda salida A *)
    xSensorSalidaB  : BOOL;    (* sB · %IX1.0 fotocelda salida B *)
    xAtascoPlanta   : BOOL;    (* j  · %IX1.1 condición física de atasco *)
    uiModoRuteo     : UINT := 0;    (* %MW0: 0=Manual, 1=Escáner, 2=Balanceo *)
    uiSkuEscaneado  : UINT := 0;    (* %MW1: 0=Sin dato, 1=A, 2=B, 99=NO_READ *)
    uiModoWatchdog  : UINT := 0;    (* %MW2: 0=Clásico/Atasco, 1=Estricto lazo cerrado *)
    tClasificacion  : TIME := T#4S; (* %MW3 / GVL_Param.T_CLASIFICACION *)
END_VAR
VAR_OUTPUT
    xCintaEntrada      : BOOL; (* Q0  · %QX0.0 *)
    xDesviador         : BOOL; (* Q1  · %QX0.1 *)
    xCintaSalidaA      : BOOL; (* Q2  · %QX0.2 *)
    xCintaSalidaB      : BOOL; (* Q3  · %QX0.3 *)
    xBaliza            : BOOL; (* Q4  · %QX0.4 *)
    xSenalCambioEstiba : BOOL; (* Q6  · %QX0.6 *)
    xStopperAdmision   : BOOL; (* Q7  · %QX0.7 tope indexador de admisión *)
    xAlarmaAtasco      : BOOL; (* Q8  · %QX1.0 falla de watchdog *)
    xAvisoNoRead       : BOOL; (* Q9  · %QX1.1 pausa inspección NO_READ *)
    xBalizaVerde       : BOOL; (* Q10 · %QX1.2 operación normal *)
    eEstado            : E_EstadoClasificador := E_EstadoClasificador.REPOSO;
    xFallaCoherencia   : BOOL;
    uiCodigoFalla      : UINT := 0;
    udiPaquetesA       : UDINT := 0;
    udiPaquetesB       : UDINT := 0;
    udiAtascos         : UDINT := 0;
    udiNoRead          : UDINT := 0;
    uiTiempoClasifMs   : UINT := 0;
    uiUltimoSku        : UINT := 0;
END_VAR
VAR
    rtMarcha           : R_TRIG;
    rtSensor           : R_TRIG;
    rtSalidaA          : R_TRIG;
    rtSalidaB          : R_TRIG;
    TON_Clasif         : TON;
    xTurnoBalanceoB    : BOOL := FALSE;
    xIrRutaB           : BOOL := FALSE;
END_VAR

(* (a) Flancos ascendentes: evaluados en todo ciclo (P4) *)
rtMarcha(CLK := xMarcha);
rtSensor(CLK := xSensor);
rtSalidaA(CLK := xSensorSalidaA);
rtSalidaB(CLK := xSensorSalidaB);

(* (b) Temporizador / Watchdog de clasificación sobre el estado vigente *)
TON_Clasif(IN := (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A)
              OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B),
           PT := tClasificacion);
uiTiempoClasifMs := TIME_TO_UINT(TON_Clasif.ET);

(* (c) Función de transición δ *)
IF xEmergencia THEN                                             (* T1 · ∀s → S4 *)
    eEstado := E_EstadoClasificador.PARADA_EMERGENCIA;
ELSIF (xEstibaLlenaA OR xEstibaLlenaB)
      AND eEstado <> E_EstadoClasificador.PARADA_EMERGENCIA
      AND eEstado <> E_EstadoClasificador.FALLA_ATASCO THEN     (* T9 · S0..S3, S7 → S5 *)
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
        ELSIF rtSensor.Q THEN                                   (* Muestreo de destino en s↑ (P5) *)
            IF uiModoRuteo = 1 THEN                             (* Modo 1: AUTO_ESCANER *)
                uiUltimoSku := uiSkuEscaneado;
                IF uiSkuEscaneado = 99 THEN                     (* T13 · Código ilegible → S7 *)
                    eEstado := E_EstadoClasificador.INSPECCION_NO_READ;
                    udiNoRead := udiNoRead + 1;
                ELSIF uiSkuEscaneado = 2 THEN
                    eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_B;
                    udiPaquetesB := udiPaquetesB + 1;
                ELSE
                    eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_A;
                    udiPaquetesA := udiPaquetesA + 1;
                END_IF
            ELSIF uiModoRuteo = 2 THEN                          (* Modo 2: AUTO_BALANCEO *)
                xIrRutaB := xTurnoBalanceoB;
                xTurnoBalanceoB := NOT xTurnoBalanceoB;
                uiUltimoSku := SEL(xIrRutaB, 1, 2);
                IF xIrRutaB THEN
                    eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_B;
                    udiPaquetesB := udiPaquetesB + 1;
                ELSE
                    eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_A;
                    udiPaquetesA := udiPaquetesA + 1;
                END_IF
            ELSE                                                (* Modo 0: MANUAL (%IX0.4) *)
                uiUltimoSku := SEL(xSelectorB, 1, 2);
                IF xSelectorB THEN                              (* T5 *)
                    eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_B;
                    udiPaquetesB := udiPaquetesB + 1;
                ELSE                                            (* T4 *)
                    eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_A;
                    udiPaquetesA := udiPaquetesA + 1;
                END_IF
            END_IF
        END_IF

    E_EstadoClasificador.CLASIFICANDO_RUTA_A:
        IF xParada THEN                                         (* T7 *)
            eEstado := E_EstadoClasificador.REPOSO;
        ELSIF rtSalidaA.Q AND NOT xAtascoPlanta THEN            (* T6a · Cierre de lazo en salida A *)
            eEstado := E_EstadoClasificador.EN_MARCHA_ESPERA;
        ELSIF TON_Clasif.Q THEN
            IF xAtascoPlanta OR (uiModoWatchdog = 1) THEN       (* T11 · Watchdog vencido sin descarga → S6 *)
                eEstado := E_EstadoClasificador.FALLA_ATASCO;
                udiAtascos := udiAtascos + 1;
            ELSE                                                (* T6 · Lazo abierto clásico *)
                eEstado := E_EstadoClasificador.EN_MARCHA_ESPERA;
            END_IF
        END_IF

    E_EstadoClasificador.CLASIFICANDO_RUTA_B:
        IF xParada THEN                                         (* T7 *)
            eEstado := E_EstadoClasificador.REPOSO;
        ELSIF rtSalidaB.Q AND NOT xAtascoPlanta THEN            (* T6b · Cierre de lazo en salida B *)
            eEstado := E_EstadoClasificador.EN_MARCHA_ESPERA;
        ELSIF TON_Clasif.Q THEN
            IF xAtascoPlanta OR (uiModoWatchdog = 1) THEN       (* T11 · Watchdog vencido sin descarga → S6 *)
                eEstado := E_EstadoClasificador.FALLA_ATASCO;
                udiAtascos := udiAtascos + 1;
            ELSE                                                (* T6 · Lazo abierto clásico *)
                eEstado := E_EstadoClasificador.EN_MARCHA_ESPERA;
            END_IF
        END_IF

    E_EstadoClasificador.PARADA_EMERGENCIA:
        IF xParada THEN                                         (* T8 · Rearme consciente *)
            eEstado := E_EstadoClasificador.REPOSO;
        END_IF

    E_EstadoClasificador.ESPERANDO_CAMBIO_ESTIBA:
        eEstado := E_EstadoClasificador.REPOSO;                 (* T10 · exige Marcha (P7) *)

    E_EstadoClasificador.FALLA_ATASCO:
        IF xParada AND NOT xAtascoPlanta THEN                   (* T12 · Rearme tras despejar atasco *)
            eEstado := E_EstadoClasificador.REPOSO;
        END_IF

    E_EstadoClasificador.INSPECCION_NO_READ:
        IF xParada THEN                                         (* Cancelar a Reposo *)
            eEstado := E_EstadoClasificador.REPOSO;
        ELSIF rtMarcha.Q THEN                                   (* T14 · Operador asigna ruta A/B y confirma con Marcha *)
            IF xSelectorB THEN
                uiUltimoSku := 2;
                eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_B;
                udiPaquetesB := udiPaquetesB + 1;
            ELSE
                uiUltimoSku := 1;
                eEstado := E_EstadoClasificador.CLASIFICANDO_RUTA_A;
                udiPaquetesA := udiPaquetesA + 1;
            END_IF
        END_IF

    ELSE
        eEstado := E_EstadoClasificador.PARADA_EMERGENCIA;
    END_CASE
END_IF

(* (d) Función de salida λ (Moore): códigos inyectivos *)
xCintaEntrada      := (eEstado = E_EstadoClasificador.EN_MARCHA_ESPERA)
                   OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A)
                   OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B);
xDesviador         :=  eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B;
xCintaSalidaA      :=  eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A;
xCintaSalidaB      :=  eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B;
xBaliza            := (eEstado = E_EstadoClasificador.PARADA_EMERGENCIA)
                   OR (eEstado = E_EstadoClasificador.FALLA_ATASCO);
xSenalCambioEstiba := (eEstado = E_EstadoClasificador.ESPERANDO_CAMBIO_ESTIBA)
                   OR (eEstado = E_EstadoClasificador.INSPECCION_NO_READ);
xStopperAdmision   := (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_A)
                   OR (eEstado = E_EstadoClasificador.CLASIFICANDO_RUTA_B)
                   OR (eEstado = E_EstadoClasificador.INSPECCION_NO_READ)
                   OR (eEstado = E_EstadoClasificador.FALLA_ATASCO);
xAlarmaAtasco      :=  eEstado = E_EstadoClasificador.FALLA_ATASCO;
xAvisoNoRead       :=  eEstado = E_EstadoClasificador.INSPECCION_NO_READ;
xBalizaVerde       :=  xCintaEntrada;

(* (e) Invariantes P2/P3 y código de falla *)
xFallaCoherencia := (xCintaSalidaA AND xCintaSalidaB) OR (xDesviador XOR xCintaSalidaB);

IF xFallaCoherencia THEN
    uiCodigoFalla := 5;
ELSIF eEstado = E_EstadoClasificador.PARADA_EMERGENCIA THEN
    uiCodigoFalla := 1;
ELSIF eEstado = E_EstadoClasificador.ESPERANDO_CAMBIO_ESTIBA THEN
    uiCodigoFalla := 2;
ELSIF eEstado = E_EstadoClasificador.FALLA_ATASCO THEN
    uiCodigoFalla := 3;
ELSIF eEstado = E_EstadoClasificador.INSPECCION_NO_READ THEN
    uiCodigoFalla := 4;
ELSE
    uiCodigoFalla := 0;
END_IF
END_FUNCTION_BLOCK


(* ================================================================ [3] PLC_PRG == *)
PROGRAM PLC_PRG
VAR
    fbClasificador : FB_ClasificadorFSM;
    fbHeartbeat    : FB_Heartbeat;
    tWatchdog      : TIME;
END_VAR

fbHeartbeat(tSemiperiodo := GVL_Param.T_HEARTBEAT);

IF GVL_IO.HR_Tiempo_Watchdog_Ms >= 1000 AND GVL_IO.HR_Tiempo_Watchdog_Ms <= 15000 THEN
    tWatchdog := UINT_TO_TIME(GVL_IO.HR_Tiempo_Watchdog_Ms);
ELSE
    tWatchdog := GVL_Param.T_CLASIFICACION;
END_IF

fbClasificador(
    xMarcha        := GVL_IO.Marcha,
    xParada        := GVL_IO.Parada,
    xEmergencia    := GVL_IO.Emergencia,
    xSensor        := GVL_IO.Sensor_Entrada,
    xSelectorB     := GVL_IO.Selector_Destino,
    xEstibaLlenaA  := GVL_IO.Estiba_Llena_A,
    xEstibaLlenaB  := GVL_IO.Estiba_Llena_B,
    xSensorSalidaA := GVL_IO.Sensor_Salida_A,
    xSensorSalidaB := GVL_IO.Sensor_Salida_B,
    xAtascoPlanta  := GVL_IO.Atasco_Planta,
    uiModoRuteo    := GVL_IO.HR_Modo_Ruteo,
    uiSkuEscaneado := GVL_IO.HR_SKU_Escaneado,
    uiModoWatchdog := GVL_IO.HR_Modo_Watchdog,
    tClasificacion := tWatchdog);

(* Escritura de la imagen de salidas discretas %QX *)
GVL_IO.Motor_Cinta_Entrada  := fbClasificador.xCintaEntrada;
GVL_IO.Actuador_Desviador   := fbClasificador.xDesviador;
GVL_IO.Motor_Cinta_Salida_A := fbClasificador.xCintaSalidaA;
GVL_IO.Motor_Cinta_Salida_B := fbClasificador.xCintaSalidaB;
GVL_IO.Baliza_Alarma        := fbClasificador.xBaliza OR fbClasificador.xFallaCoherencia;
GVL_IO.Heartbeat_Out        := fbHeartbeat.xPulso;
GVL_IO.Senal_Cambio_Estiba  := fbClasificador.xSenalCambioEstiba;
GVL_IO.Stopper_Admision     := fbClasificador.xStopperAdmision;
GVL_IO.Alarma_Atasco        := fbClasificador.xAlarmaAtasco;
GVL_IO.Aviso_NoRead         := fbClasificador.xAvisoNoRead;
GVL_IO.Baliza_Verde         := fbClasificador.xBalizaVerde;

(* Escritura de los registros de entrada %IW (telemetría FC04) *)
GVL_IO.IR_Estado_FSM        := INT_TO_UINT(fbClasificador.eEstado);
GVL_IO.IR_Codigo_Falla      := fbClasificador.uiCodigoFalla;
GVL_IO.IR_Paquetes_A        := UDINT_TO_UINT(fbClasificador.udiPaquetesA);
GVL_IO.IR_Paquetes_B        := UDINT_TO_UINT(fbClasificador.udiPaquetesB);
GVL_IO.IR_Atascos           := UDINT_TO_UINT(fbClasificador.udiAtascos);
GVL_IO.IR_NoRead            := UDINT_TO_UINT(fbClasificador.udiNoRead);
GVL_IO.IR_Tiempo_Clasif_Ms  := fbClasificador.uiTiempoClasifMs;
GVL_IO.IR_Ultimo_SKU        := fbClasificador.uiUltimoSku;
END_PROGRAM
