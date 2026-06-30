import { calculateEstimate } from './src/engine/calculator.js';

const TOLERANCIA_PCT = 5;

const CASOS = [
  {
    nome: 'PRIO',
    input: {
      storageGB: 10000,
      storageRegion: 'EAST_US', 
      computeRegion: 'EAST_US',
      tier: 'premium',          // <-- A chave que faltava para evitar o erro!
      
      // Prod AP
      apProdInstance: 'D8AV4',
      apProdNodes: 2,
      apProdHorasVM: 325,
      apProdHorasDbu: 325,
      
      // Dev AP (Antiga Homologação/Dev)
      apDevInstance: 'D8AV4',
      apDevNodes: 1,
      apDevHorasVM: 162.5, // ~50% do tempo de prod
      apDevHorasDbu: 162.5,
      
      // Job Prod
      jobProdInstance: 'D8AV4',
      jobProdNodes: 1,
      jobProdHorasVM: 300,
      jobProdHorasDbu: 300,
      
      // Job Dev (Zerado se não usar)
      jobDevInstance: 'D8AV4',
      jobDevNodes: 0,
      jobDevHorasVM: 0,
      jobDevHorasDbu: 0,
      
      // SQL
      sqlInstance: 'D8AV4',
      sqlNodes: 4, // 4 nós * 1.5 DBU = 6 DBUs (equivalente à regra antiga)
      sqlHorasVM: 176,
      sqlHorasDbu: 176,
      
      includePostgre: true,
      includeKeyVault: true
    },
    gabaritoOficial: 2653.80
  },
  {
    nome: 'AMAGGI',
    input: {
      storageGB: 72000,
      storageRegion: 'EAST_US',
      computeRegion: 'EAST_US',
      tier: 'premium',          // <-- A chave que faltava para evitar o erro!
      
      // Prod AP
      apProdInstance: 'D16AV4',
      apProdNodes: 2,
      apProdHorasVM: 352,
      apProdHorasDbu: 352,
      
      // Dev AP (Zerado: Gabarito AMAGGI considera apenas Prod)
      apDevInstance: 'D4AV4',
      apDevNodes: 0,
      apDevHorasVM: 0,
      apDevHorasDbu: 0,
      
      // Job Prod
      jobProdInstance: 'D8AV4',
      jobProdNodes: 1,
      jobProdHorasVM: 352,
      jobProdHorasDbu: 352,
      
      // Job Dev (Zerado)
      jobDevInstance: 'D4AV4',
      jobDevNodes: 0,
      jobDevHorasVM: 0,
      jobDevHorasDbu: 0,
      
      // SQL
      sqlInstance: 'D16AV4',
      sqlNodes: 2, // 2 nós * 3.0 DBU = 6 DBUs (equivalente à regra antiga)
      sqlHorasVM: 0, // SQL Serverless no MVP não cobra VM
      sqlHorasDbu: 730,
      
      includePostgre: true,
      includeKeyVault: true
    },
    gabaritoOficial: 6223.25
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