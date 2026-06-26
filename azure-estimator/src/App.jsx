import React, { useState, useEffect } from 'react';
import { calculateEstimate } from './engine/calculator';
import { azure_prices } from './data/prices';

function App() {
  const [inputs, setInputs] = useState({
    storageGB: 10000, // 10TB para bater com PRIO
    instanceKey: 'D8AV4',
    nodes: 2,
    hoursProd: 325,
    sqlHours: 176,
    jobHours: 300
  });

  const [results, setResults] = useState(null);

  useEffect(() => {
    // Agora passamos o objeto completo de inputs
    setResults(calculateEstimate(inputs));
  }, [inputs]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: isNaN(value) ? value : Number(value) }));
  };

  if (!results) return <div>Carregando...</div>;

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Azure Cost Estimator (Gabarito PRIO)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px', background: '#f9f9f9', padding: '15px' }}>
        <div>
          <h3>Infra & All-Purpose</h3>
          <label>Storage (GB): <input name="storageGB" type="number" value={inputs.storageGB} onChange={handleChange} /></label><br/>
          <label>Instância: 
            <select name="instanceKey" value={inputs.instanceKey} onChange={handleChange}>
              {Object.keys(azure_prices.databricks.instances).map(key => <option key={key} value={key}>{key}</option>)}
            </select>
          </label><br/>
          <label>Quantidade de Nós: <input name="nodes" type="number" value={inputs.nodes} onChange={handleChange} /></label><br/>
          <label>Horas All-Purpose: <input name="hoursProd" type="number" value={inputs.hoursProd} onChange={handleChange} /></label>
        </div>
        <div>
          <h3>Workloads Específicos</h3>
          <label>Horas SQL Serverless: <input name="sqlHours" type="number" value={inputs.sqlHours} onChange={handleChange} /></label><br/>
          <label>Horas Job Compute: <input name="jobHours" type="number" value={inputs.jobHours} onChange={handleChange} /></label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px' }}>
        <div style={{ border: '1px solid #ccc', padding: '10px', flex: 1 }}>
          <h3>DEV</h3>
          <strong>Total: ${results.dev.total.toFixed(2)}</strong>
        </div>
        <div style={{ border: '1px solid #ccc', padding: '10px', flex: 1 }}>
          <h3>PROD</h3>
          <strong>Total: ${results.prod.total.toFixed(2)}</strong>
        </div>
      </div>

      <h2 style={{ textAlign: 'right' }}>Total Mensal: ${results.totalMonthly.toFixed(2)}</h2>
      <p style={{ textAlign: 'right', color: 'gray' }}>Gabarito PRIO: $2,653.80</p>
    </div>
  );
}

export default App;