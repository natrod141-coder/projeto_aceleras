import { azure_prices } from '../data/prices';

export const calculateEstimate = (input) => {
    const { storageGB, nodesProd, hoursProd, sqlHours, jobHoursProd } = input;
    const p = azure_prices;
    const t = p.databricks.tiers.premium;
    const instD8 = p.databricks.instances["D8AV4"];
    const instD16 = p.databricks.instances["D16AV4"];
    const instD3 = p.databricks.instances["D3V2"];

    // 1. Storage (72TB LRS)
    const storageCost = storageGB * p.storage.adls_gen2.hot_lrs_gb;

    // 2. Databricks All-Purpose (DEV e PROD)
    const dbDev = ((1 * instD3.dbu_per_hour * t.all_purpose) + (1 * instD3.vm_price_per_hour)) * hoursProd;
    const dbProd = ((nodesProd * instD8.dbu_per_hour * t.all_purpose) + (nodesProd * instD8.vm_price_per_hour)) * hoursProd;

    // 3. Databricks Jobs (DEV e PROD) - Ajustado para lógica de horas DBU vs VM da AMAGGI
    const jobDev = ((1 * instD8.dbu_per_hour * t.job_compute * (730/352)) + (1 * instD8.vm_price_per_hour)) * 352;
    const jobProd = ((1 * instD16.dbu_per_hour * t.job_compute * (730/352)) + (1 * instD16.vm_price_per_hour)) * 352;

    // 4. Databricks SQL e Periféricos
    const sqlCost = ((1 * instD16.dbu_per_hour * t.sql_compute) + (1 * instD16.vm_price_per_hour)) * sqlHours;
    const postgre = p.peripherals.postgresql_flex;

    const totalCalculado = storageCost + dbDev + dbProd + jobDev + jobProd + sqlCost + postgre;

    return {
        lines: {
            storage: storageCost,
            dbDev,
            dbProd,
            jobDev,
            jobProd,
            sql: sqlCost,
            postgre
        },
        totalCalculado
    };
};