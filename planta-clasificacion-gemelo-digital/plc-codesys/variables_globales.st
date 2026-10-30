(* =============================================================================
   variables_globales.st
   Proyecto : Planta Virtual de Clasificación Gobernada por PLC
   Norma    : IEC 61131-3:2013 · Texto Estructurado
   Contrato : config_modbus_slave.json v1.2.0 (4 tablas Modbus TCP: Coils 0..9,
              Discrete Inputs 0..10, Holding Registers 0..3, Input Registers 0..7;
              retrocompatible con las direcciones 0..6 de v1.1.0)
   Contiene : 4 objetos CODESYS a crear por separado en el árbol POU:
              [1] DUT  E_EstadoClasificador   (Enumeración de estados S0..S7)
              [2] DUT  E_ModoRuteo            (Enumeración de modos de ruteo)
              [3] GVL  GVL_IO                 (Imagen de proceso %IX, %QX, %MW, %IW)
              [4] GVL  GVL_Param              (Constantes de proceso por defecto)
   ============================================================================= *)


(* ------------------------------------------------------------------ [1] DUT -- *)
(* Estados S0..S7 de la máquina de Moore (docs/01 §3.1; S6 y S7 en v1.2.0).      *)
{attribute 'qualified_only'}
{attribute 'strict'}
{attribute 'to_string'}
TYPE E_EstadoClasificador :
(
    REPOSO                  := 0,   (* S0 · estado seguro de referencia, F = {S0} *)
    EN_MARCHA_ESPERA        := 1,   (* S1 · cinta activa esperando paquete en %IX0.3 *)
    CLASIFICANDO_RUTA_A     := 2,   (* S2 · evacuando hacia salida A hasta %IX0.7 *)
    CLASIFICANDO_RUTA_B     := 3,   (* S3 · evacuando hacia salida B hasta %IX1.0 *)
    PARADA_EMERGENCIA       := 4,   (* S4 · seta enclavada; requiere rearme consciente *)
    ESPERANDO_CAMBIO_ESTIBA := 5,   (* S5 · estiba A o B no disponible (llena o en cambio) *)
    FALLA_ATASCO            := 6,   (* S6 · watchdog TON vencido sin confirmar %IX0.7/%IX1.0 *)
    INSPECCION_NO_READ      := 7    (* S7 · código ilegible (SKU 99); espera asignación manual *)
) INT;
END_TYPE


(* ------------------------------------------------------------------ [2] DUT -- *)
{attribute 'qualified_only'}
{attribute 'strict'}
TYPE E_ModoRuteo :
(
    MANUAL        := 0,   (* Decide con %IX0.4 Selector_Destino *)
    AUTO_ESCANER  := 1,   (* Decide con %MW1 HR_SKU_Escaneado (1=A, 2=B, 99=NO_READ) *)
    AUTO_BALANCEO := 2    (* Alterna/balancea automáticamente en el PLC entre A y B *)
) UINT;
END_TYPE


(* ------------------------------------------------------------------ [3] GVL -- *)
(* Imagen de proceso. Las direcciones AT coinciden 1:1 con el esclavo Modbus:    *)
(*   Coils 0..9             -> %IX0.0..%IX1.1  (escritas por el maestro, FC05/15)*)
(*   Discrete Inputs 0..10  -> %QX0.0..%QX1.2  (leídas por el maestro, FC02)     *)
(*   Holding Registers 0..3 -> %MW0..%MW3      (leídos/escritos, FC03/FC06)      *)
(*   Input Registers 0..7   -> %IW0..%IW7      (telemetría PLC, FC04)            *)
{attribute 'qualified_only'}
VAR_GLOBAL
    (* Entradas discretas al PLC (%IX · Coils 0..9) ---------------------------- *)
    Marcha               AT %IX0.0 : BOOL;  (* Coil 0 · pulsador NA momentáneo         *)
    Parada               AT %IX0.1 : BOOL;  (* Coil 1 · pulsador momentáneo, prioridad *)
    Emergencia           AT %IX0.2 : BOOL;  (* Coil 2 · TRUE = emergencia activa       *)
    Sensor_Entrada       AT %IX0.3 : BOOL;  (* Coil 3 · fotocelda pórtico escáner      *)
    Selector_Destino     AT %IX0.4 : BOOL;  (* Coil 4 · FALSE = Ruta A, TRUE = Ruta B  *)
    Estiba_Llena_A       AT %IX0.5 : BOOL;  (* Coil 5 · estiba A no disponible         *)
    Estiba_Llena_B       AT %IX0.6 : BOOL;  (* Coil 6 · estiba B no disponible         *)
    Sensor_Salida_A      AT %IX0.7 : BOOL;  (* Coil 7 · fotocelda descarga salida A    *)
    Sensor_Salida_B      AT %IX1.0 : BOOL;  (* Coil 8 · fotocelda descarga salida B    *)
    Atasco_Planta        AT %IX1.1 : BOOL;  (* Coil 9 · atasco físico en banda activa  *)

    (* Salidas discretas del PLC (%QX · Discrete Inputs 0..10) ----------------- *)
    Motor_Cinta_Entrada  AT %QX0.0 : BOOL;  (* DI 0  · contactor banda principal       *)
    Actuador_Desviador   AT %QX0.1 : BOOL;  (* DI 1  · electroválvula 5/2 (TRUE = B)   *)
    Motor_Cinta_Salida_A AT %QX0.2 : BOOL;  (* DI 2  · contactor banda salida A        *)
    Motor_Cinta_Salida_B AT %QX0.3 : BOOL;  (* DI 3  · contactor banda salida B        *)
    Baliza_Alarma        AT %QX0.4 : BOOL;  (* DI 4  · torreta roja (S4 o S6)          *)
    Heartbeat_Out        AT %QX0.5 : BOOL;  (* DI 5  · onda cuadrada supervisión ~1 Hz *)
    Senal_Cambio_Estiba  AT %QX0.6 : BOOL;  (* DI 6  · torreta ámbar (S5 o S7)         *)
    Stopper_Admision     AT %QX0.7 : BOOL;  (* DI 7  · tope neumático indexador cola   *)
    Alarma_Atasco        AT %QX1.0 : BOOL;  (* DI 8  · falla de watchdog de atasco S6  *)
    Aviso_NoRead         AT %QX1.1 : BOOL;  (* DI 9  · pausa inspección NO_READ S7     *)
    Baliza_Verde         AT %QX1.2 : BOOL;  (* DI 10 · torreta verde operación normal  *)

    (* Registros de mantenimiento (%MW · Holding Registers 0..3, FC03/FC06) ---- *)
    HR_Modo_Ruteo          AT %MW0 : UINT := 0;    (* 0=Manual, 1=Escáner, 2=Balanceo *)
    HR_SKU_Escaneado       AT %MW1 : UINT := 0;    (* 0=Sin dato, 1=SKU_A, 2=SKU_B, 99=NO_READ *)
    HR_Modo_Watchdog       AT %MW2 : UINT := 0;    (* 0=Clásico/Señal, 1=Lazo cerrado estricto *)
    HR_Tiempo_Watchdog_Ms  AT %MW3 : UINT := 4000; (* PT del watchdog en ms (1000..15000) *)

    (* Registros de entrada (%IW · Input Registers 0..7, FC04) ----------------- *)
    IR_Estado_FSM          AT %IW0 : UINT;  (* Código numérico E_EstadoClasificador 0..7 *)
    IR_Codigo_Falla        AT %IW1 : UINT;  (* 0=OK, 1=EMERG, 2=ESTIBA, 3=ATASCO, 4=NOREAD, 5=COHERENCIA *)
    IR_Paquetes_A          AT %IW2 : UINT;  (* Contador acumulado Ruta A                *)
    IR_Paquetes_B          AT %IW3 : UINT;  (* Contador acumulado Ruta B                *)
    IR_Atascos             AT %IW4 : UINT;  (* Contador acumulado de atascos            *)
    IR_NoRead              AT %IW5 : UINT;  (* Contador acumulado de lecturas NO_READ   *)
    IR_Tiempo_Clasif_Ms    AT %IW6 : UINT;  (* Tiempo transcurrido ET del TON (ms)      *)
    IR_Ultimo_SKU          AT %IW7 : UINT;  (* Último SKU evaluado en el túnel lector   *)
END_VAR


(* ------------------------------------------------------------------ [4] GVL -- *)
{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
    T_HEARTBEAT     : TIME := T#500MS;  (* PT de Heartbeat_Timer (semiperiodo)          *)
    T_CLASIFICACION : TIME := T#4S;     (* T_clas / Watchdog por defecto (docs/01 §3.2) *)
END_VAR
