/**
 * Parser de texto — Azure Pricing Calculator / PDF / linguagem natural
 *
 * Pipeline: Texto → Parser → Objeto estruturado → (futuro: Validador) → Config da calculadora
 */

const PRESETS = {
  interativo: { horasVM: 352, horasDbu: 352 },
  comercial:  { horasVM: 352, horasDbu: 730 },
  mensal:     { horasVM: 730, horasDbu: 730 },
  continuo:   { horasVM: 744, horasDbu: 744 },
};

const defaultEnv = (instance, nodes, preset, override = false) => ({
  enabled:  true,
  override,
  instance,
  nodes,
  preset,
  horasVM:  PRESETS[preset].horasVM,
  horasDbu: PRESETS[preset].horasDbu,
});

const defaultWorkload = (instance = 'D8AV4', preset = 'comercial', region = 'WEST_US') => ({
  enabled: false,
  region,
  prod: defaultEnv(instance, 1, preset, true),
  hom:  defaultEnv(instance, 1, preset, false),
  dev:  defaultEnv(instance, 1, preset, false),
});

const defaultSqlEnv = (horas = 0) => ({
  enabled:     false,
  clusterSize: 'XSMALL',
  horas,
});

/** Configuração padrão completa — espelha INITIAL do App */
export function getDefaultConfig() {
  return {
    projectName:    '',
    storageRegion:  'EAST_US',
    tier:           'premium',
    storageGB:      0,
    storageEnabled: true,
    allPurpose: defaultWorkload('D3V2',  'interativo', 'WEST_US'),
    jobCompute: defaultWorkload('D8AV4', 'comercial',  'WEST_US'),
    sqlCompute: {
      enabled: false,
      prod: { ...defaultSqlEnv(176), enabled: true },
      hom:  defaultSqlEnv(44),
      dev:  defaultSqlEnv(88),
    },
    postgre:  false,
    keyVault: false,
  };
}

const emptyFound = () => ({
  projectName:    false,
  storageRegion:  false,
  storageGB:      false,
  storageEnabled: false,
  tier:           false,
  postgre:        false,
  keyVault:       false,
  allPurpose:     false,
  jobCompute:     false,
  sqlCompute:     false,
});

// ─── Helpers de extração ───────────────────────────────────────────────────────

const INSTANCE_MAP = [
  { re: /\bd16a\s*v4\b|\bd16av4\b/i,                       value: 'D16AV4' },
  { re: /\bd8a\s*v4\b|\bd8av4\b|\bd8s\s*v3\b/i, value: 'D8AV4'  },
  { re: /\bd4a\s*v4\b|\bd4av4\b/i,                         value: 'D4AV4'  },
  { re: /\bds3\s*v2\b|\bds3v2\b/i,                         value: 'DS3V2'  },
  { re: /\bd3\s*v2\b|\bd3v2\b/i,                           value: 'D3V2'   },
];

function matchInstance(text) {
  for (const { re, value } of INSTANCE_MAP) {
    if (re.test(text)) return value;
  }
  return null;
}

function matchRegion(text) {
  if (/brazil\s*south|brasil|south\s*brazil/i.test(text)) return 'BRAZIL_SOUTH';
  if (/east\s*us|leste\s*dos\s*eua/i.test(text))          return 'EAST_US';
  if (/west\s*us|oeste\s*dos\s*eua/i.test(text))          return 'WEST_US';
  return null;
}

function matchStorageGB(text) {
  const tb = text.match(/(\d+(?:[.,]\d+)?)\s*tb\b/i);
  if (tb) return Math.round(parseFloat(tb[1].replace(',', '.')) * 1024);

  const gb = text.match(/(\d+(?:[.,]\d+)?)\s*gb\b/i);
  if (gb) return Math.round(parseFloat(gb[1].replace(',', '.')));

  return null;
}

function matchHours(text) {
  const m = text.match(/(\d+)\s*h(?:oras?|ours?)?\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function matchNodes(text) {
  const m = text.match(/(\d+)\s*(?:n[oó]s?|nodes?)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function matchClusterSize(text) {
  const m = text.match(/\b(xsmall|small|medium|large)\b/i);
  return m ? m[1].toUpperCase() : null;
}

function hoursToPreset(horasVM, horasDbu) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (p.horasVM === horasVM && p.horasDbu === horasDbu) return key;
  }
  return 'custom';
}

function sectionSlice(text, patterns) {
  const lower = text.toLowerCase();
  for (const pat of patterns) {
    const idx = lower.search(pat);
    if (idx >= 0) {
      const rest = text.slice(idx);
      const nextSection = rest.slice(1).search(/\n\s*(?:azure |storage |postgresql|key vault|total\b)/i);
      return nextSection >= 0 ? rest.slice(0, nextSection + 1) : rest.slice(0, 800);
    }
  }
  return text;
}

// ─── Parser principal ───────────────────────────────────────────────────────────

/**
 * @returns {{ config: object, found: object, extracted: string[], warnings: string[] }}
 */
export function parseProject(text) {
  const config  = getDefaultConfig();
  const found   = emptyFound();
  const extracted = [];
  const warnings  = [];

  if (!text || !String(text).trim()) {
    warnings.push('Nenhum texto fornecido.');
    return { config, found, extracted, warnings };
  }

  const originalText = String(text);
  const lower = originalText.toLowerCase();

  // ── Nome do projeto ──
  const namePatterns = [
    /(?:estimate\s*name|nome\s*(?:do\s*)?projeto|project\s*name)\s*[:\-]\s*(.+)/i,
    /your\s*estimate\s*[:\-]\s*(.+)/i,
  ];
  for (const re of namePatterns) {
    const m = originalText.match(re);
    if (m?.[1]?.trim()) {
      config.projectName = m[1].trim().split('\n')[0].slice(0, 120);
      found.projectName = true;
      extracted.push(`Projeto: ${config.projectName}`);
      break;
    }
  }

  // ── Storage ──
  const storageSection = sectionSlice(originalText, [
    /storage\s*accounts?/i,
    /data\s*lake\s*storage/i,
    /adls\s*gen\s*2/i,
  ]);
  const storageGB = matchStorageGB(storageSection) ?? matchStorageGB(originalText);
  if (storageGB != null && storageGB > 0) {
    config.storageGB = storageGB;
    config.storageEnabled = true;
    found.storageGB = true;
    found.storageEnabled = true;
    const label = storageGB >= 1024
      ? `${(storageGB / 1024).toFixed(1)} TB`
      : `${storageGB} GB`;
    extracted.push(`Storage: ${label}`);
  }

  const storageRegion = matchRegion(storageSection) ?? matchRegion(originalText);
  if (storageRegion) {
    config.storageRegion = storageRegion;
    found.storageRegion = true;
    if (!extracted.some(e => e.startsWith('Região'))) {
      extracted.push(`Região Storage: ${regionLabel(storageRegion)}`);
    }
  }

  // ── Tier ──
  if (/\bstandard\b/i.test(originalText) && !/\bpremium\b/i.test(originalText)) {
    config.tier = 'standard';
    found.tier = true;
    extracted.push('Tier: Standard');
  } else if (/\bpremium\b/i.test(originalText)) {
    config.tier = 'premium';
    found.tier = true;
    extracted.push('Tier: Premium');
  }

  // ── All-Purpose Compute ──
  const apSection = sectionSlice(originalText, [
    /all[\s-]?purpose\s*compute/i,
    /all[\s-]?purpose\b/i,
    /databricks[\s\S]{0,40}all/i,
  ]);
  const apDetected = /all[\s-]?purpose/i.test(apSection) ||
    (/databricks/i.test(originalText) && /all[\s-]?purpose/i.test(originalText));

  if (apDetected || matchInstance(apSection) || matchHours(apSection)) {
    config.allPurpose.enabled = true;
    found.allPurpose = true;
    extracted.push('All-Purpose Compute');

    const apRegion = matchRegion(apSection);
    if (apRegion && apRegion !== 'BRAZIL_SOUTH') {
      config.allPurpose.region = apRegion;
    } else if (apRegion === 'BRAZIL_SOUTH') {
      config.allPurpose.region = 'EAST_US';
      warnings.push('All-Purpose: Brazil South não suportado para compute — usando East US.');
    }

    const instance = matchInstance(apSection);
    if (instance) config.allPurpose.prod.instance = instance;

    const nodes = matchNodes(apSection);
    if (nodes) config.allPurpose.prod.nodes = nodes;

    const horas = matchHours(apSection);
    if (horas) {
      config.allPurpose.prod.horasVM  = horas;
      config.allPurpose.prod.horasDbu = horas;
      config.allPurpose.prod.preset   = hoursToPreset(horas, horas);
    }
  }

  // ── Job Compute ──
  const jobSection = sectionSlice(originalText, [
    /jobs?\s*compute/i,
    /job\s*cluster/i,
    /databricks[\s\S]{0,40}job/i,
  ]);
  const jobDetected = /jobs?\s*compute/i.test(jobSection) ||
    (/databricks/i.test(originalText) && /jobs?\s*compute/i.test(originalText));

  if (jobDetected || (matchInstance(jobSection) && !apDetected)) {
    config.jobCompute.enabled = true;
    found.jobCompute = true;
    extracted.push('Job Compute');

    const jobRegion = matchRegion(jobSection);
    if (jobRegion && jobRegion !== 'BRAZIL_SOUTH') {
      config.jobCompute.region = jobRegion;
    } else if (jobRegion === 'BRAZIL_SOUTH') {
      config.jobCompute.region = 'WEST_US';
      warnings.push('Job Compute: Brazil South não suportado para compute — usando West US.');
    }

    const instance = matchInstance(jobSection);
    if (instance) config.jobCompute.prod.instance = instance;

    const nodes = matchNodes(jobSection);
    if (nodes) config.jobCompute.prod.nodes = nodes;

    const horas = matchHours(jobSection);
    if (horas) {
      config.jobCompute.prod.horasVM  = horas;
      config.jobCompute.prod.horasDbu = horas;
      config.jobCompute.prod.preset   = hoursToPreset(horas, horas);
    }
  }

  // ── SQL Serverless ──
  const sqlSection = sectionSlice(originalText, [
    /sql\s*serverless/i,
    /serverless\s*sql/i,
    /databricks\s*sql/i,
    /sql\s*analytics/i,
    /sql\s*compute/i,
  ]);
  if (/sql\s*serverless|serverless\s*sql|databricks\s*sql|sql\s*analytics|sql\s*compute/i.test(sqlSection)) {
    config.sqlCompute.enabled = true;
    config.sqlCompute.prod.enabled = true;
    found.sqlCompute = true;
    extracted.push('SQL Serverless');

    const size = matchClusterSize(sqlSection);
    if (size) config.sqlCompute.prod.clusterSize = size;

    const horas = matchHours(sqlSection);
    if (horas != null) config.sqlCompute.prod.horas = horas;
  }

  // ── PostgreSQL ──
  if (/postgres(?:ql)?/i.test(originalText)) {
    config.postgre = true;
    found.postgre = true;
    extracted.push('PostgreSQL Flexible');
  }

  // ── Key Vault ──
  if (/key\s*vault/i.test(originalText)) {
    config.keyVault = true;
    found.keyVault = true;
    extracted.push('Key Vault');
  }

  // ── Linguagem natural: pipelines + frequência ──
  const pipelineMatch = lower.match(/(\d+)\s*pipeline/i);
  if (pipelineMatch) {
    extracted.push(`Pipelines: ${pipelineMatch[1]}`);
  }

  let freqHours = null;
  if (/hora|horária|hourly/i.test(lower))           freqHours = 730;
  else if (/diári[ao]|daily/i.test(lower))          freqHours = 352;
  else if (/semanal|weekly/i.test(lower))           freqHours = 96;
  else if (/mensal|monthly/i.test(lower))           freqHours = 24;

  if (freqHours && found.jobCompute && !matchHours(jobSection)) {
    config.jobCompute.prod.horasVM  = freqHours;
    config.jobCompute.prod.horasDbu = freqHours;
    config.jobCompute.prod.preset   = hoursToPreset(freqHours, freqHours);
  }

  // ── Avisos informativos ──
  if (!found.storageGB) {
    warnings.push('Capacidade de armazenamento não encontrada.');
  }
  if (!found.storageRegion) {
    warnings.push('Região não identificada — mantendo padrão.');
  }

  return { config, found, extracted, warnings };
}

function regionLabel(value) {
  const map = {
    EAST_US:      'East US',
    WEST_US:      'West US',
    BRAZIL_SOUTH: 'Brazil South',
  };
  return map[value] ?? value;
}
