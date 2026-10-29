#!/usr/bin/env python3
"""Genera las figuras esquemáticas del manual de puesta en marcha (docs/03): 1, 2, 3, 5, 6 y 7.

La vista superior se dibuja con la geometría que exporta el modelo de planta
(hmi-planta-3d/src/core/plantModel.js), de modo que el esquema no se desvía del
código. Requiere Node.js. Uso: python3 docs/figuras/generar_figuras.py
"""
import json
import math
import subprocess
from html import escape
from pathlib import Path

AQUI = Path(__file__).resolve().parent
HMI = AQUI.parent.parent / "hmi-planta-3d"

TINTA = "#1f2329"
GRIS = "#5f6873"
TENUE = "#9aa3ad"
CINTA = "#dde2e8"
LISTON = "#b4bcc6"
ZONA = "#eef1f4"
CAJA = "#d9a66b"
CAJA_BORDE = "#8a5a2b"
HAZ = "#c0392b"
PALETA = "#e0b000"
MOTOR = "#3f74a8"
SALIDA = "#2c6fb7"     # señales de salida del PLC (Q)
ENTRADA = "#2f7a4a"    # señales de entrada del PLC (I)
AMBAR = "#ffd666"      # módulo ámbar de la baliza (H2)
FUENTE = "Helvetica Neue, Helvetica, Arial, sans-serif"


def leer_geometria():
    codigo = """
import { GEOMETRIA, TRAMOS, HAZ_SENSOR } from './src/core/plantModel.js';
const p = (v) => [v.x, v.z];
console.log(JSON.stringify({
  G: GEOMETRIA,
  tramos: Object.fromEntries(Object.entries(TRAMOS).map(([k, t]) =>
    [k, t.map((s) => ({ desde: p(s.desde), hasta: p(s.hasta), cinta: s.cinta }))])),
  haz: { min: HAZ_SENSOR.min.toArray(), max: HAZ_SENSOR.max.toArray() },
}));"""
    salida = subprocess.check_output(["node", "--input-type=module", "-e", codigo], cwd=HMI, text=True)
    return json.loads(salida)


class Svg:
    def __init__(self, ancho, alto):
        self.ancho, self.alto, self.partes = ancho, alto, []

    def add(self, fragmento):
        self.partes.append(fragmento)

    def linea(self, a, b, color=TINTA, grosor=1.2, trazo=None, flecha=None, flecha_inicio=None):
        extra = f' stroke-dasharray="{trazo}"' if trazo else ""
        extra += f' marker-end="url(#{flecha})"' if flecha else ""
        extra += f' marker-start="url(#{flecha_inicio})"' if flecha_inicio else ""
        self.add(f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" '
                 f'stroke="{color}" stroke-width="{grosor}"{extra}/>')

    def poligono(self, puntos, relleno, borde=TINTA, grosor=1.2, trazo=None):
        extra = f' stroke-dasharray="{trazo}"' if trazo else ""
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in puntos)
        self.add(f'<polygon points="{pts}" fill="{relleno}" stroke="{borde}" stroke-width="{grosor}"{extra}/>')

    def rect(self, x, y, w, h, relleno="#fff", borde=TINTA, grosor=1.2, radio=0, trazo=None):
        extra = f' stroke-dasharray="{trazo}"' if trazo else ""
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{radio}" '
                 f'fill="{relleno}" stroke="{borde}" stroke-width="{grosor}"{extra}/>')

    def circulo(self, c, r, relleno="#fff", borde=TINTA, grosor=1.4):
        self.add(f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="{r}" fill="{relleno}" stroke="{borde}" stroke-width="{grosor}"/>')

    def texto(self, p, contenido, tam=12, ancla="start", color=TINTA, peso="normal", cursiva=False, giro=None):
        estilo = ' font-style="italic"' if cursiva else ""
        rot = f' transform="rotate({giro:.1f} {p[0]:.1f} {p[1]:.1f})"' if giro is not None else ""
        self.add(f'<text x="{p[0]:.1f}" y="{p[1]:.1f}" font-size="{tam}" text-anchor="{ancla}" '
                 f'fill="{color}" font-weight="{peso}"{estilo}{rot}>{escape(contenido)}</text>')

    def guardar(self, nombre, titulo):
        defs = f"""<defs>
  <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{TINTA}"/></marker>
  <marker id="punta-gris" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{GRIS}"/></marker>
  <marker id="punta-salida" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{SALIDA}"/></marker>
  <marker id="punta-entrada" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="{ENTRADA}"/></marker>
  <marker id="cota" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
    <path d="M0,1 L10,5 L0,9" fill="none" stroke="{GRIS}" stroke-width="1.4"/></marker>
</defs>"""
        cuerpo = "\n".join(self.partes)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.ancho} {self.alto}" '
               f'width="{self.ancho}" height="{self.alto}" font-family="{FUENTE}" role="img" aria-label="{escape(titulo)}">\n'
               f"<title>{escape(titulo)}</title>\n{defs}\n"
               f'<rect width="{self.ancho}" height="{self.alto}" fill="#ffffff"/>\n{cuerpo}\n</svg>\n')
        (AQUI / nombre).write_text(svg, encoding="utf-8")
        print("figura:", AQUI / nombre)


# --------------------------------------------------------------- símbolos ----
def motor(svg, c, etiqueta):
    svg.circulo(c, 13, "#ffffff", TINTA, 1.6)
    svg.texto((c[0], c[1] + 4.5), "M", 12, "middle", TINTA, "600")
    if etiqueta:
        svg.texto((c[0], c[1] + 27), etiqueta, 10, "middle", GRIS)


def lampara(svg, c, r=12, relleno="#ffffff"):
    svg.circulo(c, r, relleno, TINTA, 1.6)
    d = r * 0.7
    svg.linea((c[0] - d, c[1] - d), (c[0] + d, c[1] + d), TINTA, 1.4)
    svg.linea((c[0] - d, c[1] + d), (c[0] + d, c[1] - d), TINTA, 1.4)


def etiqueta_equipo(svg, punto, ancla, texto, color):
    """Referencia de equipo (p. ej. «M1 · Q0») con línea de llamada hasta el símbolo."""
    w = 7.2 * len(texto) + 14
    svg.linea(punto, ancla, GRIS, 0.9)
    svg.rect(ancla[0] - w / 2, ancla[1] - 11, w, 22, "#ffffff", color, 1.4, 4)
    svg.texto((ancla[0], ancla[1] + 4.5), texto, 12, "middle", color, "600")


def cota(svg, a, b, texto, desplaz=(0, -6), giro=None):
    svg.linea(a, b, GRIS, 1, None, "cota", "cota")
    medio = ((a[0] + b[0]) / 2 + desplaz[0], (a[1] + b[1]) / 2 + desplaz[1])
    svg.texto(medio, texto, 11, "middle", GRIS, cursiva=True, giro=giro)


# ------------------------------------------------- figura 2: vista superior ----
def figura_vista_superior(geo):
    G, tramos, haz = geo["G"], geo["tramos"], geo["haz"]
    S = 125                                   # px por metro
    ox, oz = 50 + 3.2 * S, 70 + 2.0 * S
    T = lambda x, z: (ox + x * S, oz + z * S)

    svg = Svg(1360, 830)
    ancho = G["anchoCinta"]

    def ejes_de(tramo):
        dx, dz = tramo["hasta"][0] - tramo["desde"][0], tramo["hasta"][1] - tramo["desde"][1]
        largo = math.hypot(dx, dz)
        d = (dx / largo, dz / largo)
        return d, (-d[1], d[0]), largo

    def cinta(desde, hasta, w, desfase=0.0, largueros=(-1, 1), relleno=CINTA):
        d, n, largo = ejes_de({"desde": desde, "hasta": hasta})
        punto = lambda base, a, b: T(base[0] + d[0] * a + n[0] * b, base[1] + d[1] * a + n[1] * b)
        esquinas = [punto(desde, 0, desfase - w / 2), punto(desde, 0, desfase + w / 2),
                    punto(desde, largo, desfase + w / 2), punto(desde, largo, desfase - w / 2)]
        svg.poligono(esquinas, relleno, TINTA, 1.2)
        k = 0.06
        while k < largo:
            svg.linea(punto(desde, k, desfase - w / 2), punto(desde, k, desfase + w / 2), LISTON, 0.8)
            k += 0.12
        for lado in largueros:
            svg.linea(punto(desde, 0, desfase + lado * w / 2), punto(desde, largo, desfase + lado * w / 2), TINTA, 2.6)
        return d, n, largo

    # Zona de seguridad (franja amarilla del suelo)
    svg.rect(*T(-3.0, -1.1), 6.75 * S, 4.05 * S, "none", PALETA, 2, 0, "10 6")
    svg.texto((T(-3.0, -1.1)[0] + 6, T(-3.0, -1.1)[1] - 6), "Zona de seguridad (franja amarilla del suelo)", 11, "start", "#9a7a00", cursiva=True)

    # Cintas y zona de desvío
    cinta((G["xSensor"], 0), (G["xSensor"] + G["largoZonaDesvio"], 0), 0.62, 0.085, (-1,), ZONA)
    cinta((G["xInicioEntrada"], 0), (G["xSensor"], 0), ancho)
    salida_a = tramos["A"][1]
    salida_b = tramos["B"][1]
    cinta(salida_a["desde"], salida_a["hasta"], ancho)
    db, nb, _ = cinta(salida_b["desde"], salida_b["hasta"], ancho)

    # Trayectorias del centro del paquete y sentido de avance
    dec = tramos["A"][0]["desde"]
    for ruta in ("A", "B"):
        svg.linea(T(*dec), T(*tramos[ruta][1]["hasta"]), GRIS, 1, "2 4")
    svg.linea(T(G["xInicioEntrada"] + 0.35, 0), T(G["xSensor"], 0), GRIS, 1, "2 4")
    for x in (-1.9, -0.55):
        svg.linea(T(x, 0), T(x + 0.28, 0), GRIS, 1.6, None, "punta-gris")
    svg.linea(T(1.2, 0), T(1.48, 0), GRIS, 1.6, None, "punta-gris")
    pb = (salida_b["desde"][0] + db[0] * 0.6, salida_b["desde"][1] + db[1] * 0.6)
    svg.linea(T(*pb), T(pb[0] + db[0] * 0.28, pb[1] + db[1] * 0.28), GRIS, 1.6, None, "punta-gris")

    # Estibas al final de cada salida, con el patrón de 4 × 4 posiciones y algunas cajas de ejemplo
    E, P = G["estiba"], G["paquete"]
    anclas_estiba = {}
    for rama, tramo, cajas in (("A", salida_a, 3), ("B", salida_b, 1)):
        d, n, _ = ejes_de(tramo)
        c = (tramo["hasta"][0] + d[0] * E["distancia"], tramo["hasta"][1] + d[1] * E["distancia"])
        en = lambda a, b: T(c[0] + d[0] * a + n[0] * b, c[1] + d[1] * a + n[1] * b)
        L, W = E["largo"], E["ancho"]
        svg.poligono([en(-L / 2, -W / 2), en(-L / 2, W / 2), en(L / 2, W / 2), en(L / 2, -W / 2)], "#ead9bd", CAJA_BORDE, 1.4)
        for i in range(5):
            svg.linea(en(-L / 2 + i * P["largo"], -W / 2), en(-L / 2 + i * P["largo"], W / 2), "#c4a477", 0.8, "3 3")
            svg.linea(en(-L / 2, -W / 2 + i * P["ancho"]), en(L / 2, -W / 2 + i * P["ancho"]), "#c4a477", 0.8, "3 3")
        for k in range(cajas):
            columna, fila = 3 - (k % 4), k // 4
            a = -L / 2 + P["largo"] / 2 + columna * P["largo"]
            b = -W / 2 + P["ancho"] / 2 + fila * P["ancho"]
            svg.poligono([en(a - P["largo"] / 2 + 0.01, b - P["ancho"] / 2 + 0.01), en(a - P["largo"] / 2 + 0.01, b + P["ancho"] / 2 - 0.01),
                          en(a + P["largo"] / 2 - 0.01, b + P["ancho"] / 2 - 0.01), en(a + P["largo"] / 2 - 0.01, b - P["ancho"] / 2 + 0.01)],
                         CAJA, CAJA_BORDE, 1.2)
        anclas_estiba[rama] = (c[0] + n[0] * (-W / 2) + d[0] * 0.3, c[1] + n[1] * (-W / 2) + d[1] * 0.3)
    svg.texto(T(2.9, 0.72), "Estiba A · 1,2 × 1,0 m · 4 × 4 por capa", 11, "middle", TINTA)
    svg.texto(T(0.95, 2.62), "Estiba B", 11, "middle", TINTA)

    # Desviador de paleta Y1: posición de reposo (ruta A) y de trabajo (ruta B, 45°)
    theta = G["anguloRutaB"]
    holgura = P["ancho"] / 2 + 0.02
    pared = (G["xDecision"] + math.sin(theta) * holgura, -math.cos(theta) * holgura)
    k = (-ancho / 2 - pared[1]) / math.sin(theta)
    pivote = (pared[0] + math.cos(theta) * k, pared[1] + math.sin(theta) * k)
    svg.rect(*T(pivote[0] - 0.16, pivote[1] - 0.16), 0.22 * S, 0.08 * S, MOTOR, TINTA, 1)
    svg.linea(T(*pivote), T(pivote[0] + 0.75, pivote[1]), PALETA, 5)
    extremo_b = (pivote[0] + 0.75 * math.cos(theta), pivote[1] + 0.75 * math.sin(theta))
    svg.linea(T(*pivote), T(*extremo_b), PALETA, 3, "7 4")
    r = 0.42 * S
    a0, a1 = T(pivote[0] + 0.42, pivote[1]), T(pivote[0] + 0.42 * math.cos(theta), pivote[1] + 0.42 * math.sin(theta))
    svg.add(f'<path d="M{a0[0]:.1f},{a0[1]:.1f} A{r:.1f},{r:.1f} 0 0 1 {a1[0]:.1f},{a1[1]:.1f}" fill="none" stroke="{GRIS}" stroke-width="1" marker-end="url(#punta-gris)"/>')
    svg.texto(T(pivote[0] + 0.5 * math.cos(theta / 2), pivote[1] + 0.5 * math.sin(theta / 2) + 0.03), "45°", 11, "start", GRIS, cursiva=True)
    svg.circulo(T(*pivote), 3.5, TINTA, TINTA, 1)

    # Sensor fotoeléctrico B1: emisor, reflector y haz
    zmin, zmax = haz["min"][2] - 0.02, haz["max"][2] + 0.02
    svg.linea(T(G["xSensor"], zmin), T(G["xSensor"], zmax), HAZ, 1.6, "5 3")
    for z in (zmin, zmax):
        svg.rect(*T(G["xSensor"] - 0.025, z - 0.03), 0.05 * S, 0.06 * S, "#2c3138", TINTA, 1)

    # Motores, baliza de dos módulos y caja en la entrada
    posiciones_motor = []
    for desde, hasta in (((G["xInicioEntrada"], 0), (G["xSensor"], 0)),
                         (tuple(salida_a["desde"]), tuple(salida_a["hasta"])),
                         (tuple(salida_b["desde"]), tuple(salida_b["hasta"]))):
        d, n, largo = ejes_de({"desde": desde, "hasta": hasta})
        centro = ((desde[0] + hasta[0]) / 2, (desde[1] + hasta[1]) / 2)
        m = (centro[0] + d[0] * (largo / 2 - 0.05) - n[0] * (ancho / 2 + 0.12),
             centro[1] + d[1] * (largo / 2 - 0.05) - n[1] * (ancho / 2 + 0.12))
        posiciones_motor.append(m)
        motor(svg, T(*m), None)
    baliza = (-0.6, -0.8)
    lampara(svg, (T(*baliza)[0] - 13, T(*baliza)[1]), 11)
    lampara(svg, (T(*baliza)[0] + 13, T(*baliza)[1]), 11, AMBAR)
    caja = (-1.0, 0.0)
    svg.rect(*T(caja[0] - P["largo"] / 2, caja[1] - P["ancho"] / 2), P["largo"] * S, P["ancho"] * S, CAJA, CAJA_BORDE, 1.4)
    svg.rect(*T(caja[0] - P["largo"] / 2, caja[1] - 0.025), P["largo"] * S, 0.05 * S, "#efdcb8", "none", 0)

    # Tablero de control (ubicación esquemática del PLC)
    svg.rect(*T(-3.0, -1.95), 1.0 * S, 0.55 * S, "#f5f7fa", TINTA, 1.6, 3)
    svg.texto(T(-2.5, -1.66), "PLC", 18, "middle", TINTA, "700")
    svg.texto(T(-2.5, -1.5), "Tablero de control", 11, "middle", GRIS)
    svg.linea(T(-2.0, -1.68), T(-1.35, -1.25), SALIDA, 1.4, "6 3", "punta-salida")
    svg.texto(T(-1.3, -1.6), "Señales de E/S hacia los equipos (Figura 3)", 11, "start", SALIDA, cursiva=True)

    # Referencias de equipo
    m1, m2, m3 = posiciones_motor
    etiqueta_equipo(svg, T(*caja), T(-1.0, -0.52), "Caja", CAJA_BORDE)
    etiqueta_equipo(svg, T(*baliza), T(-1.55, -0.95), "H1 · Q4  H2 · Q6", SALIDA)
    etiqueta_equipo(svg, T(m1[0] - 0.06, m1[1] - 0.06), T(-0.62, -0.55), "M1 · Q0", SALIDA)
    etiqueta_equipo(svg, T(pivote[0] + 0.4, pivote[1]), T(0.62, -0.55), "Y1 · Q1", SALIDA)
    etiqueta_equipo(svg, T(G["xSensor"], zmax + 0.03), T(-0.45, 0.78), "B1 · I3", ENTRADA)
    etiqueta_equipo(svg, T(m2[0], m2[1] - 0.06), T(2.3, -0.95), "M2 · Q2", SALIDA)
    etiqueta_equipo(svg, T(m3[0] + 0.06, m3[1]), T(2.35, 0.95), "M3 · Q3", SALIDA)
    etiqueta_equipo(svg, T(*anclas_estiba["A"]), T(3.25, -0.9), "B2 · I5", ENTRADA)
    etiqueta_equipo(svg, T(*anclas_estiba["B"]), T(3.25, 1.45), "B3 · I6", ENTRADA)

    # Cotas
    cota(svg, T(G["xInicioEntrada"], 0.42), T(G["xSensor"], 0.42), "Cinta de entrada · 2,40 m", (0, 16))
    cota(svg, T(G["xSensor"], -0.78), T(G["xSensor"] + G["largoZonaDesvio"], -0.78), "Ld = 0,65 m", (0, -8))
    cota(svg, T(salida_a["desde"][0], -0.78), T(salida_a["hasta"][0], -0.78), "Cinta de salida A · Ls = 1,50 m", (-18, -8))
    cota(svg, T(-2.6, -ancho / 2), T(-2.6, ancho / 2), "0,45 m", (-8, 4), -90)
    off = 0.42
    b0 = (salida_b["desde"][0] + nb[0] * off, salida_b["desde"][1] + nb[1] * off)
    b1 = (salida_b["hasta"][0] + nb[0] * off, salida_b["hasta"][1] + nb[1] * off)
    cota(svg, T(*b0), T(*b1), "Cinta de salida B · Ls = 1,50 m", (-10, 14), 45)

    # Ejes, escala y nota
    o = T(-3.0, 3.2)
    svg.linea(o, (o[0] + 50, o[1]), TINTA, 1.4, None, "punta")
    svg.linea(o, (o[0], o[1] + 50), TINTA, 1.4, None, "punta")
    svg.texto((o[0] + 56, o[1] + 4), "x", 12, "start", TINTA, cursiva=True)
    svg.texto((o[0] - 4, o[1] + 66), "z", 12, "middle", TINTA, cursiva=True)
    e0 = T(-2.0, 3.4)
    svg.linea(e0, (e0[0] + S, e0[1]), TINTA, 2)
    for i, rot in ((0, "0"), (0.5, "0,5"), (1, "1 m")):
        svg.linea((e0[0] + i * S, e0[1] - 5), (e0[0] + i * S, e0[1] + 5), TINTA, 1.4)
        svg.texto((e0[0] + i * S, e0[1] + 19), rot, 10, "middle", GRIS)
    svg.texto(T(-0.6, 3.35), "Cotas en metros. Origen (0, 0) en el haz de B1; x en el sentido de avance, z hacia la ruta B.", 11, "start", GRIS, cursiva=True)

    # Leyenda
    lx, ly = 1040, 50
    svg.rect(lx - 14, ly - 30, 310, 790, "#fafbfc", "#cdd3da", 1, 6)
    svg.texto((lx, ly - 6), "Referencias", 14, "start", TINTA, "700")
    filas = [
        ("motor", "M1 · Motor de la cinta de entrada", "Q0 · %QX0.0", SALIDA),
        ("motor", "M2 · Motor de la cinta de salida A", "Q2 · %QX0.2", SALIDA),
        ("motor", "M3 · Motor de la cinta de salida B", "Q3 · %QX0.3", SALIDA),
        ("paleta", "Y1 · Desviador de paleta", "Q1 · %QX0.1", SALIDA),
        ("lampara", "H1 · Baliza de alarma (roja)", "Q4 · %QX0.4", SALIDA),
        ("lampara-ambar", "H2 · Baliza de cambio de estiba (ámbar)", "Q6 · %QX0.6", SALIDA),
        ("sensor", "B1 · Sensor fotoeléctrico de entrada", "I3 · %IX0.3", ENTRADA),
        ("detector", "B2 · B3 · Estiba A · B no disponible", "I5 · %IX0.5 · I6 · %IX0.6", ENTRADA),
        ("estiba", "Estiba de madera 1,2 × 1,0 m", "capacidad 1–48; 12 por defecto", GRIS),
        ("caja", "Caja (paquete) 0,30 × 0,25 × 0,20 m", "", CAJA_BORDE),
        ("plc", "PLC · Tablero de control", "Modbus TCP", TINTA),
    ]
    y = ly + 34
    for simbolo, desc, senal, color in filas:
        c = (lx + 14, y)
        if simbolo == "motor":
            motor(svg, c, None)
        elif simbolo == "paleta":
            svg.linea((c[0] - 14, c[1]), (c[0] + 14, c[1]), PALETA, 5)
        elif simbolo == "lampara":
            lampara(svg, c, 11)
        elif simbolo == "lampara-ambar":
            lampara(svg, c, 11, AMBAR)
        elif simbolo == "sensor":
            svg.linea((c[0], c[1] - 14), (c[0], c[1] + 14), HAZ, 1.6, "5 3")
            svg.rect(c[0] - 4, c[1] - 18, 8, 8, "#2c3138", TINTA, 1)
            svg.rect(c[0] - 4, c[1] + 10, 8, 8, "#2c3138", TINTA, 1)
        elif simbolo == "detector":
            svg.rect(c[0] - 14, c[1] - 11, 28, 22, "#ffffff", ENTRADA, 1.4, 3)
            svg.texto((c[0], c[1] + 4), "B", 11, "middle", ENTRADA, "700")
        elif simbolo == "estiba":
            svg.rect(c[0] - 15, c[1] - 12, 30, 24, "#ead9bd", CAJA_BORDE, 1.4)
            svg.linea((c[0], c[1] - 12), (c[0], c[1] + 12), "#c4a477", 0.8, "3 3")
            svg.linea((c[0] - 15, c[1]), (c[0] + 15, c[1]), "#c4a477", 0.8, "3 3")
        elif simbolo == "caja":
            svg.rect(c[0] - 14, c[1] - 11, 28, 22, CAJA, CAJA_BORDE, 1.4)
        elif simbolo == "plc":
            svg.rect(c[0] - 14, c[1] - 11, 28, 22, "#f5f7fa", TINTA, 1.4, 3)
        svg.texto((lx + 40, y - 2), desc, 12, "start", TINTA)
        if senal:
            svg.texto((lx + 40, y + 14), senal if simbolo in ("estiba", "plc") else f"Señal {senal}", 11, "start", color)
        y += 48
    y += 4
    for (tipo, color, trazo), desc in ((("linea", HAZ, "5 3"), "Haz del sensor"), (("linea", GRIS, "2 4"), "Trayectoria del centro de la caja"),
                                       (("flecha", GRIS, None), "Sentido de avance"), (("linea", PALETA, "7 4"), "Paleta en posición ruta B (45°)"),
                                       (("linea", "#c4a477", "3 3"), "Posiciones de carga (4 × 4 por capa)"),
                                       (("linea", SALIDA, "6 3"), "Enlace con el PLC")):
        svg.linea((lx, y), (lx + 30, y), color, 2 if tipo == "linea" else 1.6, trazo, "punta-gris" if tipo == "flecha" else None)
        svg.texto((lx + 40, y + 4), desc, 11, "start", TINTA)
        y += 24
    svg.texto((lx, y + 10), "Q = salida del PLC · I = entrada del PLC", 11, "start", GRIS, cursiva=True)

    svg.guardar("fig02_planta_vista_superior.svg", "Vista superior a escala de la planta de clasificación con estibas")


# ---------------------------------------------- figura 1: arquitectura ----
def figura_arquitectura():
    svg = Svg(1240, 520)

    def caja(x, y, w, h, titulo, subtitulo, relleno="#f7f8fa"):
        svg.rect(x, y, w, h, relleno, TINTA, 1.6, 8)
        svg.texto((x + 14, y + 26), titulo, 15, "start", TINTA, "700")
        if subtitulo:
            svg.texto((x + 14, y + 44), subtitulo, 11, "start", GRIS, cursiva=True)

    def lista(x, y, lineas, tam=12, paso=19):
        for i, linea in enumerate(lineas):
            svg.texto((x, y + i * paso), linea, tam, "start", TINTA)

    # Operador
    svg.circulo((70, 205), 15, "#ffffff", TINTA, 1.6)
    svg.add(f'<path d="M45,265 Q70,225 95,265" fill="#ffffff" stroke="{TINTA}" stroke-width="1.6"/>')
    svg.texto((70, 290), "Operador", 13, "middle", TINTA, "600")
    svg.linea((100, 220), (178, 220), TINTA, 1.4, None, "punta")
    svg.linea((178, 250), (100, 250), TINTA, 1.4, None, "punta")
    svg.texto((139, 212), "órdenes", 10, "middle", GRIS, cursiva=True)
    svg.texto((139, 268), "vista 3D", 10, "middle", GRIS, cursiva=True)

    # C3 · HMI
    caja(185, 70, 330, 330, "C3 · HMI 3D", "Navegador · Vite, Three.js, Tailwind · :5173")
    svg.rect(203, 130, 294, 92, "#ffffff", TENUE, 1, 6)
    svg.texto((215, 151), "Panel de operador", 12, "start", TINTA, "600")
    lista(215, 172, ["Marcha, Parada, Emergencia, destino A/B", "Estado, conexiones, contadores, eventos"], 11, 17)
    svg.rect(203, 236, 294, 146, "#ffffff", TENUE, 1, 6)
    svg.texto((215, 257), "Planta emulada", 12, "start", TINTA, "600")
    lista(215, 278, ["Cintas (M1, M2, M3) y paleta Y1 según %QX", "Sensores B1 (AABB) y B2/B3 (estibas)", "Balizas H1/H2, cajas y estibas",
                     "Nunca decide transiciones de proceso"], 11, 18)

    # Enlace C3 ⇄ C2
    svg.linea((515, 190), (600, 190), SALIDA, 1.6, None, "punta-salida")
    svg.linea((600, 250), (515, 250), ENTRADA, 1.6, None, "punta-entrada")
    svg.texto((557, 180), "comandos", 10, "middle", SALIDA, cursiva=True)
    svg.texto((557, 268), "estado · 50 ms", 10, "middle", ENTRADA, cursiva=True)
    svg.texto((557, 222), "WebSocket", 12, "middle", TINTA, "600")
    svg.texto((557, 237), ":8080", 11, "middle", GRIS)

    # C2 · Middleware
    caja(605, 70, 270, 330, "C2 · Middleware", "Node.js · modbus-serial, ws, pino")
    lista(623, 140, ["Lista blanca de comandos", "Cola FIFO, una transacción a la vez", "Lectura FC01 + FC02 cada 50 ms",
                     "λ⁻¹: bits de salida → estado", "Vigilancia del heartbeat (1,5 s)", "Degradación segura",
                     "Reconexión 0,5 → 5 s", "Inicialización segura (FC15)"], 12, 24)

    # Enlace C2 ⇄ C1
    svg.linea((875, 190), (955, 190), SALIDA, 1.6, None, "punta-salida")
    svg.linea((955, 250), (875, 250), ENTRADA, 1.6, None, "punta-entrada")
    svg.texto((915, 180), "FC05 / FC15", 10, "middle", SALIDA, cursiva=True)
    svg.texto((915, 268), "FC01 / FC02", 10, "middle", ENTRADA, cursiva=True)
    svg.texto((915, 222), "Modbus TCP", 12, "middle", TINTA, "600")
    svg.texto((915, 237), ":502 · :5020", 11, "middle", GRIS)

    # C1 · PLC
    caja(960, 70, 260, 330, "C1 · PLC", "IEC 61131-3 · ciclo de 10 ms")
    for i, (texto, y) in enumerate((("Imagen de entradas %IX0.0–0.6", 130), ("FB_ClasificadorFSM", 205), ("Imagen de salidas %QX0.0–0.6", 280))):
        svg.rect(978, y, 224, 46, "#ffffff", TENUE, 1, 6)
        svg.texto((1090, y + 28), texto, 12, "middle", TINTA, "600" if i == 1 else "normal")
    svg.texto((1090, 246), "máquina de Moore · T1–T10", 11, "middle", GRIS, cursiva=True)
    svg.linea((1090, 176), (1090, 203), TINTA, 1.2, None, "punta")
    svg.linea((1090, 251), (1090, 278), TINTA, 1.2, None, "punta")
    svg.texto((978, 350), "Laboratorio: CODESYS Control Win V3 · :502", 11, "start", TINTA)
    svg.texto((978, 370), "macOS: PLC virtual (Node.js) · :5020", 11, "start", TINTA)

    # Lazo de control
    svg.add(f'<path d="M1090,400 L1090,450 L350,450 L350,402" fill="none" stroke="{GRIS}" stroke-width="1.4" stroke-dasharray="6 4" marker-end="url(#punta-gris)"/>')
    svg.texto((720, 472), "Lazo de control: salidas %QX → movimiento de la planta → sensor B1 → entrada %IX0.3", 12, "middle", GRIS, cursiva=True)
    svg.texto((720, 500), "Azul: órdenes hacia el PLC · Verde: estado desde el PLC", 11, "middle", GRIS)

    svg.guardar("fig01_arquitectura.svg", "Arquitectura de tres capas del sistema")


# ------------------------------------------- figura 3: conexiones del PLC ----
def figura_conexiones():
    svg = Svg(1240, 850)
    x_pos, x_neg = 70, 1170
    plc_x0, plc_x1, plc_y0, plc_y1 = 480, 780, 90, 690
    centro = (plc_x0 + plc_x1) / 2
    y_entrada0, paso_entrada = 240, 68
    y_salida0, paso_salida = 232, 70

    svg.linea((x_pos, 205), (x_pos, 670), "#b03a2e", 2.4)
    svg.texto((x_pos, 193), "+24 V DC", 12, "middle", "#b03a2e", "600")
    svg.linea((x_neg, 205), (x_neg, 670), TINTA, 2.4)
    svg.texto((x_neg, 193), "0 V", 12, "middle", TINTA, "600")
    svg.texto((270, 40), "Entradas del PLC", 15, "middle", ENTRADA, "700")
    svg.texto((270, 58), "coils: las escribe el maestro Modbus (FC05/FC15)", 11, "middle", GRIS, cursiva=True)
    svg.texto((990, 40), "Salidas del PLC", 15, "middle", SALIDA, "700")
    svg.texto((990, 58), "discrete inputs: las lee el maestro Modbus (FC02)", 11, "middle", GRIS, cursiva=True)

    # Bloque del PLC con cabecera propia, separada de los bornes
    svg.rect(plc_x0, plc_y0, plc_x1 - plc_x0, plc_y1 - plc_y0, "#f5f7fa", TINTA, 2, 8)
    svg.texto((centro, 124), "PLC", 26, "middle", TINTA, "700")
    for i, linea in enumerate(("CODESYS Control Win V3 o PLC virtual (macOS)", "PLC_PRG → FB_ClasificadorFSM · MainTask 10 ms",
                               "Esclavo Modbus TCP · Unit ID 1 · contrato v1.1.0")):
        svg.texto((centro, 148 + i * 17), linea, 11, "middle", TINTA if i == 1 else GRIS)
    svg.linea((plc_x0, 200), (plc_x1, 200), TENUE, 1)

    def contacto(x, y):
        svg.linea((x, y), (x + 8, y), TINTA, 1.6)
        svg.linea((x + 8, y), (x + 34, y - 12), TINTA, 1.6)
        svg.linea((x + 36, y), (x + 44, y), TINTA, 1.6)

    def accionador(x, y, tipo):
        cx = x + 21
        svg.linea((cx, y - 7), (cx, y - 26), TINTA, 1, "3 2")
        if tipo == "pulsador":
            svg.linea((cx - 8, y - 26), (cx + 8, y - 26), TINTA, 1.6)
            svg.linea((cx - 8, y - 26), (cx - 8, y - 22), TINTA, 1.6)
            svg.linea((cx + 8, y - 26), (cx + 8, y - 22), TINTA, 1.6)
        elif tipo == "seta":
            svg.add(f'<path d="M{cx - 11},{y - 26} A11,11 0 0 1 {cx + 11},{y - 26} Z" fill="#d64541" stroke="{TINTA}" stroke-width="1.4"/>')
        elif tipo == "selector":
            svg.add(f'<path d="M{cx - 9},{y - 22} L{cx - 9},{y - 30} L{cx + 9},{y - 30}" fill="none" stroke="{TINTA}" stroke-width="1.6"/>')

    entradas = [
        ("I0", "%IX0.0", "Coil 0", "SB1 · Marcha", "pulsador momentáneo", "pulsador", None),
        ("I1", "%IX0.1", "Coil 1", "SB2 · Parada", "pulsador momentáneo (prioritario)", "pulsador", None),
        ("I2", "%IX0.2", "Coil 2", "SE1 · Emergencia", "seta enclavada (1 = activa)", "seta", None),
        ("I3", "%IX0.3", "Coil 3", "B1 · Sensor fotoeléctrico", "emulado por la HMI (intersección AABB)", "sensor", "B1"),
        ("I4", "%IX0.4", "Coil 4", "SA1 · Selector de destino", "0 = ruta A, 1 = ruta B", "selector", None),
        ("I5", "%IX0.5", "Coil 5", "B2 · Estiba A no disponible", "llena o en cambio; emulado por la HMI", "sensor", "B2"),
        ("I6", "%IX0.6", "Coil 6", "B3 · Estiba B no disponible", "llena o en cambio; emulado por la HMI", "sensor", "B3"),
    ]
    for i, (term, iec, modbus, nombre, desc, tipo, tag) in enumerate(entradas):
        y = y_entrada0 + i * paso_entrada
        svg.circulo((x_pos, y), 3, TINTA, TINTA, 1)
        svg.linea((x_pos, y), (200, y), ENTRADA, 1.6)
        if tipo == "sensor":
            svg.rect(200, y - 14, 46, 28, "#ffffff", TINTA, 1.6, 3)
            svg.texto((223, y + 5), tag, 12, "middle", TINTA, "600")
            if tag == "B1":
                for dx in (0, 9):
                    svg.linea((214 + dx, y - 26), (222 + dx, y - 17), HAZ, 1.4, None, "punta")
            svg.linea((246, y), (plc_x0, y), ENTRADA, 1.6)
        else:
            contacto(200, y)
            accionador(200, y, tipo)
            svg.linea((244, y), (plc_x0, y), ENTRADA, 1.6)
        svg.texto((268, y - 26), nombre, 12, "start", TINTA, "600")
        svg.texto((268, y - 10), desc, 11, "start", GRIS, cursiva=True)
        svg.texto((268, y + 20), modbus, 11, "start", ENTRADA)
        svg.circulo((plc_x0, y), 4.5, "#ffffff", ENTRADA, 1.8)
        svg.texto((plc_x0 + 12, y + 4), f"{term} · {iec}", 12, "start", ENTRADA, "600")

    salidas = [
        ("Q0", "%QX0.0", "DI 0", "KM1", "M1 · motor de la cinta de entrada", "motor"),
        ("Q1", "%QX0.1", "DI 1", "Y1", "Y1 · actuador del desviador (1 = ruta B)", "solenoide"),
        ("Q2", "%QX0.2", "DI 2", "KM2", "M2 · motor de la cinta de salida A", "motor"),
        ("Q3", "%QX0.3", "DI 3", "KM3", "M3 · motor de la cinta de salida B", "motor"),
        ("Q4", "%QX0.4", "DI 4", "H1", "H1 · baliza de alarma (roja)", "lampara"),
        ("Q5", "%QX0.5", "DI 5", "", "Heartbeat · vigilancia del middleware", "latido"),
        ("Q6", "%QX0.6", "DI 6", "H2", "H2 · baliza de cambio de estiba (ámbar)", "lampara-ambar"),
    ]
    for i, (term, iec, modbus, tag, desc, tipo) in enumerate(salidas):
        y = y_salida0 + i * paso_salida
        svg.circulo((plc_x1, y), 4.5, "#ffffff", SALIDA, 1.8)
        svg.texto((plc_x1 - 12, y + 4), f"{term} · {iec}", 12, "end", SALIDA, "600")
        svg.texto((plc_x1 + 14, y - 8), modbus, 11, "start", SALIDA)
        if tipo == "latido":
            svg.linea((plc_x1, y), (900, y), SALIDA, 1.6, "6 3", "punta-salida")
            svg.texto((910, y + 4), desc, 12, "start", TINTA)
            svg.texto((910, y + 20), "onda cuadrada de 1,04 s; no acciona ningún equipo", 11, "start", GRIS, cursiva=True)
            continue
        svg.linea((plc_x1, y), (870, y), SALIDA, 1.6)
        if tipo == "motor":
            svg.rect(870, y - 11, 34, 22, "#ffffff", TINTA, 1.6)
            svg.texto((887, y + 4), tag, 10, "middle", TINTA, "600")
            svg.linea((887, y + 11), (887, y + 26), TINTA, 1, "3 2")
            motor(svg, (887, y + 40), None)
        elif tipo == "solenoide":
            svg.rect(870, y - 11, 34, 22, "#ffffff", TINTA, 1.6)
            svg.linea((870, y + 11), (904, y - 11), TINTA, 1.2)
        elif tipo == "lampara":
            lampara(svg, (887, y), 11)
        elif tipo == "lampara-ambar":
            lampara(svg, (887, y), 11, AMBAR)
        svg.linea((904, y), (x_neg, y), SALIDA, 1.6)
        svg.circulo((x_neg, y), 3, TINTA, TINTA, 1)
        svg.texto((925, y - 8), desc, 12, "start", TINTA)
        if tipo == "motor":
            svg.texto((925, y + 22), "contactor KM → motor trifásico", 11, "start", GRIS, cursiva=True)

    # Red
    svg.linea((centro, plc_y1), (centro, 718), TINTA, 1.6)
    svg.rect(centro - 130, 718, 260, 40, "#ffffff", TINTA, 1.4, 6)
    svg.texto((centro, 736), "Ethernet · Modbus TCP", 12, "middle", TINTA, "600")
    svg.texto((centro, 751), "hacia el middleware (:502 · :5020)", 11, "middle", GRIS)
    svg.texto((70, 800), "Equivalente cableado de las señales que, en la planta virtual, viajan por Modbus.", 11, "start", GRIS, cursiva=True)
    svg.texto((70, 818), "En una instalación real, SE1 sería un contacto NC en un circuito de seguridad independiente (H4).", 11, "start", GRIS, cursiva=True)

    svg.guardar("fig03_conexiones_plc.svg", "Conexiones de entradas y salidas del PLC")


# --------------------------------- figura 5: ciclo de scan y diagrama temporal ----
def figura_ciclo_scan():
    svg = Svg(1240, 760)
    T_SCAN, T_POLL, T_FIN = 10, 50, 200
    t_orden, ancho_pulso = 23, 150                      # Marcha pedida por la HMI a los 23 ms
    siguiente_scan = lambda t: math.ceil(t / T_SCAN) * T_SCAN
    t_visto, t_suelto = siguiente_scan(t_orden), siguiente_scan(t_orden + ancho_pulso)

    # Fases del ciclo
    fases = [("1", "Lectura de entradas", "copia la imagen %IX", "coils → %IX0.0–0.6"),
             ("2", "Ejecución del programa", "PLC_PRG → FB_ClasificadorFSM", "flancos, TON, δ y λ"),
             ("3", "Escritura de salidas", "copia la imagen %QX", "%QX0.0–0.6 → discrete inputs"),
             ("4", "Servicios del sistema", "comunicación Modbus,", "diagnóstico y vigilancia")]
    x0, w, hueco = 70, 245, 50
    for i, (n, titulo, l1, l2) in enumerate(fases):
        x = x0 + i * (w + hueco)
        svg.rect(x, 40, w, 96, "#f5f7fa", TINTA, 1.6, 8)
        svg.circulo((x + 22, 63), 13, TINTA, TINTA, 1)
        svg.texto((x + 22, 67.5), n, 12, "middle", "#ffffff", "700")
        svg.texto((x + 44, 68), titulo, 13, "start", TINTA, "700")
        svg.texto((x + 16, 99), l1, 11, "start", GRIS)
        svg.texto((x + 16, 117), l2, 11, "start", GRIS, cursiva=True)
        if i < 3:
            svg.linea((x + w, 88), (x + w + hueco - 2, 88), TINTA, 1.6, None, "punta")
    ultimo = x0 + 3 * (w + hueco) + w / 2
    svg.add(f'<path d="M{ultimo},136 L{ultimo},160 L{x0 + w / 2},160 L{x0 + w / 2},138" fill="none" stroke="{TINTA}" '
            f'stroke-width="1.6" marker-end="url(#punta)"/>')
    svg.texto((640, 178), "El ciclo se repite cada 10 ms (MainTask). El programa razona siempre sobre la imagen de entradas congelada al inicio.",
              12, "middle", GRIS, cursiva=True)

    # Diagrama temporal
    t0x, escala = 300, 4.4
    X = lambda t: t0x + t * escala
    alto = 11
    filas = [
        (250, "Ciclos de scan (10 ms)"),
        (300, "Lecturas del middleware (FC01 + FC02)"),
        (355, "Coil 0 · Marcha escrito por el middleware"),
        (410, "%IX0.0 en la imagen del PLC"),
        (465, "R_TRIG.Q · flanco de Marcha"),
        (520, "eEstado del PLC"),
        (575, "%QX0.0 · motor de la cinta de entrada"),
        (630, "systemStatus publicado a la HMI"),
    ]
    for y, etiqueta in filas:
        svg.texto((t0x - 16, y + 4), etiqueta, 12, "end", TINTA)
    for t in range(0, T_FIN + 1, T_SCAN):
        svg.linea((X(t), 236), (X(t), 650), "#e3e7ec", 1)
        svg.linea((X(t), 243), (X(t), 257), TINTA, 1.6)
    for t in range(0, T_FIN + 1, T_POLL):
        svg.poligono([(X(t), 292), (X(t) + 7, 300), (X(t), 308), (X(t) - 7, 300)], SALIDA, SALIDA, 1)
        svg.texto((X(t), 678), f"{t} ms", 11, "middle", GRIS)

    def onda(y, altos, color):
        puntos = [(X(0), y + alto)]
        for a, b in altos:
            puntos += [(X(a), y + alto), (X(a), y - alto), (X(b), y - alto)]
            if b < T_FIN:
                puntos.append((X(b), y + alto))
        if not altos or altos[-1][1] < T_FIN:
            puntos.append((X(T_FIN), y + alto))
        pts = " ".join(f"{px:.1f},{py:.1f}" for px, py in puntos)
        svg.add(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2.2"/>')

    def bus(y, tramos):
        for a, b, texto in tramos:
            xa, xb = X(a), X(b)
            svg.poligono([(xa + 5, y - alto), (xb - 5, y - alto), (xb, y), (xb - 5, y + alto), (xa + 5, y + alto), (xa, y)],
                         "#ffffff", TINTA, 1.4)
            svg.texto(((xa + xb) / 2, y + 4), texto, 11, "middle", TINTA)

    onda(355, [(t_orden, t_orden + ancho_pulso)], SALIDA)
    onda(410, [(t_visto, t_suelto)], ENTRADA)
    onda(465, [(t_visto, t_visto + T_SCAN)], ENTRADA)
    bus(520, [(0, t_visto, "REPOSO"), (t_visto, T_FIN, "EN_MARCHA_ESPERA")])
    onda(575, [(t_visto, T_FIN)], SALIDA)
    primera_lectura = math.ceil(t_visto / T_POLL) * T_POLL
    bus(630, [(0, primera_lectura, "REPOSO"), (primera_lectura, T_FIN, "ESPERANDO_PAQUETE")])

    # Anotaciones
    svg.linea((X(t_visto), 236), (X(t_visto), 650), "#c0392b", 1.2, "5 3")
    svg.texto((X(t_visto) + 6, 230), f"ciclo de los {t_visto} ms: ve Marcha = 1 → T2", 11, "start", "#c0392b", cursiva=True)
    svg.texto((X(t_orden) - 4, 338), f"orden a los {t_orden} ms", 10, "end", SALIDA, cursiva=True)
    svg.linea((X(primera_lectura), 640), (X(primera_lectura), 650), SALIDA, 1.6)
    svg.texto((X(t_orden + ancho_pulso) + 6, 350), f"{ancho_pulso} ms", 10, "start", SALIDA, cursiva=True)
    svg.texto((640, 712), f"El pulso de {ancho_pulso} ms supera T_scan + T_p = {T_SCAN + T_POLL} ms: el PLC lo detecta en el ciclo siguiente "
              f"({t_visto} ms) y la lectura de retorno lo registra a los 50, 100 y 150 ms.", 12, "middle", GRIS, cursiva=True)
    svg.texto((640, 732), f"La HMI ve el cambio en la lectura de los {primera_lectura} ms: {primera_lectura - t_orden} ms después de la orden, "
              "dentro del presupuesto de latencia de ≈ 79 ms (docs/01 §6.1).", 12, "middle", GRIS, cursiva=True)

    svg.guardar("fig05_ciclo_scan.svg", "Ciclo de scan del PLC y diagrama temporal de una orden de Marcha")


# ----------------------------- figura 6: anatomía de un PLC y su emulación ----
def figura_anatomia_plc():
    svg = Svg(1240, 470)
    svg.texto((330, 40), "PLC modular · vista frontal esquemática", 14, "middle", TINTA, "700")
    svg.rect(30, 60, 600, 340, "#eef1f4", TINTA, 1.6, 6)
    svg.rect(30, 90, 600, 14, "#c9d0d8", "none", 0)                    # perfil de montaje
    modulos = [("1", "Fuente", "24 V DC", 96), ("2", "CPU", "programa y memoria", 140), ("3", "Entradas", "digitales", 120),
               ("4", "Salidas", "digitales", 120), ("5", "Comunicación", "Ethernet", 120)]
    x = 40
    centros = []
    for n, nombre, sub, w in modulos:
        svg.rect(x, 74, w - 8, 314, "#ffffff", TINTA, 1.4, 4)
        cx = x + (w - 8) / 2
        centros.append(cx)
        svg.circulo((x + 16, 94), 11, TINTA, TINTA, 1)
        svg.texto((x + 16, 98), n, 11, "middle", "#ffffff", "700")
        svg.texto((cx, 134), nombre, 13, "middle", TINTA, "700")
        svg.texto((cx, 151), sub, 10, "middle", GRIS, cursiva=True)
        if nombre == "Fuente":
            for j, borne in enumerate(("L+", "M", "PE")):
                svg.circulo((cx, 230 + j * 34), 7, "#ffffff", TINTA, 1.2)
                svg.texto((cx, 252 + j * 34), borne, 9, "middle", GRIS)
        elif nombre == "CPU":
            for j, (led, color) in enumerate((("RUN", "#2f9e57"), ("STOP", "#e0b000"), ("ERR", "#c0392b"))):
                svg.circulo((x + 26, 186 + j * 24), 5, color, TINTA, 1)
                svg.texto((x + 38, 190 + j * 24), led, 10, "start", TINTA)
            svg.rect(x + 22, 268, 50, 22, "#2c3138", TINTA, 1, 2)
            svg.texto((x + 47, 304), "RUN / STOP", 9, "middle", GRIS)
            svg.rect(x + 22, 322, 40, 30, "#d5dbe1", TINTA, 1, 2)
            svg.texto((x + 42, 366), "programación", 9, "middle", GRIS)
        elif nombre in ("Entradas", "Salidas"):
            prefijo = "I" if nombre == "Entradas" else "Q"
            color = ENTRADA if nombre == "Entradas" else SALIDA
            for j in range(7):
                yy = 178 + j * 26
                svg.circulo((x + 22, yy), 4.5, color, TINTA, 0.8)
                svg.texto((x + 34, yy + 4), f"{prefijo}{j}", 10, "start", TINTA)
                svg.circulo((x + w - 30, yy), 6, "#ffffff", TINTA, 1.1)
        elif nombre == "Comunicación":
            svg.rect(cx - 22, 190, 44, 34, "#d5dbe1", TINTA, 1.2, 2)
            svg.rect(cx - 12, 200, 24, 16, "#2c3138", TINTA, 1, 1)
            svg.texto((cx, 240), "RJ45", 9, "middle", GRIS)
            svg.texto((cx, 270), "Modbus TCP", 10, "middle", TINTA)
            svg.texto((cx, 286), "esclavo", 10, "middle", GRIS, cursiva=True)
        x += w
    svg.texto((30, 424), "3 · Entradas: reciben pulsadores, seta de emergencia y sensores (24 V DC).", 11, "start", ENTRADA, cursiva=True)
    svg.texto((30, 442), "4 · Salidas: accionan contactores de motores, el actuador del desviador y las balizas.", 11, "start", SALIDA, cursiva=True)

    # Tabla de equivalencias
    tx, ty = 660, 60
    columnas = [(tx, 34, "N.º"), (tx + 34, 270, "Laboratorio · CODESYS Control Win V3"), (tx + 304, 270, "macOS · PLC virtual (Node.js)")]
    svg.rect(tx, ty, 574, 30, "#e8ecf0", "#cdd3da", 1, 0)
    for x_col, w, titulo in columnas:
        svg.texto((x_col + 8, ty + 20), titulo, 12, "start", TINTA, "700")
    filas = [
        ("1", ["El PC con Windows que aloja", "el runtime"], ["El Mac"]),
        ("2", ["Runtime IEC 61131-3: ejecuta los .st", "compilados en la MainTask de 10 ms"],
              ["clasificador.js, traducción 1:1 de", "los .st; tarea de 10 ms (setInterval)"]),
        ("3", ["Coils 0–6 del esclavo Modbus", "(%IX0.0–0.6), escritos por el middleware"], ["Igual: coils 0–6 en memoria"]),
        ("4", ["Discrete inputs 0–6 (%QX0.0–0.6),", "leídos por el middleware"], ["Igual: discrete inputs 0–6"]),
        ("5", ["ModbusTCP Slave Device", "en 127.0.0.1:502"], ["Servidor modbus-serial", "en 127.0.0.1:5020"]),
    ]
    y = ty + 30
    for n, lab, mac in filas:
        alto_fila = 22 + 16 * max(len(lab), len(mac))
        svg.rect(tx, y, 574, alto_fila, "#ffffff", "#cdd3da", 1, 0)
        svg.circulo((tx + 17, y + alto_fila / 2), 10, TINTA, TINTA, 1)
        svg.texto((tx + 17, y + alto_fila / 2 + 4), n, 11, "middle", "#ffffff", "700")
        for col, lineas in ((columnas[1][0], lab), (columnas[2][0], mac)):
            for k, linea in enumerate(lineas):
                svg.texto((col + 8, y + 20 + 16 * k), linea, 11, "start", TINTA)
        y += alto_fila
    svg.texto((tx, y + 28), "En la emulación no hay módulos físicos: las imágenes de E/S se intercambian por", 11, "start", GRIS, cursiva=True)
    svg.texto((tx, y + 45), "Modbus con el middleware, y la planta 3D hace de proceso (sensores y actuadores).", 11, "start", GRIS, cursiva=True)

    svg.guardar("fig06_anatomia_plc.svg", "Anatomía de un PLC modular y su equivalente en la simulación")


# ------------------------------------- figura 7: colocación en la estiba ----
def leer_colocacion():
    """Orden de llenado y trayectorias reales: el modelo despacha una caja por la ruta A
    hacia las posiciones 1, 4 y 33 y se registra su vuelo (coordenadas locales de la estiba)."""
    codigo = """
import { ESTIBAS, GEOMETRIA, ModeloPlanta, posicionEnEstiba } from './src/core/plantModel.js';
const RUTA_A = { cintaEntrada: true, desviadorActivo: false, cintaSalidaA: true, cintaSalidaB: false, balizaAlarma: false };
const { centro, direccion, normal } = ESTIBAS.A;
const local = (v) => [v.clone().sub(centro).dot(direccion), v.clone().sub(centro).dot(normal), v.y];
function trayectoria(indice) {
  const modelo = new ModeloPlanta();
  modelo.fijarCapacidad(48);
  for (let i = 0; i < indice; i++) modelo.estibas.A.paquetes.push({ id: -1 - i, posicion: posicionEnEstiba('A', i), rumbo: 0, malClasificado: false });
  modelo.generarPaquete();
  const puntos = [];
  for (let paso = 0; paso < 4000; paso++) {
    modelo.paso(0.005, RUTA_A, 0, false);
    const p = modelo.paquetes[0];
    if (p?.colocacion) puntos.push([p.colocacion.t, ...local(p.posicion)]);
    if (!p && puntos.length) break;
  }
  // t = 0: el centro de la caja en el borde de la cinta; t = T: su posición en la estiba
  const salida = centro.clone().addScaledVector(direccion, -GEOMETRIA.estiba.distancia).setY(GEOMETRIA.alturaTransporte + GEOMETRIA.paquete.alto / 2);
  return [[0, ...local(salida)], ...puntos, [GEOMETRIA.tiempoColocacion, ...local(posicionEnEstiba('A', indice))]];
}
console.log(JSON.stringify({
  ranuras: Array.from({ length: 48 }, (_, i) => local(posicionEnEstiba('A', i))),
  trayectorias: Object.fromEntries([0, 3, 32].map((k) => [k, trayectoria(k)])),
}));"""
    return json.loads(subprocess.check_output(["node", "--input-type=module", "-e", codigo], cwd=HMI, text=True))


def figura_colocacion(geo, datos):
    G = geo["G"]
    est, paq = G["estiba"], G["paquete"]
    svg = Svg(1240, 740)
    madera, madera_borde = "#efe4cc", "#a8926a"

    # a) Vista superior: orden de llenado de la capa 1
    S, cx, cy = 300, 370, 265
    P = lambda a, b: (cx + a * S, cy + b * S)
    svg.texto((40, 40), "a) Orden de llenado · vista superior de la estiba A", 14, "start", TINTA, "700")
    x0, y0 = P(-1.07, -G["anchoCinta"] / 2)
    svg.rect(x0, y0, (1.07 - est["distancia"]) * S, G["anchoCinta"] * S, CINTA, LISTON, 1.2)
    for k in range(1, 6):
        svg.linea(P(-1.07 + k * 0.055, -G["anchoCinta"] / 2), P(-1.07 + k * 0.055, G["anchoCinta"] / 2), LISTON, 0.8)
    svg.linea(P(-1.02, 0), P(-0.8, 0), GRIS, 1.4, None, "punta-gris")
    svg.texto(P(-0.91, -G["anchoCinta"] / 2 - 0.05), "cinta de salida A", 11, "middle", GRIS, cursiva=True)
    xa, ya = P(-est["largo"] / 2, -est["ancho"] / 2)
    svg.rect(xa, ya, est["largo"] * S, est["ancho"] * S, madera, madera_borde, 1.6, 2)
    for i in range(16):
        a, b, _ = datos["ranuras"][i]
        x, y = P(a - paq["largo"] / 2, b - paq["ancho"] / 2)
        ocupada = i < 7
        svg.rect(x + 2, y + 2, paq["largo"] * S - 4, paq["ancho"] * S - 4, CAJA if ocupada else "none",
                 CAJA_BORDE if ocupada else madera_borde, 1.2 if ocupada else 1, 2, None if ocupada else "4 3")
        svg.texto((P(a, b)[0], P(a, b)[1] + 6), str(i + 1), 17, "middle", TINTA, "700")
    for fila in range(4):                                           # sentido dentro de cada fila
        a0, b0, _ = datos["ranuras"][fila * 4]
        a3, _, _ = datos["ranuras"][fila * 4 + 3]
        svg.linea(P(a0 - 0.05, b0 + 0.085), P(a3 + 0.05, b0 + 0.085), GRIS, 1, None, "punta-gris")
    destino = datos["ranuras"][7]
    svg.linea(P(-est["distancia"], 0), P(destino[0] - 0.1, destino[1]), SALIDA, 1.8, "6 3", "punta-salida")
    svg.texto(P(-0.73, 0.06), "en vuelo", 11, "start", SALIDA, cursiva=True)
    svg.texto((cx, ya - 12), "fondo de la planta (−z)", 11, "middle", GRIS, cursiva=True)
    svg.texto((cx, ya + est["ancho"] * S + 22), "frente (+z)", 11, "middle", GRIS, cursiva=True)
    svg.texto((xa + est["largo"] * S + 14, cy + 4), "extremo lejano", 11, "start", GRIS, cursiva=True, giro=None)
    cota(svg, P(-est["largo"] / 2, est["ancho"] / 2 + 0.17), P(est["largo"] / 2, est["ancho"] / 2 + 0.17), "1,2 m", (0, -6))
    for i, linea in enumerate((
            "Fila a fila desde el fondo; en cada fila, del extremo lejano hacia la cinta:",
            "cada caja se deposita delante de la anterior. Capa 2: posiciones 17–32 y",
            "capa 3: 33–48, con la misma secuencia 0,20 m más arriba. Las posiciones 1–7",
            "ocupadas y la 8 en vuelo son el instante de la Figura 4.")):
        svg.texto((40, 512 + i * 17), linea, 11, "start", GRIS, cursiva=True)

    # b) Vista lateral: trayectoria real de colocación
    S2, ox, oy = 300, 960, 470
    Q = lambda a, y: (ox + a * S2, oy - y * S2)
    svg.texto((640, 40), "b) Trayectoria de colocación · vista lateral a lo largo de la ruta A", 14, "start", TINTA, "700")
    svg.linea(Q(-1.06, 0), Q(0.78, 0), TINTA, 1.6)
    for k in range(24):
        a = -1.04 + k * 0.08
        svg.linea(Q(a, 0), Q(a - 0.03, -0.03), TENUE, 1)
    h_cinta = G["alturaTransporte"]
    svg.rect(*Q(-1.06, h_cinta), (1.06 - est["distancia"]) * S2, 0.06 * S2, CINTA, LISTON, 1.2)
    svg.circulo(Q(-est["distancia"] - 0.03, h_cinta - 0.03), 0.03 * S2, "#ffffff", LISTON, 1.2)
    svg.rect(*Q(-0.93, h_cinta - 0.06), 0.03 * S2, (h_cinta - 0.06) * S2, "#c9d0d8", LISTON, 1)
    # Estiba de perfil: tablas superior e inferior y tres tacos
    tabla = 0.022
    svg.rect(*Q(-est["largo"] / 2, est["alto"]), est["largo"] * S2, tabla * S2, madera, madera_borde, 1.2)
    svg.rect(*Q(-est["largo"] / 2, tabla), est["largo"] * S2, tabla * S2, madera, madera_borde, 1.2)
    for a in (-est["largo"] / 2, -0.05, est["largo"] / 2 - 0.1):
        svg.rect(*Q(a, est["alto"] - tabla), 0.1 * S2, (est["alto"] - 2 * tabla) * S2, "#dccaa4", madera_borde, 1.2)
    for capa in range(3):
        for col in range(4):
            a = -est["largo"] / 2 + col * paq["largo"]
            svg.rect(*Q(a, est["alto"] + (capa + 1) * paq["alto"]), paq["largo"] * S2, paq["alto"] * S2, "none", madera_borde, 0.8, 0, "3 3")
        svg.texto(Q(est["largo"] / 2 + 0.03, est["alto"] + (capa + 0.5) * paq["alto"] - 0.01), f"capa {capa + 1}", 11, "start", GRIS, cursiva=True)
    tope = est["alto"] + 3 * paq["alto"]
    svg.linea(Q(-1.06, h_cinta), Q(0.78, h_cinta), TENUE, 1, "2 3")
    svg.texto((Q(0.78, h_cinta)[0], Q(0, h_cinta)[1] - 5), "0,80 m · superficie de las cintas", 11, "end", GRIS)
    svg.linea(Q(-0.62, tope), Q(0.78, tope), TENUE, 1, "2 3")
    svg.texto((Q(0.78, tope)[0], Q(0, tope)[1] + 14), "0,744 m · tope de la capa 3", 11, "end", GRIS)

    def curva(puntos, color, ancho, trazo=None):
        pts = " ".join(f"{Q(a, y)[0]:.1f},{Q(a, y)[1]:.1f}" for _, a, _, y in puntos)
        extra = f' stroke-dasharray="{trazo}"' if trazo else ""
        svg.add(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{ancho}"{extra}/>')

    principal = datos["trayectorias"]["0"]
    for clave, nombre in (("3", "pos. 4"), ("32", "pos. 33")):
        tray = datos["trayectorias"][clave]
        curva(tray, TENUE, 1.4, "5 3")
        _, a, _, y = tray[-1]
        svg.texto((Q(a, y)[0], Q(a, y)[1] + 4), nombre, 11, "middle", GRIS, "600")
    # Recta base (interpolación sin arco) y altura del arco a mitad del vuelo
    (_, a0, _, y0b), (_, a1, _, y1b) = principal[0], principal[-1]
    svg.linea(Q(a0, y0b), Q(a1, y1b), TENUE, 1, "2 3")
    medio = ((a0 + a1) / 2, (y0b + y1b) / 2)
    cota(svg, Q(medio[0], medio[1]), Q(medio[0], medio[1] + 0.25), "h = 0,25 m", (-40, 4))
    for t_obj in (0, 0.2, 0.4, 0.6):
        t, a, _, y = min(principal, key=lambda p: abs(p[0] - t_obj))
        final = t_obj == 0.6
        x, yy = Q(a - paq["largo"] / 2, y + paq["alto"] / 2)
        svg.rect(x, yy, paq["largo"] * S2, paq["alto"] * S2, CAJA if final or t_obj == 0 else "#f3e2cb",
                 CAJA_BORDE, 1.4 if final or t_obj == 0 else 1, 1, None if final or t_obj == 0 else "4 2")
        etiqueta = f"t = {t_obj:.1f} s".replace(".", ",")
        if final:
            svg.texto((Q(a, y)[0], Q(a, y)[1] + 4), etiqueta, 11, "middle", TINTA, "600")
        else:
            svg.texto((Q(a, y)[0], yy - 8), etiqueta, 11, "middle", SALIDA, "600")
    curva(principal, SALIDA, 2.2)
    for t_obj in (0, 0.2, 0.4):
        _, a, _, y = min(principal, key=lambda p: abs(p[0] - t_obj))
        svg.circulo(Q(a, y), 3, SALIDA, SALIDA, 1)
    svg.texto((Q(a0, 0)[0], Q(0, h_cinta)[1] + 0.12 * S2), "fin de la cinta A", 11, "middle", GRIS, cursiva=True)
    cota(svg, Q(-est["distancia"], 0.06), Q(-est["largo"] / 2, 0.06), "0,15", (0, -6))
    for i, linea in enumerate((
            "p(t) = p₀ + (p₁ − p₀) · s(u) + h · 4u(1 − u) · ŷ,   u = t / 0,6 s,   s(u) = 3u² − 2u³",
            "p₀: centro de la caja al dejar la cinta; p₁: centro de su posición en la estiba. Curvas",
            "obtenidas ejecutando el modelo de planta (plantModel.js), no dibujadas a mano.")):
        svg.texto((640, 512 + i * 17), linea, 12 if i == 0 else 11, "start", TINTA if i == 0 else GRIS, cursiva=i > 0)

    # c) Cambio de estiba
    svg.texto((40, 600), "c) Cambio de estiba (3 s)", 14, "start", TINTA, "700")
    t0, escala_t, yb = 80, 360, 638
    tramos = [(0, 1.5, "#e8ecf0", "sale la llena: 2,2 m en el sentido de la ruta"),
              (1.5, 3.0, "#dcefe3", "entra la vacía: 2,2 m por el costado libre (A desde el fondo, B desde el frente)")]
    for a, b, color, texto in tramos:
        svg.rect(t0 + a * escala_t, yb - 15, (b - a) * escala_t, 30, color, "#cdd3da", 1, 0)
        svg.texto((t0 + (a + b) / 2 * escala_t, yb + 4), texto, 11, "middle", TINTA)
    hitos = [(0, ("orden «Cambiar estiba»", "desde la HMI")),
             (1.5, ("se cuenta la estiba retirada;", "la nueva toma la capacidad vigente")),
             (3.0, ("estiba disponible: B2/B3 = 0; con ambas", "libres, el PLC pasa a REPOSO (T10)"))]
    for t, lineas in hitos:
        x = t0 + t * escala_t
        ancla = "start" if t == 0 else ("end" if t == 3.0 else "middle")
        svg.linea((x, yb - 22), (x, yb + 24), TINTA, 1.6)
        svg.texto((x, yb + 40), f"{t:.1f} s".replace(".", ","), 11, ancla, TINTA, "600")
        for k, linea in enumerate(lineas):
            svg.texto((x, yb + 57 + k * 15), linea, 11, ancla, GRIS, cursiva=True)

    svg.guardar("fig07_colocacion_estiba.svg", "Colocación de los paquetes en la estiba y cambio de estiba")


if __name__ == "__main__":
    geometria = leer_geometria()
    figura_arquitectura()
    figura_vista_superior(geometria)
    figura_conexiones()
    figura_ciclo_scan()
    figura_anatomia_plc()
    figura_colocacion(geometria, leer_colocacion())
