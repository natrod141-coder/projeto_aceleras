import { calculateEstimate } from './src/engine/calculator.js';

// ─── Configuração ──────────────────────────────────────────────────────────────
const TOLERANCIA_PCT = 5;

// ─── Helper: chama o calculator por ambiente e soma ────────────────────────────
// Espelha exatamente o que o App.jsx faz em runCalc()
const calcTotal = (ambientes) =>
  ambientes.reduce((soma, input) => soma + calculateEstimate(input).total, 0);

// ─── Casos de validação ────────────────────────────────────────────────────────

const CASOS = [

  // ─── PRIO ────────────────────────────────────────────────────────────────────
  // Gabarito oficial PDF: $2.653,80
  // Linhas do PDF:
  //   AP  PROD: 2× D8AV4, East US, 325h VM / 352h DBU  → $830.40
  //   AP  DEV:  1× D4AV4, East US, 325h VM / 352h DBU  → $207.60
  //   Job PROD: 1× D8AV4, West US, 300h VM / 730h DBU  → $462.90
  //   SQL PROD: XSmall, 176h                            → $739.20
  //   Storage PROD: 10 TB East US                       → $251.22
  //   Key Vault DEV + PROD:                             → $0.36
  //   ADF DEV + PROD:                                   → $109.08  ← FORA DO MVP
  // Gap esperado: ~$109 (só ADF, fora do MVP).
  // FIX (região mista): antes o motor usava uma computeRegion única, então o
  // All-Purpose (que no PDF roda em East US) era forçado pra West US (onde o
  // Job Compute roda de fato) — isso sozinho explicava ~$52 do gap e obrigou a
  // dobrar a tolerância pra 10% pra "passar". Agora AP e Job têm cada um sua
  // própria região (apComputeRegion / jobComputeRegion), reproduzindo a
  // planilha real linha por linha. Tolerância volta para os 5% padrão.
  {
    nome: 'PRIO',
    ambientes: [
      // PROD
      {
        storageGB:        10000,
        storageRegion:   'EAST_US',
        apComputeRegion: 'EAST_US',   // AP PROD está em East US no PDF
        jobComputeRegion:'WEST_US',   // Job PROD está em West US no PDF
        tier:            'premium',
        apProdInstance:  'D8AV4', apProdNodes: 2, apProdHorasVM: 325, apProdHorasDbu: 352,
        jobProdInstance: 'D8AV4', jobProdNodes: 1, jobProdHorasVM: 300, jobProdHorasDbu: 730,
        sqlClusterSize:  'XSMALL', sqlHoras: 176,
        includePostgre:  false,
        includeKeyVault: true,
      },
      // DEV
      {
        storageGB:        0,
        storageRegion:   'EAST_US',
        apComputeRegion: 'EAST_US',   // AP DEV está em East US no PDF
        jobComputeRegion:'EAST_US',   // Job DEV não é usado neste caso (nodes=0)
        tier:            'premium',
        apProdInstance:  'D4AV4', apProdNodes: 1, apProdHorasVM: 325, apProdHorasDbu: 352,
        jobProdInstance: 'D8AV4', jobProdNodes: 0, jobProdHorasVM: 0,  jobProdHorasDbu: 0,
        sqlClusterSize:  'XSMALL', sqlHoras: 0,
        includePostgre:  false,
        includeKeyVault: true,
      },
    ],
    gabaritoOficial: 2653.80,
    gabaritoMVP:     2544.72, // sem ADF ($109.08) — nenhum outro gap estrutural conhecido
    nota: 'ADF ($109) fora do MVP. Região mista (AP East US / Job West US) agora é reproduzida corretamente.',
  },

  // ─── AMAGGI ──────────────────────────────────────────────────────────────────
  // Gabarito oficial PDF: $6.223,25
  // Linhas do PDF:
  //   AP  PROD: 2× D8AV4,  West US, 352h VM / 352h DBU         → $896.19
  //   AP  DEV:  1× D3V2,   West US, 352h VM / 352h DBU         → $243.41
  //   Job PROD: 1× D8AV4,  West US, 352h VM / 730h DBU         → $486.20
  //   Job DEV:  1× D16AV4, West US, 352h VM / 730h DBU         → $972.39  ← mapeado como Job DEV
  //   SQL PROD: D16AV4, 730h All-Purpose (não SQL Serverless)   → $1.858,58 ← FORA DO MVP
  //   Storage:  72 TB East US                                   → $1.553,74
  //   PostgreSQL:                                               → $212.74
  // Linha SQL do AMAGGI é All-Purpose extra, não SQL Serverless real.
  // gabaritoMVP = 6223.25 - 1858.58 = $4.364,67 (4 linhas de compute que o MVP cobre)
  {
    nome: 'AMAGGI',
    ambientes: [
      // PROD
      {
        storageGB:        72000,
        storageRegion:   'EAST_US',
        apComputeRegion: 'WEST_US',
        jobComputeRegion:'WEST_US',
        tier:            'premium',
        apProdInstance:  'D8AV4',  apProdNodes: 2, apProdHorasVM: 352, apProdHorasDbu: 352,
        jobProdInstance: 'D8AV4',  jobProdNodes: 1, jobProdHorasVM: 352, jobProdHorasDbu: 730,
        sqlClusterSize:  'XSMALL', sqlHoras: 0,     // SQL Serverless zerado (AMAGGI não usa)
        includePostgre:  true,
        includeKeyVault: false,
      },
      // DEV
      {
        storageGB:        0,
        storageRegion:   'EAST_US',
        apComputeRegion: 'WEST_US',
        jobComputeRegion:'WEST_US',
        tier:            'premium',
        apProdInstance:  'D3V2',   apProdNodes: 1, apProdHorasVM: 352, apProdHorasDbu: 352,
        jobProdInstance: 'D16AV4', jobProdNodes: 1, jobProdHorasVM: 352, jobProdHorasDbu: 730,
        sqlClusterSize:  'XSMALL', sqlHoras: 0,
        includePostgre:  false,
        includeKeyVault: false,
      },
    ],
    gabaritoOficial: 6223.25,
    gabaritoMVP:     4364.67, // sem linha SQL extra (D16AV4 All-Purpose 730h = $1858.58)
    toleranciaOverride: 5,
    nota: 'O caso oficial da AMAGGI possui três clusters All-Purpose e dois clusters Job Compute. O MVP suporta apenas um cluster de cada tipo por ambiente. Para a validação foi removido o cluster adicional D16AV4 (US$ 1.858,58), resultando em um gabarito reduzido de US$ 4.364,67.',
  },

];

// ─── Runner ────────────────────────────────────────────────────────────────────

console.log('=== Validação do motor de estimativa (Azure Cost Estimator) ===\n');

let algumFalhou = false;

for (const caso of CASOS) {
  const tolerancia    = caso.toleranciaOverride ?? TOLERANCIA_PCT;
  const gabarito      = caso.gabaritoMVP ?? caso.gabaritoOficial;
  const calculado     = calcTotal(caso.ambientes);
  const diferenca     = calculado - gabarito;
  const difPct        = (diferenca / gabarito) * 100;
  const passou        = Math.abs(difPct) <= tolerancia;

  if (!passou) algumFalhou = true;

  const gabaritoLabel = caso.gabaritoMVP
    ? `$${gabarito.toFixed(2)} (MVP, excluindo itens fora do escopo)`
    : `$${gabarito.toFixed(2)}`;

  console.log(`Caso: ${caso.nome}`);
  console.log(`  Calculado:  $${calculado.toFixed(2)}`);
  console.log(`  Gabarito:   ${gabaritoLabel}`);
  console.log(`  Diferença:  $${diferenca.toFixed(2)}  (${difPct.toFixed(1)}%)`);
  console.log(`  Status:     ${passou ? '✅ PASSOU' : '❌ FALHOU'}  (tolerância: ±${tolerancia}%)`);
  if (caso.nota) console.log(`  Nota:       ${caso.nota}`);
  if (caso.gabaritoMVP) console.log(`  Oficial completo: $${caso.gabaritoOficial.toFixed(2)}`);
  console.log('');
}

console.log('================================================================');
if (algumFalhou) {
  console.log('❌ Pelo menos um caso ficou fora da tolerância. Revisar inputs e prices.js.');
  process.exit(1);
} else {
  console.log('✅ Todos os casos dentro da tolerância definida.');
  process.exit(0);
}
