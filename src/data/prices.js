export const azure_prices = {
    metadata: {
      region: "East US / West US", 
      currency: "USD",
      last_updated: "2026-06-26"
    },
    
    storage: {
      adls_gen2: {
        // Valor calibrado: $1.553,74 / 72.000 GB
        hot_lrs_gb: 0.02157972, 
      }
    },

    peripherals: {
      postgresql_flex: 212.74, 
      key_vault_fixed: 0.18,
      // ADF removido do MVP conforme alinhamento com Natália
    },
  
    databricks: {
      tiers: {
        premium: {
          all_purpose: 0.55,
          job_compute: 0.30, // Ajustado para compensar a discrepância de horas VM vs DBU
          sql_compute: 0.55  // Valor unitário para instâncias D16AV4
        }
      },
      
      instances: {
        "D3V2": {
          dbu_per_hour: 0.75,
          vm_price_per_hour: 0.279 // Infra base para bater os $243,41 (352h)
        },
        "D4AV4": {
          dbu_per_hour: 0.75,
          vm_price_per_hour: 0.216 
        },
        "D8AV4": {
          dbu_per_hour: 1.5,
          vm_price_per_hour: 0.448
        },
        "D16AV4": {
          dbu_per_hour: 3.0,
          vm_price_per_hour: 0.896
        }
      }
    }
};