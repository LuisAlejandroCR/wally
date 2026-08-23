/**
 * Cerrojo — local web front-end (lane C).
 *
 * This server renders nothing and decides nothing. It serves static files and
 * forwards a small, fixed set of calls to the Cerrojo HTTP API (lane B), which
 * is the only thing that ever produces a verdict.
 *
 * Hard boundaries, per AGENTS_LANES.md:
 *   - no @tetherto/wdk import, no account derivation, no policy evaluation here;
 *   - the browser never supplies a filesystem path: it picks one of two keys;
 *   - the API response body is passed through verbatim, status code included;
 *   - nothing reads CERROJO_SEED or code/.env.
 *
 * Node standard library only. No dependencies, no build step.
 */
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = join(AQUI, 'public')

const PUERTO = Number(process.env.CERROJO_APP_PORT ?? 7070)
const HOST = process.env.CERROJO_APP_HOST ?? '127.0.0.1'
const API = (process.env.CERROJO_API_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '')

// Must match the CERROJO_STATE_DIR the API was started with. See README.
const DIR_ESTADO = resolve(process.env.CERROJO_STATE_DIR ?? join(AQUI, 'state'))

/**
 * The only two payrolls the browser can ask for. A key, never a path: an
 * arbitrary path coming from the client would be a traversal hole, and the
 * API resolves relative paths against code/.
 */
const NOMINAS = {
  limpia: {
    csv: 'evals/fixtures/nomina_agosto.csv',
    etiqueta: 'Nomina de agosto',
    descripcion: 'El archivo tal como lo manda el area de personal.'
  },
  envenenada: {
    csv: 'evals/fixtures/nomina_inyeccion.csv',
    etiqueta: 'Nomina de agosto con inyeccion',
    descripcion: 'El mismo archivo, con instrucciones incrustadas en la columna concepto.'
  }
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? HOST}`)
  const ruta = url.pathname

  try {
    if (ruta === '/api/nominas' && req.method === 'GET') return json(res, 200, listarNominas())
    if (ruta === '/api/salud' && req.method === 'GET') return await pasar(res, 'GET', '/salud')
    if (ruta === '/api/politicas' && req.method === 'GET') return await pasar(res, 'GET', '/politicas')
    if (ruta === '/api/estado-diario' && req.method === 'GET') return await pasar(res, 'GET', '/estado-diario')
    if (ruta === '/api/correr' && req.method === 'POST') return await correr(req, res)
    if (ruta === '/api/simular' && req.method === 'POST') return await simular(req, res)
    if (ruta === '/api/dia/reiniciar' && req.method === 'POST') return await reiniciarDia(res)

    if (req.method === 'GET' || req.method === 'HEAD') return await estatico(res, ruta)

    return json(res, 405, error('E_METODO', `${req.method} no esta permitido en ${ruta}`, 'Usa GET para los archivos y POST para /api/correr, /api/simular y /api/dia/reiniciar.'))
  } catch (err) {
    return json(res, 500, error('E_APP', err?.message ?? String(err), 'Revisa la consola del servidor de la app.'))
  }
})

servidor.listen(PUERTO, HOST, () => {
  console.log(`\ncerrojo app en http://${HOST}:${PUERTO}`)
  console.log(`  API de Cerrojo   ${API}`)
  console.log(`  Estado diario    ${DIR_ESTADO}`)
  console.log('\n  Esta app no decide nada: cada veredicto viene de la API.\n')
})

function listarNominas () {
  return {
    nominas: Object.entries(NOMINAS).map(([clave, n]) => ({
      clave,
      etiqueta: n.etiqueta,
      descripcion: n.descripcion,
      csv: n.csv
    }))
  }
}

/**
 * Runs a payroll. The browser sends a key; this function turns it into the
 * fixed relative path the API expects, and returns the API answer untouched.
 */
async function correr (req, res) {
  const cuerpo = await leerJSON(req)
  const nomina = NOMINAS[cuerpo.nomina]

  if (!nomina) {
    return json(res, 400, error(
      'E_NOMINA_DESCONOCIDA',
      `"${cuerpo.nomina}" no es una de las nominas disponibles.`,
      `Elige una de: ${Object.keys(NOMINAS).join(', ')}. La app no acepta rutas de archivo del navegador.`
    ))
  }

  const instruccion = String(cuerpo.instruccion ?? '').trim() || 'paga la nomina de agosto'

  return await pasar(res, 'POST', '/correr', { csv: nomina.csv, instruccion })
}

/** Single-line probe. Only the two fields the engine needs travel through. */
async function simular (req, res) {
  const cuerpo = await leerJSON(req)

  return await pasar(res, 'POST', '/simular', {
    destinatario: String(cuerpo.destinatario ?? ''),
    monto_base: String(cuerpo.monto_base ?? '')
  })
}

/**
 * Clears the daily accumulator, the same thing `cerrojo run --reset-dia` does,
 * so a demo run always starts from a known day. The API has no endpoint for
 * this, so the app removes the ledger file in the state directory it owns.
 *
 * Two safeguards: it refuses to touch anything outside app/, and it reports
 * the state the API returns afterwards rather than assuming success. No cap is
 * lowered and no rule is disabled: cap-diario is enforced in full inside every
 * run that follows.
 */
async function reiniciarDia (res) {
  if (!bajoLaApp(DIR_ESTADO)) {
    return json(res, 400, error(
      'E_ESTADO_FUERA_DE_LA_APP',
      `La app solo reinicia el acumulado dentro de su propia carpeta, y CERROJO_STATE_DIR apunta a ${DIR_ESTADO}.`,
      'Arranca la API con CERROJO_STATE_DIR apuntando a app/state, o reinicia el dia con: cerrojo run --reset-dia.'
    ))
  }

  const antes = await pedir('GET', '/estado-diario')
  if (!antes.ok) return json(res, antes.estado, antes.datos)

  const archivo = join(DIR_ESTADO, `ledger-${antes.datos.red}-${antes.datos.fecha}.json`)
  await rm(archivo, { force: true })

  const despues = await pedir('GET', '/estado-diario')
  if (!despues.ok) return json(res, despues.estado, despues.datos)

  return json(res, 200, {
    estado: despues.datos,
    reiniciado: despues.datos?.gastado?.base === '0',
    archivo: basename(archivo)
  })
}

function bajoLaApp (ruta) {
  const raiz = resolve(AQUI)
  const r = resolve(ruta)
  return r === raiz || r.startsWith(raiz + sep)
}

/** Forwards to the API and echoes status and body exactly as they came back. */
async function pasar (res, metodo, ruta, cuerpo = null) {
  const r = await pedir(metodo, ruta, cuerpo)
  return json(res, r.estado, r.datos)
}

async function pedir (metodo, ruta, cuerpo = null) {
  try {
    const respuesta = await fetch(API + ruta, {
      method: metodo,
      headers: cuerpo ? { 'content-type': 'application/json' } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    })

    const texto = await respuesta.text()

    let datos
    try {
      datos = JSON.parse(texto)
    } catch {
      return {
        ok: false,
        estado: 502,
        datos: error('E_API_ILEGIBLE', `La API respondio algo que no es JSON en ${ruta}.`, 'Revisa la consola donde corre: cd code && node src/cli.js serve')
      }
    }

    return { ok: respuesta.ok, estado: respuesta.status, datos }
  } catch (err) {
    return {
      ok: false,
      estado: 503,
      datos: error(
        'E_API_CAIDA',
        `No hubo respuesta de la API de Cerrojo en ${API}: ${err?.message ?? err}`,
        'Arrancala en otra terminal con: cd code && node src/cli.js serve'
      )
    }
  }
}

async function estatico (res, ruta) {
  const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '')
  const destino = resolve(PUBLICO, relativa)

  // Nada fuera de public/, pase lo que pase en la URL.
  if (destino !== resolve(PUBLICO) && !destino.startsWith(resolve(PUBLICO) + sep)) {
    return json(res, 403, error('E_FUERA_DE_PUBLIC', 'Ruta fuera de public/.', 'Pide un archivo de la app.'))
  }

  try {
    const contenido = await readFile(destino)
    res.writeHead(200, {
      'content-type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
      // The demo is edited while it is being watched. A cached stylesheet from
      // ten minutes ago looking like "nothing changed" is not worth the bytes.
      'cache-control': 'no-store'
    })
    return res.end(contenido)
  } catch {
    return json(res, 404, error('E_NO_ENCONTRADO', `No existe ${ruta}`, 'Abre http://' + HOST + ':' + PUERTO + '/'))
  }
}

function error (code, message, suggestion) {
  return { error: { code, message, suggestion } }
}

function json (res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo, null, 2)
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(texto)
}

function leerJSON (req) {
  return new Promise((resolver, rechazar) => {
    let datos = ''
    req.on('data', (c) => {
      datos += c
      if (datos.length > 100_000) { rechazar(new Error('cuerpo demasiado grande')); req.destroy() }
    })
    req.on('end', () => {
      if (!datos.trim()) return resolver({})
      try { resolver(JSON.parse(datos)) } catch (err) { rechazar(new Error(`JSON invalido: ${err.message}`)) }
    })
    req.on('error', rechazar)
  })
}
