import React, { useState, useMemo } from 'react';
import { parseProject } from './parser/naturalLanguageParser';
import { calculateEstimate } from './engine/calculator';

// ─── Constantes ────────────────────────────────────────────────────────────────

const STORAGE_REGIONS = [
  { value: 'EAST_US',      label: 'East US' },
  { value: 'WEST_US',      label: 'West US' },
  { value: 'BRAZIL_SOUTH', label: 'Brazil South' },
];

// Região de compute agora é escolhida POR WORKLOAD (All-Purpose e Job Compute
// cada um com a sua), não mais um único seletor global — casos reais mostram
// os dois workloads rodando em regiões diferentes no mesmo projeto.
const COMPUTE_REGIONS = [
  { value: 'EAST_US', label: 'East US' },
  { value: 'WEST_US', label: 'West US' },
];

const TIERS = [
  { value: 'premium',  label: 'Premium' },
  { value: 'standard', label: 'Standard' },
];

const INSTANCES = ['D3V2', 'DS3V2', 'D4AV4', 'D8AV4', 'D16AV4'];
const SQL_CLUSTER_SIZES = ['XSMALL', 'SMALL', 'MEDIUM', 'LARGE'];

const PRESETS = {
  interativo: { label: 'Interativo (All-Purpose)', horasVM: 352, horasDbu: 352 },
  comercial:  { label: 'Janela Comercial',          horasVM: 352, horasDbu: 730 },
  mensal:     { label: 'Mensal (730h)',              horasVM: 730, horasDbu: 730 },
  continuo:   { label: 'Contínuo (24/7)',            horasVM: 744, horasDbu: 744 },
  custom:     { label: 'Personalizado',              horasVM: null, horasDbu: null },
};

const ENV_DEFAULTS = {
  prod: { ratio: 1,    color: '#3fb950', label: 'PROD' },
  hom:  { ratio: 0.25, color: '#d29922', label: 'HOM'  },
  dev:  { ratio: 0.5,  color: '#58a6ff', label: 'DEV'  },
};

// ─── Estado default ────────────────────────────────────────────────────────────

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
  region, // região de compute deste workload (própria — ver COMPUTE_REGIONS)
  prod: defaultEnv(instance, 1, preset, true),
  hom:  defaultEnv(instance, 1, preset, false),
  dev:  defaultEnv(instance, 1, preset, false),
});

const defaultSqlEnv = (horas = 0) => ({
  enabled:     false,
  clusterSize: 'XSMALL',
  horas,
});

const INITIAL = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolveEnv = (envKey, workload) => {
  const env = workload[envKey];
  if (!env.enabled) return null;
  if (env.override || envKey === 'prod') return env;
  const prod  = workload.prod;
  const ratio = ENV_DEFAULTS[envKey].ratio;
  return {
    ...env,
    instance: prod.instance,
    nodes:    prod.nodes,
    horasVM:  Math.round((prod.horasVM  ?? 0) * ratio),
    horasDbu: Math.round((prod.horasDbu ?? 0) * ratio),
  };
};

const fmt = (v) =>
  v == null || isNaN(v) ? '—' :
  v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const regionLabel = (v) =>
  [...STORAGE_REGIONS, ...COMPUTE_REGIONS].find(r => r.value === v)?.label ?? v;

const mergeWorkload = (old, parsed, apply) => {
  if (!apply) return old;
  return {
    ...old,
    enabled: parsed.enabled ?? old.enabled,
    region:  parsed.region  ?? old.region,
    prod: { ...old.prod, ...(parsed.prod ?? {}) },
    hom:  { ...old.hom,  ...(parsed.hom  ?? {}) },
    dev:  { ...old.dev,  ...(parsed.dev  ?? {}) },
  };
};

const mergeParsedConfig = (old, parsed, found) => ({
  ...old,
  ...(found.projectName    ? { projectName:    parsed.projectName }    : {}),
  ...(found.storageRegion  ? { storageRegion:  parsed.storageRegion }  : {}),
  ...(found.storageGB      ? { storageGB:      parsed.storageGB }      : {}),
  ...(found.storageEnabled ? { storageEnabled: parsed.storageEnabled } : {}),
  ...(found.tier           ? { tier:           parsed.tier }           : {}),
  ...(found.postgre        ? { postgre:        parsed.postgre }        : {}),
  ...(found.keyVault       ? { keyVault:       parsed.keyVault }       : {}),
  allPurpose: mergeWorkload(old.allPurpose, parsed.allPurpose ?? {}, found.allPurpose),
  jobCompute: mergeWorkload(old.jobCompute, parsed.jobCompute ?? {}, found.jobCompute),
  sqlCompute: found.sqlCompute
    ? {
        ...old.sqlCompute,
        enabled: parsed.sqlCompute?.enabled ?? old.sqlCompute.enabled,
        prod: { ...old.sqlCompute.prod, ...(parsed.sqlCompute?.prod ?? {}) },
        hom:  { ...old.sqlCompute.hom,  ...(parsed.sqlCompute?.hom  ?? {}) },
        dev:  { ...old.sqlCompute.dev,  ...(parsed.sqlCompute?.dev  ?? {}) },
      }
    : old.sqlCompute,
});

// ─── Cálculo ──────────────────────────────────────────────────────────────────

const runCalc = (cfg) => {
  const envKeys = ['prod', 'hom', 'dev'];
  const results = {};

  for (const env of envKeys) {
    const ap     = resolveEnv(env, cfg.allPurpose);
    const job    = resolveEnv(env, cfg.jobCompute);
    const sqlEnv = cfg.sqlCompute[env];

    const envTemWorkload =
      (cfg.allPurpose.enabled && ap     != null) ||
      (cfg.jobCompute.enabled && job    != null) ||
      (cfg.sqlCompute.enabled && sqlEnv?.enabled);

    const input = {
      storageRegion: cfg.storageRegion,
      // Cada workload usa a sua própria região de compute (não existe mais
      // um "computeRegion" global) — resolve o caso de região mista (ex: PRIO,
      // onde AP roda em East US e Job roda em West US no mesmo projeto).
      apComputeRegion:  cfg.allPurpose.region,
      jobComputeRegion: cfg.jobCompute.region,
      tier:          cfg.tier,
      storageGB: env === 'prod' && cfg.storageEnabled ? cfg.storageGB : 0,

      apProdInstance: ap?.instance  ?? 'D8AV4',
      apProdNodes:    (cfg.allPurpose.enabled && ap) ? ap.nodes : 0,
      apProdHorasVM:  ap?.horasVM   ?? 0,
      apProdHorasDbu: ap?.horasDbu  ?? 0,

      jobProdInstance: job?.instance ?? 'D8AV4',
      jobProdNodes:    (cfg.jobCompute.enabled && job) ? job.nodes : 0,
      jobProdHorasVM:  job?.horasVM  ?? 0,
      jobProdHorasDbu: job?.horasDbu ?? 0,

      sqlClusterSize: (cfg.sqlCompute.enabled && sqlEnv?.enabled)
        ? sqlEnv.clusterSize : 'XSMALL',
      sqlHoras: (cfg.sqlCompute.enabled && sqlEnv?.enabled)
        ? sqlEnv.horas : 0,

      includePostgre:  env === 'prod' && cfg.postgre,
      includeKeyVault: cfg.keyVault && envTemWorkload,
    };

    results[env] = calculateEstimate(input);
  }

  return results;
};

// ─── Estilos ──────────────────────────────────────────────────────────────────

const C = {
  bg:      '#0d1117',
  surface: '#161b22',
  border:  '#30363d',
  muted:   '#8b949e',
  text:    '#e6edf3',
  blue:    '#58a6ff',
  green:   '#3fb950',
  yellow:  '#d29922',
  red:     '#f78166',
  accent:  '#1f6feb',
};

const S = {
  app: { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif", paddingBottom: 60 },
  header: { background: 'linear-gradient(135deg,#1a237e,#0078d4)', padding: '24px 40px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border}` },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' },
  headerSub: { margin: '2px 0 0', fontSize: 11, opacity: 0.7 },
  badge: { marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600 },
  body: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 },
  cardHead: { padding: '12px 18px', background: '#1c2128', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: (color) => ({ margin: 0, fontSize: 11, fontWeight: 700, color: color ?? C.muted, textTransform: 'uppercase', letterSpacing: '0.8px' }),
  cardBody: { padding: 18 },
  row: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 },
  label: { fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: '7px 9px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: '7px 9px', fontSize: 12, outline: 'none', width: '100%', cursor: 'pointer' },
  presetBar: { display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  presetBtn: (active) => ({ padding: '4px 10px', borderRadius: 20, border: active ? `1px solid ${C.blue}` : `1px solid ${C.border}`, background: active ? 'rgba(31,111,235,0.15)' : 'transparent', color: active ? C.blue : C.muted, fontSize: 10, fontWeight: 600, cursor: 'pointer' }),
  toggleWrap: (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: on ? C.blue : C.muted, fontWeight: on ? 600 : 400, userSelect: 'none' }),
  toggleTrack: (on) => ({ width: 32, height: 18, borderRadius: 9, background: on ? C.accent : C.border, position: 'relative', transition: 'background .2s', flexShrink: 0 }),
  toggleThumb: (on) => ({ position: 'absolute', top: 2, left: on ? 15 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }),
  envTabs: { display: 'flex', gap: 6, marginBottom: 14 },
  envTab: (active, color) => ({ padding: '5px 12px', borderRadius: 6, border: active ? `1px solid ${color}` : `1px solid ${C.border}`, background: active ? `${color}18` : 'transparent', color: active ? color : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.5px' }),
  envToggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` },
  overrideBtn: (on) => ({ padding: '3px 8px', borderRadius: 4, border: `1px solid ${on ? C.yellow : C.border}`, background: on ? `${C.yellow}18` : 'transparent', color: on ? C.yellow : C.muted, fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.5px' }),
  stickyPanel: { position: 'sticky', top: 20 },
  warningBanner: { background: 'rgba(210,153,34,0.12)', border: `1px solid ${C.yellow}`, borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 11, lineHeight: 1.6, color: '#e3b341' },
  totalCard: { background: 'linear-gradient(135deg,#0f2744,#0d1b2e)', border: `1px solid ${C.accent}`, borderRadius: 10, padding: 20, marginBottom: 14 },
  totalLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 },
  totalValue: { fontSize: 34, fontWeight: 800, color: C.blue, letterSpacing: '-1px', lineHeight: 1 },
  totalCurrency: { fontSize: 14, fontWeight: 500, color: C.muted, marginLeft: 4 },
  envPills: { display: 'flex', gap: 10, marginTop: 16 },
  envPill: (color) => ({ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '10px 8px', textAlign: 'center', border: `1px solid ${color}22` }),
  envPillLabel: (color) => ({ fontSize: 9, fontWeight: 700, color, letterSpacing: '1px', marginBottom: 4 }),
  envPillVal: { fontSize: 14, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' },
  breakdownItem: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid #21262d`, fontSize: 12 },
  breakdownSub: { paddingLeft: 10, borderLeft: `2px solid #21262d`, marginBottom: 4 },
  breakdownSubLine: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, padding: '1px 0' },
  guideCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18 },
  guideTitle: { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 },
  guideStep: { fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 6, paddingLeft: 16, position: 'relative' },
  dot: { position: 'absolute', left: 0, color: C.accent, fontWeight: 700 },
  disabled: { opacity: 0.3, pointerEvents: 'none' },
  hint: { fontSize: 10, color: C.muted, marginTop: 6, fontStyle: 'italic' },
  projectBadge: {
    background: '#0d1117',
    border: `1px solid ${C.accent}`,
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: 12,
    fontSize: 12,
    color: C.blue,
    fontWeight: 600,
  },
  openCalcBtn: {
    display: 'block',
    marginTop: 14,
    padding: '9px 0',
    background: 'linear-gradient(135deg, #1a237e, #0078d4)',
    borderRadius: 6,
    textAlign: 'center',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    letterSpacing: '0.3px',
  },
  copyBox: {
    background: '#0d1117',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '10px 12px',
    marginTop: 10,
    fontSize: 11,
    color: C.muted,
    lineHeight: 1.8,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  copyBtn: {
    display: 'block',
    width: '100%',
    marginTop: 6,
    padding: '6px 0',
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.muted,
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.3px',
  },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Toggle({ on, onChange, label }) {
  return (
    <label style={S.toggleWrap(on)} onClick={() => onChange(!on)}>
      <span style={S.toggleTrack(on)}><span style={S.toggleThumb(on)} /></span>
      {label}
    </label>
  );
}

function Field({ label, children }) {
  return <div style={S.field}><span style={S.label}>{label}</span>{children}</div>;
}

function EnvPanel({ envKey, workload, prodValues, onChange }) {
  const cfg = ENV_DEFAULTS[envKey];
  const env = workload[envKey];
  const isOverride = env.override || envKey === 'prod';
  const displayed = isOverride ? env : {
    instance: prodValues.instance,
    nodes:    prodValues.nodes,
    horasVM:  Math.round((prodValues.horasVM  ?? 0) * cfg.ratio),
    horasDbu: Math.round((prodValues.horasDbu ?? 0) * cfg.ratio),
    preset:   env.preset,
  };

  const setPreset = (key) => {
    const p = PRESETS[key];
    onChange({ ...env, preset: key, horasVM: p.horasVM, horasDbu: p.horasDbu });
  };

  const update = (patch) => onChange({ ...env, ...patch });

  return (
    <div>
      <div style={S.envToggleRow}>
        <Toggle on={env.enabled} onChange={(v) => update({ enabled: v })} label={`Ambiente ${cfg.label} ativo`} />
        {envKey !== 'prod' && (
          <button style={S.overrideBtn(isOverride)}
            onClick={() => update({ override: !env.override })}>
            {isOverride ? '🔓 Config própria' : '🔒 Espelha PROD'}
          </button>
        )}
      </div>
      <div style={env.enabled ? {} : S.disabled}>
        {isOverride ? (
          <>
            <div style={S.row}>
              <Field label="Instância VM">
                <select style={S.select} value={env.instance}
                  onChange={e => update({ instance: e.target.value })}>
                  {INSTANCES.map(i => <option key={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Nós">
                <input style={S.input} type="number" min={1} value={env.nodes}
                  onChange={e => update({ nodes: Number(e.target.value) })} />
              </Field>
            </div>
            <div style={S.label}>Perfil de execução</div>
            <div style={S.presetBar}>
              {Object.entries(PRESETS).map(([k, p]) => (
                <button key={k} style={S.presetBtn(env.preset === k)} onClick={() => setPreset(k)}>{p.label}</button>
              ))}
            </div>
            {env.preset === 'custom' && (
              <div style={{ ...S.row, marginTop: 8 }}>
                <Field label="Horas VM">
                  <input style={S.input} type="number" min={1} max={744}
                    value={env.horasVM ?? ''}
                    onChange={e => update({ horasVM: Number(e.target.value) })} />
                </Field>
                <Field label="Horas DBU">
                  <input style={S.input} type="number" min={1} max={744}
                    value={env.horasDbu ?? ''}
                    onChange={e => update({ horasDbu: Number(e.target.value) })} />
                </Field>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            <strong style={{ color: cfg.color }}>{displayed.instance}</strong> · {displayed.nodes} nó(s) ·{' '}
            {displayed.horasVM}h VM · {displayed.horasDbu}h DBU
            <span style={{ opacity: 0.6 }}> ({Math.round(cfg.ratio * 100)}% de PROD)</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkloadSection({ title, color, workload, onChange }) {
  const [activeEnv, setActiveEnv] = useState('prod');

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardTitle(color)}>{title}</span>
        <Toggle on={workload.enabled} onChange={(v) => onChange({ ...workload, enabled: v })}
          label={workload.enabled ? 'Ativo' : 'Inativo'} />
      </div>
      <div style={{ ...S.cardBody, ...(workload.enabled ? {} : S.disabled) }}>
        <div style={{ ...S.row, marginBottom: 14 }}>
          <Field label={`Região de Compute — ${title}`}>
            <select style={S.select} value={workload.region}
              onChange={e => onChange({ ...workload, region: e.target.value })}>
              {COMPUTE_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={S.envTabs}>
          {Object.entries(ENV_DEFAULTS).map(([k, d]) => (
            <button key={k} style={S.envTab(activeEnv === k, d.color)} onClick={() => setActiveEnv(k)}>
              {d.label} {!workload[k].enabled && '✕'}
            </button>
          ))}
        </div>
        <EnvPanel
          envKey={activeEnv}
          workload={workload}
          prodValues={workload.prod}
          onChange={(updated) => onChange({ ...workload, [activeEnv]: updated })}
        />
      </div>
    </div>
  );
}

function SqlSection({ sql, onChange }) {
  const [activeEnv, setActiveEnv] = useState('prod');
  const envs = ['prod', 'hom', 'dev'];

  const updateEnv = (envKey, patch) =>
    onChange({ ...sql, [envKey]: { ...sql[envKey], ...patch } });

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardTitle(C.red)}>SQL Serverless</span>
        <Toggle on={sql.enabled} onChange={v => onChange({ ...sql, enabled: v })}
          label={sql.enabled ? 'Ativo' : 'Inativo'} />
      </div>
      <div style={{ ...S.cardBody, ...(sql.enabled ? {} : S.disabled) }}>
        <div style={S.envTabs}>
          {envs.map(k => (
            <button key={k} style={S.envTab(activeEnv === k, ENV_DEFAULTS[k].color)}
              onClick={() => setActiveEnv(k)}>
              {ENV_DEFAULTS[k].label} {!sql[k].enabled && '✕'}
            </button>
          ))}
        </div>
        <div style={S.envToggleRow}>
          <Toggle on={sql[activeEnv].enabled}
            onChange={v => updateEnv(activeEnv, { enabled: v })}
            label={`Ambiente ${ENV_DEFAULTS[activeEnv].label} ativo`} />
        </div>
        <div style={sql[activeEnv].enabled ? {} : S.disabled}>
          <div style={S.row}>
            <Field label="Tamanho do Cluster">
              <select style={S.select} value={sql[activeEnv].clusterSize}
                onChange={e => updateEnv(activeEnv, { clusterSize: e.target.value })}>
                {SQL_CLUSTER_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Horas de execução">
              <input style={S.input} type="number" min={0} max={744}
                value={sql[activeEnv].horas}
                onChange={e => updateEnv(activeEnv, { horas: Number(e.target.value) })} />
            </Field>
          </div>
          <p style={S.hint}>Sem componente de VM — cobra exclusivamente por DBU × horas.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Guia de preenchimento com resumo copiável ────────────────────────────────

function GuiaPreenchimento({ cfg, breakdown, totals, currency }) {
  const [copied, setCopied] = useState(false);

  const activeWorkloads = [
    cfg.allPurpose.enabled && 'All-Purpose Compute',
    cfg.jobCompute.enabled && 'Job Compute',
    cfg.sqlCompute.enabled && 'SQL Serverless',
    cfg.postgre            && 'PostgreSQL Flexible',
    cfg.keyVault           && 'Key Vault',
  ].filter(Boolean);

  const resumo = [
    cfg.projectName ? `📁 Projeto: ${cfg.projectName}` : '📁 Projeto: (sem nome)',
    `🌍 Storage: ${regionLabel(cfg.storageRegion)} | All-Purpose: ${regionLabel(cfg.allPurpose.region)} | Job Compute: ${regionLabel(cfg.jobCompute.region)} | Tier: ${cfg.tier === 'premium' ? 'Premium' : 'Standard'}`,
    '',
    '── Serviços ativos ──',
    ...activeWorkloads.map(w => `  • ${w}`),
    '',
    '── Custo por ambiente ──',
    `  PROD: ${currency} ${fmt(totals.prod)}`,
    `  HOM:  ${currency} ${fmt(totals.hom)}`,
    `  DEV:  ${currency} ${fmt(totals.dev)}`,
    `  TOTAL: ${currency} ${fmt(totals.prod + totals.hom + totals.dev)}`,
    '',
    '── Breakdown por serviço ──',
    ...breakdown.map(b => `  ${b.label}: ${currency} ${fmt(b.prod + b.hom + b.dev)}`),
    '',
    'Gerado por Azure Cost Estimator — Dataside',
  ].join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(resumo).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={S.guideCard}>
      <div style={S.guideTitle}>📋 Guia de Preenchimento — Calculadora Azure</div>

      {cfg.projectName && (
        <div style={S.projectBadge}>🗂 {cfg.projectName}</div>
      )}

      {[
        <>Acesse <strong>azure.microsoft.com/pricing/calculator</strong></>,
        <>Adicione <strong>Storage Accounts</strong> → ADLS Gen2, LRS, Hot, região <strong>{regionLabel(cfg.storageRegion)}</strong></>,
        cfg.allPurpose.enabled && <>Adicione <strong>Azure Databricks — All-Purpose</strong> → Tier <strong>{cfg.tier === 'premium' ? 'Premium' : 'Standard'}</strong>, região <strong>{regionLabel(cfg.allPurpose.region)}</strong></>,
        cfg.jobCompute.enabled && <>Adicione <strong>Azure Databricks — Job Compute</strong> → Tier <strong>{cfg.tier === 'premium' ? 'Premium' : 'Standard'}</strong>, região <strong>{regionLabel(cfg.jobCompute.region)}</strong></>,
        <>Para cada workload ativo, configure Workload Type, instância, nós e horas conforme o breakdown — repita para cada ambiente ativo.</>,
        <>Clique em <strong>Save and share</strong> para gerar o link oficial.</>,
      ].filter(Boolean).map((step, i) => (
        <div key={i} style={S.guideStep}>
          <span style={S.dot}>{i + 1}.</span>{step}
        </div>
      ))}

      {/* Resumo copiável */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Resumo para compartilhar
        </div>
        <div style={S.copyBox}>{resumo}</div>
        <button style={S.copyBtn} onClick={handleCopy}>
          {copied ? '✅ Copiado!' : '📋 Copiar resumo'}
        </button>
      </div>

      <a
        href="https://azure.microsoft.com/pt-br/pricing/calculator/"
        target="_blank"
        rel="noopener noreferrer"
        style={S.openCalcBtn}
      >
        🔗 Abrir Calculadora Azure →
      </a>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [cfg, setCfg] = useState(INITIAL);
  const [rawInput, setRawInput] = useState('');
  const [parserMessage, setParserMessage] = useState(null);

  const handleAutoFill = () => {
    try {
      if (!rawInput?.trim()) {
        setParserMessage({ type: 'error', text: '❌ Cole um texto antes de processar.' });
        return;
      }

      const { config, found, extracted, warnings } = parseProject(rawInput);
      const hasFound = Object.values(found ?? {}).some(Boolean);

      setCfg(old => mergeParsedConfig(old, config, found));

      if (!hasFound) {
        setParserMessage({
          type: 'error',
          text: '⚠️ Nenhum recurso identificado — valores atuais mantidos.',
          summary: [],
          warnings: warnings ?? [],
        });
        return;
      }

      setParserMessage({
        type: 'success',
        text: '✅ Configuração preenchida automaticamente.',
        summary: extracted ?? [],
        warnings: warnings ?? [],
      });
    } catch (err) {
      console.error(err);
      setParserMessage({ type: 'error', text: '❌ Não foi possível interpretar o texto.' });
    }
  };

  const results = useMemo(() => {
    try { return runCalc(cfg); } catch (e) { console.error(e); return null; }
  }, [cfg]);

  // Soma por ambiente respeitando a moeda — nunca mistura USD com BRL num único número.
  const sumEnvByCurrency = (env) => results?.[env]?.totalsByCurrency ?? { USD: 0, BRL: 0 };

  const totalsUSD = {
    prod: sumEnvByCurrency('prod').USD, hom: sumEnvByCurrency('hom').USD, dev: sumEnvByCurrency('dev').USD,
  };
  const totalsBRL = {
    prod: sumEnvByCurrency('prod').BRL, hom: sumEnvByCurrency('hom').BRL, dev: sumEnvByCurrency('dev').BRL,
  };
  const grandUSD = totalsUSD.prod + totalsUSD.hom + totalsUSD.dev;
  const grandBRL = totalsBRL.prod + totalsBRL.hom + totalsBRL.dev;

  const mixedCurrency = ['prod', 'hom', 'dev'].some(e => results?.[e]?.mixedCurrency);
  const allWarnings = ['prod', 'hom', 'dev'].flatMap(e => results?.[e]?.warnings ?? []);

  // Compatibilidade com o restante da UI (breakdown, guia): quando NÃO há mistura,
  // continua existindo um único total/moeda, como antes.
  const totals   = mixedCurrency ? totalsUSD : (grandBRL > 0 ? totalsBRL : totalsUSD);
  const grand    = mixedCurrency ? grandUSD  : (grandBRL > 0 ? grandBRL  : grandUSD);
  const currency = mixedCurrency ? 'USD' : (grandBRL > 0 ? 'BRL' : 'USD');

  const breakdown = results ? [
    { label: 'Storage (ADLS Gen2)', prod: results.prod.lines.storage  ?? 0, hom: 0,                               dev: 0 },
    { label: 'All-Purpose Compute', prod: results.prod.lines.apProd   ?? 0, hom: results.hom.lines.apProd   ?? 0, dev: results.dev.lines.apProd  ?? 0 },
    { label: 'Job Compute',         prod: results.prod.lines.jobProd  ?? 0, hom: results.hom.lines.jobProd  ?? 0, dev: results.dev.lines.jobProd ?? 0 },
    { label: 'SQL Serverless',      prod: results.prod.lines.sql      ?? 0, hom: results.hom.lines.sql      ?? 0, dev: results.dev.lines.sql     ?? 0 },
    { label: 'PostgreSQL',          prod: results.prod.lines.postgre  ?? 0, hom: 0,                               dev: 0 },
    { label: 'Key Vault',           prod: results.prod.lines.keyVault ?? 0, hom: results.hom.lines.keyVault ?? 0, dev: results.dev.lines.keyVault ?? 0 },
  ].filter(b => b.prod + b.hom + b.dev > 0.001) : [];

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div>
          <h1 style={S.headerTitle}>Azure Cost Estimator</h1>
          <p style={S.headerSub}>Dataside · Azure + Databricks · Preço de lista on-demand</p>
        </div>
        <span style={S.badge}>MVP v0.6</span>
      </div>

      <div style={S.body}>
        <div>
          {/* Preenchimento Automático */}
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardTitle()}>Preenchimento Automático (Beta)</span>
            </div>
            <div style={S.cardBody}>
              <Field label="Cole aqui o texto do Azure Calculator ou PDF">
                <textarea
                  style={{ ...S.input, height: 180, resize: 'vertical' }}
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder="Cole aqui todo o conteúdo do PDF ou da calculadora Azure..."
                />
              </Field>
              <button
                style={{ ...S.openCalcBtn, marginTop: 15, cursor: 'pointer', border: 'none' }}
                onClick={handleAutoFill}
              >
                🤖 Preencher automaticamente
              </button>
              {parserMessage && (
                <>
                  <p style={{
                    marginTop: 10,
                    color: parserMessage.type === 'success' ? C.green : C.red,
                    fontSize: 12,
                    marginBottom: 0,
                  }}>
                    {parserMessage.text}
                  </p>
                  {(parserMessage.summary?.length ?? 0) > 0 && (
                    <div style={{ ...S.copyBox, marginTop: 8, fontSize: 10 }}>
                      <strong>Recursos identificados:</strong>
                      {(parserMessage.summary ?? []).map((item, i) => (
                        <div key={i}>• {item}</div>
                      ))}
                    </div>
                  )}
                  {(parserMessage.warnings?.length ?? 0) > 0 && (
                    <p style={{ ...S.hint, marginTop: 6, fontStyle: 'normal' }}>
                      {(parserMessage.warnings ?? []).join(' · ')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Config global */}
          <div style={S.card}>
            <div style={S.cardHead}><span style={S.cardTitle()}>Configuração do Projeto</span></div>
            <div style={S.cardBody}>
              <Field label="Nome do Projeto">
                <input
                  style={{ ...S.input, marginBottom: 12 }}
                  type="text"
                  placeholder="Ex: Pipeline Analytics — Cliente XYZ"
                  value={cfg.projectName}
                  onChange={e => setCfg({ ...cfg, projectName: e.target.value })}
                />
              </Field>
              <div style={S.row}>
                <Field label="Região — Storage">
                  <select style={S.select} value={cfg.storageRegion}
                    onChange={e => setCfg({ ...cfg, storageRegion: e.target.value })}>
                    {STORAGE_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Tier Databricks">
                  <select style={S.select} value={cfg.tier}
                    onChange={e => setCfg({ ...cfg, tier: e.target.value })}>
                    {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
              <p style={S.hint}>
                A região de compute (Databricks/VMs) agora é definida em cada workload
                (All-Purpose e Job Compute) — casos reais frequentemente usam regiões
                diferentes para cada um dentro do mesmo projeto.
              </p>
            </div>
          </div>

          {/* Storage */}
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardTitle('#79c0ff')}>Storage — ADLS Gen2</span>
              <Toggle on={cfg.storageEnabled} onChange={v => setCfg({ ...cfg, storageEnabled: v })}
                label={cfg.storageEnabled ? 'Ativo' : 'Inativo'} />
            </div>
            <div style={{ ...S.cardBody, ...(cfg.storageEnabled ? {} : S.disabled) }}>
              <Field label="Capacidade total (GB)">
                <input style={{ ...S.input, maxWidth: 180 }} type="number" min={0}
                  value={cfg.storageGB}
                  onChange={e => setCfg({ ...cfg, storageGB: Number(e.target.value) })} />
              </Field>
              <p style={S.hint}>LRS · Hot · Operações fixadas no padrão Dataside — ajuste fino na calculadora oficial.</p>
            </div>
          </div>

          <WorkloadSection title="All-Purpose Compute" color={C.green}
            workload={cfg.allPurpose}
            onChange={v => setCfg({ ...cfg, allPurpose: v })} />

          <WorkloadSection title="Job Compute" color={C.yellow}
            workload={cfg.jobCompute}
            onChange={v => setCfg({ ...cfg, jobCompute: v })} />

          <SqlSection sql={cfg.sqlCompute}
            onChange={v => setCfg({ ...cfg, sqlCompute: v })} />

          <div style={S.card}>
            <div style={S.cardHead}><span style={S.cardTitle()}>Serviços Adicionais</span></div>
            <div style={S.cardBody}>
              <div style={{ display: 'flex', gap: 24 }}>
                <Toggle on={cfg.postgre}  onChange={v => setCfg({ ...cfg, postgre: v })}  label="PostgreSQL Flexible (D2dsv5)" />
                <Toggle on={cfg.keyVault} onChange={v => setCfg({ ...cfg, keyVault: v })} label="Key Vault" />
              </div>
            </div>
          </div>
        </div>

        {/* Painel direito */}
        <div style={S.stickyPanel}>
          {mixedCurrency && (
            <div style={S.warningBanner}>
              ⚠️ Storage em Brazil South (BRL) + compute em região USD no mesmo projeto.
              Os totais abaixo são mostrados <strong>separados por moeda</strong> — nunca somados,
              para evitar um número final incorreto. O MVP ainda não tem tabela de preço de
              compute Databricks/VM para Brazil South.
            </div>
          )}
          {!mixedCurrency && allWarnings.length > 0 && (
            <div style={S.warningBanner}>
              ⚠️ {allWarnings.length === 1 ? 'Aviso de preço:' : `${allWarnings.length} avisos de preço:`}{' '}
              {[...new Set(allWarnings)].join(' · ')}
            </div>
          )}
          <div style={S.totalCard}>
            <div style={S.totalLabel}>
              {cfg.projectName
                ? `Estimativa — ${cfg.projectName}`
                : 'Custo total estimado (todos os ambientes ativos)'}
              {mixedCurrency && ' — Compute (USD)'}
            </div>
            <div>
              <span style={S.totalValue}>{fmt(grand)}</span>
              <span style={S.totalCurrency}>{currency}/mês</span>
            </div>
            <div style={S.envPills}>
              {Object.entries(ENV_DEFAULTS).map(([k, d]) => (
                <div key={k} style={S.envPill(d.color)}>
                  <div style={S.envPillLabel(d.color)}>{d.label}</div>
                  <div style={S.envPillVal}>{fmt(totals[k])}</div>
                </div>
              ))}
            </div>
          </div>

          {mixedCurrency && grandBRL > 0.001 && (
            <div style={S.totalCard}>
              <div style={S.totalLabel}>Storage — Brazil South (BRL)</div>
              <div>
                <span style={S.totalValue}>{fmt(grandBRL)}</span>
                <span style={S.totalCurrency}>BRL/mês</span>
              </div>
              <div style={S.envPills}>
                {Object.entries(ENV_DEFAULTS).map(([k, d]) => (
                  <div key={k} style={S.envPill(d.color)}>
                    <div style={S.envPillLabel(d.color)}>{d.label}</div>
                    <div style={S.envPillVal}>{fmt(totalsBRL[k])}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {breakdown.length > 0 && (
            <div style={S.card}>
              <div style={S.cardHead}><span style={S.cardTitle()}>Breakdown por Serviço</span></div>
              <div style={S.cardBody}>
                {breakdown.map(b => (
                  <div key={b.label}>
                    <div style={S.breakdownItem}>
                      <span style={{ color: C.muted }}>{b.label}</span>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(b.prod + b.hom + b.dev)}</span>
                    </div>
                    <div style={S.breakdownSub}>
                      {[['PROD', b.prod, C.green], ['HOM', b.hom, C.yellow], ['DEV', b.dev, C.blue]]
                        .filter(([, v]) => v > 0.001)
                        .map(([env, val, color]) => (
                          <div key={env} style={S.breakdownSubLine}>
                            <span style={{ color }}>{env}</span>
                            <span>{fmt(val)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <GuiaPreenchimento
            cfg={cfg}
            breakdown={breakdown}
            totals={totals}
            currency={currency}
          />
        </div>
      </div>
    </div>
  );
}