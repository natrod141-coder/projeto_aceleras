// Valores calibrados contra gabaritos reais (AMAGGI, PRIO, Simpress)
// Última calibração: 2026-06-25
// Metodologia: engenharia reversa sobre gabaritos oficiais exportados pelos arquitetos Dataside
// Sistema de equações determinado (Databricks): cross-validado entre AMAGGI e PRIO
// Storage: modelo de 2 faixas calibrado nos únicos pontos disponíveis (10TB e 72TB)

export const REGIONS = {
  EAST_US:      { label: "East US (Leste dos EUA)",      currency: "USD" },
  WEST_US:      { label: "West US (Oeste dos EUA)",      currency: "USD" },
  BRAZIL_SOUTH: { label: "Brazil South (Sul do Brasil)", currency: "BRL" },
};

export const azure_prices = {

  storage: {
    adls_gen2: {
      // Preço implícito Hot LRS por GB/mês — inclui operações no padrão Dataside (8MB × 11 ops)
      // Modelado em 2 faixas derivadas dos casos reais:
      //   Faixa 1 (≤ 51.200 GB / ~50TB): $0.025122/GB — calibrado PRIO PROD (10TB → $251.22)
      //   Faixa 2 (> 51.200 GB):          $0.021580/GB — calibrado AMAGGI (72TB → $1553.74)
      // Limitação: taxa "all-in" (capacidade + operações juntas). Volumes <1TB podem divergir.
      hot_lrs_tiers: {
        EAST_US: [
          { until_gb: 51200, price: 0.025122 },    // até ~50 TB
          { until_gb: Infinity, price: 0.021580 },  // acima de 50 TB
        ],
        WEST_US: [
          { until_gb: 51200, price: 0.025122 },    // sem gabarito próprio — proxy East US
          { until_gb: Infinity, price: 0.021580 },
        ],
      },
      // Brazil South em BRL — preço all-in calibrado Simpress (10GB → R$296.99)
      // Aviso: Simpress usa operações menores (4MB × 100 ops), pode divergir em outros casos
      hot_lrs_gb_brl: {
        BRAZIL_SOUTH: 29.699, // R$/GB — calibrado Simpress
      },
    },
  },

  databricks: {
    tiers: {
      premium: {
        all_purpose: 0.55, // $/DBU-h — sistema 5 equações AMAGGI, cross-validado PRIO
        job_compute: 0.30, // $/DBU-h — sistema 5 equações AMAGGI, cross-validado PRIO
        // SQL Serverless: ver sql_serverless abaixo — fórmula própria, sem infra separada
      },
      standard: {
        job_compute: 0.15, // $/DBU-h — calibrado Simpress (Brazil South)
      },
    },

    instances: {
      // vm_price_per_hour: custo da infra Azure por hora (separado do DBU Databricks)
      // Derivados por engenharia reversa: vm = (custo_total - dbu_total) / (nodes × horasVM)
      D3V2:  { dbu_per_hour: 0.75, vm_price_per_hour: { WEST_US: 0.279 } },
      // derivado AMAGGI DEV (West US): (243.41 - 1*0.75*0.55*352) / (1*352) = 0.279
      DS3V2: { dbu_per_hour: 0.75, vm_price_per_hour: { BRAZIL_SOUTH: 0.0 } },
      // Simpress: VM embutida no preço DBU Standard — valor real pendente de gabarito separado
      D4AV4: { dbu_per_hour: 0.75, vm_price_per_hour: { EAST_US: 0.192 } },
      // derivado PRIO DEV (East US): (207.60 - 1*0.75*0.55*352) / (1*325) = 0.192
      D8AV4: { dbu_per_hour: 1.5,  vm_price_per_hour: { EAST_US: 0.384, WEST_US: 0.448 } },
      // EAST_US: derivado PRIO AP PROD (East US): (830.40 - 2*1.5*0.55*352) / (2*325) = 0.384
      // WEST_US: derivado AMAGGI Job (West US): (486.20 - 1*1.5*0.30*352) / (1*352) = 0.448
      //          cross-validado via PRIO Job (West US): (462.90 - 1*1.5*0.30*730) / (1*300) = 0.448 ✅
      D16AV4:{ dbu_per_hour: 3.0,  vm_price_per_hour: { EAST_US: 0.896, WEST_US: 0.896 } },
      // derivado AMAGGI AP PROD (West US): (896.19 - 2*3.0*0.55*352) / (2*352) — sem gabarito East US
    },

    // SQL Serverless: modelo de cobrança próprio
    // NÃO tem componente de VM — cobra exclusivamente por DBU × preço Serverless × horas
    // Derivado gabarito PRIO: $739.20 = 6 DBU × $0.70/DBU-h × 176h → preço = 0.6999.../DBU-h
    sql_serverless: {
      cluster_dbu: {
        XSMALL: 6,   // ← único tamanho com gabarito real (PRIO)
        SMALL:  12,  // padrão Azure, sem gabarito disponível para validar
        MEDIUM: 24,  // padrão Azure, sem gabarito disponível para validar
        LARGE:  48,  // padrão Azure, sem gabarito disponível para validar
      },
      price_per_dbu: {
        premium:  0.70, // $/DBU-h — derivado PRIO: 739.20 / (6 × 176) ≈ 0.6999
        standard: 0.36, // $/DBU-h — padrão Azure documentado, sem gabarito para validar
      },
    },
  },

  peripherals: {
    postgresql_flex_d2dsv5: { EAST_US: 212.74 }, // calibrado AMAGGI — inclui VM + storage SSD
    key_vault_fixed:        { EAST_US: 0.18, WEST_US: 0.18, BRAZIL_SOUTH: null },
    // Key Vault: valor fixo por ambiente ativo — não cobrar HOM quando HOM não existe
    adf_v2_per_activity: { EAST_US: null }, // Cortado do MVP — ver log de decisões no README
  },
};