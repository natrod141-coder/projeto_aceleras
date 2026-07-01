import { azure_prices } from '../data/prices.js';

/**
 * Calcula estimativa de custo Azure + Databricks.
 *
 * @param {object} input
 * @param {number} input.storageGB        - Capacidade total em GB
 * @param {string} input.storageRegion    - Região do storage (ex: "EAST_US")
 * @param {string} input.computeRegion    - Região do Databricks/VMs (ex: "WEST_US")
 * @param {string} input.tier             - Tier Databricks: "premium" | "standard"
 *
 * @param {string} input.apDevInstance    - Instância All-Purpose DEV (ex: "D3V2")
 * @param {number} input.apDevNodes       - Número de nós All-Purpose DEV
 * @param {number} input.apDevHorasVM     - Horas de VM All-Purpose DEV
 * @param {number} input.apDevHorasDbu    - Horas de DBU All-Purpose DEV
 *
 * @param {string} input.apProdInstance   - Instância All-Purpose PROD
 * @param {number} input.apProdNodes      - Número de nós All-Purpose PROD
 * @param {number} input.apProdHorasVM    - Horas de VM All-Purpose PROD
 * @param {number} input.apProdHorasDbu   - Horas de DBU All-Purpose PROD
 *
 * @param {string} input.jobDevInstance   - Instância Job Compute DEV
 * @param {number} input.jobDevNodes      - Número de nós Job DEV
 * @param {number} input.jobDevHorasVM    - Horas de VM Job DEV
 * @param {number} input.jobDevHorasDbu   - Horas de DBU Job DEV
 *
 * @param {string} input.jobProdInstance  - Instância Job Compute PROD
 * @param {number} input.jobProdNodes     - Número de nós Job PROD
 * @param {number} input.jobProdHorasVM   - Horas de VM Job PROD
 * @param {number} input.jobProdHorasDbu  - Horas de DBU Job PROD
 *
 * @param {string} input.sqlInstance      - Instância SQL Serverless
 * @param {number} input.sqlNodes         - Número de nós SQL
 * @param {number} input.sqlHorasVM       - Horas de VM SQL
 * @param {number} input.sqlHorasDbu      - Horas de DBU SQL
 *
 * @param {boolean} input.includePostgre  - Incluir PostgreSQL?
 * @param {boolean} input.includeKeyVault - Incluir Key Vault?
 */
export const calculateEstimate = (input) => {
  const {
    storageGB, storageRegion, computeRegion, tier,
    apDevInstance,  apDevNodes,  apDevHorasVM,  apDevHorasDbu,
    apProdInstance, apProdNodes, apProdHorasVM, apProdHorasDbu,
    jobDevInstance,  jobDevNodes,  jobDevHorasVM,  jobDevHorasDbu,
    jobProdInstance, jobProdNodes, jobProdHorasVM, jobProdHorasDbu,
    sqlInstance, sqlNodes, sqlHorasVM, sqlHorasDbu,
    includePostgre  = false,
    includeKeyVault = false,
  } = input;

  const p  = azure_prices;
  const t  = p.databricks.tiers[tier];
  const inst = p.databricks.instances;

  // Helper: retorna vm_price_per_hour para a região de compute
  const vmPrice = (instanceKey) => {
    const prices = inst[instanceKey]?.vm_price_per_hour;
    if (!prices || prices[computeRegion] == null) {
      console.warn(`Preço de VM não encontrado para ${instanceKey} em ${computeRegion}`);
      return 0;
    }
    return prices[computeRegion];
  };

  // Helper: retorna dbu_per_hour da instância
  const dbuRate = (instanceKey) => inst[instanceKey]?.dbu_per_hour ?? 0;

  // 1. Storage
  const isBrazil = storageRegion === 'BRAZIL_SOUTH';
  const storagePricePerGB = isBrazil
    ? p.storage.adls_gen2.hot_lrs_gb_brl[storageRegion]
    : p.storage.adls_gen2.hot_lrs_gb[storageRegion];
  const storage = storageGB * (storagePricePerGB ?? 0);

  // 2. All-Purpose DEV
const apDev = (apDevNodes * dbuRate(apDevInstance) * (t.all_purpose ?? 0) * apDevHorasDbu)
+ (apDevNodes * vmPrice(apDevInstance) * apDevHorasVM);

// 3. All-Purpose PROD
const apProd = (apProdNodes * dbuRate(apProdInstance) * (t.all_purpose ?? 0) * apProdHorasDbu)
+ (apProdNodes * vmPrice(apProdInstance) * apProdHorasVM);

  // 4. Job Compute DEV
  const jobDev = (jobDevNodes * dbuRate(jobDevInstance) * t.job_compute * jobDevHorasDbu)
               + (jobDevNodes * vmPrice(jobDevInstance) * jobDevHorasVM);

  // 5. Job Compute PROD
  const jobProd = (jobProdNodes * dbuRate(jobProdInstance) * t.job_compute * jobProdHorasDbu)
                + (jobProdNodes * vmPrice(jobProdInstance) * jobProdHorasVM);

  // 6. SQL Serverless
const sql = (sqlNodes * dbuRate(sqlInstance) * (t.sql_compute ?? 0) * sqlHorasDbu)
+ (sqlNodes * vmPrice(sqlInstance) * sqlHorasVM);          

  // 7. Periféricos opcionais
  const postgre   = includePostgre
    ? (p.peripherals.postgresql_flex_d2dsv5[computeRegion] ?? 0)
    : 0;
  const keyVault  = includeKeyVault
    ? (p.peripherals.key_vault_fixed[computeRegion] ?? 0)
    : 0;

  const total = storage + apDev + apProd + jobDev + jobProd + sql + postgre + keyVault;

  return {
    lines: { storage, apDev, apProd, jobDev, jobProd, sql, postgre, keyVault },
    total,
    currency: isBrazil ? 'BRL' : 'USD',
  };
};