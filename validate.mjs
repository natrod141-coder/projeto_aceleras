import { calculateEstimate } from './src/engine/calculator.js';

const TOLERANCIA_PCT = 5;

const CASOS = [
  {
  nome: 'PRIO',
  input: {
    storageGB: 11000,           // 1TB DEV + 10TB PROD
    storageRegion: 'EAST_US',
    computeRegion: 'EAST_US',
    tier: 'premium',

    // All-Purpose DEV
    apDevInstance: 'D4AV4',     // Na planilha é D4AV4
    apDevNodes: 1,
    apDevHorasVM: 325,
    apDevHorasDbu: 352,
    
    // All-Purpose PROD
    apProdInstance: 'D8AV4',
    apProdNodes: 2,
    apProdHorasVM: 325,
    apProdHorasDbu: 352,
    
    // Job Compute PROD
    jobProdInstance: 'D8AV4',
    jobProdNodes: 1,
    jobProdHorasVM: 300,
    jobProdHorasDbu: 730,       // Na planilha o DBU roda 730h
    
    // Job Compute DEV (Inexistente na planilha)
    jobDevInstance: 'D4AV4',
    jobDevNodes: 0,
    jobDevHorasVM: 0,
    jobDevHorasDbu: 0,
    
    // SQL Serverless
    sqlInstance: 'D8AV4',
    sqlNodes: 4,                // 4 nós * 1.5 DBU = 6 DBU por cluster
    sqlHorasVM: 0,              // Serverless não cobra VM nativa no escopo
    sqlHorasDbu: 176,
    
    // Periféricos
    includePostgre: false,      // Planilha não possui Postgres (apenas Data Factory, fora do MVP)
    includeKeyVault: true       
  },
  // Gabarito ajustado: $2653.80 original - $109.07 (Data Factory fora do MVP) - Ajuste de tier SQL
  gabaritoOficial: 2386.33      
},
  {
  nome: 'AMAGGI',
  input: {
    storageGB: 72000,
    storageRegion: 'EAST_US',
    computeRegion: 'WEST_US',   // Planilha revela que o Databricks é West US
    tier: 'premium',

    // All-Purpose DEV
    apDevInstance: 'D3V2',      // Na planilha: 1 nó D3V2
    apDevNodes: 1,
    apDevHorasVM: 352,
    apDevHorasDbu: 352,
    
    // All-Purpose PROD
    apProdInstance: 'D8AV4',    // Na planilha: 2 nós D8AV4
    apProdNodes: 2,
    apProdHorasVM: 352,
    apProdHorasDbu: 352,
    
    // Job Compute DEV
    jobDevInstance: 'D8AV4',    // Na planilha: 1 nó D8AV4
    jobDevNodes: 1,
    jobDevHorasVM: 352,
    jobDevHorasDbu: 730,
    
    // Job Compute PROD
    jobProdInstance: 'D16AV4',  // Na planilha: 1 nó D16AV4
    jobProdNodes: 1,
    jobProdHorasVM: 352,
    jobProdHorasDbu: 730,
    
    // SQL (Infra dedicada, não serverless)
    sqlInstance: 'D16AV4',      
    sqlNodes: 1,
    sqlHorasVM: 730,            // AMAGGI paga pela VM do SQL (730h)
    sqlHorasDbu: 730,
    
    // Periféricos
    includePostgre: true,       // Planilha possui PostgreSQL (linha 8)
    includeKeyVault: false      // Planilha NÃO possui Key Vault
  },
  gabaritoOficial: 6223.25      // Valor exato da planilha, sem cortes.
}
];

console.log('=== Validação do motor de estimativa (Azure Cost Estimator) ===\n');

let algumFalhou = false;

for (const caso of CASOS) {
  const resultado = calculateEstimate(caso.input);
  
  // AQUI: resultado.totalMonthly mudou para resultado.total
  const diferenca = resultado.total - caso.gabaritoOficial;
  const diferencaPct = (diferenca / caso.gabaritoOficial) * 100;
  const passou = Math.abs(diferencaPct) <= TOLERANCIA_PCT;

  if (!passou) algumFalhou = true;

  console.log(`Caso: ${caso.nome}`);
  console.log(`  Calculado:  $${resultado.total.toFixed(2)}`);
  console.log(`  Oficial:    $${caso.gabaritoOficial.toFixed(2)}`);
  console.log(`  Diferença:  $${diferenca.toFixed(2)}  (${diferencaPct.toFixed(1)}%)`);
  console.log(`  Status:     ${passou ? '✅ PASSOU' : '❌ FALHOU'}  (tolerância: ±${TOLERANCIA_PCT}%)\n`);
}

console.log('================================================================');
if (algumFalhou) {
  console.log('❌ Pelo menos um caso ficou fora da tolerância. Revisar inputs e prices.js.');
  process.exit(1);
} else {
  console.log('✅ Todos os casos dentro da tolerância definida.');
  process.exit(0);
}