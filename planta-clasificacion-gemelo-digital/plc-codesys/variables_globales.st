(* =============================================================================
   variables_globales.st
   Proyecto : Planta Virtual de Clasificación Gobernada por PLC
   Norma    : IEC 61131-3:2013 · Texto Estructurado
   Contrato : config_modbus_slave.json v1.1.0 (v1.0.0 + estibas; ninguna dirección
              existente se reasigna)
   Contiene : 2 objetos CODESYS a crear por separado en el árbol POU:
              [1] DUT  E_EstadoClasificador   (Agregar objeto > DUT > Enumeración)
              [2] GVL  GVL_IO                 (Agregar objeto > Lista de variables globales)
              [3] GVL  GVL_Param              (constantes de proceso)
   ============================================================================= *)


(* ------------------------------------------------------------------ [1] DUT -- *)
(* Estados S0..S5 de la máquina de Moore (docs/01 §3.1; S5 en docs/08 §3).       *)
{attribute 'qualified_only'}
{attribute 'strict'}
{attribute 'to_string'}
TYPE E_EstadoClasificador :
(
    REPOSO                  := 0,   (* S0 · estado seguro de referencia, F = {S0} *)
    EN_MARCHA_ESPERA        := 1,   (* S1 *)
    CLASIFICANDO_RUTA_A     := 2,   (* S2 *)
    CLASIFICANDO_RUTA_B     := 3,   (* S3 *)
    PARADA_EMERGENCIA       := 4,   (* S4 *)
    ESPERANDO_CAMBIO_ESTIBA := 5    (* S5 · una estiba llena o en cambio *)
) INT;
END_TYPE


(* ------------------------------------------------------------------ [2] GVL -- *)
(* Imagen de proceso. Las direcciones AT coinciden 1:1 con el esclavo Modbus:    *)
(*   Coils 0..6           -> %IX0.0..%IX0.6  (escritas por el maestro, FC05/15)  *)
(*   Discrete Inputs 0..6 -> %QX0.0..%QX0.6  (leídas por el maestro, FC02)       *)
(* Requisito: el área de I/O del ModbusTCP_Slave_Device debe iniciar en %IX0.0   *)
(* y %QX0.0 (pestaña "Asignación E/S" del dispositivo).                           *)
{attribute 'qualified_only'}
VAR_GLOBAL
    (* Entradas al PLC (%IX) ------------------------------------------------- *)
    Marcha               AT %IX0.0 : BOOL;  (* Coil 0 · pulsador NA momentáneo         *)
    Parada               AT %IX0.1 : BOOL;  (* Coil 1 · pulsador momentáneo, prioridad *)
    Emergencia           AT %IX0.2 : BOOL;  (* Coil 2 · TRUE = emergencia activa       *)
    Sensor_Entrada       AT %IX0.3 : BOOL;  (* Coil 3 · presencia emulada por la HMI   *)
    Selector_Destino     AT %IX0.4 : BOOL;  (* Coil 4 · FALSE = Ruta A, TRUE = Ruta B  *)
    Estiba_Llena_A       AT %IX0.5 : BOOL;  (* Coil 5 · estiba A no disponible: llena o en cambio *)
    Estiba_Llena_B       AT %IX0.6 : BOOL;  (* Coil 6 · estiba B no disponible                    *)

    (* Salidas del PLC (%QX) ------------------------------------------------- *)
    Motor_Cinta_Entrada  AT %QX0.0 : BOOL;  (* DI 0 *)
    Actuador_Desviador   AT %QX0.1 : BOOL;  (* DI 1 · TRUE = paleta en Ruta B *)
    Motor_Cinta_Salida_A AT %QX0.2 : BOOL;  (* DI 2 *)
    Motor_Cinta_Salida_B AT %QX0.3 : BOOL;  (* DI 3 *)
    Baliza_Alarma        AT %QX0.4 : BOOL;  (* DI 4 *)
    Heartbeat_Out        AT %QX0.5 : BOOL;  (* DI 5 · onda cuadrada ~1 s *)
    Senal_Cambio_Estiba  AT %QX0.6 : BOOL;  (* DI 6 · baliza ámbar: esperando cambio de estiba *)
END_VAR


(* ------------------------------------------------------------------ [3] GVL -- *)
{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
    T_HEARTBEAT     : TIME := T#500MS;  (* PT de Heartbeat_Timer (semiperiodo)          *)
    T_CLASIFICACION : TIME := T#4S;     (* T_clas >= (L_d + L_s)/v_c + eps (docs/01 §3.2) *)
END_VAR
