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

const REGEX = {
  nodesLabel:  /(?:nodes?|n[oó]s?)\s*:\s*(\d+)/i,
  nodesValue:  /(\d+)\s*(?:nodes?|n[oó]s?)\b/i,
  hoursLabel:  /(?:horas?\s*(?:de\s*execu[cç][aã]o|vm|dbu)?|hours?)\s*[:\-]?\s*(\d+)/i,
  hoursValue:  /(\d+)\s*(?:h(?:oras?|ours?)?)\b/i,
  storageTB:   /(\d+(?:[.,]\d+)?)\s*tb\b/i,
  storageGB:   /(\d+(?:[.,]\d+)?)\s*gb(?!\s*ram)\b/i,
  storageRAM:  /\d+(?:[.,]\d+)?\s*gb\s*ram\b/gi,
  sqlWarehouse:   /sql\s*warehouse/i,
  sqlServerless:  /sql\s*serverless|serverless\s*sql/i,
  sqlDatabricks:  /databricks\s*sql/i,
  sqlAnalytics:   /sql\s*analytics/i,
  sqlCompute:     /sql\s*compute/i,
  databricksPremium:  /(?:databricks\s+)?premium(?:\s+tier)?|premium(?:\s+tier)?(?:\s+databricks)?/i,
  databricksStandard: /(?:databricks\s+)?standard(?:\s+tier)?|standard(?:\s+tier)?(?:\s+databricks)?/i,
  regionBrazilSouth: /brazil\s*south|brasil\s*sul|south\s*brazil|\bbrasil\b/i,
  regionEastUs:      /east\s*us|leste\s*dos\s*eua/i,
  regionWestUs:      /west\s*us|oeste\s*dos\s*eua/i,
  allPurpose:     /all[\s-]?purpose(?:\s*compute)?/i,
  jobCompute:     /jobs?\s*compute/i,
  jobCluster:     /job\s*cluster/i,
  postgre:        /postgres(?:ql)?/i,
  keyVault:       /key\s*vault/i,
  pipeline:       /(\d+)\s*pipeline/i,
  clusterSize:    /\b(xsmall|small|medium|large)\b/i,
  projectName:    /(?:estimate\s*name|nome\s*(?:do\s*)?projeto|project\s*name)\s*[:\-]\s*(.+)/i,
  yourEstimate:   /your\s*estimate\s*[:\-]\s*(.+)/i,
  storageSection: /storage\s*accounts?|data\s*lake\s*storage|adls\s*gen\s*2/i,
  freqHourly:     /hora|horária|hourly/i,
  freqDaily:      /diári[ao]|daily/i,
  freqWeekly:     /semanal|weekly/i,
  freqMonthly:    /mensal|monthly/i,
  instanceD16:    /\bd16a\s*v4\b|\bd16av4\b/i,
  instanceD8:     /\bd8a\s*v4\b|\bd8av4\b|\bd8s\s*v3\b/i,
  instanceD4:     /\bd4a\s*v4\b|\bd4av4\b/i,
  instanceDS3:    /\bds3\s*v2\b|\bds3v2\b/i,
  instanceD3:     /\bd3\s*v2\b|\bd3v2\b/i,
};

const RESOURCE_DEFS = [
  { id: 'storage',     label: 'Storage',             mention: (t) => REGEX.storageSection.test(t) || REGEX.storageTB.test(t) || REGEX.storageGB.test(t) || /\bstorage\b/i.test(t) },
  { id: 'allPurpose',  label: 'All Purpose Compute', mention: (t) => REGEX.allPurpose.test(t) },
  { id: 'jobCompute',  label: 'Jobs Compute',        mention: (t) => REGEX.jobCompute.test(t) || REGEX.jobCluster.test(t) },
  { id: 'sqlCompute',  label: 'SQL Serverless',      mention: (t) => REGEX.sqlServerless.test(t) || REGEX.sqlWarehouse.test(t) || REGEX.sqlDatabricks.test(t) || REGEX.sqlAnalytics.test(t) || REGEX.sqlCompute.test(t) },
  { id: 'postgre',     label: 'PostgreSQL',          mention: (t) => REGEX.postgre.test(t) },
  { id: 'keyVault',    label: 'Key Vault',           mention: (t) => REGEX.keyVault.test(t) },
];

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

function matchInstance(text) {
  try {
    if (!text) return null;
    if (REGEX.instanceD16.test(text)) return 'D16AV4';
    if (REGEX.instanceD8.test(text))  return 'D8AV4';
    if (REGEX.instanceD4.test(text))  return 'D4AV4';
    if (REGEX.instanceDS3.test(text)) return 'DS3V2';
    if (REGEX.instanceD3.test(text))  return 'D3V2';
    return null;
  } catch {
    return null;
  }
}

function matchRegion(text) {
  try {
    if (!text) return null;
    if (REGEX.regionBrazilSouth.test(text)) return 'BRAZIL_SOUTH';
    if (REGEX.regionEastUs.test(text))      return 'EAST_US';
    if (REGEX.regionWestUs.test(text))      return 'WEST_US';
    return null;
  } catch {
    return null;
  }
}

function matchStorageGB(text) {
  try {
    if (!text) return null;
    const cleaned = String(text).replace(REGEX.storageRAM, '');

    const tb = cleaned.match(REGEX.storageTB);
    if (tb) return Math.round(parseFloat(tb[1].replace(',', '.')) * 1024);

    const gb = cleaned.match(REGEX.storageGB);
    if (gb) return Math.round(parseFloat(gb[1].replace(',', '.')));

    return null;
  } catch {
    return null;
  }
}

function matchHours(text) {
  try {
    if (!text) return null;
    const m = text.match(REGEX.hoursLabel) || text.match(REGEX.hoursValue);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function matchNodes(text) {
  try {
    if (!text) return null;
    const m = text.match(REGEX.nodesLabel) || text.match(REGEX.nodesValue);
    return m ? parseInt(m[1], 10) : null;
  } catch {
    return null;
  }
}

function matchClusterSize(text) {
  try {
    if (!text) return null;
    const m = text.match(REGEX.clusterSize);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

function hoursToPreset(horasVM, horasDbu) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (p.horasVM === horasVM && p.horasDbu === horasDbu) return key;
  }
  return 'custom';
}

function sectionSlice(text, patterns) {
  try {
    if (!text) return '';
    const blocks = text.split(/(?:\n\s*\n)|(?=\n\s*\d+\.\s+)/);

    for (const block of blocks) {
      const lower = block.toLowerCase();
      for (const pat of patterns) {
        if (lower.search(pat) >= 0) return block;
      }
    }
    return '';
  } catch {
    return '';
  }
}

function matchesSql(text) {
  try {
    if (!text) return false;
    return REGEX.sqlServerless.test(text) ||
      REGEX.sqlWarehouse.test(text) ||
      REGEX.sqlDatabricks.test(text) ||
      REGEX.sqlAnalytics.test(text) ||
      REGEX.sqlCompute.test(text);
  } catch {
    return false;
  }
}

function applyWorkloadFields(workload, section, globalText) {
  const source = section || globalText;
  const instance = matchInstance(source);
  if (instance) workload.prod.instance = instance;

  const nodes = matchNodes(source);
  if (nodes) workload.prod.nodes = nodes;

  const horas = matchHours(source);
  if (horas != null) {
    workload.prod.horasVM  = horas;
    workload.prod.horasDbu = horas;
    workload.prod.preset   = hoursToPreset(horas, horas);
  }
}

/** Monta listas de recursos encontrados e não encontrados para o resumo da UI */
function buildResourceSummary(text, found) {
  const foundFlags = {
    storage:    !!(found.storageGB || found.storageEnabled),
    allPurpose: !!found.allPurpose,
    jobCompute: !!found.jobCompute,
    sqlCompute: !!found.sqlCompute,
    postgre:    !!found.postgre,
    keyVault:   !!found.keyVault,
  };

  const foundList    = [];
  const notFoundList = [];

  for (const r of RESOURCE_DEFS) {
    if (foundFlags[r.id]) {
      foundList.push(r.label);
    } else if (r.mention(text)) {
      notFoundList.push(r.label);
    }
  }

  return { found: foundList, notFound: notFoundList };
}

function regionLabel(value) {
  const map = {
    EAST_US:      'East US',
    WEST_US:      'West US',
    BRAZIL_SOUTH: 'Brazil South',
  };
  return map[value] ?? value;
}

// ─── Parser principal ───────────────────────────────────────────────────────────

/**
 * @returns {{ config: object, found: object, extracted: string[], warnings: string[], resourceSummary: { found: string[], notFound: string[] } }}
 */
export function parseProject(text) {
  const config    = getDefaultConfig();
  const found     = emptyFound();
  const extracted = [];
  const warnings  = [];

  if (!text || !String(text).trim()) {
    warnings.push('Nenhum texto fornecido.');
    return { config, found, extracted, warnings, resourceSummary: { found: [], notFound: [] } };
  }

  const originalText = String(text);
  const lower = originalText.toLowerCase();

  // ── Nome do projeto ──
  const nameMatch = originalText.match(REGEX.projectName) ?? originalText.match(REGEX.yourEstimate);
  if (nameMatch?.[1]?.trim()) {
    config.projectName = nameMatch[1].trim().split('\n')[0].slice(0, 120);
    found.projectName = true;
    extracted.push(`Projeto: ${config.projectName}`);
  }

  // ── Storage ──
  const storageSection = sectionSlice(originalText, [REGEX.storageSection]) || originalText;
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
  const hasPremium  = REGEX.databricksPremium.test(originalText);
  const hasStandard = REGEX.databricksStandard.test(originalText);
  if (hasStandard && !hasPremium) {
    config.tier = 'standard';
    found.tier = true;
    extracted.push('Tier: Standard');
  } else if (hasPremium) {
    config.tier = 'premium';
    found.tier = true;
    extracted.push('Tier: Premium');
  }

  // ── All-Purpose Compute ──
  const apSection = sectionSlice(originalText, [REGEX.allPurpose]);
  const apMentioned = REGEX.allPurpose.test(originalText);
  const apHasData = apSection
    ? (matchInstance(apSection) != null || matchNodes(apSection) != null || matchHours(apSection) != null)
    : false;

  if (apMentioned || apHasData) {
    config.allPurpose.enabled = true;
    found.allPurpose = true;
    extracted.push('All-Purpose Compute');

    const apRegion = matchRegion(apSection || originalText);
    if (apRegion && apRegion !== 'BRAZIL_SOUTH') {
      config.allPurpose.region = apRegion;
    } else if (apRegion === 'BRAZIL_SOUTH') {
      config.allPurpose.region = 'EAST_US';
      warnings.push('All-Purpose: Brazil South não suportado para compute — usando East US.');
    }

    applyWorkloadFields(config.allPurpose, apSection, originalText);
  }

  // ── Job Compute ──
  const jobSection = sectionSlice(originalText, [REGEX.jobCompute, REGEX.jobCluster]);
  const jobMentioned = REGEX.jobCompute.test(originalText) || REGEX.jobCluster.test(originalText);
  const jobHasData = jobSection
    ? (matchInstance(jobSection) != null || matchNodes(jobSection) != null || matchHours(jobSection) != null || matchRegion(jobSection) != null)
    : false;

  if (jobMentioned || jobHasData) {
    config.jobCompute.enabled = true;
    found.jobCompute = true;
    extracted.push('Job Compute');

    const jobRegion = matchRegion(jobSection || originalText);
    if (jobRegion && jobRegion !== 'BRAZIL_SOUTH') {
      config.jobCompute.region = jobRegion;
    } else if (jobRegion === 'BRAZIL_SOUTH') {
      config.jobCompute.region = 'WEST_US';
      warnings.push('Job Compute: Brazil South não suportado para compute — usando West US.');
    }

    applyWorkloadFields(config.jobCompute, jobSection, originalText);
  }

  // ── SQL Serverless ──
  const sqlSection = sectionSlice(originalText, [
    REGEX.sqlServerless,
    REGEX.sqlWarehouse,
    REGEX.sqlDatabricks,
    REGEX.sqlAnalytics,
    REGEX.sqlCompute,
  ]);
  if (matchesSql(sqlSection) || matchesSql(originalText)) {
    config.sqlCompute.enabled = true;
    config.sqlCompute.prod.enabled = true;
    found.sqlCompute = true;
    extracted.push('SQL Serverless');

    const sqlSource = sqlSection || originalText;
    const size = matchClusterSize(sqlSource);
    if (size) config.sqlCompute.prod.clusterSize = size;

    const horas = matchHours(sqlSource);
    if (horas != null) config.sqlCompute.prod.horas = horas;
  }

  // ── PostgreSQL ──
  if (REGEX.postgre.test(originalText)) {
    config.postgre = true;
    found.postgre = true;
    extracted.push('PostgreSQL Flexible');
  }

  // ── Key Vault ──
  if (REGEX.keyVault.test(originalText)) {
    config.keyVault = true;
    found.keyVault = true;
    extracted.push('Key Vault');
  }

  // ── Linguagem natural: pipelines + frequência ──
  const pipelineMatch = lower.match(REGEX.pipeline);
  if (pipelineMatch) {
    extracted.push(`Pipelines: ${pipelineMatch[1]}`);
  }

  let freqHours = null;
  if (REGEX.freqHourly.test(lower))       freqHours = 730;
  else if (REGEX.freqDaily.test(lower))   freqHours = 352;
  else if (REGEX.freqWeekly.test(lower))  freqHours = 96;
  else if (REGEX.freqMonthly.test(lower)) freqHours = 24;

  if (freqHours && found.jobCompute && !matchHours(jobSection) && !matchHours(originalText)) {
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

  const resourceSummary = buildResourceSummary(originalText, found);

  return { config, found, extracted, warnings, resourceSummary };
}
