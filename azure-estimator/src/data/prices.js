export const azure_prices = {
    metadata: {
      region: "East US",
      currency: "USD",
      last_updated: "2026-06-25"
    },
    
    storage: {
      adls_gen2: {
        // Redundância LRS, Camada Hot (padrão Dataside)
        hot_lrs_gb: 0.01221, 
        // Caso queira expandir para GRS no futuro, a estrutura já permite
        hot_grs_gb: 0.0458 
      }
    },
  
    databricks: {
      // Preço do DBU por Tier (Premium é o padrão dos casos reais)
      tiers: {
        premium: {
          all_purpose: 0.55, // Valor aproximado baseado no seu teste de $62.95
          job_compute: 0.15,
          sql_compute: 0.70
        }
      },
      
      // Mapeamento de instâncias conforme seu raciocínio de abstração
      instances: {
        "D4AV4": {
          dbu_per_hour: 0.75,
          vm_price_per_hour: 0.216 // Preço da infraestrutura Azure (East US)
        },
        "D8AV4": {
          dbu_per_hour: 1.5,
          vm_price_per_hour: 0.432
        },
        "D16AV4": {
          dbu_per_hour: 3.0,
          vm_price_per_hour: 0.864
        }
      }
    }
  };