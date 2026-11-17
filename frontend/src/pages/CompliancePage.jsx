import React, { useEffect, useState } from 'react';
import { complianceApi, authApi } from '../services/api';
import { FileText, Download, Shield, RefreshCw, KeyRound, LogOut, Radio } from 'lucide-react';

export default function CompliancePage() {
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogsAndSessions = async () => {
    setLoading(true);
    try {
      const data = await complianceApi.getAuditLogs();
      setLogs(data);
      const sessList = await authApi.getSessions();
      setSessions(sessList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsAndSessions();
  }, []);

  const handleRevokeSession = async (sessionId) => {
    if (!window.confirm("Are you sure you want to revoke this active session?")) return;
    try {
      await authApi.revokeSession(sessionId);
      await fetchLogsAndSessions();
    } catch (err) {
      alert("Failed to revoke session");
    }
  };

  const handleExport = async (format) => {
    try {
      const report = await complianceApi.exportReport(format);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `compliance_report_${Date.now()}.${format}`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      alert("Failed to export compliance report.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Realtime Active Sessions Manager */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={18} color="var(--accent-emerald)" /> Realtime Authenticated JWT Sessions ({sessions.length})
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Live PostgreSQL tracked user sessions. Revoking a session immediately terminates its WebSocket heartbeat.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={fetchLogsAndSessions}>
            <RefreshCw size={12} /> Sync Sessions
          </button>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>IP Address</th>
              <th>Browser User Agent</th>
              <th>Issued At</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent-cyan)' }}>
                  {s.id}
                </td>
                <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{s.ip_address || '127.0.0.1'}</td>
                <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.user_agent || 'Client Agent'}</td>
                <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(s.created_at).toLocaleString()}</td>
                <td>
                  <span className={`badge ${s.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {s.is_active ? 'ACTIVE' : 'REVOKED'}
                  </span>
                </td>
                <td>
                  {s.is_active && (
                    <button className="btn btn-danger" style={{ fontSize: '11px', padding: '2px 6px' }} onClick={() => handleRevokeSession(s.id)}>
                      <LogOut size={12} /> Revoke Remote
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--accent-purple)" /> Compliance Audit Log & Reporting
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Immutable event history for Sunbird RC credential actions, RBAC checks, and AI evaluations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={fetchLogsAndSessions}>
            <RefreshCw size={16} /> Refresh Stream
          </button>
          <button className="btn btn-primary" onClick={() => handleExport('json')}>
            <Download size={16} /> Export JSON Report
          </button>
        </div>
      </div>

      <div className="glass-card">
        {loading ? (
          <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading Audit Trail...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action Event</th>
                <th>Resource Type</th>
                <th>User / Officer</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <span className="badge badge-success">{log.action}</span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>{log.resource_type}</td>
                  <td style={{ fontSize: '13px', fontWeight: 600 }}>{log.user_email || 'System'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {JSON.stringify(log.details || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

