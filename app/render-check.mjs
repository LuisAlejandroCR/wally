/**
 * Runs the real public/app.js rendering functions against real API receipts,
 * inside a minimal DOM shim, and asserts what ends up on screen.
 *
 * It exists because the rendering layer is where a demo can quietly start
 * lying: showing a status the engine did not return, or dropping the rule name
 * off a denial. Every assertion below compares rendered text against the
 * receipt field it is supposed to come from.
 *
 * Usage, with both servers running:
 *   node app/render-check.mjs
 */
import { readFile } from 'node:fs/promises'

const APP = (process.env.CERROJO_APP_URL ?? 'http://127.0.0.1:7070').replace(/\/+$/, '')

let fallos = 0
let pruebas = 0

function comprobar (nombre, ok, detalle = '') {
  pruebas++
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`)
}

/* ------------------------------------------------------------ DOM shim --- */

class Nodo {
  constructor (tag) {
    this.tagName = tag
    this.childNodes = []
    this.className = ''
    this._texto = ''
    this.dataset = {}
    this.hidden = false

    const yo = this
    this.classList = {
      add (c) { yo.className = `${yo.className} ${c}`.trim() },
      toggle (c, on) { if (on) this.add(c) },
      contains (c) { return yo.className.split(/\s+/).includes(c) }
    }
  }

  get firstChild () { return this.childNodes[0] ?? null }
  get children () { return this.childNodes }

  appendChild (n) {
    if (n && n.__fragmento) { for (const c of n.childNodes) this.childNodes.push(c); return n }
    this.childNodes.push(n)
    return n
  }

  removeChild (n) { this.childNodes = this.childNodes.filter((x) => x !== n) }
  setAttribute (k, v) { this[k] = v }
  getAttribute (k) { return this[k] }
  addEventListener () {}

  set textContent (v) { this.childNodes = []; this._texto = String(v) }
  get textContent () { return this._texto + this.childNodes.map((c) => c.textContent ?? '').join('') }
}

const porId = new Map()

globalThis.document = {
  createElement: (tag) => new Nodo(tag),
  createTextNode: (t) => ({ textContent: String(t) }),
  createDocumentFragment: () => { const f = new Nodo('#fragment'); f.__fragmento = true; return f },
  getElementById: (id) => {
    if (!porId.has(id)) porId.set(id, new Nodo(`#${id}`))
    return porId.get(id)
  },
  querySelectorAll: () => []
}

globalThis.window = { scrollTo () {} }

/* ------------------------------------------------ carga de public/app.js --- */

const fuente = await readFile(new URL('./public/app.js', import.meta.url), 'utf8')

// Se quita el arranque automatico y se exponen las funciones de pintado.
const modulo = fuente.replace(/\niniciar\s*\(\)\s*\n?$/, '\n') +
  '\nexport { estado, pintarPlan, pintarVeredicto, pintarRecibo, pintarComparacion, renderMarkdown, formatear, aUnidadesBase, huella }\n'

comprobar('public/app.js llama a iniciar() una sola vez al final', modulo !== fuente)

const app = await import(`data:text/javascript;base64,${Buffer.from(modulo).toString('base64')}`)

/* -------------------------------------------------------- datos reales --- */

async function correr (nomina) {
  await fetch(`${APP}/api/dia/reiniciar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  const r = await fetch(`${APP}/api/correr`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nomina, instruccion: 'paga la nomina de agosto' })
  })
  if (!r.ok) throw new Error(`/api/correr ${nomina} respondio ${r.status}`)
  return await r.json()
}

const limpia = await correr('limpia')
const envenenada = await correr('envenenada')

app.estado.recibo = limpia.recibo
app.estado.markdown = limpia.markdown
app.estado.decimales = limpia.recibo.totals.decimals
app.estado.simbolo = 'USDT'

const texto = (id) => document.getElementById(id).textContent

/* ------------------------------------------------------------- 2. plan --- */

app.pintarPlan()

const planTexto = texto('cuerpo-plan')
const propuestas = limpia.recibo.lines.filter((l) => l.to)

comprobar('el plan pinta una fila por linea propuesta',
  propuestas.every((l) => planTexto.includes(String(l.amount ? app.formatear(l.amount, l.decimals) : ''))),
  `${propuestas.length} propuestas`)

comprobar('el plan no adelanta ningun veredicto',
  !/denegada|ejecutada|no intentada/.test(planTexto),
  planTexto.slice(0, 60))

comprobar('el plan lista las abstenciones con su razon',
  limpia.recibo.lines.filter((l) => !l.to).every((l) => texto('cuerpo-abstenciones').includes(l.why)))

/* -------------------------------------------------------- 3. veredicto --- */

app.pintarVeredicto()

const t = limpia.recibo.totals
comprobar('la cuadratura se pinta con la aritmetica del motor',
  texto('cuadratura').includes(`${t.ejecutadas} + ${t.denegadas} + ${t.no_intentadas} = ${t.ejecutadas + t.denegadas + t.no_intentadas} de ${t.lineas}`) &&
  texto('cuadratura').includes('La suma cuadra'),
  texto('cuadratura').trim())

comprobar('los contadores muestran las cifras del recibo',
  texto('contadores').includes(String(t.ejecutadas)) &&
  texto('contadores').includes(String(t.denegadas)) &&
  texto('contadores').includes(String(t.no_intentadas)))

const veredictoTexto = texto('cuerpo-veredicto')

for (const l of limpia.recibo.lines.filter((x) => x.estado === 'denegada')) {
  comprobar(`la fila ${l.row} muestra politica y regla del motor`,
    veredictoTexto.includes(`${l.policy.id} / ${l.policy.rule}`),
    `${l.policy.id} / ${l.policy.rule}`)
  comprobar(`la fila ${l.row} muestra la razon literal del motor`,
    veredictoTexto.includes(l.policy.reason),
    l.policy.reason.slice(0, 70))
}

for (const l of limpia.recibo.lines.filter((x) => x.estado === 'no_intentada')) {
  comprobar(`la fila ${l.row} muestra por que no se intento`, veredictoTexto.includes(l.why), l.why.slice(0, 60))
}

comprobar('cada linea del recibo tiene su fila en la tabla',
  limpia.recibo.lines.every((l) => veredictoTexto.includes(l.estado.replace('_', ' '))))

/* ----------------------------------------------------------- 4. recibo --- */

app.pintarRecibo()

comprobar('la ficha trae el id de la corrida', texto('ficha-recibo').includes(limpia.recibo.run.id), limpia.recibo.run.id)
comprobar('la ficha trae el sha256 del archivo de entrada', texto('ficha-recibo').includes(limpia.recibo.run.inputSha256))
comprobar('el markdown del motor se pinta', texto('recibo-md').includes('Recibo'), `${texto('recibo-md').length} caracteres`)
comprobar('los chequeos se pintan con su nombre',
  (limpia.recibo.checks ?? []).every((c) => texto('chequeos').includes(c.name)))
comprobar('las politicas aplicadas se pintan',
  (limpia.recibo.policiesApplied ?? []).every((p) => texto('cuerpo-aplicadas').includes(p.id)))

/* ------------------------------------------------------- comparacion --- */

app.pintarComparacion(limpia.recibo, envenenada.recibo)

comprobar('el banner declara veredictos identicos',
  texto('banner-comparar').includes(`Mismo veredicto en las ${limpia.recibo.lines.length} lineas`),
  texto('banner-comparar').slice(0, 80))

comprobar('cada fila de la comparacion queda marcada como identica',
  !texto('cuerpo-comparar').includes('distinto'))

const inyectadas = limpia.recibo.lines.filter((l, i) => (l.concepto ?? '') !== (envenenada.recibo.lines[i].concepto ?? ''))
comprobar('el texto inyectado se muestra literal, como dato',
  inyectadas.every((l, i) => texto('lista-inyeccion').includes(envenenada.recibo.lines.find((x) => x.row === l.row).concepto)),
  `${inyectadas.length} filas`)

/* --------------------------------------------------- utilidades puras --- */

comprobar('formatear respeta los decimales del token', app.formatear('180500000', 6) === '180.500000', app.formatear('180500000', 6))
comprobar('aUnidadesBase convierte sin floats', app.aUnidadesBase('400', 6).base === '400000000', app.aUnidadesBase('400', 6).base)
comprobar('aUnidadesBase rechaza exceso de decimales', app.aUnidadesBase('1.1234567', 6).ok === false)
comprobar('aUnidadesBase rechaza texto', app.aUnidadesBase('mucho', 6).ok === false)

const md = app.renderMarkdown('# Titulo\n\n| a | b |\n|---|---|\n| 1 | 2 |\n')
comprobar('el markdown arma la tabla', md.textContent.includes('Titulo') && md.textContent.includes('1'))

const marcado = app.renderMarkdown('<img src=x onerror=alert(1)>')
comprobar('el markdown no interpreta HTML del recibo',
  marcado.childNodes.every((n) => n.tagName !== 'img'),
  marcado.textContent.trim())

console.log(`\n${pruebas - fallos} de ${pruebas} comprobaciones de pintado en verde.`)
process.exit(fallos === 0 ? 0 : 1)
