#!/usr/bin/env node
// scripts/deploy-token.mjs
//
// Setup tooling, not product. This is the one place in the repository that signs
// something without asking the policy engine, and it is kept apart from `src/`
// for exactly that reason: it never sees a payroll, never reads the allowlist,
// and nothing under `src/` imports it.
//
// What it is for: Sepolia's registry USD₮ cannot be minted by us, so the
// treasury's balance is zero and no transfer can ever be executed. That leaves
// the project unable to show its own lock opening. This deploys the mock USD₮ in
// contracts/MockUSDT.sol and mints a testnet balance, so that exactly one real,
// human-approved transfer can happen and be pointed at on a block explorer.
//
//   node scripts/deploy-token.mjs deploy
//   node scripts/deploy-token.mjs mint <token> <to> <amount-in-base-units>
//   node scripts/deploy-token.mjs balance <token> <address>
//
// The seed comes from .env and is never printed. The derived address is checked
// against CERROJO_TREASURY when that variable is set, so a typo in the seed
// cannot quietly deploy from a different wallet.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ContractFactory, Contract, HDNodeWallet, JsonRpcProvider, Mnemonic } from 'ethers'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')

const envPath = join(RAIZ, '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

const RPC = process.env.CERROJO_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const RUTA = "m/44'/60'/0'/0/0" // the same path WDK's EVM wallet derives index 0 from

const artefacto = JSON.parse(readFileSync(join(RAIZ, '..', 'contracts', 'MockUSDT.json'), 'utf8'))

function salir (mensaje, sugerencia) {
  console.error(`⛔ ${mensaje}`)
  if (sugerencia) console.error(`  ➜ ${sugerencia}`)
  process.exit(1)
}

function firmante (proveedor) {
  const semilla = process.env.CERROJO_SEED?.trim()
  if (!semilla) salir('No hay CERROJO_SEED en .env.', 'Copia .env.example a .env y pon una semilla de prueba.')

  const cartera = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(semilla), RUTA).connect(proveedor)

  const esperada = process.env.CERROJO_TREASURY?.trim()
  if (esperada && esperada.toLowerCase() !== cartera.address.toLowerCase()) {
    salir(
      `La semilla deriva ${cartera.address}, no la tesoreria ${esperada}.`,
      'Revisa CERROJO_SEED. No se despliega desde una cartera que no es la esperada.'
    )
  }

  return cartera
}

async function main () {
  const [orden, ...args] = process.argv.slice(2)
  const proveedor = new JsonRpcProvider(RPC)
  const red = await proveedor.getNetwork()

  if (orden === 'balance') {
    const [token, quien] = args
    if (!token || !quien) salir('Uso: balance <token> <address>')
    const c = new Contract(token, artefacto.abi, proveedor)
    const [saldo, decimales, simbolo] = await Promise.all([c.balanceOf(quien), c.decimals(), c.symbol()])
    console.log(`${quien}: ${saldo} unidades base (${Number(saldo) / 10 ** Number(decimales)} ${simbolo})`)
    return
  }

  const cartera = firmante(proveedor)
  const nativo = await proveedor.getBalance(cartera.address)
  console.log(`Red:       ${red.name} (chainId ${red.chainId})`)
  console.log(`Firmante:  ${cartera.address}`)
  console.log(`Saldo:     ${nativo} wei`)
  if (nativo === 0n) salir('El firmante no tiene gas.', 'Usa un faucet de Sepolia antes de desplegar.')

  if (orden === 'deploy') {
    console.log(`\nDesplegando MockUSDT (${artefacto.compiler})...`)
    const fabrica = new ContractFactory(artefacto.abi, artefacto.bytecode, cartera)
    const contrato = await fabrica.deploy()
    const tx = contrato.deploymentTransaction()
    console.log(`tx:        ${tx.hash}`)
    console.log('esperando confirmacion...')
    await contrato.waitForDeployment()
    const direccion = await contrato.getAddress()
    console.log(`\n✅ MockUSDT en ${direccion}`)
    console.log(`   https://sepolia.etherscan.io/address/${direccion}`)
    console.log(`\nPon esto en .env:\n   CERROJO_TOKEN_ADDRESS=${direccion}`)
    return
  }

  if (orden === 'mint') {
    const [token, para, monto] = args
    if (!token || !para || !monto) salir('Uso: mint <token> <to> <amount-in-base-units>')
    const c = new Contract(token, artefacto.abi, cartera)
    console.log(`\nAcunando ${monto} unidades base para ${para}...`)
    const tx = await c.mint(para, BigInt(monto))
    console.log(`tx:        ${tx.hash}`)
    await tx.wait()
    const saldo = await c.balanceOf(para)
    console.log(`\n✅ Saldo de ${para}: ${saldo} unidades base`)
    console.log(`   https://sepolia.etherscan.io/tx/${tx.hash}`)
    return
  }

  salir('Orden desconocida.', 'deploy | mint <token> <to> <amount> | balance <token> <address>')
}

main().catch((e) => salir(e.shortMessage ?? e.message))
