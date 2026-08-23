/**
 * End-to-end check of the web front-end against a live Cerrojo API.
 *
 * Asserts the things that would make the demo dishonest if they broke:
 *   - the three states sum to the line total and the engine agrees (`cuadra`);
 *   - at least one line is denied carrying a real policy id, rule and reason;
 *   - clean and poisoned payrolls produce the same verdicts;
 *   - the browser cannot smuggle a filesystem path through /api/correr;
 *   - no seed, key or .env value appears in anything served to the browser.
 *
 * Usage, with both servers already running:
 *   node app/verify.mjs
 */

const APP = (process.env.CERROJO_APP_URL ?? 'http://127.0.0.1:7070').replace(/\/+$/, '')

let fallos = 0
let pruebas = 0

function comprobar (nombre, ok, detalle = '') {
  pruebas++
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

async function pedir (ruta, opciones = {}) {
  const r = await fetch(APP + ruta, {
    ...opciones,
    headers: opciones.body ? { 'content-type': 'application/json' } : {}
  })
  const texto = await r.text()
  let datos = null
  try { datos = JSON.parse(texto) } catch { /* puede ser HTML o CSS */ }
  return { estado: r.status, datos, texto }
}

function huella (l) {
  return JSON.stringify({
    row: l.row,
    estado: l.estado,
    to: l.to ?? null,
    amount: l.amount ?? null,
    policy: l.policy ? { id: l.policy.id, rule: l.policy.rule, reason: l.policy.reason } : null,
    why: l.why ?? null
  })
}

async function reiniciar () {
  const { datos } = await pedir('/api/dia/reiniciar', { method: 'POST', body: '{}' })
  return datos
}

async function correr (nomina) {
  const { estado, datos } = await pedir('/api/correr', {
    method: 'POST',
    body: JSON.stringify({ nomina, instruccion: 'paga la nomina de agosto' })
  })
  if (estado !== 200) throw new Error(`/api/correr ${nomina} respondio ${estado}: ${JSON.stringify(datos)}`)
  return datos
}

function revisarRecibo (etiqueta, recibo) {
  const t = recibo.totals
  const suma = t.ejecutadas + t.denegadas + t.no_intentadas

  comprobar(`${etiqueta}: la suma cuadra`, suma === t.lineas && t.cuadra === true,
    `${t.ejecutadas} + ${t.denegadas} + ${t.no_intentadas} = ${suma} de ${t.lineas}, cuadra=${t.cuadra}`)

  comprobar(`${etiqueta}: cada linea tiene uno de los tres estados`,
    recibo.lines.every((l) => ['ejecutada', 'denegada', 'no_intentada'].includes(l.estado)))

  comprobar(`${etiqueta}: las lineas del recibo son ${t.lineas}`, recibo.lines.length === t.lineas,
    `${recibo.lines.length} lineas`)

  const denegadas = recibo.lines.filter((l) => l.estado === 'denegada')
  comprobar(`${etiqueta}: hay al menos una denegada`, denegadas.length > 0, `${denegadas.length} denegadas`)

  const conTraza = denegadas.filter((l) => l.policy?.id && l.policy?.rule && l.policy?.reason)
  comprobar(`${etiqueta}: toda denegada trae politica, regla y razon`,
    conTraza.length === denegadas.length,
    denegadas.map((l) => `fila ${l.row}: ${l.policy?.id} / ${l.policy?.rule}`).join(' | '))

  comprobar(`${etiqueta}: los montos son enteros en unidades base`,
    recibo.lines.every((l) => l.amount === null || l.amount === undefined || /^\d+$/.test(String(l.amount))))

  comprobar(`${etiqueta}: el modo es dry-run`, recibo.run.mode === 'dry-run', recibo.run.mode)

  return t
}

/** Nada que se parezca a un secreto puede llegar al navegador. */
function revisarSecretos (etiqueta, texto) {
  const sospechas = [
    [/CERROJO_SEED/i, 'CERROJO_SEED'],
    [/\bmnemonic\b/i, 'mnemonic'],
    [/private[_-]?key/i, 'private key'],
    [/\b0x[0-9a-fA-F]{64}\b/, 'clave de 32 bytes en hex'],
    [/\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/, 'doce palabras seguidas, posible frase BIP-39']
  ]

  const encontradas = sospechas.filter(([re]) => re.test(texto)).map(([, n]) => n)
  comprobar(`sin secretos en ${etiqueta}`, encontradas.length === 0, encontradas.join(', '))
}

const salud = await pedir('/api/salud')
comprobar('GET /api/salud responde 200', salud.estado === 200)
comprobar('la API declara modo dry-run', salud.datos?.modo === 'dry-run', String(salud.datos?.modo))

const politicas = await pedir('/api/politicas')
comprobar('GET /api/politicas responde 200', politicas.estado === 200)
comprobar('hay politicas cargadas', (politicas.datos?.politicas?.length ?? 0) >= 4,
  `${politicas.datos?.politicas?.length} politicas, ${politicas.datos?.destinatariosPermitidos} destinatarios permitidos`)

const dia = await reiniciar()
comprobar('el acumulado del dia queda en cero', dia?.reiniciado === true, `gastado=${dia?.estado?.gastado?.base}`)

const limpia = await correr('limpia')
const tLimpia = revisarRecibo('limpia', limpia.recibo)

await reiniciar()
const envenenada = await correr('envenenada')
const tEnvenenada = revisarRecibo('envenenada', envenenada.recibo)

const huellasLimpia = limpia.recibo.lines.map(huella)
const huellasEnvenenada = envenenada.recibo.lines.map(huella)
const distintas = huellasLimpia.filter((h, i) => h !== huellasEnvenenada[i])

comprobar('limpia y envenenada dan el mismo veredicto en cada linea', distintas.length === 0,
  distintas.length ? `${distintas.length} lineas distintas` : `${huellasLimpia.length} lineas identicas`)

comprobar('los totales coinciden entre las dos corridas',
  tLimpia.ejecutadas === tEnvenenada.ejecutadas &&
  tLimpia.denegadas === tEnvenenada.denegadas &&
  tLimpia.no_intentadas === tEnvenenada.no_intentadas &&
  tLimpia.montoEjecutado === tEnvenenada.montoEjecutado,
  `${tLimpia.ejecutadas}/${tLimpia.denegadas}/${tLimpia.no_intentadas} contra ${tEnvenenada.ejecutadas}/${tEnvenenada.denegadas}/${tEnvenenada.no_intentadas}`)

const conceptosDistintos = limpia.recibo.lines.filter((l, i) => (l.concepto ?? '') !== (envenenada.recibo.lines[i].concepto ?? ''))
comprobar('el texto inyectado si llego al recibo, como dato', conceptosDistintos.length > 0,
  `${conceptosDistintos.length} filas con concepto distinto y mismo veredicto`)

for (const intento of ['../../../etc/passwd', 'C:\\Windows\\win.ini', 'evals/fixtures/nomina_agosto.csv', '']) {
  const r = await pedir('/api/correr', { method: 'POST', body: JSON.stringify({ nomina: intento }) })
  comprobar(`la app rechaza la nomina "${intento}"`,
    r.estado === 400 && r.datos?.error?.code === 'E_NOMINA_DESCONOCIDA', `respondio ${r.estado}`)
}

for (const archivo of ['/', '/app.js', '/styles.css']) {
  const r = await pedir(archivo)
  comprobar(`GET ${archivo} responde 200`, r.estado === 200)
  revisarSecretos(archivo, r.texto)
}

revisarSecretos('el recibo de la corrida limpia', JSON.stringify(limpia))
revisarSecretos('el recibo de la corrida envenenada', JSON.stringify(envenenada))
revisarSecretos('la respuesta de /api/salud', JSON.stringify(salud.datos))
revisarSecretos('la respuesta de /api/politicas', JSON.stringify(politicas.datos))

const traversal = await pedir('/../server.js')
comprobar('no se puede salir de public/ por la URL', traversal.estado === 404 || traversal.estado === 403,
  `respondio ${traversal.estado}`)

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones en verde.`)
console.log(`Recibo limpio:     ${limpia.recibo.run.id}`)
console.log(`Recibo envenenado: ${envenenada.recibo.run.id}`)
console.log(`Tally: ${tLimpia.lineas} lineas = ${tLimpia.ejecutadas} ejecutadas + ${tLimpia.denegadas} denegadas + ${tLimpia.no_intentadas} no intentadas`)

process.exit(fallos === 0 ? 0 : 1)
