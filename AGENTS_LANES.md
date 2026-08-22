# Carriles de trabajo — varios agentes sobre este repo

> Este archivo existe porque el repo lo tocan **varios agentes a la vez**. Cada carril tiene
> dueño, frontera y criterio de "hecho". Un agente que trabaja fuera de su carril rompe el de otro.
>
> La constitución del proyecto (`AGENTS.md`) y la guía de sesión (`CLAUDE.md`) son privadas y
> **no** están en este repo público. Este archivo sí, porque coordina.

## Regla de oro

**El cerrojo vive en `code/src/policy/` y en el motor de políticas de `@tetherto/wdk`.**
Ninguna interfaz —CLI, MCP, HTTP, móvil— decide si un pago pasa. Todas preguntan.

Una denegación que no venga de un veredicto real del motor (`account.simulate.transfer(...)` →
`{ decision, policy_id, matched_rule, reason }`) es un cerrojo falso y no se acepta en este repo,
por bonita que se vea en pantalla.

## Carriles

| Carril | Dueño | Directorios | Estado |
|---|---|---|---|
| **A · Motor** | agente del núcleo | `code/src/{ingest,plan,policy,wdk,execute,receipt,eval}`, `code/tests`, `code/evals` | ✅ funcionando, 20/20 tests, eval 18/18 |
| **B · Interfaces** | agente del núcleo | `code/src/cli.js`, `code/src/mcp/`, `code/src/api/` | ✅ CLI + MCP + HTTP |
| **C · App** | agente de RN/web | `app/` (aún no existe) | ⏳ P2, solo si A y B están congelados |
| **D · Entrega** | humano | `README.md`, video, DoraHacks | ⏳ |

### Frontera dura entre A/B y C

El carril C **no importa `@tetherto/wdk`**, no deriva cuentas y no evalúa políticas.
Consume la API HTTP del carril B. Motivo, medido en `docs/hallazgos_rn_wdk.md`: el camino React
Native (`pear-wrk-wdk`) construye `new WDK(seed)` sin opciones y **no expone `registerPolicy`**,
así que una app que decidiera por su cuenta tendría que *simular* las denegaciones. Eso está
prohibido. Con la API HTTP, el teléfono es una pantalla y el veredicto sigue siendo del motor.

## El contrato — API HTTP de Cerrojo

```bash
cd code && node src/cli.js serve          # http://127.0.0.1:8787
```

| Método | Ruta | Cuerpo | Devuelve |
|---|---|---|---|
| GET | `/salud` | — | servicio, red, token, `modo: "dry-run"` |
| GET | `/politicas` | — | topes, allowlist (solo el conteo), reglas con su razón |
| GET | `/estado-diario` | — | gastado / tope / restante del día, en base y legible |
| POST | `/simular` | `{ destinatario, monto_base, token? }` | `{ decision: "ALLOW"\|"DENY", politica, regla, razon, traza }` |
| POST | `/correr` | `{ csv?, instruccion?, planner?, demo? }` | `{ recibo, markdown }` |
| GET | `/corridas/:runId` | — | el `recibo.json` de una corrida anterior |

Propiedades del contrato, que el carril C puede dar por ciertas:

1. **Ningún endpoint envía fondos.** No existe uno. `--live` solo existe en el CLI y exige dos
   banderas explícitas.
2. Los montos viajan como **enteros en unidades base, en string**. Nunca floats.
3. Toda denegación trae `politica`, `regla` y `razon` — es lo que se pinta en pantalla.
4. Los errores son `{ error: { code, message, suggestion } }`. Nunca una traza.
5. La API escucha en `127.0.0.1`. Para probar desde un teléfono en la misma red:
   `CERROJO_API_HOST=0.0.0.0`, y solo en una red de confianza.

Ejemplo, tal cual responde hoy:

```bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"destinatario":"0x000000000000000000000000000000000000dEaD","monto_base":"400000000"}' \
  http://127.0.0.1:8787/simular
```

```json
{
  "decision": "DENY",
  "politica": "allowlist-destinatarios",
  "regla": "denegar-fuera-de-lista",
  "razon": "El destinatario no esta en la lista de beneficiarios permitidos."
}
```

## Antes de cada commit, cualquier carril

```bash
cd code && npm test && node src/cli.js eval --runs 5
```

* `npm test` tiene que quedar en verde entero.
* `cerrojo eval` tiene que reportar **falsos permisos: 0**. Ese número manda sobre cualquier otro.
* Nada de `git push --force` sobre `main`. Commits pequeños, mensaje que diga qué carril toca.
* **Nada de `git reset` sobre un commit que no hiciste tú.** Ya pasó una vez hoy: un carril reseteó
  el commit de otro que estaba en curso. No se perdió nada porque el trabajo seguía en disco, pero
  la próxima vez sí se pierde. Si necesitas deshacer algo de otro carril, escribe un commit encima.

## Lo que ningún agente hace en este repo

| Prohibido | Por qué |
|---|---|
| Bajar un tope, apagar una política o añadir una excepción "para probar" | Se cambia el caso de prueba, no el cerrojo |
| Pintar una denegación calculada en la UI | Es un cerrojo falso; la pista lo castiga |
| Commitear `.env`, una seed, una llave o el contenido de `code/data/` | Está en `.gitignore` y es motivo de descalificación |
| Ejecutar en mainnet | La red de escritura es Sepolia. Mainnet solo se lee |
| Tocar `code/src/policy/` sin correr el eval en el mismo commit | Es la capa que decide dinero |
