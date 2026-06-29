import React, { useState, useMemo } from 'react';
import { calculateEstimate } from './engine/calculator';

// ─── Constantes ────────────────────────────────────────────────────────────────

const REGIONS = [
  { value: 'EAST_US',      label: 'East US' },
  { value: 'WEST_US',      label: 'West US' },
  { value: 'BRAZIL_SOUTH', label: 'Brazil South' },
];

const TIERS = [
  { value: 'premium',  label: 'Premium' },
  { value: 'standard', label: 'Standard' },
];

const INSTANCES = ['D3V2', 'DS3V2', 'D4AV4', 'D8AV4', 'D16AV4'];

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

// ─── Estado default de um ambiente de workload ────────────────────────────────
const defaultEnv = (instance, nodes, preset, override = false) => ({
  enabled:  true,
  override, // se true, usa valores próprios; se false, deriva de prod
  instance,
  nodes,
  preset,
  horasVM:  PRESETS[preset].horasVM,
  horasDbu: PRESETS[preset].horasDbu,
});

const defaultWorkload = (instance = 'D8AV4', preset = 'comercial') => ({
  enabled: false,
  prod: defaultEnv(instance, 1, preset, true),
  hom:  defaultEnv(instance, 1, preset, false),
  dev:  defaultEnv(instance, 1, preset, false),
});

const INITIAL = {
  storageRegion:  'EAST_US',
  computeRegion:  'WEST_US',
  tier:           'premium',
  storageGB:      0,
  storageEnabled: true,
  allPurpose:  defaultWorkload('D3V2',  'interativo'),
  jobCompute:  defaultWorkload('D8AV4', 'comercial'),
  sqlCompute:  defaultWorkload('D16AV4','mensal'),
  postgre:     false,
  keyVault:    false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Resolve os parâmetros de um ambiente (override ou derivado de prod)
const resolveEnv = (envKey, workload) => {
  const env = workload[envKey];
  if (!env.enabled) return null;
  if (env.override || envKey === 'prod') return env;
  // Deriva de prod com ratio
  const prod = workload.prod;
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

// ─── Cálculo ──────────────────────────────────────────────────────────────────

const calcWorkloadEnv = (envParams, workloadType, tier, computeRegion, prices) => {
  if (!envParams) return 0;
  const { instance, nodes, horasVM, horasDbu } = envParams;
  const inst = prices.databricks.instances[instance];
  if (!inst) return 0;
  const dbuPrice = prices.databricks.tiers[tier]?.[workloadType] ?? 0;
  const vmPrice  = inst.vm_price_per_hour?.[computeRegion] ?? 0;
  return (nodes * inst.dbu_per_hour * dbuPrice * horasDbu)
       + (nodes * vmPrice * horasVM);
};

const runCalc = (cfg) => {
  const envKeys = ['prod', 'hom', 'dev'];
  const results = {};

  for (const env of envKeys) {
    const ap  = resolveEnv(env, cfg.allPurpose);
    const job = resolveEnv(env, cfg.jobCompute);
    const sql = resolveEnv(env, cfg.sqlCompute);

    const input = {
      storageRegion:  cfg.storageRegion,
      computeRegion:  cfg.computeRegion,
      tier:           cfg.tier,
      storageGB: env === 'prod' && cfg.storageEnabled ? cfg.storageGB : 0,

      // Dev zerado — cada ambiente calcula só sua própria linha
      apDevInstance:   'D8AV4', apDevNodes: 0,
      apDevHorasVM:    0,       apDevHorasDbu: 0,

      apProdInstance:  ap?.instance  ?? 'D8AV4',
      apProdNodes:     (cfg.allPurpose.enabled && ap) ? ap.nodes : 0,
      apProdHorasVM:   ap?.horasVM   ?? 0,
      apProdHorasDbu:  ap?.horasDbu  ?? 0,

      jobDevInstance:  'D8AV4', jobDevNodes: 0,
      jobDevHorasVM:   0,       jobDevHorasDbu: 0,

      jobProdInstance: job?.instance ?? 'D8AV4',
      jobProdNodes:    (cfg.jobCompute.enabled && job) ? job.nodes : 0,
      jobProdHorasVM:  job?.horasVM  ?? 0,
      jobProdHorasDbu: job?.horasDbu ?? 0,

      sqlInstance:  sql?.instance ?? 'D16AV4',
      sqlNodes:     (cfg.sqlCompute.enabled && sql) ? sql.nodes : 0,
      sqlHorasVM:   sql?.horasVM  ?? 0,
      sqlHorasDbu:  sql?.horasDbu ?? 0,

      includePostgre:  env === 'prod' && cfg.postgre,
      includeKeyVault: cfg.keyVault,
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
  presetBar: { display: 'flex', gap: 5, marginTop: 6 },
  presetBtn: (active) => ({ padding: '4px 10px', borderRadius: 20, border: active ? `1px solid ${C.blue}` : `1px solid ${C.border}`, background: active ? 'rgba(31,111,235,0.15)' : 'transparent', color: active ? C.blue : C.muted, fontSize: 10, fontWeight: 600, cursor: 'pointer' }),
  toggleWrap: (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12, color: on ? C.blue : C.muted, fontWeight: on ? 600 : 400, userSelect: 'none' }),
  toggleTrack: (on) => ({ width: 32, height: 18, borderRadius: 9, background: on ? C.accent : C.border, position: 'relative', transition: 'background .2s', flexShrink: 0 }),
  toggleThumb: (on) => ({ position: 'absolute', top: 2, left: on ? 15 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .2s' }),
  envTabs: { display: 'flex', gap: 6, marginBottom: 14 },
  envTab: (active, color) => ({ padding: '5px 12px', borderRadius: 6, border: active ? `1px solid ${color}` : `1px solid ${C.border}`, background: active ? `${color}18` : 'transparent', color: active ? color : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.5px' }),
  envToggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` },
  overrideBtn: (on) => ({ padding: '3px 8px', borderRadius: 4, border: `1px solid ${on ? C.yellow : C.border}`, background: on ? `${C.yellow}18` : 'transparent', color: on ? C.yellow : C.muted, fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.5px' }),
  stickyPanel: { position: 'sticky', top: 20 },
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
                <Field label="Horas VM"><input style={S.input} type="number" min={1} max={744}
                  value={env.horasVM ?? ''} onChange={e => update({ horasVM: Number(e.target.value) })} /></Field>
                <Field label="Horas DBU"><input style={S.input} type="number" min={1} max={744}
                  value={env.horasDbu ?? ''} onChange={e => update({ horasDbu: Number(e.target.value) })} /></Field>
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

function WorkloadSection({ title, color, workloadKey, workload, onChange }) {
  const [activeEnv, setActiveEnv] = useState('prod');
  const prod = workload.prod;

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span style={S.cardTitle(color)}>{title}</span>
        <Toggle on={workload.enabled} onChange={(v) => onChange({ ...workload, enabled: v })}
          label={workload.enabled ? 'Ativo' : 'Inativo'} />
      </div>
      <div style={{ ...S.cardBody, ...(workload.enabled ? {} : S.disabled) }}>
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
          prodValues={prod}
          onChange={(updated) => onChange({ ...workload, [activeEnv]: updated })}
        />
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [cfg, setCfg] = useState(INITIAL);

  const results = useMemo(() => {
    try { return runCalc(cfg); } catch (e) { console.error(e); return null; }
  }, [cfg]);

  const sumEnv = (env) => {
    if (!results?.[env]) return 0;
    const l = results[env].lines;
    return (l.storage ?? 0) + (l.apProd ?? 0)
         + (l.jobProd ?? 0) + (l.sql ?? 0)
         + (l.postgre ?? 0) + (l.keyVault ?? 0);
  };

  const totals = { prod: sumEnv('prod'), hom: sumEnv('hom'), dev: sumEnv('dev') };
  const grand  = totals.prod + totals.hom + totals.dev;
  const currency = results?.prod?.currency ?? 'USD';

  const breakdown = results ? [
    { label: 'Storage (ADLS Gen2)',  prod: results.prod.lines.storage ?? 0,  hom: 0, dev: 0 },
    { label: 'All-Purpose Compute',  prod: results.prod.lines.apProd  ?? 0,  hom: results.hom.lines.apProd  ?? 0, dev: results.dev.lines.apProd  ?? 0 },
    { label: 'Job Compute',          prod: results.prod.lines.jobProd ?? 0,  hom: results.hom.lines.jobProd ?? 0, dev: results.dev.lines.jobProd ?? 0 },
    { label: 'SQL Serverless',       prod: results.prod.lines.sql     ?? 0,  hom: results.hom.lines.sql     ?? 0, dev: results.dev.lines.sql     ?? 0 },
    { label: 'PostgreSQL',           prod: results.prod.lines.postgre ?? 0,  hom: 0, dev: 0 },
    { label: 'Key Vault',            prod: results.prod.lines.keyVault ?? 0, hom: results.hom.lines.keyVault ?? 0, dev: results.dev.lines.keyVault ?? 0 },
  ].filter(b => b.prod + b.hom + b.dev > 0.001) : [];

  const regionLabel = (v) => REGIONS.find(r => r.value === v)?.label ?? v;

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div>
          <h1 style={S.headerTitle}>Azure Cost Estimator</h1>
          <p style={S.headerSub}>Dataside · Azure + Databricks · Preço de lista on-demand</p>
        </div>
        <span style={S.badge}>MVP v0.2</span>
      </div>

      <div style={S.body}>
        {/* Formulário */}
        <div>
          {/* Config global */}
          <div style={S.card}>
            <div style={S.cardHead}><span style={S.cardTitle()}>Configuração do Projeto</span></div>
            <div style={S.cardBody}>
              <div style={S.row}>
                <Field label="Região — Storage">
                  <select style={S.select} value={cfg.storageRegion}
                    onChange={e => setCfg({ ...cfg, storageRegion: e.target.value })}>
                    {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Região — Databricks / VMs">
                  <select style={S.select} value={cfg.computeRegion}
                    onChange={e => setCfg({ ...cfg, computeRegion: e.target.value })}>
                    {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Tier Databricks">
                  <select style={S.select} value={cfg.tier}
                    onChange={e => setCfg({ ...cfg, tier: e.target.value })}>
                    {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              </div>
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

          {/* Workloads */}
          {[
            { key: 'allPurpose', title: 'All-Purpose Compute', color: C.green },
            { key: 'jobCompute', title: 'Job Compute',         color: C.yellow },
            { key: 'sqlCompute', title: 'SQL Serverless',      color: C.red },
          ].map(({ key, title, color }) => (
            <WorkloadSection key={key} title={title} color={color} workloadKey={key}
              workload={cfg[key]}
              onChange={v => setCfg({ ...cfg, [key]: v })} />
          ))}

          {/* Periféricos */}
          <div style={S.card}>
            <div style={S.cardHead}><span style={S.cardTitle()}>Serviços Adicionais</span></div>
            <div style={S.cardBody}>
              <div style={{ display: 'flex', gap: 24 }}>
                <Toggle on={cfg.postgre} onChange={v => setCfg({ ...cfg, postgre: v })} label="PostgreSQL Flexible (D2dsv5)" />
                <Toggle on={cfg.keyVault} onChange={v => setCfg({ ...cfg, keyVault: v })} label="Key Vault" />
              </div>
            </div>
          </div>
        </div>

        {/* Painel de resultado */}
        <div style={S.stickyPanel}>
          <div style={S.totalCard}>
            <div style={S.totalLabel}>Custo total estimado (todos os ambientes ativos)</div>
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

          {/* Guia */}
          <div style={S.guideCard}>
            <div style={S.guideTitle}>📋 Guia de Preenchimento — Calculadora Azure</div>
            {[
              <>Acesse <strong>azure.microsoft.com/pricing/calculator</strong></>,
              <>Adicione <strong>Storage Accounts</strong> → ADLS Gen2, LRS, Hot, região <strong>{regionLabel(cfg.storageRegion)}</strong></>,
              <>Adicione <strong>Azure Databricks</strong> → Tier <strong>{cfg.tier === 'premium' ? 'Premium' : 'Standard'}</strong>, região <strong>{regionLabel(cfg.computeRegion)}</strong></>,
              <>Para cada workload ativo, configure Workload Type, instância, nós e horas conforme o breakdown acima — repita para cada ambiente ativo.</>,
              <>Clique em <strong>Save and share</strong> para gerar o link oficial.</>,
            ].map((step, i) => (
              <div key={i} style={S.guideStep}>
                <span style={S.dot}>{i + 1}.</span>{step}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}