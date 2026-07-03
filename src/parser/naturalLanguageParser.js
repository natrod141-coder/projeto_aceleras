/**
 * Parser V2 — documentos técnicos Dataside / Azure Calculator / linguagem natural
 *
 * Pipeline: Texto → Blocos → Extração estruturada → Config da calculadora
 */

const PRESETS = {
  interativo: { horasVM: 352, horasDbu: 352 },
  comercial:  { horasVM: 352, horasDbu: 730 },
  mensal:     { horasVM: 730, horasDbu: 730 },
  continuo:   { horasVM: 744, horasDbu: 744 },
};

const REGEX = {
  // ── Documento estruturado ──
  projetoLine:       /^projeto\s*:\s*(.+)$/im,
  sectionStorage:    /^storage\s*$/im,
  sectionDatabricks: /^databricks\s*$/im,
  sectionAllPurpose: /^all[\s-]?purpose\s*compute\s*$/im,
  sectionJobCompute: /^job\s*compute\s*$/im,
  sectionSql:        /^sql\s*serverless\s*$/im,
  sectionPostgre:    /^postgresql\s*$/im,
  sectionKeyVault:   /^key\s*vault\s*$/im,
  envHeader:         /^\s*[-•*]?\s*(PROD|HOM|DEV)\s*$/im,

  capacidade:   /capacidade\s*:\s*(\d+(?:[.,]\d+)?)\s*(tb|gb)?/i,
  regiaoLabel:  /regi[aã]o\s*:\s*(.+?)(?:\s*$|\n)/im,
  tierLabel:    /tier\s*:\s*(premium|standard)/i,
  vmLabel:      /vm\s*:\s*([A-Z0-9]+)/i,
  nosLabel:     /n[oó]s\s*:\s*(\d+)/i,
  horasVMLabel: /horas?\s*vm\s*:\s*(\d+)/i,
  horasDBULabel:/horas?\s*dbu\s*:\s*(\d+)/i,
  clusterLabel: /cluster\s*:\s*(xsmall|small|medium|large)/i,
  horasSqlLabel:/^[-•*]?\s*horas?\s*:\s*(\d+)/im,
  desabilitado: /desabilitad[oa]|disabled|inativ[oa]/i,
  answerSim:    /^\s*[-•*]?\s*sim\s*$/im,
  answerNao:    /^\s*[-•*]?\s*n[aã]o\s*$/im,

  // ── Legado / linguagem natural ──
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

const SECTION_DEFS = [
  { key: 'storage',     pattern: REGEX.sectionStorage },
  { key: 'databricks',  pattern: REGEX.sectionDatabricks },
  { key: 'allPurpose',  pattern: REGEX.sectionAllPurpose },
  { key: 'jobCompute',  pattern: REGEX.sectionJobCompute },
  { key: 'sql',         pattern: REGEX.sectionSql },
  { key: 'postgre',     pattern: REGEX.sectionPostgre },
  { key: 'keyVault',    pattern: REGEX.sectionKeyVault },
];

const RESOURCE_DEFS = [
  { id: 'storage',     label: 'Storage',             mention: (t) => REGEX.storageSection.test(t) || REGEX.storageTB.test(t) || REGEX.storageGB.test(t) || REGEX.sectionStorage.test(t) || /\bstorage\b/i.test(t) },
  { id: 'allPurpose',  label: 'All Purpose Compute', mention: (t) => REGEX.allPurpose.test(t) || REGEX.sectionAllPurpose.test(t) },
  { id: 'jobCompute',  label: 'Jobs Compute',        mention: (t) => REGEX.jobCompute.test(t) || REGEX.jobCluster.test(t) || REGEX.sectionJobCompute.test(t) },
  { id: 'sqlCompute',  label: 'SQL Serverless',      mention: (t) => REGEX.sqlServerless.test(t) || REGEX.sqlWarehouse.test(t) || REGEX.sectionSql.test(t) },
  { id: 'postgre',     label: 'PostgreSQL',          mention: (t) => REGEX.sectionPostgre.test(t) || /postgres/i.test(t) },
  { id: 'keyVault',    label: 'Key Vault',           mention: (t) => REGEX.sectionKeyVault.test(t) || /key\s*vault/i.test(t) },
];

const ENV_KEYS = { PROD: 'prod', HOM: 'hom', DEV: 'dev' };

const INSTANCES = ['D3V2', 'DS3V2', 'D4AV4', 'D8AV4', 'D16AV4'];

// ─── Defaults ─────────────────────────────────────────────────────────────────

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

// ─── Utilitários privados ─────────────────────────────────────────────────────

function hoursToPreset(horasVM, horasDbu) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (p.horasVM === horasVM && p.horasDbu === horasDbu) return key;
  }
  return 'custom';
}

function regionLabel(value) {
  const map = {
    EAST_US: 'East US', WEST_US: 'West US', BRAZIL_SOUTH: 'Brazil South',
  };
  return map[value] ?? value;
}

function safeInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function normalizeInstance(raw) {
  try {
    if (!raw) return null;
    const t = String(raw).toUpperCase().replace(/\s+/g, '');
    const map = {
      D16AV4: REGEX.instanceD16, D8AV4: REGEX.instanceD8, D4AV4: REGEX.instanceD4,
      DS3V2: REGEX.instanceDS3, D3V2: REGEX.instanceD3,
    };
    if (map[t]) return t;
    for (const [name, re] of Object.entries(map)) {
      if (re.test(t)) return name;
    }
    return INSTANCES.includes(t) ? t : null;
  } catch {
    return null;
  }
}

/** Extrai todas as ocorrências de seções do documento estruturado */
function extractSections(text) {
  try {
    const matches = [];
    for (const def of SECTION_DEFS) {
      const re = new RegExp(def.pattern.source, 'gim');
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ key: def.key, start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex++;
      }
    }
    matches.sort((a, b) => a.start - b.start);

    return matches.map((match, i) => ({
      key: match.key,
      text: text.slice(match.end, i + 1 < matches.length ? matches[i + 1].start : text.length).trim(),
    }));
  } catch {
    return [];
  }
}

function isStructuredDocument(text) {
  return REGEX.projetoLine.test(text) ||
    REGEX.sectionStorage.test(text) ||
    REGEX.sectionAllPurpose.test(text) ||
    REGEX.sectionJobCompute.test(text);
}

// ─── Parsers de campo ─────────────────────────────────────────────────────────

function parseRegion(text) {
  try {
    if (!text) return null;
    const labeled = text.match(REGEX.regiaoLabel);
    if (labeled?.[1]) return parseRegionValue(labeled[1].trim());
    if (REGEX.regionBrazilSouth.test(text)) return 'BRAZIL_SOUTH';
    if (REGEX.regionEastUs.test(text))      return 'EAST_US';
    if (REGEX.regionWestUs.test(text))      return 'WEST_US';
    return null;
  } catch {
    return null;
  }
}

function parseRegionValue(label) {
  try {
    const l = String(label).toLowerCase();
    if (/brazil|brasil/.test(l)) return 'BRAZIL_SOUTH';
    if (/\beast\b/.test(l))      return 'EAST_US';
    if (/\bwest\b/.test(l))      return 'WEST_US';
    return null;
  } catch {
    return null;
  }
}

function matchStorageGB(text) {
  try {
    if (!text) return null;
    const cleaned = String(text).replace(REGEX.storageRAM, '');
    const cap = cleaned.match(REGEX.capacidade);
    if (cap) {
      const val = parseFloat(cap[1].replace(',', '.'));
      const unit = (cap[2] ?? 'gb').toLowerCase();
      return Math.round(unit === 'tb' ? val * 1024 : val);
    }
    const tb = cleaned.match(REGEX.storageTB);
    if (tb) return Math.round(parseFloat(tb[1].replace(',', '.')) * 1024);
    const gb = cleaned.match(REGEX.storageGB);
    if (gb) return Math.round(parseFloat(gb[1].replace(',', '.')));
    return null;
  } catch {
    return null;
  }
}

function matchInstance(text) {
  try {
    if (!text) return null;
    const labeled = text.match(REGEX.vmLabel);
    if (labeled?.[1]) return normalizeInstance(labeled[1]);
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

function matchNodes(text) {
  try {
    if (!text) return null;
    const labeled = text.match(REGEX.nosLabel);
    if (labeled) return safeInt(labeled[1]);
    const m = text.match(REGEX.nodesLabel) || text.match(REGEX.nodesValue);
    return m ? safeInt(m[1]) : null;
  } catch {
    return null;
  }
}

function matchHorasVM(text) {
  try {
    if (!text) return null;
    const labeled = text.match(REGEX.horasVMLabel);
    if (labeled) return safeInt(labeled[1]);
    return null;
  } catch {
    return null;
  }
}

function matchHorasDBU(text) {
  try {
    if (!text) return null;
    const labeled = text.match(REGEX.horasDBULabel);
    if (labeled) return safeInt(labeled[1]);
    return null;
  } catch {
    return null;
  }
}

function matchHoursLegacy(text) {
  try {
    if (!text) return null;
    const m = text.match(REGEX.hoursLabel) || text.match(REGEX.hoursValue);
    return m ? safeInt(m[1]) : null;
  } catch {
    return null;
  }
}

function matchClusterSize(text) {
  try {
    if (!text) return null;
    const labeled = text.match(REGEX.clusterLabel);
    if (labeled) return labeled[1].toUpperCase();
    const m = text.match(REGEX.clusterSize);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

function parseSimNao(text) {
  try {
    if (!text) return null;
    if (REGEX.answerSim.test(text))  return true;
    if (REGEX.answerNao.test(text))  return false;
    if (/\bsim\b/i.test(text) && !/\bn[aã]o\b/i.test(text)) return true;
    if (/\bn[aã]o\b/i.test(text)) return false;
    return null;
  } catch {
    return null;
  }
}

/** Extrai blocos PROD / HOM / DEV dentro de uma seção de workload */
function parseEnvironment(sectionText) {
  try {
    if (!sectionText) return [];

    const results = [];
    const lines = sectionText.split('\n');
    let currentEnv = null;
    let buffer = [];

    const flush = () => {
      if (currentEnv) {
        results.push({ envKey: currentEnv, text: buffer.join('\n').trim() });
      }
      buffer = [];
    };

    for (const line of lines) {
      const envMatch = line.trim().match(REGEX.envHeader);
      if (envMatch) {
        flush();
        currentEnv = ENV_KEYS[envMatch[1].toUpperCase()] ?? null;
        continue;
      }
      if (currentEnv) buffer.push(line);
    }
    flush();

    if (results.length === 0 && sectionText.trim()) {
      return [{ envKey: 'prod', text: sectionText.trim() }];
    }
    return results;
  } catch {
    return [];
  }
}

function applyEnvironmentToWorkload(workload, envKey, blockText) {
  try {
    const env = workload[envKey];
    if (!env) return null;

    if (REGEX.desabilitado.test(blockText)) {
      env.enabled  = false;
      env.override = envKey !== 'prod';
      return { envKey, enabled: false };
    }

    env.enabled  = true;
    env.override = true;

    const instance = matchInstance(blockText);
    const nodes    = matchNodes(blockText);
    const horasVM  = matchHorasVM(blockText);
    const horasDBU = matchHorasDBU(blockText);
    const region   = parseRegion(blockText);

    if (instance) env.instance = instance;
    if (nodes != null) env.nodes = nodes;
    if (horasVM != null)  env.horasVM  = horasVM;
    if (horasDBU != null) env.horasDbu = horasDBU;

    if (horasVM != null || horasDBU != null) {
      env.preset = hoursToPreset(env.horasVM ?? 0, env.horasDbu ?? 0);
    }

    if (envKey === 'prod' && region) {
      workload.region = region === 'BRAZIL_SOUTH' ? 'EAST_US' : region;
    }

    return { envKey, enabled: true, region, instance, nodes, horasVM, horasDBU };
  } catch {
    return null;
  }
}

// ─── Parsers de seção ─────────────────────────────────────────────────────────

function parseProjectName(text, config, found, extracted) {
  try {
    const prio = text.match(REGEX.projetoLine);
    if (prio?.[1]?.trim()) {
      config.projectName = prio[1].trim().split('\n')[0].slice(0, 120);
      found.projectName = true;
      extracted.push(`Projeto: ${config.projectName}`);
      return;
    }
    const legacy = text.match(REGEX.projectName) ?? text.match(REGEX.yourEstimate);
    if (legacy?.[1]?.trim()) {
      config.projectName = legacy[1].trim().split('\n')[0].slice(0, 120);
      found.projectName = true;
      extracted.push(`Projeto: ${config.projectName}`);
    }
  } catch { /* noop */ }
}

function parseStorage(sectionText, text, config, found, extracted) {
  try {
    const source = sectionText || text;
    const storageGB = matchStorageGB(source);
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

    const storageRegion = parseRegion(source);
    if (storageRegion) {
      config.storageRegion = storageRegion;
      found.storageRegion = true;
      extracted.push(`Região Storage: ${regionLabel(storageRegion)}`);
    }
  } catch { /* noop */ }
}

function parseDatabricks(sectionText, text, config, found, extracted) {
  try {
    const source = sectionText || text;
    const tierMatch = source.match(REGEX.tierLabel);
    if (tierMatch) {
      config.tier = tierMatch[1].toLowerCase();
      found.tier = true;
      extracted.push(`Tier: ${tierMatch[1]}`);
      return;
    }
    const hasPremium  = REGEX.databricksPremium.test(source);
    const hasStandard = REGEX.databricksStandard.test(source);
    if (hasStandard && !hasPremium) {
      config.tier = 'standard';
      found.tier = true;
      extracted.push('Tier: Standard');
    } else if (hasPremium) {
      config.tier = 'premium';
      found.tier = true;
      extracted.push('Tier: Premium');
    }
  } catch { /* noop */ }
}

function parseAllPurpose(sectionTexts, config, found, extracted, warnings) {
  try {
    const blocks = sectionTexts.length > 0 ? sectionTexts : [];
    if (blocks.length === 0) return false;

    config.allPurpose.hom.enabled = false;
    config.allPurpose.dev.enabled = false;

    let anyEnabled = false;

    for (const block of blocks) {
      const envBlocks = parseEnvironment(block);
      for (const { envKey, text: envText } of envBlocks) {
        const result = applyEnvironmentToWorkload(config.allPurpose, envKey, envText);
        if (result?.enabled) anyEnabled = true;
      }
    }

    if (anyEnabled || blocks.length > 0) {
      config.allPurpose.enabled = anyEnabled || config.allPurpose.prod.enabled;
      found.allPurpose = true;
      if (!extracted.includes('All-Purpose Compute')) {
        extracted.push('All-Purpose Compute');
      }
    }

    return found.allPurpose;
  } catch {
    return false;
  }
}

function parseJobCompute(sectionTexts, config, found, extracted, warnings) {
  try {
    const blocks = sectionTexts.length > 0 ? sectionTexts : [];
    if (blocks.length === 0) return false;

    config.jobCompute.hom.enabled = false;
    config.jobCompute.dev.enabled = false;

    let anyEnabled = false;

    for (const block of blocks) {
      const envBlocks = parseEnvironment(block);
      for (const { envKey, text: envText } of envBlocks) {
        const result = applyEnvironmentToWorkload(config.jobCompute, envKey, envText);
        if (result?.enabled) anyEnabled = true;

        if (envKey === 'prod' && result?.region === 'BRAZIL_SOUTH') {
          config.jobCompute.region = 'WEST_US';
          warnings.push('Job Compute: Brazil South não suportado para compute — usando West US.');
        }
      }
    }

    if (blocks.length > 0) {
      config.jobCompute.enabled = config.jobCompute.prod.enabled && config.jobCompute.prod.nodes > 0
        ? true
        : anyEnabled;
      found.jobCompute = true;
      if (!extracted.includes('Job Compute')) {
        extracted.push('Job Compute');
      }
    }

    return found.jobCompute;
  } catch {
    return false;
  }
}

function parseSQL(sectionText, text, config, found, extracted) {
  try {
    const source = sectionText || '';
    const isSql = source.length > 0 ||
      REGEX.sqlServerless.test(text) ||
      REGEX.sqlWarehouse.test(text) ||
      REGEX.sqlDatabricks.test(text);

    if (!isSql) return;

    config.sqlCompute.enabled = true;
    config.sqlCompute.prod.enabled = true;
    config.sqlCompute.hom.enabled = false;
    config.sqlCompute.dev.enabled = false;
    found.sqlCompute = true;
    extracted.push('SQL Serverless');

    const size = matchClusterSize(source || text);
    if (size) config.sqlCompute.prod.clusterSize = size;

    const horasLabeled = source.match(REGEX.horasSqlLabel);
    const horas = horasLabeled
      ? safeInt(horasLabeled[1])
      : matchHoursLegacy(source || text);
    if (horas != null) config.sqlCompute.prod.horas = horas;
  } catch { /* noop */ }
}

function parsePostgre(sectionText, text, config, found, extracted) {
  try {
    if (sectionText) {
      found.postgre = true;
      const answer = parseSimNao(sectionText);
      config.postgre = answer === true;
      extracted.push(answer ? 'PostgreSQL Flexible' : 'PostgreSQL: Não');
      return;
    }
    if (REGEX.sectionPostgre.test(text)) return;
    if (/postgres(?:ql)?/i.test(text) && !REGEX.answerNao.test(text)) {
      config.postgre = true;
      found.postgre = true;
      extracted.push('PostgreSQL Flexible');
    }
  } catch { /* noop */ }
}

function parseKeyVault(sectionText, text, config, found, extracted) {
  try {
    if (sectionText) {
      found.keyVault = true;
      const answer = parseSimNao(sectionText);
      config.keyVault = answer !== false;
      extracted.push(answer === false ? 'Key Vault: Não' : 'Key Vault');
      return;
    }
    if (REGEX.sectionKeyVault.test(text)) return;
    if (/key\s*vault/i.test(text)) {
      config.keyVault = true;
      found.keyVault = true;
      extracted.push('Key Vault');
    }
  } catch { /* noop */ }
}

// ─── Legado (linguagem natural / calculadora) ───────────────────────────────────

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

function applyLegacyWorkloadFields(workload, section, globalText) {
  const source = section || globalText;
  const instance = matchInstance(source);
  if (instance) workload.prod.instance = instance;

  const nodes = matchNodes(source);
  if (nodes != null) workload.prod.nodes = nodes;

  const horasVM  = matchHorasVM(source)  ?? matchHoursLegacy(source);
  const horasDBU = matchHorasDBU(source) ?? horasVM;

  if (horasVM != null)  workload.prod.horasVM  = horasVM;
  if (horasDBU != null) workload.prod.horasDbu = horasDBU;
  if (horasVM != null || horasDBU != null) {
    workload.prod.preset = hoursToPreset(workload.prod.horasVM, workload.prod.horasDbu);
  }
}

function parseLegacy(text, config, found, extracted, warnings) {
  try {
    parseProjectName(text, config, found, extracted);

    const storageSection = sectionSlice(text, [REGEX.storageSection]) || text;
    parseStorage(storageSection !== text ? storageSection : '', text, config, found, extracted);
    parseDatabricks('', text, config, found, extracted);

    const apSection = sectionSlice(text, [REGEX.allPurpose]);
    if (REGEX.allPurpose.test(text)) {
      config.allPurpose.enabled = true;
      found.allPurpose = true;
      extracted.push('All-Purpose Compute');
      const apRegion = parseRegion(apSection || text);
      if (apRegion) config.allPurpose.region = apRegion === 'BRAZIL_SOUTH' ? 'EAST_US' : apRegion;
      applyLegacyWorkloadFields(config.allPurpose, apSection, text);
    }

    const jobSection = sectionSlice(text, [REGEX.jobCompute, REGEX.jobCluster]);
    if (REGEX.jobCompute.test(text) || REGEX.jobCluster.test(text)) {
      config.jobCompute.enabled = true;
      found.jobCompute = true;
      extracted.push('Job Compute');
      const jobRegion = parseRegion(jobSection || text);
      if (jobRegion) config.jobCompute.region = jobRegion === 'BRAZIL_SOUTH' ? 'WEST_US' : jobRegion;
      applyLegacyWorkloadFields(config.jobCompute, jobSection, text);
    }

    const sqlSection = sectionSlice(text, [
      REGEX.sqlServerless, REGEX.sqlWarehouse, REGEX.sqlDatabricks,
    ]);
    if (sqlSection || REGEX.sqlServerless.test(text) || REGEX.sqlWarehouse.test(text)) {
      parseSQL(sqlSection, text, config, found, extracted);
    }

    if (!found.postgre) parsePostgre('', text, config, found, extracted);
    if (!found.keyVault) parseKeyVault('', text, config, found, extracted);

    const lower = text.toLowerCase();
    const pipelineMatch = lower.match(REGEX.pipeline);
    if (pipelineMatch) extracted.push(`Pipelines: ${pipelineMatch[1]}`);

    let freqHours = null;
    if (REGEX.freqHourly.test(lower))       freqHours = 730;
    else if (REGEX.freqDaily.test(lower))   freqHours = 352;
    else if (REGEX.freqWeekly.test(lower))  freqHours = 96;
    else if (REGEX.freqMonthly.test(lower)) freqHours = 24;

    if (freqHours && found.jobCompute && !matchHorasVM(text) && !matchHoursLegacy(text)) {
      config.jobCompute.prod.horasVM  = freqHours;
      config.jobCompute.prod.horasDbu = freqHours;
      config.jobCompute.prod.preset   = hoursToPreset(freqHours, freqHours);
    }
  } catch { /* noop */ }
}

function buildResourceSummary(text, found) {
  const foundFlags = {
    storage:    !!(found.storageGB || found.storageEnabled),
    allPurpose: !!found.allPurpose,
    jobCompute: !!found.jobCompute,
    sqlCompute: !!found.sqlCompute,
    postgre:    !!found.postgre,
    keyVault:   !!found.keyVault,
  };

  const foundList = [];
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

  const originalText = String(text).replace(/\r\n/g, '\n');

  if (isStructuredDocument(originalText)) {
    parseProjectName(originalText, config, found, extracted);

    const sections = extractSections(originalText);
    const byKey = {};
    for (const s of sections) {
      if (!byKey[s.key]) byKey[s.key] = [];
      byKey[s.key].push(s.text);
    }

    parseStorage(byKey.storage?.[0] ?? '', originalText, config, found, extracted);
    parseDatabricks(byKey.databricks?.[0] ?? '', originalText, config, found, extracted);
    parseAllPurpose(byKey.allPurpose ?? [], config, found, extracted, warnings);
    parseJobCompute(byKey.jobCompute ?? [], config, found, extracted, warnings);
    parseSQL(byKey.sql?.[0] ?? '', originalText, config, found, extracted);
    parsePostgre(byKey.postgre?.[0] ?? '', originalText, config, found, extracted);
    parseKeyVault(byKey.keyVault?.[0] ?? '', originalText, config, found, extracted);
  } else {
    parseLegacy(originalText, config, found, extracted, warnings);
  }

  if (!found.storageGB) {
    warnings.push('Capacidade de armazenamento não encontrada.');
  }
  if (!found.storageRegion) {
    warnings.push('Região não identificada — mantendo padrão.');
  }

  const resourceSummary = buildResourceSummary(originalText, found);

  return { config, found, extracted, warnings, resourceSummary };
}
