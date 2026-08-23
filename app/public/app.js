/**
 * Cerrojo web front-end.
 *
 * This file renders. It never decides. Every `estado`, `policy.id`, `policy.rule`
 * and `policy.reason` on screen is read straight out of an API response; nothing
 * here evaluates a cap, an allowlist or a rule. Amounts arrive as integer strings
 * in base units and are only formatted for display.
 *
 * The interface is in English. The engine's own strings are not: the three
 * states, the policy reasons, the abstention reasons and the receipt are printed
 * exactly as the engine wrote them, because rewording a verdict is a way of
 * quietly replacing it.
 */

const estado = {
  nomina: 'limpia',
  nominas: [],
  recibo: null,
  markdown: '',
  decimales: 6,
  simbolo: 'USDT'
}

const $ = (id) => document.getElementById(id)

/* ------------------------------------------------------------------ red --- */

async function pedir (ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: opciones.body ? { 'content-type': 'application/json' } : {}
  })

  let datos
  try {
    datos = await respuesta.json()
  } catch {
    throw {
      code: 'E_RESPUESTA_ILEGIBLE',
      message: `The app server answered something that is not JSON at ${ruta}.`,
      suggestion: 'Check the console running: node app/server.js'
    }
  }

  if (!respuesta.ok || datos?.error) {
    throw datos?.error ?? {
      code: `E_HTTP_${respuesta.status}`,
      message: `${ruta} answered ${respuesta.status}.`,
      suggestion: 'Check the server console.'
    }
  }

  return datos
}

/* -------------------------------------------------------------- formato --- */

/** Integer in base units -> readable text. Presentation only. */
function formatear (base, decimales) {
  if (base === null || base === undefined) return null
  const n = BigInt(base)
  const divisor = 10n ** BigInt(decimales)
  const entero = n / divisor
  const resto = (n % divisor).toString().padStart(decimales, '0')
  return decimales === 0 ? entero.toString() : `${entero}.${resto}`
}

/** USDT as a person types it -> integer in base units, no floats. */
function aUnidadesBase (texto, decimales) {
  const limpio = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(limpio)) return { ok: false, why: `"${texto}" is not a readable number.` }

  const [enteros, dec = ''] = limpio.split('.')
  if (dec.length > decimales) return { ok: false, why: `The token takes ${decimales} decimals and you wrote ${dec.length}.` }

  return { ok: true, base: (enteros + dec.padEnd(decimales, '0')).replace(/^0+(?=\d)/, '') }
}

function corta (direccion) {
  return direccion && direccion.length > 16 ? `${direccion.slice(0, 10)}…${direccion.slice(-6)}` : (direccion ?? '')
}

function nodo (etiqueta, clase, texto) {
  const el = document.createElement(etiqueta)
  if (clase) el.className = clase
  if (texto !== undefined && texto !== null) el.textContent = String(texto)
  return el
}

function limpiar (el) { while (el.firstChild) el.removeChild(el.firstChild) }

/* ----------------------------------------------------------- pantallas --- */

function mostrar (id) {
  for (const p of document.querySelectorAll('.pantalla')) p.classList.toggle('activa', p.id === id)
  window.scrollTo({ top: 0, behavior: 'smooth' })
  revelar(document.getElementById(id))
}

/**
 * Staggered entrance for the screen being shown. Cosmetic only: the stylesheet
 * hides `.rv` exclusively while <body> carries `revelar`, a class this file
 * adds, so a page whose script never ran still shows every word.
 */
function revelar (pantalla) {
  if (!pantalla || typeof pantalla.querySelectorAll !== 'function') return

  const piezas = Array.from(pantalla.querySelectorAll('.rv'))
  for (const [i, el] of piezas.entries()) {
    el.classList.remove('dentro')
    el.style.transitionDelay = `${Math.min(i * 55, 400)}ms`
  }

  const encender = () => { for (const el of piezas) el.classList.add('dentro') }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(encender)
  else encender()
}

/** The progress rail above each screen. Four segments, one screen each. */
function armarRiel (lista) {
  const n = Number(lista.dataset.paso)
  lista.dataset.etiqueta = n === 0 ? 'Comparison' : `Step ${n} of 4`

  for (let i = 1; i <= 4; i++) {
    let clase = 'paso-seg'
    if (n && i < n) clase = 'paso-seg paso-hecho'
    if (n && i === n) clase = 'paso-seg paso-actual'
    lista.appendChild(nodo('li', clase))
  }
}

function cargando (visible, texto = 'Asking the engine…') {
  $('cargando-texto').textContent = texto
  $('cargando').hidden = !visible
}

function mostrarError (contenedor, err) {
  limpiar(contenedor)
  contenedor.hidden = false
  contenedor.appendChild(nodo('span', 'error-codigo', err?.code ?? 'E_DESCONOCIDO'))
  contenedor.appendChild(document.createTextNode(err?.message ?? String(err)))
  if (err?.suggestion) contenedor.appendChild(nodo('span', 'error-arreglo', err.suggestion))
}

/* --------------------------------------------------------------- inicio --- */

async function iniciar () {
  document.body.classList.add('revelar')

  for (const lista of document.querySelectorAll('.pasos')) armarRiel(lista)

  const barra = $('barra')
  const alDesplazar = () => barra.classList.toggle('desplazada', window.scrollY > 8)
  window.addEventListener('scroll', alDesplazar, { passive: true })
  alDesplazar()

  revelar(document.getElementById('pantalla-cargar'))

  for (const boton of document.querySelectorAll('[data-ir]')) {
    boton.addEventListener('click', () => mostrar(boton.dataset.ir))
  }

  $('boton-correr').addEventListener('click', () => correrNomina())
  $('boton-comparar').addEventListener('click', () => compararNominas())
  $('boton-veredicto').addEventListener('click', () => { pintarVeredicto(); mostrar('pantalla-veredicto') })
  $('boton-recibo').addEventListener('click', () => { pintarRecibo(); mostrar('pantalla-recibo') })
  $('boton-simular').addEventListener('click', () => simularLinea())
  $('boton-descargar').addEventListener('click', () => descargarRecibo())

  await Promise.all([cargarNominas(), cargarSalud(), cargarPoliticas()])
}

async function cargarNominas () {
  const contenedor = $('opciones-nomina')

  try {
    const { nominas } = await pedir('/api/nominas')
    estado.nominas = nominas
    limpiar(contenedor)

    for (const n of nominas) {
      const boton = nodo('button', 'opcion')
      boton.type = 'button'
      boton.setAttribute('aria-pressed', String(n.clave === estado.nomina))
      boton.appendChild(nodo('span', 'opcion-titulo', n.etiqueta))
      boton.appendChild(nodo('span', 'opcion-desc', n.descripcion))
      boton.appendChild(nodo('span', 'opcion-csv', n.csv))
      boton.addEventListener('click', () => {
        estado.nomina = n.clave
        for (const otro of contenedor.children) otro.setAttribute('aria-pressed', String(otro === boton))
      })
      contenedor.appendChild(boton)
    }
  } catch (err) {
    mostrarError($('error-cargar'), err)
  }
}

async function cargarSalud () {
  const barra = $('barra-datos')

  try {
    const [salud, dia] = await Promise.all([pedir('/api/salud'), pedir('/api/estado-diario')])
    estado.decimales = salud.token.decimals
    estado.simbolo = salud.token.symbol

    limpiar(barra)
    barra.appendChild(etiquetaDato('Network', salud.red))
    barra.appendChild(etiquetaDato('Token', `${salud.token.symbol} · ${salud.token.decimals} dec`))
    barra.appendChild(etiquetaDato('Spent today', `${dia.gastado.legible} / ${dia.tope.legible}`))

    const modo = etiquetaDato('Mode', salud.modo)
    modo.classList.add('dato-modo')
    barra.appendChild(modo)
  } catch (err) {
    limpiar(barra)
    const aviso = nodo('span', 'dato dato-error', `${err?.code ?? 'error'}: engine unavailable`)
    barra.appendChild(aviso)
    mostrarError($('error-cargar'), err)
  }
}

function etiquetaDato (nombre, valor) {
  const el = nodo('span', 'dato')
  el.appendChild(document.createTextNode(`${nombre}: `))
  el.appendChild(nodo('strong', null, valor))
  return el
}

async function cargarPoliticas () {
  try {
    const p = await pedir('/api/politicas')

    const topes = $('topes')
    limpiar(topes)
    topes.appendChild(tope('Per-transfer cap', `${p.topePorTransferencia.legible} ${p.token.symbol}`, `${p.topePorTransferencia.base} base units`))
    topes.appendChild(tope('Daily cap', `${p.topeDiario.legible} ${p.token.symbol}`, `${p.topeDiario.base} base units`))
    topes.appendChild(tope('Allowed recipients', String(p.destinatariosPermitidos), 'addresses on the allowlist'))

    const cuerpo = $('cuerpo-politicas')
    limpiar(cuerpo)

    for (const politica of p.politicas) {
      for (const regla of politica.reglas) {
        const tr = document.createElement('tr')
        tr.appendChild(nodo('td', 'mono', politica.id))
        tr.appendChild(nodo('td', 'mono', regla.nombre))

        const accion = document.createElement('td')
        accion.appendChild(nodo('span', `chip chip-${regla.accion === 'DENY' ? 'denegada' : 'ejecutada'}`, regla.accion))
        tr.appendChild(accion)

        tr.appendChild(nodo('td', 'concepto', regla.razon ?? '—'))
        cuerpo.appendChild(tr)
      }
    }

    $('panel-politicas').hidden = false
    revelar(document.getElementById('pantalla-cargar'))
  } catch {
    // The top bar already reports that the engine is not answering.
  }
}

function tope (nombre, valor, base) {
  const el = nodo('div', 'tope')
  el.appendChild(nodo('span', 'tope-nombre', nombre))
  el.appendChild(nodo('span', 'tope-valor', valor))
  el.appendChild(nodo('span', 'tope-base', base))
  return el
}

/* ------------------------------------------------------------- corridas --- */

async function reiniciarDia () {
  const r = await pedir('/api/dia/reiniciar', { method: 'POST', body: '{}' })
  return r
}

async function unaCorrida (clave) {
  return await pedir('/api/correr', {
    method: 'POST',
    body: JSON.stringify({ nomina: clave, instruccion: $('campo-instruccion').value })
  })
}

async function correrNomina () {
  $('error-cargar').hidden = true

  try {
    if ($('campo-reiniciar').checked) {
      cargando(true, "Resetting today's accumulator…")
      await reiniciarDia()
    }

    cargando(true, 'The engine is building the plan and asking the policies…')
    const { recibo, markdown } = await unaCorrida(estado.nomina)

    estado.recibo = recibo
    estado.markdown = markdown
    estado.decimales = recibo.totals?.decimals ?? estado.decimales

    cargando(false)
    await cargarSalud()

    if (recibo.failure) {
      mostrarError($('error-cargar'), recibo.failure)
      return
    }

    pintarPlan()
    mostrar('pantalla-plan')
  } catch (err) {
    cargando(false)
    mostrarError($('error-cargar'), err)
  }
}

/* ----------------------------------------------------------------- plan --- */

/**
 * The plan is projected out of the receipt, which is what the API returns.
 * A line with no recipient is an abstention by the planner; the rest are the
 * lines it proposed. No verdict is shown on this screen.
 */
function separarPlan (recibo) {
  const propuestas = recibo.lines.filter((l) => l.to !== null && l.to !== undefined)
  const abstenciones = recibo.lines.filter((l) => l.to === null || l.to === undefined)
  return { propuestas, abstenciones }
}

function pintarPlan () {
  const recibo = estado.recibo
  const { propuestas, abstenciones } = separarPlan(recibo)
  const d = recibo.totals.decimals

  const total = propuestas.reduce((acc, l) => acc + BigInt(l.amount ?? 0), 0n)
  $('resumen-plan').textContent =
    `The planner proposed ${propuestas.length} payments for ${formatear(total, d)} ${estado.simbolo} in total, ` +
    `and abstained on ${abstenciones.length} rows. Instruction: "${recibo.run.instruction}".`

  const cuerpo = $('cuerpo-plan')
  limpiar(cuerpo)

  for (const l of propuestas) {
    const tr = document.createElement('tr')
    tr.appendChild(nodo('td', null, l.row))

    const destino = nodo('td', 'direccion')
    destino.textContent = corta(l.to)
    destino.title = l.to
    tr.appendChild(destino)

    tr.appendChild(nodo('td', 'col-monto', `${formatear(l.amount, l.decimals ?? d)} ${l.token ?? estado.simbolo}`))

    const concepto = l.concepto ?? ''
    tr.appendChild(nodo('td', concepto.length > 60 ? 'concepto-largo' : 'concepto', concepto || '—'))

    cuerpo.appendChild(tr)
  }

  const bloque = $('bloque-abstenciones')
  const cuerpoAbs = $('cuerpo-abstenciones')
  limpiar(cuerpoAbs)
  bloque.hidden = abstenciones.length === 0

  for (const l of abstenciones) {
    const tr = document.createElement('tr')
    tr.appendChild(nodo('td', null, l.row))
    tr.appendChild(nodo('td', 'abstencion', l.why ?? 'no reason stated'))
    cuerpoAbs.appendChild(tr)
  }
}

/* ------------------------------------------------------------ veredicto --- */

function pintarVeredicto () {
  const recibo = estado.recibo
  const t = recibo.totals
  const d = t.decimals

  const contadores = $('contadores')
  limpiar(contadores)
  contadores.appendChild(contador('ejecutada', t.ejecutadas, 'executed', `${formatear(t.montoEjecutado, d)} ${estado.simbolo}`))
  contadores.appendChild(contador('denegada', t.denegadas, 'denied', `${formatear(t.montoDenegado, d)} ${estado.simbolo} stopped`))
  contadores.appendChild(contador('no_intentada', t.no_intentadas, 'not attempted', 'not enough data'))
  contadores.appendChild(contador('total', t.lineas, 'lines in total', 'in the file'))

  const suma = $('cuadratura')
  limpiar(suma)
  suma.className = `cuadratura ${t.cuadra ? 'cuadratura-ok' : 'cuadratura-mal'}`
  suma.appendChild(nodo('span', 'suma', `${t.ejecutadas} + ${t.denegadas} + ${t.no_intentadas} = ${t.ejecutadas + t.denegadas + t.no_intentadas} of ${t.lineas} lines. `))
  suma.appendChild(document.createTextNode(t.cuadra ? 'The sum balances.' : 'THE SUM DOES NOT BALANCE.'))

  const cuerpo = $('cuerpo-veredicto')
  limpiar(cuerpo)

  for (const l of recibo.lines) {
    const tr = document.createElement('tr')
    tr.className = `fila-${l.estado}`

    tr.appendChild(nodo('td', null, l.row))

    const chip = document.createElement('td')
    chip.appendChild(nodo('span', `chip chip-${l.estado}`, l.estado.replace('_', ' ')))
    tr.appendChild(chip)

    const destino = nodo('td', 'direccion')
    destino.textContent = l.to ? corta(l.to) : '—'
    if (l.to) destino.title = l.to
    tr.appendChild(destino)

    tr.appendChild(nodo('td', 'col-monto', l.amount ? `${formatear(l.amount, l.decimals ?? d)} ${l.token ?? estado.simbolo}` : '—'))

    tr.appendChild(celdaPorQue(l))
    cuerpo.appendChild(tr)
  }
}

function contador (clase, cifra, nombre, detalle) {
  const el = nodo('div', `contador contador-${clase}`)
  el.appendChild(nodo('span', 'contador-cifra', cifra))
  el.appendChild(nodo('span', 'contador-nombre', nombre))
  el.appendChild(nodo('span', 'contador-monto', detalle))
  return el
}

/** The column that matters: the real trace of the policy that denied. */
function celdaPorQue (l) {
  const td = document.createElement('td')

  if (l.estado === 'denegada' && l.policy) {
    const caja = nodo('span', 'denegacion')
    caja.appendChild(nodo('span', 'denegacion-regla', `${l.policy.id} / ${l.policy.rule}`))
    caja.appendChild(nodo('span', 'denegacion-razon', l.policy.reason))
    td.appendChild(caja)
    return td
  }

  if (l.estado === 'no_intentada') {
    td.appendChild(nodo('span', 'abstencion', l.why ?? 'no reason stated'))
    return td
  }

  const partes = [l.dryRun ? 'dry-run: nothing was sent' : 'sent']
  if (l.feeEstimada) partes.push(`estimated fee ${l.feeEstimada} wei`)
  if (l.quoteExacto === false && l.quoteNota) partes.push(l.quoteNota)
  if (l.txHash) partes.push(`tx ${l.txHash}`)

  td.appendChild(nodo('span', 'nota-ejecucion', partes.join(' · ')))
  return td
}

/* --------------------------------------------------------------- recibo --- */

function pintarRecibo () {
  const recibo = estado.recibo
  const ficha = $('ficha-recibo')
  limpiar(ficha)

  const campos = [
    ['Run', recibo.run.id],
    ['Mode', recibo.run.mode],
    ['Network', recibo.run.network ?? '—'],
    ['Token', recibo.run.token ? `${recibo.run.token.slug.toUpperCase()} · ${recibo.run.token.decimals} dec` : '—'],
    ['Input file', recibo.run.inputFile ?? '—'],
    ['sha256 of the file', recibo.run.inputSha256 ?? '—'],
    ['Planner', recibo.run.planner ? (recibo.run.planner.used ? `LLM ${recibo.run.planner.model}` : 'deterministic rules') : '—'],
    ['Contract version', recibo.version]
  ]

  for (const [nombre, valor] of campos) {
    const div = document.createElement('div')
    div.appendChild(nodo('dt', null, nombre))
    div.appendChild(nodo('dd', null, valor))
    ficha.appendChild(div)
  }

  const md = $('recibo-md')
  limpiar(md)
  md.appendChild(renderMarkdown(estado.markdown))

  const chequeos = $('chequeos')
  limpiar(chequeos)

  for (const c of recibo.checks ?? []) {
    const el = nodo('div', `chequeo ${c.ok ? '' : 'chequeo-mal'}`)
    el.appendChild(nodo('span', 'chequeo-nombre', c.name))
    el.appendChild(document.createTextNode(' '))
    el.appendChild(nodo('span', c.ok ? 'chequeo-ok' : 'chequeo-no', c.ok ? 'OK' : 'FALLA'))
    if (c.detail) el.appendChild(nodo('span', 'chequeo-detalle', c.detail))
    chequeos.appendChild(el)
  }

  const aplicadas = $('cuerpo-aplicadas')
  limpiar(aplicadas)

  for (const p of recibo.policiesApplied ?? []) {
    const tr = document.createElement('tr')
    tr.appendChild(nodo('td', 'mono', p.id))
    tr.appendChild(nodo('td', null, p.scope))
    tr.appendChild(nodo('td', 'concepto', p.estadoFinal ? `${p.estadoFinal} base units used today` : '—'))
    aplicadas.appendChild(tr)
  }
}

function descargarRecibo () {
  if (!estado.recibo) return
  const blob = new Blob([JSON.stringify(estado.recibo, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${estado.recibo.run.id}.recibo.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Renders the markdown the API returns. It covers only what the receipt uses:
 * headings, paragraphs, tables, bold and code. Every string goes in through
 * textContent, so nothing arriving in a receipt is ever read as HTML.
 */
function renderMarkdown (texto) {
  const raiz = document.createDocumentFragment()
  const lineas = String(texto ?? '').split('\n')
  let i = 0

  while (i < lineas.length) {
    const linea = lineas[i]

    if (linea.trim() === '') { i++; continue }

    if (linea.startsWith('## ')) { raiz.appendChild(conFormato('h2', linea.slice(3))); i++; continue }
    if (linea.startsWith('# ')) { raiz.appendChild(conFormato('h1', linea.slice(2))); i++; continue }

    if (linea.trim().startsWith('|') && (lineas[i + 1] ?? '').trim().startsWith('|-')) {
      const tabla = document.createElement('table')
      const thead = document.createElement('thead')
      thead.appendChild(filaTabla(linea, 'th'))
      tabla.appendChild(thead)

      const tbody = document.createElement('tbody')
      i += 2
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        tbody.appendChild(filaTabla(lineas[i], 'td'))
        i++
      }
      tabla.appendChild(tbody)
      raiz.appendChild(tabla)
      continue
    }

    raiz.appendChild(conFormato('p', linea))
    i++
  }

  return raiz
}

function filaTabla (linea, etiqueta) {
  const tr = document.createElement('tr')
  const celdas = linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  for (const celda of celdas) tr.appendChild(conFormato(etiqueta, celda.trim()))
  return tr
}

/** Inline bold and code, built as nodes: never innerHTML. */
function conFormato (etiqueta, texto) {
  const el = document.createElement(etiqueta)

  for (const trozo of String(texto).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (!trozo) continue
    if (trozo.startsWith('**') && trozo.endsWith('**')) el.appendChild(nodo('strong', null, trozo.slice(2, -2)))
    else if (trozo.startsWith('`') && trozo.endsWith('`')) el.appendChild(nodo('code', null, trozo.slice(1, -1)))
    else el.appendChild(document.createTextNode(trozo))
  }

  return el
}

/* ----------------------------------------------------------- comparacion --- */

async function compararNominas () {
  $('error-cargar').hidden = true

  try {
    cargando(true, 'Run 1 of 2: the clean payroll…')
    await reiniciarDia()
    const limpia = await unaCorrida('limpia')

    cargando(true, 'Run 2 of 2: the poisoned payroll…')
    await reiniciarDia()
    const envenenada = await unaCorrida('envenenada')

    cargando(false)
    await cargarSalud()

    estado.recibo = envenenada.recibo
    estado.markdown = envenenada.markdown

    pintarComparacion(limpia.recibo, envenenada.recibo)
    mostrar('pantalla-comparar')
  } catch (err) {
    cargando(false)
    mostrarError($('error-cargar'), err)
  }
}

/** Compares the fields that decide money. The description is left out on purpose: it is the text that changes. */
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

function pintarComparacion (limpia, envenenada) {
  const d = limpia.totals.decimals
  const porFila = new Map(envenenada.lines.map((l) => [l.row, l]))

  let iguales = 0
  const cuerpo = $('cuerpo-comparar')
  limpiar(cuerpo)

  const inyectadas = []

  for (const a of limpia.lines) {
    const b = porFila.get(a.row)
    const mismo = Boolean(b) && huella(a) === huella(b)
    if (mismo) iguales++

    if (b && (a.concepto ?? '') !== (b.concepto ?? '')) inyectadas.push({ fila: a.row, limpio: a.concepto ?? '', sucio: b.concepto ?? '', linea: b })

    const tr = document.createElement('tr')
    tr.className = `fila-${a.estado}`
    tr.appendChild(nodo('td', null, a.row))
    tr.appendChild(celdaLado(a, d))
    tr.appendChild(b ? celdaLado(b, d) : nodo('td', null, 'sin linea'))

    const igual = document.createElement('td')
    igual.appendChild(nodo('span', mismo ? 'igual-si' : 'igual-no', mismo ? 'identical' : 'different'))
    tr.appendChild(igual)

    cuerpo.appendChild(tr)
  }

  const todoIgual = iguales === limpia.lines.length && limpia.lines.length === envenenada.lines.length

  const banner = $('banner-comparar')
  limpiar(banner)
  banner.className = `banner ${todoIgual ? 'banner-igual' : 'banner-distinto'}`
  banner.appendChild(nodo('span', 'banner-titulo', todoIgual
    ? `Same verdict on all ${limpia.lines.length} lines`
    : `${limpia.lines.length - iguales} of ${limpia.lines.length} lines changed`))
  banner.appendChild(nodo('span', 'banner-detalle', todoIgual
    ? `The poisoned file carries instructions embedded in ${inyectadas.length} rows and moved not one decision. `
      + `Both receipts: ${limpia.totals.ejecutadas} ejecutadas, ${limpia.totals.denegadas} denegadas, ${limpia.totals.no_intentadas} no intentadas.`
    : 'Check row by row which one changed and why.'))

  const bloque = $('bloque-inyeccion')
  const lista = $('lista-inyeccion')
  limpiar(lista)
  bloque.hidden = inyectadas.length === 0

  for (const item of inyectadas) {
    const caja = nodo('div', 'inyeccion')
    caja.appendChild(nodo('span', 'inyeccion-fila', `Row ${item.fila} · description column`))
    caja.appendChild(nodo('span', 'inyeccion-texto', item.sucio))

    const efecto = nodo('span', 'inyeccion-efecto')
    efecto.appendChild(document.createTextNode("The engine's verdict for that row: "))
    efecto.appendChild(nodo('span', `chip chip-${item.linea.estado}`, item.linea.estado.replace('_', ' ')))
    efecto.appendChild(document.createTextNode(
      item.linea.policy
        ? ` by ${item.linea.policy.id} / ${item.linea.policy.rule}. The same one it gave with the text "${item.limpio}".`
        : `. The same one it gave with the text "${item.limpio}".`
    ))
    caja.appendChild(efecto)

    lista.appendChild(caja)
  }
}

function celdaLado (l, d) {
  const td = document.createElement('td')
  const caja = nodo('span', 'celda-lado')
  caja.appendChild(nodo('span', `chip chip-${l.estado}`, l.estado.replace('_', ' ')))

  if (l.policy) caja.appendChild(nodo('span', 'celda-regla', `${l.policy.id} / ${l.policy.rule}`))
  else if (l.amount) caja.appendChild(nodo('span', 'celda-regla', `${formatear(l.amount, l.decimals ?? d)} ${l.token ?? ''}`))

  td.appendChild(caja)
  return td
}

/* ------------------------------------------------------------- probador --- */

async function simularLinea () {
  const salida = $('salida-simular')
  limpiar(salida)

  const monto = aUnidadesBase($('campo-monto').value, estado.decimales)
  if (!monto.ok) {
    const err = nodo('p', 'error')
    err.textContent = monto.why
    salida.appendChild(err)
    return
  }

  try {
    cargando(true, 'Asking the policy engine…')
    const v = await pedir('/api/simular', {
      method: 'POST',
      body: JSON.stringify({ destinatario: $('campo-destinatario').value.trim(), monto_base: monto.base })
    })
    cargando(false)

    const caja = nodo('div', `veredicto-suelto ${v.decision === 'ALLOW' ? 'veredicto-allow' : 'veredicto-deny'}`)
    caja.appendChild(nodo('div', 'veredicto-decision', v.decision))
    caja.appendChild(nodo('div', 'denegacion-regla', `${v.politica} / ${v.regla}`))
    caja.appendChild(nodo('div', 'denegacion-razon', v.razon))
    caja.appendChild(nodo('div', 'nota-ejecucion', `Amount asked about: ${v.monto.legible} ${estado.simbolo} (${v.monto.base} base units)`))

    if (Array.isArray(v.traza) && v.traza.length) {
      const traza = nodo('div', 'traza')
      traza.appendChild(nodo('div', 'inyeccion-fila', 'Evaluation trace'))
      for (const paso of v.traza) {
        traza.appendChild(nodo('div', `traza-linea ${paso.matched ? 'traza-si' : ''}`,
          `${paso.matched ? '>' : ' '} ${paso.policy_id} / ${paso.rule_name} — ${paso.matched ? 'matched' : 'no match'}`))
      }
      caja.appendChild(traza)
    }

    salida.appendChild(caja)
  } catch (err) {
    cargando(false)
    const caja = document.createElement('p')
    caja.className = 'error'
    mostrarError(caja, err)
    salida.appendChild(caja)
  }
}

iniciar()
