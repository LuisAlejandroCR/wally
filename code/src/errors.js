// Errores tipados: cada uno lleva su arreglo sugerido. Nunca una traza en la cara del usuario.

export class CerrojoError extends Error {
  constructor (code, message, suggestion, stage) {
    super(message)
    this.name = 'CerrojoError'
    this.code = code
    this.suggestion = suggestion
    this.stage = stage
  }

  toJSON () {
    return { code: this.code, message: this.message, suggestion: this.suggestion, stage: this.stage }
  }
}

export const E = {
  seedAusente: () => new CerrojoError(
    'E_SEED_MISSING',
    'No hay seed configurada.',
    'Define CERROJO_SEED en code/.env con una frase BIP-39 de testnet. Nunca uses una seed con fondos reales.',
    'config'
  ),
  seedInvalida: () => new CerrojoError(
    'E_SEED_INVALID',
    'La seed configurada no es una frase BIP-39 valida.',
    'Genera una con: node -e "import(\'@tetherto/wdk\').then(m=>console.log(m.default.getRandomSeedPhrase()))"',
    'config'
  ),
  csvIlegible: (ruta, detalle) => new CerrojoError(
    'E_CSV_UNREADABLE',
    `No se pudo leer el CSV en ${ruta}: ${detalle}`,
    'Revisa la ruta que le pasaste a --csv. El archivo debe existir y tener cabecera beneficiario,direccion,monto,moneda,concepto',
    'ingest'
  ),
  allowlistAusente: (ruta) => new CerrojoError(
    'E_ALLOWLIST_MISSING',
    `No se encontro la allowlist en ${ruta}`,
    'Define CERROJO_ALLOWLIST con la ruta a un archivo de una direccion por linea. Sin allowlist el cerrojo no puede denegar por destinatario.',
    'config'
  ),
  rpcCaido: (url, detalle) => new CerrojoError(
    'E_RPC_UNREACHABLE',
    `No hubo respuesta del RPC (${url}): ${detalle}`,
    'Revisa CERROJO_RPC_URL, o corre con --sin-red para ver el plan y las politicas sin tocar la cadena.',
    'execute'
  ),
  planInvalido: (detalle) => new CerrojoError(
    'E_PLAN_INVALID',
    `El planner no produjo un plan valido: ${detalle}`,
    'Corre con --no-llm para armar el plan por reglas deterministas.',
    'plan'
  ),
  sumaNoCuadra: (detalle) => new CerrojoError(
    'E_TOTALS_MISMATCH',
    `La suma del recibo no cuadra: ${detalle}`,
    'Es un bug de bloqueo, no un aviso. No uses este recibo. Reporta la corrida completa.',
    'receipt'
  ),
  mainnetEscritura: () => new CerrojoError(
    'E_MAINNET_WRITE',
    'Se intento una operacion de escritura sobre la red de solo lectura.',
    'CERROJO_DEMO_READONLY debe ser true. La cuenta de mainnet se obtiene con toReadOnlyAccount().',
    'execute'
  )
}
