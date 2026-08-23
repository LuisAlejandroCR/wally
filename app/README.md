# Cerrojo — front-end web local (carril C)

Pantalla para la demo: se elige un archivo de nómina, se escribe una instrucción en español y se
ve, línea por línea, qué autorizó el motor de políticas y qué frenó, con el nombre de la regla y
la razón a la vista.

**Esta app no decide nada.** Consume la API HTTP de Cerrojo (carril B), que pregunta al motor de
políticas de WDK. Cada `estado`, cada `politica`, cada `regla` y cada `razon` en pantalla sale de
una respuesta de la API. No hay una sola condición de política escrita aquí.

## Cómo se arranca

Hacen falta dos procesos. La app no levanta la API por su cuenta a propósito: si la API no está,
lo dice con un error tipado en vez de inventar un resultado.

**Terminal 1 — la API de Cerrojo (puerto 8787):**

```bash
cd code
CERROJO_STATE_DIR=../app/state node src/cli.js serve
```

En PowerShell:

```powershell
cd code
$env:CERROJO_STATE_DIR="$PWD\..\app\state"
node src/cli.js serve
```

`CERROJO_STATE_DIR` no es obligatorio, pero sí recomendado: deja el acumulado diario de la demo en
`app/state/` en vez de `code/state/`, así las corridas de la demo no se mezclan con las del eval.
Es también lo que permite el botón de reiniciar el día (más abajo).

**Terminal 2 — esta app (puerto 7070):**

```bash
node app/server.js
```

Después, abrir <http://127.0.0.1:7070>.

| Variable | Por defecto | Para qué |
|---|---|---|
| `CERROJO_APP_PORT` | `7070` | Puerto de la app |
| `CERROJO_APP_HOST` | `127.0.0.1` | Interfaz donde escucha |
| `CERROJO_API_URL` | `http://127.0.0.1:8787` | Dónde vive la API de Cerrojo |
| `CERROJO_STATE_DIR` | `app/state` | Debe coincidir con el de la API |

## Las cuatro pantallas

1. **Cargar** — se elige entre la nómina limpia y la envenenada, se escribe la instrucción y se
   decide si se reinicia el acumulado del día. Abajo, las políticas activas con sus topes y un
   probador de una sola línea contra `POST /simular`.
2. **Plan** — lo que propuso el planner: destinatarios, montos y el concepto tal como venía en el
   archivo. Sin ningún veredicto todavía.
3. **Veredicto** — cada línea con su estado, y las tres cifras sumando al total. Las denegadas
   llevan `politica / regla` y la razón literal del motor.
4. **Recibo** — la ficha de la corrida, el markdown que devuelve la API, los chequeos
   deterministas y las políticas aplicadas. Se puede descargar el `recibo.json`.

Aparte está **Comparar limpia contra envenenada**: dos corridas reales, cada una desde el mismo
acumulado diario, puestas lado a lado. Es la demostración de que el texto inyectado viaja hasta el
recibo como dato y no mueve una sola decisión.

## Qué consume de la API

| Ruta de la app | Ruta de la API | Nota |
|---|---|---|
| `GET /api/salud` | `GET /salud` | Tal cual |
| `GET /api/politicas` | `GET /politicas` | Tal cual |
| `GET /api/estado-diario` | `GET /estado-diario` | Tal cual |
| `POST /api/correr` | `POST /correr` | La app traduce una clave a una ruta fija |
| `POST /api/simular` | `POST /simular` | Solo pasan `destinatario` y `monto_base` |
| `GET /api/nominas` | — | Las dos nóminas disponibles, servidas por la app |
| `POST /api/dia/reiniciar` | — | Ver abajo |

El cuerpo y el código de estado de la API se devuelven **verbatim**. Los nombres de campo se
pintan como vienen: `estado`, `policy.id`, `policy.rule`, `policy.reason`, `why`, `totals.lineas`,
`totals.ejecutadas`, `totals.denegadas`, `totals.no_intentadas`, `totals.cuadra`, `decision`,
`politica`, `regla`, `razon`, `traza`. Nada se renombra y nada se recalcula.

## El botón de reiniciar el día

El acumulado diario persiste entre corridas, que es justo lo que tiene que hacer: `cap-diario` es
una política real. El efecto secundario es que la segunda corrida del día arranca con el tope casi
consumido, y entonces la comparación limpia contra envenenada no compararía lo mismo.

La API no expone un endpoint para reiniciarlo, así que la app borra el archivo de ledger **dentro
de su propia carpeta** `app/state/`, que es lo mismo que hace `cerrojo run --reset-dia`. Con dos
resguardos: se niega a tocar cualquier ruta fuera de `app/`, y después de borrar vuelve a leer
`GET /estado-diario` y muestra lo que responda la API, no lo que supone. Ningún tope baja y
ninguna regla se apaga: `cap-diario` se aplica entera dentro de cada corrida.

Si se prefiere no usarlo, basta con desmarcar la casilla en la pantalla de carga.

## Lo que esta app no hace

* **No importa `@tetherto/wdk`**, no deriva cuentas y no evalúa políticas. Frontera del carril C.
* **No calcula ninguna denegación.** Una denegación pintada por la interfaz sería un cerrojo falso.
* **No puede enviar fondos.** La API no tiene endpoint que ejecute en vivo; `--live` existe solo en
  el CLI y exige dos banderas explícitas.
* **No lee `CERROJO_SEED` ni `code/.env`.** La seed la usa el proceso de la API y nunca cruza el
  límite HTTP.
* **No acepta rutas de archivo del navegador.** El cliente manda `limpia` o `envenenada`; la app
  las traduce a rutas fijas dentro de `code/evals/fixtures/`. Cualquier otra cosa es un 400.
* **No cambia topes ni la allowlist.** No hay forma de pedirlo, ni desde la interfaz ni por HTTP.
* **No tiene dependencias.** Solo la biblioteca estándar de Node y HTML, CSS y JS a mano. Sin build.

## Comprobaciones

Con los dos servidores arriba:

```bash
node app/verify.mjs        # flujo completo contra la API real
node app/render-check.mjs  # ejecuta el pintado real y verifica lo que queda en pantalla
```

`verify.mjs` comprueba que las tres cifras suman el total y que el motor lo confirma con `cuadra`,
que toda línea denegada trae política, regla y razón, que la nómina limpia y la envenenada dan el
mismo veredicto, que el navegador no puede colar una ruta de archivo y que nada que se parezca a
una seed o una llave llega al navegador.

`render-check.mjs` carga `public/app.js` en un DOM mínimo, lo corre contra recibos reales y compara
el texto pintado contra el campo del recibo del que debía salir.

## Archivos

```text
app/
  server.js          servidor estatico + proxy a la API. Sin logica de decision
  verify.mjs         comprobacion de punta a punta contra la API real
  render-check.mjs   comprobacion del pintado contra recibos reales
  README.md          este archivo
  public/
    index.html       las cuatro pantallas y la comparacion
    app.js           estado de la interfaz y pintado
    styles.css       tema oscuro de alto contraste, pensado para video
  state/             acumulado diario de la demo (lo escribe la API)
```
