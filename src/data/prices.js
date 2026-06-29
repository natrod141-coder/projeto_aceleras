// Valores calibrados contra gabaritos reais (AMAGGI, PRIO, Simpress)
// Última calibração: 2026-06-25
// IMPORTANTE: Operações de leitura/escrita assumem padrão Dataside (8MB x 11 ops)
// Desvios de volumetria muito pequena (<100GB) podem gerar divergência — documentado no README

export const REGIONS = {
  EAST_US:      { label: "East US (Leste dos EUA)",      currency: "USD" },
  WEST_US:      { label: "West US (Oeste dos EUA)",      currency: "USD" },
  BRAZIL_SOUTH: { label: "Brazil South (Sul do Brasil)", currency: "BRL" },
};

export const azure_prices = {

  storage: {
    adls_gen2: {
      // Preço base de capacidade Hot LRS por GB/mês
      // Operações fixadas no padrão Dataside — ver README
      hot_lrs_gb: {
        EAST_US:      0.02157972, // Calibrado: AMAGGI 72TB = $1553.74
        WEST_US:      0.02157972, // Sem gabarito próprio — assume East US como proxy
        BRAZIL_SOUTH: null,       // Em BRL: usar hot_lrs_gb_brl
      },
      hot_lrs_gb_brl: {
        BRAZIL_SOUTH: 29.699,     // Calibrado: Simpress 10GB = R$296.99
      },
    },
  },

  databricks: {
    tiers: {
      premium: {
        all_purpose: 0.55, // $/DBU — West US, calibrado AMAGGI
        job_compute: 0.30, // $/DBU — West US, calibrado AMAGGI
        sql_compute: 0.55, // $/DBU — West US, calibrado AMAGGI
      },
      standard: {
        job_compute: 0.15, // $/DBU — Brazil South, calibrado Simpress
      },
    },

    instances: {
      // vm_price_per_hour: custo da infra Azure por hora (separado do DBU)
      D3V2:  { dbu_per_hour: 0.75, vm_price_per_hour: { WEST_US: 0.279 } },
      DS3V2: { dbu_per_hour: 0.75, vm_price_per_hour: { BRAZIL_SOUTH: null } }, // a calibrar
      D4AV4: { dbu_per_hour: 0.75, vm_price_per_hour: { EAST_US: 0.216 } },
      D8AV4: { dbu_per_hour: 1.5,  vm_price_per_hour: { EAST_US: 0.448, WEST_US: 0.448 } },
      D16AV4:{ dbu_per_hour: 3.0,  vm_price_per_hour: { EAST_US: 0.896, WEST_US: 0.896 } },
    },
  },

  peripherals: {
    postgresql_flex_d2dsv5: { EAST_US: 212.74 }, // Calibrado: AMAGGI
    key_vault_fixed:        { EAST_US: 0.18, BRAZIL_SOUTH: null },
    adf_v2_per_activity:    { EAST_US: null }, // Cortado do MVP — ver log de decisões
  },
};