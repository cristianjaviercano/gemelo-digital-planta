-- Planta de Clasificación: abre Terminal con «Iniciar planta.command», que debe
-- estar en la misma carpeta que esta aplicación (la raíz del proyecto).
set aplicacion to POSIX path of (path to me)
set carpeta to do shell script "dirname " & quoted form of aplicacion
set lanzador to carpeta & "/Iniciar planta.command"

try
	do shell script "test -x " & quoted form of lanzador
on error
	display dialog "No se encontró «Iniciar planta.command» junto a la aplicación. La aplicación debe permanecer en la carpeta del proyecto." buttons {"Aceptar"} default button 1 with icon stop
	return
end try

do shell script "open -a Terminal " & quoted form of lanzador
