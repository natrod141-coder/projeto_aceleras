import React, { useState, useEffect } from 'react';
import { calculateEstimate } from './engine/calculator';

// ─── Constantes ────────────────────────────────────────────────────────────────

const REGIONS = [
  { value: 'EAST_US',      label: 'East US (Leste dos EUA)' },
  { value: 'WEST_US',      label: 'West US (Oeste dos EUA)' },
  { value: 'BRAZIL_SOUTH', label: 'Brazil South (Sul do Brasil)' },
];

const TIERS = [
  { value: 'premium',  label: 'Premium' },
  { value: 'standard', label: 'Standard' },
];

const INSTANCES = ['D3V2', 'DS3V2', 'D4AV4', 'D8AV4', 'D16AV4'];

const PRESETS = {
  comercial: { label: 'Janela Comercial', horasVM: 352, horasDbu: 730 },
  continuo:  { label: 'Contínuo (24/7)',  horasVM: 744, horasDbu: 744 },
  custom:    { label: 'Personalizado',    horasVM: null, horasDbu: null },
};

// Regras de projeção Dev/Hom a partir de Prod (Oscar)
const ENV_RATIOS = { hom: 0.25, dev: 0.50 };

// ─── Default de um workload ────────────────────────────────────────────────────
const defaultWorkload = (instance = 'D8AV4', preset = 'comercial') => ({
  enabled:   false,
  instance,
  nodes:     1,
  preset,
  horasVM:   PRESETS[preset].horasVM,
  horasDbu:  PRESETS[preset].horasDbu,
});

// ─── Estado inicial ────────────────────────────────────────────────────────────
const INITIAL = {
  storageRegion:  'EAST_US',
  computeRegion:  'WEST_US',
  tier:           'premium',
  storageGB:      0,
  storageEnabled: true,
  allPurpose:  defaultWorkload('D3V2',  'comercial'),
  jobCompute:  defaultWorkload('D8AV4', 'comercial'),
  sqlCompute:  defaultWorkload('D16AV4','continuo'),
  postgre:     false,
  keyVault:    false,
};

// ─── Estilos ───────────────────────────────────────────────────────────────────
const S = {
  app: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#e6edf3',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: '0 0 60px',
  },
  header: {
    background: 'linear-gradient(135deg, #1a237e 0%, #0078d4 100%)',
    padding: '28px 40px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    borderBottom: '1px solid #30363d',
  },
  headerTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.3px',
  },
  headerSub: {
    margin: '2px 0 0',
    fontSize: '12px',
    opacity: 0.7,
    fontWeight: 400,
  },
  badge: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  body: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '32px 24px',
    display: 'grid',
    gridTemplateColumns: '1fr 360px',
    gap: '24px',
    alignItems: 'start',
  },
  card: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  cardHeader: {
    padding: '14px 20px',
    background: '#1c2128',
    borderBottom: '1px solid #30363d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  cardBody: {
    padding: '20px',
  },
  row: {
    display: 'flex',
    gap: '12px',
    marginBottom: '14px',
    flexWrap: 'wrap',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    flex: 1,
    minWidth: '120px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    color: '#e6edf3',
    padding: '8px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
  },
  toggle: (on) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    color: on ? '#58a6ff' : '#8b949e',
    fontWeight: on ? 600 : 400,
    userSelect: 'none',
  }),
  toggleTrack: (on) => ({
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    background: on ? '#1f6feb' : '#30363d',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  }),
  toggleThumb: (on) => ({
    position: 'absolute',
    top: '3px',
    left: on ? '18px' : '3px',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.2s',
  }),
  presetBar: {
    display: 'flex',
    gap: '6px',
    marginBottom: '14px',
  },
  presetBtn: (active) => ({
    padding: '5px 12px',
    borderRadius: '20px',
    border: active ? '1px solid #58a6ff' : '1px solid #30363d',
    background: active ? 'rgba(31,111,235,0.15)' : 'transparent',
    color: active ? '#58a6ff' : '#8b949e',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: '0.3px',
  }),
  envGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
    marginTop: '10px',
  },
  envCard: (color) => ({
    background: '#0d1117',
    border: `1px solid ${color}33`,
    borderRadius: '8px',
    padding: '12px',
  }),
  envLabel: (color) => ({
    fontSize: '10px',
    fontWeight: 700,
    color,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '6px',
  }),
  envValue: {
    fontSize: '13px',
    color: '#e6edf3',
    fontWeight: 500,
  },
  envSub: {
    fontSize: '11px',
    color: '#8b949e',
    marginTop: '2px',
  },
  stickyPanel: {
    position: 'sticky',
    top: '24px',
  },
  totalCard: {
    background: 'linear-gradient(135deg, #0f2744 0%, #0d1b2e 100%)',
    border: '1px solid #1f6feb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '16px',
  },
  totalLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '8px',
  },
  totalValue: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#58a6ff',
    letterSpacing: '-1px',
    lineHeight: 1,
  },
  totalCurrency: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#8b949e',
    marginLeft: '4px',
  },
  breakdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #21262d',
    fontSize: '13px',
  },
  breakdownLabel: {
    color: '#8b949e',
  },
  breakdownValue: {
    color: '#e6edf3',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  envBreakdown: {
    marginTop: '6px',
    paddingLeft: '12px',
    borderLeft: '2px solid #21262d',
  },
  envBreakdownLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#8b949e',
    padding: '2px 0',
  },
  guideCard: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '12px',
    padding: '20px',
  },
  guideTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#8b949e',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '12px',
  },
  guideStep: {
    fontSize: '12px',
    color: '#8b949e',
    lineHeight: 1.6,
    marginBottom: '8px',
    paddingLeft: '16px',
    position: 'relative',
  },
  guideStepDot: {
    position: 'absolute',
    left: 0,
    color: '#1f6feb',
    fontWeight: 700,
  },
  disabled: {
    opacity: 0.35,
    pointerEvents: 'none',
  },
};

// ─── Componentes auxiliares ────────────────────────────────────────────────────

function Toggle({ on, onChange, label }) {
  return (
    <label style={S.toggle(on)} onClick={() => onChange(!on)}>
      <span style={S.toggleTrack(on)}>
        <span style={S.toggleThumb(on)} />
      </span>
      {label}
    </label>
  );
}

function Field({ label, children }) {
  return (
    <div style={S.field}>
      <span style={S.label}>{label}</span>
      {children}
    </div>
  );
}

function WorkloadSection({ title, color, workload, onChange, tier }) {
  const setPreset = (key) => {
    const p = PRESETS[key];
    onChange({ ...workload, preset: key, horasVM: p.horasVM, horasDbu: p.horasDbu });
  };

  // Projeção Dev/Hom a partir de Prod
  const projHom = {
    horasVM:  Math.round((workload.horasVM  ?? 0) * ENV_RATIOS.hom),
    horasDbu: Math.round((workload.horasDbu ?? 0) * ENV_RATIOS.hom),
  };
  const projDev = {
    horasVM:  Math.round((workload.horasVM  ?? 0) * ENV_RATIOS.dev),
    horasDbu: Math.round((workload.horasDbu ?? 0) * ENV_RATIOS.dev),
  };

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={{ ...S.cardTitle, color }}>{title}</span>
        <Toggle on={workload.enabled} onChange={(v) => onChange({ ...workload, enabled: v })} label={workload.enabled ? 'Ativo' : 'Inativo'} />
      </div>

      <div style={{ ...S.cardBody, ...(workload.enabled ? {} : S.disabled) }}>
        <div style={S.row}>
          <Field label="Instância VM">
            <select style={S.select} value={workload.instance}
              onChange={e => onChange({ ...workload, instance: e.target.value })}>
              {INSTANCES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Nós (Prod)">
            <input style={S.input} type="number" min={1} value={workload.nodes}
              onChange={e => onChange({ ...workload, nodes: Number(e.target.value) })} />
          </Field>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <span style={S.label}>Perfil de Execução (Prod)</span>
          <div style={{ ...S.presetBar, marginTop: '8px' }}>
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} style={S.presetBtn(workload.preset === key)}
                onClick={() => setPreset(key)}>{p.label}</button>
            ))}
          </div>
        </div>

        {workload.preset === 'custom' && (
          <div style={S.row}>
            <Field label="Horas VM (Prod)">
              <input style={S.input} type="number" min={1} max={744}
                value={workload.horasVM ?? ''}
                onChange={e => onChange({ ...workload, horasVM: Number(e.target.value) })} />
            </Field>
            <Field label="Horas DBU (Prod)">
              <input style={S.input} type="number" min={1} max={744}
                value={workload.horasDbu ?? ''}
                onChange={e => onChange({ ...workload, horasDbu: Number(e.target.value) })} />
            </Field>
          </div>
        )}

        <div style={S.envGrid}>
          {[
            { key: 'PROD', color: '#3fb950', h: workload, ratio: null },
            { key: 'HOM',  color: '#d29922', h: projHom,  ratio: '25% Prod' },
            { key: 'DEV',  color: '#58a6ff', h: projDev,  ratio: '50% Prod' },
          ].map(({ key, color: c, h, ratio }) => (
            <div key={key} style={S.envCard(c)}>
              <div style={S.envLabel(c)}>{key}</div>
              <div style={S.envValue}>{h.horasVM ?? '-'}h VM</div>
              <div style={S.envSub}>{h.horasDbu ?? '-'}h DBU</div>
              {ratio && <div style={{ ...S.envSub, color: c, marginTop: '4px' }}>{ratio}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Função de cálculo por ambiente ───────────────────────────────────────────
function buildInput(cfg, envOverrides = {}) {
  const { storageRegion, computeRegion, tier, storageGB, allPurpose, jobCompute, sqlCompute, postgre, keyVault } = cfg;

  const horasFor = (w, env) => {
    if (env === 'prod') return { horasVM: w.horasVM ?? 0, horasDbu: w.horasDbu ?? 0 };
    const ratio = env === 'hom' ? ENV_RATIOS.hom : ENV_RATIOS.dev;
    return {
      horasVM:  Math.round((w.horasVM  ?? 0) * ratio),
      horasDbu: Math.round((w.horasDbu ?? 0) * ratio),
    };
  };

  const env = envOverrides.env ?? 'prod';
  const ap  = horasFor(allPurpose,  env);
  const job = horasFor(jobCompute,  env);
  const sql = horasFor(sqlCompute,  env);

  return {
    storageRegion, computeRegion, tier,
    storageGB: env === 'prod' ? storageGB : 0, // storage só em prod

    apDevInstance:   allPurpose.instance,  apDevNodes:  allPurpose.nodes,
    apDevHorasVM:    ap.horasVM,           apDevHorasDbu: ap.horasDbu,
    apProdInstance:  allPurpose.instance,  apProdNodes: allPurpose.nodes,
    apProdHorasVM:   ap.horasVM,           apProdHorasDbu: ap.horasDbu,

    jobDevInstance:  jobCompute.instance,  jobDevNodes:  jobCompute.nodes,
    jobDevHorasVM:   job.horasVM,          jobDevHorasDbu: job.horasDbu,
    jobProdInstance: jobCompute.instance,  jobProdNodes: jobCompute.nodes,
    jobProdHorasVM:  job.horasVM,          jobProdHorasDbu: job.horasDbu,

    sqlInstance:     sqlCompute.instance,  sqlNodes:    sqlCompute.nodes,
    sqlHorasVM:      sql.horasVM,          sqlHorasDbu: sql.horasDbu,

    includePostgre:   postgre,
    includeKeyVault:  keyVault,

    // flags de ativação
    _apEnabled:  allPurpose.enabled,
    _jobEnabled: jobCompute.enabled,
    _sqlEnabled: sqlCompute.enabled,
  };
}

// ─── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [cfg, setCfg] = useState(INITIAL);
  const [results, setResults] = useState(null);

  useEffect(() => {
    try {
      const prod = calculateEstimate({ ...buildInput(cfg, { env: 'prod' }), _env: 'prod' });
      const hom  = calculateEstimate({ ...buildInput(cfg, { env: 'hom'  }), _env: 'hom'  });
      const dev  = calculateEstimate({ ...buildInput(cfg, { env: 'dev'  }), _env: 'dev'  });

      // Zera serviços desabilitados
      const mask = (r, key) => cfg[key]?.enabled ? r : 0;

      const masked = (r) => ({
        ...r,
        lines: {
          ...r.lines,
          apDev:  cfg.allPurpose.enabled ? r.lines.apDev  : 0,
          apProd: cfg.allPurpose.enabled ? r.lines.apProd : 0,
          jobDev:  cfg.jobCompute.enabled ? r.lines.jobDev  : 0,
          jobProd: cfg.jobCompute.enabled ? r.lines.jobProd : 0,
          sql:    cfg.sqlCompute.enabled  ? r.lines.sql    : 0,
        },
      });

      const mp = masked(prod);
      const mh = masked(hom);
      const md = masked(dev);

      const sumLines = (r) =>
        r.lines.storage + r.lines.apDev + r.lines.apProd +
        r.lines.jobDev + r.lines.jobProd + r.lines.sql +
        r.lines.postgre + r.lines.keyVault;

      setResults({
        prod: { ...mp, total: sumLines(mp) },
        hom:  { ...mh, total: sumLines(mh) },
        dev:  { ...md, total: sumLines(md) },
        currency: prod.currency,
      });
    } catch (e) {
      console.error(e);
    }
  }, [cfg]);

  const grandTotal = results
    ? results.prod.total + results.hom.total + results.dev.total
    : 0;

  const fmt = (v) =>
    v == null ? '—' :
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currency = results?.currency ?? 'USD';

  const breakdown = results ? [
    { label: 'Storage (ADLS Gen2)', prod: results.prod.lines.storage, hom: 0, dev: 0 },
    { label: 'All-Purpose Compute', prod: results.prod.lines.apProd,  hom: results.hom.lines.apProd,  dev: results.dev.lines.apProd  },
    { label: 'Job Compute',         prod: results.prod.lines.jobProd, hom: results.hom.lines.jobProd, dev: results.dev.lines.jobProd },
    { label: 'SQL Serverless',      prod: results.prod.lines.sql,     hom: results.hom.lines.sql,     dev: results.dev.lines.sql     },
    { label: 'PostgreSQL',          prod: results.prod.lines.postgre, hom: 0,                         dev: 0                         },
    { label: 'Key Vault',           prod: results.prod.lines.keyVault,hom: results.hom.lines.keyVault,dev: results.dev.lines.keyVault},
  ].filter(b => b.prod + b.hom + b.dev > 0) : [];

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.headerTitle}>Azure Cost Estimator</h1>
          <p style={S.headerSub}>Dataside · Azure + Databricks · Preço de lista on-demand</p>
        </div>
        <span style={{ ...S.badge, marginLeft: 'auto' }}>MVP v0.1</span>
      </div>

      <div style={S.body}>
        {/* Coluna esquerda — formulário */}
        <div>
          {/* Configuração global */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Configuração do Projeto</span>
            </div>
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
            <div style={S.cardHeader}>
              <span style={{ ...S.cardTitle, color: '#79c0ff' }}>Storage — ADLS Gen2</span>
              <Toggle on={cfg.storageEnabled}
                onChange={v => setCfg({ ...cfg, storageEnabled: v })}
                label={cfg.storageEnabled ? 'Ativo' : 'Inativo'} />
            </div>
            <div style={{ ...S.cardBody, ...(cfg.storageEnabled ? {} : S.disabled) }}>
              <Field label="Capacidade total (GB)">
                <input style={{ ...S.input, maxWidth: '200px' }} type="number" min={0}
                  value={cfg.storageGB}
                  onChange={e => setCfg({ ...cfg, storageGB: Number(e.target.value) })} />
              </Field>
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#6e7681' }}>
                LRS · Hot · Operações assumem padrão Dataside — ajuste fino na calculadora oficial.
              </p>
            </div>
          </div>

          {/* Workloads */}
          <WorkloadSection title="All-Purpose Compute" color="#3fb950"
            workload={cfg.allPurpose} tier={cfg.tier}
            onChange={v => setCfg({ ...cfg, allPurpose: v })} />

          <WorkloadSection title="Job Compute" color="#d29922"
            workload={cfg.jobCompute} tier={cfg.tier}
            onChange={v => setCfg({ ...cfg, jobCompute: v })} />

          <WorkloadSection title="SQL Serverless" color="#f78166"
            workload={cfg.sqlCompute} tier={cfg.tier}
            onChange={v => setCfg({ ...cfg, sqlCompute: v })} />

          {/* Periféricos */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Serviços Adicionais</span>
            </div>
            <div style={S.cardBody}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <Toggle on={cfg.postgre}
                  onChange={v => setCfg({ ...cfg, postgre: v })}
                  label="PostgreSQL Flexible (D2dsv5)" />
                <Toggle on={cfg.keyVault}
                  onChange={v => setCfg({ ...cfg, keyVault: v })}
                  label="Key Vault" />
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita — resultado */}
        <div style={S.stickyPanel}>
          <div style={S.totalCard}>
            <div style={S.totalLabel}>Custo total estimado (Dev + Hom + Prod)</div>
            <div>
              <span style={S.totalValue}>{fmt(grandTotal)}</span>
              <span style={S.totalCurrency}>{currency}/mês</span>
            </div>

            {results && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                {[
                  { key: 'PROD', color: '#3fb950', val: results.prod.total },
                  { key: 'HOM',  color: '#d29922', val: results.hom.total  },
                  { key: 'DEV',  color: '#58a6ff', val: results.dev.total  },
                ].map(({ key, color, val }) => (
                  <div key={key} style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color, letterSpacing: '1px', marginBottom: '4px' }}>{key}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#e6edf3', fontVariantNumeric: 'tabular-nums' }}>{fmt(val)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Breakdown */}
          {breakdown.length > 0 && (
            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardTitle}>Breakdown por Serviço</span>
              </div>
              <div style={S.cardBody}>
                {breakdown.map(b => (
                  <div key={b.label}>
                    <div style={S.breakdownItem}>
                      <span style={S.breakdownLabel}>{b.label}</span>
                      <span style={S.breakdownValue}>{fmt(b.prod + b.hom + b.dev)}</span>
                    </div>
                    <div style={S.envBreakdown}>
                      {[['PROD', b.prod, '#3fb950'], ['HOM', b.hom, '#d29922'], ['DEV', b.dev, '#58a6ff']]
                        .filter(([, v]) => v > 0)
                        .map(([env, val, color]) => (
                          <div key={env} style={S.envBreakdownLine}>
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

          {/* Guia de preenchimento */}
          <div style={S.guideCard}>
            <div style={S.guideTitle}>📋 Guia de Preenchimento — Calculadora Azure</div>
            <div style={S.guideStep}>
              <span style={S.guideStepDot}>1.</span>
              Acesse <strong>azure.microsoft.com/pricing/calculator</strong>
            </div>
            <div style={S.guideStep}>
              <span style={S.guideStepDot}>2.</span>
              Adicione <strong>Storage Accounts</strong> → selecione ADLS Gen2, LRS, Hot, região {REGIONS.find(r => r.value === cfg.storageRegion)?.label}
            </div>
            <div style={S.guideStep}>
              <span style={S.guideStepDot}>3.</span>
              Adicione <strong>Azure Databricks</strong> → selecione Tier {cfg.tier === 'premium' ? 'Premium' : 'Standard'}, região {REGIONS.find(r => r.value === cfg.computeRegion)?.label}
            </div>
            <div style={S.guideStep}>
              <span style={S.guideStepDot}>4.</span>
              Para cada workload ativo, preencha Workload Type, instância VM, nós e horas conforme os valores calculados acima.
            </div>
            <div style={S.guideStep}>
              <span style={S.guideStepDot}>5.</span>
              Repita para os ambientes Hom e Dev usando as horas projetadas automaticamente.
            </div>
            <div style={S.guideStep}>
              <span style={S.guideStepDot}>6.</span>
              Clique em <strong>Save and share</strong> para gerar o link oficial.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}