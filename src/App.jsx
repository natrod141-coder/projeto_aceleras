import React, { useState, useEffect } from 'react';
import { calculateEstimate } from './engine/calculator';
import { azure_prices } from './data/prices';

function App() {
  const [inputs, setInputs] = useState({
    storageGB: 72000,
    nodesProd: 2,
    hoursProd: 352,
    sqlHours: 730,
    jobHoursProd: 352
  });

  const [results, setResults] = useState(null);
  const GABARITO_ESPERADO = 6223.25;

  useEffect(() => {
    setResults(calculateEstimate(inputs));
  }, [inputs]);

  if (!results) return <div>Calculando...</div>;

  return (
    <div style={{ padding: '30px', fontFamily: 'Segoe UI, sans-serif'}}>
      <h1 style={{ fontSize: '25px'}}>Azure Cost Estimator (Comparativo AMAGGI)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f3f2f1', padding: '20px', borderRadius: '8px' }}>
        <div>
          <h3>Parâmetros de Entrada</h3>
          <label>Storage (GB): <input type="number" value={inputs.storageGB} onChange={e => setInputs({...inputs, storageGB: Number(e.target.value)})} /></label><br/><br/>
          <label>Nós All-Purpose Prod: <input type="number" value={inputs.nodesProd} onChange={e => setInputs({...inputs, nodesProd: Number(e.target.value)})} /></label>
        </div>
        <div style={{ borderLeft: '1px solid #ccc', paddingLeft: '20px' }}>
          <h3>Breakdown de Linhas</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li>Storage: ${results.lines.storage.toFixed(2)}</li>
            <li>DB All-Purpose (Dev+Prod): ${(results.lines.dbDev + results.lines.dbProd).toFixed(2)}</li>
            <li>DB Jobs (Dev+Prod): ${(results.lines.jobDev + results.lines.jobProd).toFixed(2)}</li>
            <li>DB SQL Serverless: ${results.lines.sql.toFixed(2)}</li>
            <li>PostgreSQL: ${results.lines.postgre.toFixed(2)}</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', backgroundColor: '#eef7ff', borderRadius: '10px', border: '2px solid #0078d4' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0078d4' }}>Total Calculado: ${results.totalCalculado.toFixed(2)}</h2>
          <p style={{ margin: '5px 0 0', fontWeight: 'bold', color: results.totalCalculado.toFixed(2) === GABARITO_ESPERADO.toString() ? 'green' : 'orange' }}>
            Status: {results.totalCalculado.toFixed(2) === GABARITO_ESPERADO.toString() ? '✅ Fidelidade 100%' : '⚠️ Divergência em ajustes'}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h3 style={{ margin: 0, color: '#666' }}>Total Esperado (Gabarito):</h3>
          <h2 style={{ margin: 0, color: '#333' }}>${GABARITO_ESPERADO.toFixed(2)}</h2>
        </div>
      </div>
    </div>
  );
}

export default App;