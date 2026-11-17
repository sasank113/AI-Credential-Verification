import React, { useState } from 'react';
import { aiApi } from '../services/api';
import { Bot, Send, Code, Database, Sparkles } from 'lucide-react';

export default function AiAssistantPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);

  const sampleQueries = [
    "Show all active credentials issued to Software Engineers in the last month",
    "List all revoked medical license credentials",
    "Find credentials flagged with high AI fraud risk scores"
  ];

  const handleRunQuery = async (e) => {
    e?.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const res = await aiApi.queryNaturalLanguage(query);
      setQueryResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--gradient-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Bot size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Natural Language Credential Assistant</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Query registry credentials and audit logs in plain English.</p>
          </div>
        </div>

        <form onSubmit={handleRunQuery} style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Ask anything (e.g. Find all credentials issued to computer science graduates with GPA > 3.5)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Send size={16} /> {loading ? 'Thinking...' : 'Query'}
          </button>
        </form>

      </div>

      {queryResult && (
        <div className="grid-2">
          {/* Query Translation Explanation */}
          <div className="glass-card">
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              <Sparkles size={18} color="var(--accent-purple)" /> AI Response
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {queryResult.answer}
            </p>
          </div>

          {/* Results Table */}
          <div className="glass-card">
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} color="var(--accent-emerald)" /> Query Results ({queryResult.data?.length || 0} records)
            </h4>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Identifier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(queryResult.data || []).map((r, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.recipient_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {r.payload?.degree || r.payload?.branch || ''}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{r.recipient_identifier}</td>
                    <td>
                      <span className={`badge ${r.status === 'ISSUED' ? 'badge-success' : 'badge-danger'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
