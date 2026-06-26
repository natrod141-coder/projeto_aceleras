import { azure_prices } from '../data/prices';

export const calculateEstimate = (input) => {
    const { storageGB, instanceKey, nodes, hoursProd, sqlHours, jobHours } = input;
    const p = azure_prices;
    const inst = p.databricks.instances[instanceKey];
    const tier = p.databricks.tiers.premium;
  
    // Função auxiliar para Databricks (DBU + VM)
    const calcDB = (n, dbuPerHr, unitPrice, vmPrice, hrs) => 
      ((n * dbuPerHr * unitPrice) + (n * vmPrice)) * hrs;
  
    // --- AMBIENTE PROD ---
    const prodStorage = storageGB * p.storage.adls_gen2.hot_lrs_gb;
    const prodDB_All = calcDB(nodes, inst.dbu_per_hour, tier.all_purpose, inst.vm_price_per_hour, hoursProd);
    const prodDB_SQL = (6 * tier.sql_compute) * sqlHours; // Cluster X-Small = 6 DBU
    const prodDB_Job = calcDB(1, 1.5, tier.job_compute, 0.432, jobHours); // Exemplo D8AV4
    const prodTotal = prodStorage + prodDB_All + prodDB_SQL + prodDB_Job + 53.05 + 0.18; // +ADF + KV
  
    // --- AMBIENTE DEV (Regras do Oscar: 50% tempo, hardware menor) ---
    const devStorage = (storageGB * 0.1) * p.storage.adls_gen2.hot_lrs_gb; // CORREÇÃO AQUI
    const devDB = calcDB(1, 0.75, tier.all_purpose, 0.216, hoursProd * 0.5);
    const devTotal = devStorage + devDB + 12.21 + 0.18; // +ADF + KV
  
    return {
      prod: { total: prodTotal },
      dev: { total: devTotal },
      // Homologação: use sua lógica de 30% do tempo sobre o hardware de Prod
      totalMonthly: prodTotal + devTotal + (prodTotal * 0.3) 
    };
  };