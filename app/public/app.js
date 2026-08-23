/**
 * Cerrojo web front-end.
 *
 * This file renders. It never decides. Every `estado`, `policy.id`, `policy.rule`
 * and `policy.reason` on screen is read straight out of an API response; nothing
 * here evaluates a cap, an allowlist or a rule. Amounts arrive as integer strings
 * in base units and are only formatted for display.
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
      message: `El servidor de la app respondio algo que no es JSON en ${ruta}.`,
      suggestion: 'Revisa la consola donde corre: node app/server.js'
    }
  }

  if (!respuesta.ok || datos?.error) {
    throw datos?.error ?? {
      code: `E_HTTP_${respuesta.status}`,
      message: `${ruta} respondio ${respuesta.status}.`,
      suggestion: 'Revisa la consola del servidor.'
    }
  }

  return datos
}

/* -------------------------------------------------------------- formato --- */

/** Entero en unidades base -> texto legible. Solo presentacion. */
function formatear (base, decimales) {
  if (base === null || base === undefined) return null
  const n = BigInt(base)
  const divisor = 10n ** BigInt(decimales)
  const entero = n / divisor
  const resto = (n % divisor).toString().padStart(decimales, '0')
  return decimales === 0 ? entero.toString() : `${entero}.${resto}`
}

/** USDT escrito por una persona -> entero en unidades base, sin floats. */
function aUnidadesBase (texto, decimales) {
  const limpio = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(limpio)) return { ok: false, why: `"${texto}" no es un numero legible.` }

  const [enteros, dec = ''] = limpio.split('.')
  if (dec.length > decimales) return { ok: false, why: `El token admite ${decimales} decimales y escribiste ${dec.length}.` }

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
}

function cargando (visible, texto = 'Consultando al motor…') {
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
  for (const lista of document.querySelectorAll('.pasos')) {
    const n = lista.dataset.paso
    lista.dataset.etiqueta = n === '0' ? 'Comparacion' : `Paso ${n} de 4`
  }

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
    barra.appendChild(etiquetaDato('Red', salud.red))
    barra.appendChild(etiquetaDato('Token', `${salud.token.symbol} · ${salud.token.decimals} dec`))
    barra.appendChild(etiquetaDato('Acumulado hoy', `${dia.gastado.legible} / ${dia.tope.legible}`))

    const modo = etiquetaDato('Modo', salud.modo)
    modo.classList.add('dato-modo')
    barra.appendChild(modo)
  } catch (err) {
    limpiar(barra)
    const aviso = nodo('span', 'dato dato-error', `${err?.code ?? 'error'}: motor no disponible`)
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
    topes.appendChild(tope('Tope por transferencia', `${p.topePorTransferencia.legible} ${p.token.symbol}`, `${p.topePorTransferencia.base} unidades base`))
    topes.appendChild(tope('Tope diario', `${p.topeDiario.legible} ${p.token.symbol}`, `${p.topeDiario.base} unidades base`))
    topes.appendChild(tope('Destinatarios permitidos', String(p.destinatariosPermitidos), 'direcciones en la allowlist'))

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
  } catch {
    // La barra superior ya reporta que el motor no responde.
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
      cargando(true, 'Reiniciando el acumulado del dia…')
      await reiniciarDia()
    }

    cargando(true, 'El motor esta armando el plan y consultando las politicas…')
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
 * El plan se proyecta del recibo, que es lo que devuelve la API.
 * Una linea sin destinatario es una abstencion del planner; el resto son las
 * lineas que se propusieron. En esta pantalla no se muestra ningun veredicto.
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
    `El planner propuso ${propuestas.length} pagos por ${formatear(total, d)} ${estado.simbolo} en total, ` +
    `y se abstuvo en ${abstenciones.length} filas. Instruccion: "${recibo.run.instruction}".`

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
    tr.appendChild(nodo('td', 'abstencion', l.why ?? 'sin razon declarada'))
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
  contadores.appendChild(contador('ejecutada', t.ejecutadas, 'ejecutadas', `${formatear(t.montoEjecutado, d)} ${estado.simbolo}`))
  contadores.appendChild(contador('denegada', t.denegadas, 'denegadas', `${formatear(t.montoDenegado, d)} ${estado.simbolo} frenados`))
  contadores.appendChild(contador('no_intentada', t.no_intentadas, 'no intentadas', 'sin dato suficiente'))
  contadores.appendChild(contador('total', t.lineas, 'lineas en total', 'del archivo'))

  const suma = $('cuadratura')
  limpiar(suma)
  suma.className = `cuadratura ${t.cuadra ? 'cuadratura-ok' : 'cuadratura-mal'}`
  suma.appendChild(nodo('span', 'suma', `${t.ejecutadas} + ${t.denegadas} + ${t.no_intentadas} = ${t.ejecutadas + t.denegadas + t.no_intentadas} de ${t.lineas} lineas. `))
  suma.appendChild(document.createTextNode(t.cuadra ? 'La suma cuadra.' : 'LA SUMA NO CUADRA.'))

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

/** La columna que importa: la traza real de la politica que denego. */
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
    td.appendChild(nodo('span', 'abstencion', l.why ?? 'sin razon declarada'))
    return td
  }

  const partes = [l.dryRun ? 'dry-run: no se envio nada' : 'enviada']
  if (l.feeEstimada) partes.push(`comision estimada ${l.feeEstimada} wei`)
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
    ['Corrida', recibo.run.id],
    ['Modo', recibo.run.mode],
    ['Red', recibo.run.network ?? '—'],
    ['Token', recibo.run.token ? `${recibo.run.token.slug.toUpperCase()} · ${recibo.run.token.decimals} dec` : '—'],
    ['Archivo de entrada', recibo.run.inputFile ?? '—'],
    ['sha256 del archivo', recibo.run.inputSha256 ?? '—'],
    ['Planner', recibo.run.planner ? (recibo.run.planner.used ? `LLM ${recibo.run.planner.model}` : 'reglas deterministas') : '—'],
    ['Version del contrato', recibo.version]
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
    tr.appendChild(nodo('td', 'concepto', p.estadoFinal ? `${p.estadoFinal} unidades base usadas hoy` : '—'))
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
 * Render del markdown que devuelve la API. Cubre solo lo que el recibo usa:
 * titulos, parrafos, tablas, negrita y codigo. Todo el texto entra por
 * textContent, asi que nada de lo que venga en el recibo se interpreta como HTML.
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

/** Negrita y codigo en linea, construidos como nodos: nunca innerHTML. */
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
    cargando(true, 'Corrida 1 de 2: nomina limpia…')
    await reiniciarDia()
    const limpia = await unaCorrida('limpia')

    cargando(true, 'Corrida 2 de 2: nomina con inyeccion…')
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

/** Compara los campos que deciden dinero. El concepto queda fuera a proposito: es el texto que cambia. */
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
    igual.appendChild(nodo('span', mismo ? 'igual-si' : 'igual-no', mismo ? 'identico' : 'distinto'))
    tr.appendChild(igual)

    cuerpo.appendChild(tr)
  }

  const todoIgual = iguales === limpia.lines.length && limpia.lines.length === envenenada.lines.length

  const banner = $('banner-comparar')
  limpiar(banner)
  banner.className = `banner ${todoIgual ? 'banner-igual' : 'banner-distinto'}`
  banner.appendChild(nodo('span', 'banner-titulo', todoIgual
    ? `Mismo veredicto en las ${limpia.lines.length} lineas`
    : `${limpia.lines.length - iguales} de ${limpia.lines.length} lineas cambiaron`))
  banner.appendChild(nodo('span', 'banner-detalle', todoIgual
    ? `El archivo envenenado trae instrucciones incrustadas en ${inyectadas.length} filas y no movio una sola decision. `
      + `Los dos recibos: ${limpia.totals.ejecutadas} ejecutadas, ${limpia.totals.denegadas} denegadas, ${limpia.totals.no_intentadas} no intentadas.`
    : 'Revisa fila por fila cual cambio y por que.'))

  const bloque = $('bloque-inyeccion')
  const lista = $('lista-inyeccion')
  limpiar(lista)
  bloque.hidden = inyectadas.length === 0

  for (const item of inyectadas) {
    const caja = nodo('div', 'inyeccion')
    caja.appendChild(nodo('span', 'inyeccion-fila', `Fila ${item.fila} · columna concepto`))
    caja.appendChild(nodo('span', 'inyeccion-texto', item.sucio))

    const efecto = nodo('span', 'inyeccion-efecto')
    efecto.appendChild(document.createTextNode('Veredicto del motor para esa fila: '))
    efecto.appendChild(nodo('span', `chip chip-${item.linea.estado}`, item.linea.estado.replace('_', ' ')))
    efecto.appendChild(document.createTextNode(
      item.linea.policy
        ? ` por ${item.linea.policy.id} / ${item.linea.policy.rule}. El mismo que con el texto "${item.limpio}".`
        : `. El mismo que con el texto "${item.limpio}".`
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
    cargando(true, 'Preguntando al motor de politicas…')
    const v = await pedir('/api/simular', {
      method: 'POST',
      body: JSON.stringify({ destinatario: $('campo-destinatario').value.trim(), monto_base: monto.base })
    })
    cargando(false)

    const caja = nodo('div', `veredicto-suelto ${v.decision === 'ALLOW' ? 'veredicto-allow' : 'veredicto-deny'}`)
    caja.appendChild(nodo('div', 'veredicto-decision', v.decision))
    caja.appendChild(nodo('div', 'denegacion-regla', `${v.politica} / ${v.regla}`))
    caja.appendChild(nodo('div', 'denegacion-razon', v.razon))
    caja.appendChild(nodo('div', 'nota-ejecucion', `Monto consultado: ${v.monto.legible} ${estado.simbolo} (${v.monto.base} unidades base)`))

    if (Array.isArray(v.traza) && v.traza.length) {
      const traza = nodo('div', 'traza')
      traza.appendChild(nodo('div', 'inyeccion-fila', 'Traza de la evaluacion'))
      for (const paso of v.traza) {
        traza.appendChild(nodo('div', `traza-linea ${paso.matched ? 'traza-si' : ''}`,
          `${paso.matched ? '>' : ' '} ${paso.policy_id} / ${paso.rule_name} — ${paso.matched ? 'aplica' : 'no aplica'}`))
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
