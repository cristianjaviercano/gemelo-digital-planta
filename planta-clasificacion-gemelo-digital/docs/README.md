# Documentación del proyecto

Planta Virtual de Clasificación Gobernada por PLC (*Virtual Commissioning*) · Grupo SILOGE, Universidad Pontificia Bolivariana.

| # | Documento | Responde a | Para quién | Estado |
|:-:|---|---|---|---|
| 01 | [Arquitectura, modelo de control y flujos](01_arquitectura_y_flujos.md) | ¿Cómo se diseñó el sistema? Capas, máquina de estados, DFD y secuencias | Ingeniería | Diseño de referencia (Fase 1) |
| 02 | [Mapeo de memoria Modbus y contrato de datos](02_mapeo_memoria_modbus.md) | ¿Qué significa cada bit y cada campo del JSON? | Ingeniería, laboratorio | v1.1.0 vigente (§6 amplía la v1.0.0) |
| 03 | [Manual de puesta en marcha](03_manual_puesta_en_marcha.md) | ¿Qué es un PLC y cómo lo emula la aplicación? ¿Cómo se instala, se pone en marcha y se prueba en macOS? | Desarrollo, docencia | Fases 2–4 y estibas; figuras 1–7 |
| 04 | [Modelo de procesos BPMN 2.0](04_modelo_bpmn.md) | ¿Qué hace cada actor y en qué orden? | Ingeniería, docencia | Proceso 1 implementado; proceso 2 implementado en parte (estibas) |
| 05 | [Arquitectura de software implementada](05_arquitectura_de_software.md) | ¿Qué se construyó, cómo se conecta y cómo se extiende? | Desarrollo | Fases 1–4 y estibas; indicadores en diseño |
| 06 | [Manual de operación](06_manual_de_operacion.md) | ¿Cómo se opera la planta y qué hacer ante cada situación? | Operadores, estudiantes, docentes | Fases 2–4 y estibas (POE-09) |
| 07 | [Fundamentos teóricos](07_fundamentos_teoricos.md) | ¿Por qué el sistema está diseñado así? | Docencia, investigación | Completo |
| 08 | [Especificación de la Fase 5](08_especificacion_fase5.md) | ¿Cómo serán los KPIs, las estibas y el informe de corrida? | Desarrollo, docencia | Estibas y S5 implementados; KPIs y CSV pendientes |
| — | [Laboratorio SILOGE (Windows)](../windows/README.md) | ¿Cómo se monta y opera en el laboratorio con CODESYS? | Laboratorio | Pendiente de validar en CODESYS |
| — | [Registro de cambios macOS ↔ Windows](../windows/REGISTRO_DE_CAMBIOS.md) | ¿Qué cambió y qué falta comprobar en el laboratorio? | Laboratorio | Vivo |

## Modelos BPMN

| Proceso | Carpeta | Abrir |
|---|---|---|
| Clasificación de un paquete | [`bpmn/01_clasificacion_paquete/`](bpmn/01_clasificacion_paquete/) | `visor_bpmn.html` en el navegador, o `proceso.bpmn` en Camunda Modeler / bpmn.io |
| Corrida de medición y cambio de estiba (Fase 5) | [`bpmn/02_corrida_y_estibas/`](bpmn/02_corrida_y_estibas/) | Igual |

## Orden de lectura sugerido

- *Para operar la planta:* 06, y luego 03 o la guía del laboratorio.
- *Para entender el PLC y su emulación:* la sección «El PLC» de 03, y luego 07 §4.
- *Para entender el diseño:* 07, 01, 04 y 05.
- *Para continuar el desarrollo:* 05, 02, 08 y 03.
