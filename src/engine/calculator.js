import { azure_prices } from '../data/pricesTable.js';

/**
 * Calcula estimativa de custo Azure + Databricks para UM ambiente por chamada.
 * O App.jsx chama esta função 3 vezes (prod, hom, dev) e soma os resultados.
 *
 * @param {object} input
 * @param {number} input.storageGB         - Capacidade total em GB (0 para envs sem storage)
 * @param {string} input.storageRegion     - Região do storage (ex: "EAST_US")
 *
 * IMPORTANTE: All-Purpose e Job Compute têm cada um sua PRÓPRIA região de compute.
 * Casos reais (ex: PRIO) mostram AP e Job rodando em regiões diferentes dentro do
 * mesmo projeto — forçar uma única "computeRegion" global gerava divergência
 * artificial na validação. Ver ORGANIZACAO.md / validate.mjs para o caso documentado.
 * @param {string} input.apComputeRegion   - Região de compute do All-Purpose (ex: "EAST_US")
 * @param {string} input.jobComputeRegion  - Região de compute do Job Compute (ex: "WEST_US")
 * @param {string} input.tier              - Tier Databricks: "premium" | "standard"
 *
 * @param {string} input.apProdInstance    - Instância All-Purpose (deste ambiente)
 * @param {number} input.apProdNodes       - Número de nós All-Purpose
 * @param {number} input.apProdHorasVM     - Horas de VM All-Purpose
 * @param {number} input.apProdHorasDbu    - Horas de DBU All-Purpose
 *
 * @param {string} input.jobProdInstance   - Instância Job Compute (deste ambiente)
 * @param {number} input.jobProdNodes      - Número de nós Job Compute
 * @param {number} input.jobProdHorasVM    - Horas de VM Job Compute
 * @param {number} input.jobProdHorasDbu   - Horas de DBU Job Compute
 *
 * SQL Serverless — fórmula própria, SEM componente de VM (não depende de região de compute):
 * @param {string} input.sqlClusterSize    - Tamanho: "XSMALL"|"SMALL"|"MEDIUM"|"LARGE"
 * @param {number} input.sqlHoras          - Horas de execução SQL Serverless
 *
 * @param {boolean} input.includePostgre   - Incluir PostgreSQL? (só em PROD)
 * @param {boolean} input.includeKeyVault  - Incluir Key Vault para ESTE ambiente?
 *                                           O App.jsx decide por env se deve incluir ou não.
 */
export const calculateEstimate = (input) => {
  const {
    storageGB, storageRegion, tier,
    // Regiões de compute — uma por workload (ver nota acima). Aceita computeRegion
    // como fallback legado para não quebrar chamadas antigas de teste/script.
    apComputeRegion  = input.computeRegion,
    jobComputeRegion = input.computeRegion,
    // All-Purpose (slot único por chamada — o App.jsx passa o env correto aqui)
    apProdInstance = 'D8AV4', apProdNodes = 0, apProdHorasVM = 0, apProdHorasDbu = 0,
    // Job Compute (idem)
    jobProdInstance = 'D8AV4', jobProdNodes = 0, jobProdHorasVM = 0, jobProdHorasDbu = 0,
    // SQL Serverless — sem VM
    sqlClusterSize = 'XSMALL',
    sqlHoras       = 0,
    // Periféricos
    includePostgre  = false,
    includeKeyVault = false,
  } = input;

  const p    = azure_prices;
  const t    = p.databricks.tiers[tier];
  const inst = p.databricks.instances;
  const warnings = [];

  // Helper: vm_price_per_hour para uma região de compute específica (por workload)
  const vmPrice = (instanceKey, region) => {
    const prices = inst[instanceKey]?.vm_price_per_hour;
    if (!prices || prices[region] == null) {
      warnings.push(`Preço de VM não encontrado para ${instanceKey} em ${region}`);
      return 0;
    }
    return prices[region];
  };

  // Helper: dbu_per_hour da instância
  const dbuRate = (instanceKey) => inst[instanceKey]?.dbu_per_hour ?? 0;

  // ── 1. Storage — modelo de faixas (não-linear) ────────────────────────────
  const isBrazil = storageRegion === 'BRAZIL_SOUTH';
  let storage = 0;
  if (isBrazil) {
    const rate = p.storage.adls_gen2.hot_lrs_gb_brl[storageRegion] ?? 0;
    storage = storageGB * rate;
  } else {
    const tiers = p.storage.adls_gen2.hot_lrs_tiers[storageRegion] ?? [];
    let remaining = storageGB, floor = 0;
    for (const tier of tiers) {
      const chunk = Math.min(remaining, tier.until_gb - floor);
      if (chunk <= 0) break;
      storage   += chunk * tier.price;
      remaining -= chunk;
      floor      = tier.until_gb;
    }
  }

  // ── 2. All-Purpose Compute (região própria: apComputeRegion) ──────────────
  const apProd = (apProdNodes * dbuRate(apProdInstance) * t.all_purpose * apProdHorasDbu)
               + (apProdNodes * vmPrice(apProdInstance, apComputeRegion) * apProdHorasVM);

  // ── 3. Job Compute (região própria: jobComputeRegion) ─────────────────────
  const jobProd = (jobProdNodes * dbuRate(jobProdInstance) * t.job_compute * jobProdHorasDbu)
                + (jobProdNodes * vmPrice(jobProdInstance, jobComputeRegion) * jobProdHorasVM);

  // ── 4. SQL Serverless — fórmula própria, SEM componente de VM ────────────
  // custo = DBU_fixo_por_tamanho × preço_DBU_serverless × horas
  // Gabarito PRIO: $739.20 = 6 DBU × $0.70/DBU-h × 176h
  const sqlDbu      = p.databricks.sql_serverless.cluster_dbu[sqlClusterSize] ?? 0;
  const sqlDbuPrice = p.databricks.sql_serverless.price_per_dbu[tier]         ?? 0;
  const sql         = sqlDbu * sqlDbuPrice * sqlHoras;

  // ── 5. Periféricos opcionais ──────────────────────────────────────────────
  const postgre = includePostgre
    ? (p.peripherals.postgresql_flex_d2dsv5[storageRegion] ?? 0)
    : 0;

  // Key Vault: $0.18 fixo se este ambiente deve ter KV — decisão do App.jsx
  const kvPricePerEnv = p.peripherals.key_vault_fixed[storageRegion] ?? 0;
  const keyVault      = includeKeyVault ? kvPricePerEnv : 0;

  const total = storage + apProd + jobProd + sql + postgre + keyVault;

  // ── Moeda ──────────────────────────────────────────────────────────────
  // Storage segue storageRegion (pode ser BRL). Compute (AP/Job/SQL) e
  // periféricos são sempre precificados em USD no MVP (não há tabela de
  // compute em BRL). Antes, quando storageRegion era BRAZIL_SOUTH, o total
  // inteiro era rotulado "BRL" mesmo somando valores em USD por baixo —
  // agora isso é separado explicitamente para nunca misturar moeda num
  // único número.
  const computeUSD    = apProd + jobProd + sql + postgre + keyVault;
  const totalsByCurrency = {
    USD: computeUSD + (isBrazil ? 0 : storage),
    BRL: isBrazil ? storage : 0,
  };
  const mixedCurrency = isBrazil && computeUSD > 0.001;
  if (mixedCurrency) {
    warnings.push(
      'Storage em Brazil South (BRL) combinado com compute em região USD — ' +
      'totais reportados separadamente por moeda, não somados.'
    );
  }

  return {
    lines: { storage, apProd, jobProd, sql, postgre, keyVault },
    total,                          // mantido por compatibilidade (validate.mjs, casos sem BR)
    totalsByCurrency,                // { USD, BRL } — use isto na UI para nunca somar moedas diferentes
    mixedCurrency,
    currency: isBrazil ? 'BRL' : 'USD', // mantido por compatibilidade quando NÃO há mistura
    warnings,
  };
};