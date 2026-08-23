import { formatearMonto } from '../ingest/amount.js'

const ICONO = { ejecutada: '✅ ejecutada', denegada: '⛔ denegada', no_intentada: '⏸ no intentada' }

/**
 * El gemelo legible del recibo. Es lo que se abre en pantalla durante la demo:
 * la columna "Por que" trae el nombre de la politica, el de la regla y su razon.
 * No es un parrafo generado — es la traza real de la politica que denego.
 */
export function reciboMarkdown (recibo) {
  const d = recibo.totals?.decimals ?? 0
  const simbolo = (recibo.run?.token?.slug ?? '').toUpperCase() || 'TOKEN'
  const L = []

  L.push(`# Recibo — ${recibo.run?.instruction ?? 'corrida de Cerrojo'}`)
  L.push('')
  L.push(`**Corrida:** \`${recibo.run.id}\` · **Modo:** ${recibo.run.mode} · **Red:** ${recibo.run.network ?? '—'} · **Token:** ${simbolo} (${d} dec)`)
  if (recibo.run.inputFile) L.push(`**Entrada:** \`${recibo.run.inputFile}\` · sha256 \`${(recibo.run.inputSha256 ?? '').slice(0, 16)}…\``)
  if (recibo.run.planner) {
    const p = recibo.run.planner
    // El recibo nombra el planner que armo el plan (`rules` | `llm`), nunca una bandera del CLI:
    // sigue siendo cierto aunque las banderas se renombren.
    const modo = p.modo ?? (p.used ? 'llm' : 'rules')
    const etiqueta = p.used ? `LLM \`${p.model}\`` : 'reglas deterministas'
    L.push(`**Planner:** \`${modo}\` · ${etiqueta}${p.retries ? ` · reintentos: ${p.retries}` : ''}`)
  }
  L.push('')

  if (recibo.failure) {
    L.push('## ⚠️ La corrida no se completo')
    L.push('')
    L.push(`**\`${recibo.failure.code}\`** en la etapa \`${recibo.failure.stage}\`: ${recibo.failure.message}`)
    L.push('')
    L.push(`**Que hacer:** ${recibo.failure.suggestion}`)
    L.push('')
    L.push(`**${recibo.totals.lineas} lineas = 0 ejecutadas + 0 denegadas + ${recibo.totals.no_intentadas} no intentadas.** ✅ La suma cuadra.`)
    L.push('')
    return L.join('\n')
  }

  L.push('| # | Estado | Destinatario | Monto | Por que |')
  L.push('|---|---|---|---|---|')

  for (const l of recibo.lines) {
    const monto = l.amount ? `${formatearMonto(l.amount, l.decimals ?? d)} ${simbolo}` : '—'
    L.push(`| ${l.row} | ${ICONO[l.estado] ?? l.estado} | ${l.to ? corta(l.to) : '—'} | ${monto} | ${porQue(l)} |`)
  }

  L.push('')
  const t = recibo.totals
  L.push(`**${t.lineas} lineas = ${t.ejecutadas} ejecutadas + ${t.denegadas} denegadas + ${t.no_intentadas} no intentadas.** ${t.cuadra ? '✅ La suma cuadra.' : '❌ LA SUMA NO CUADRA.'}`)
  L.push('')
  L.push(`**Movido:** ${formatearMonto(t.montoEjecutado, d)} ${simbolo} · **Frenado por politica:** ${formatearMonto(t.montoDenegado, d)} ${simbolo}`)
  L.push('')
  L.push(`**Chequeos:** ${recibo.checks.map((c) => `${c.name} ${c.ok ? '✅' : '❌'}`).join(' · ')}`)
  L.push('')

  if (recibo.policiesApplied?.length) {
    L.push('## Politicas aplicadas')
    L.push('')
    L.push('| Politica | Alcance | Estado |')
    L.push('|---|---|---|')
    for (const p of recibo.policiesApplied) {
      L.push(`| \`${p.id}\` | ${p.scope} | ${p.estadoFinal ? `${p.estadoFinal} unidades base usadas hoy` : '—'} |`)
    }
    L.push('')
  }

  if (recibo.mainnetSoloLectura) {
    const m = recibo.mainnetSoloLectura
    L.push('## Mainnet — solo lectura')
    L.push('')
    L.push(`Red \`${m.network}\` · saldo nativo \`${m.saldoNativo ?? 'n/d'}\` · comision estimada de un transfer ERC-20: \`${m.feeTransferEstimada ?? 'n/d'}\` wei`)
    L.push('')
    L.push(`\`typeof cuenta.transfer === 'function'\` → **${m.transferExiste}**. ${m.nota ?? ''}`)
    L.push('')
  }

  return L.join('\n')
}

function porQue (l) {
  if (l.estado === 'denegada' && l.policy) {
    return `\`${l.policy.id} / ${l.policy.rule}\`: ${l.policy.reason}`
  }
  if (l.estado === 'no_intentada') return l.why ?? 'sin razon declarada'
  if (l.estado === 'ejecutada') {
    if (l.txHash) return `tx \`${corta(l.txHash)}\``
    const nota = l.quoteExacto === false && l.quoteNota ? ` · ${l.quoteNota}` : ''
    return `dry-run · comision estimada \`${l.feeEstimada ?? 'n/d'}\` wei${nota}`
  }
  return '—'
}

function corta (s) {
  return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s
}
