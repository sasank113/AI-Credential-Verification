import React, { useEffect, useState, useCallback } from 'react';
import { credentialsApi } from '../services/api';
import {
  Award, Search, Filter, RefreshCw, Eye, XCircle, CheckCircle2,
  Clock, AlertTriangle, Download, SortAsc, SortDesc,
  Shield, User, Calendar, Hash, FileText
} from 'lucide-react';

const STATUS_COLORS = {
  ISSUED: { bg: 'rgba(5,150,105,0.1)', color: '#059669', border: 'rgba(5,150,105,0.25)', label: 'Active' },
  REVOKED: { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', border: 'rgba(220,38,38,0.25)', label: 'Revoked' },
  PENDING_AI: { bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.25)', label: 'Pending AI' },
  FAILED: { bg: 'rgba(100,116,139,0.1)', color: '#64748b', border: 'rgba(100,116,139,0.25)', label: 'Failed' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.FAILED;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`
    }}>
      {status === 'ISSUED' && <CheckCircle2 size={11} />}
      {status === 'REVOKED' && <XCircle size={11} />}
      {status === 'PENDING_AI' && <Clock size={11} />}
      {status === 'FAILED' && <AlertTriangle size={11} />}
      {s.label}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '50%',
        border: '3px solid rgba(37,99,235,0.15)', borderTopColor: '#2563eb',
        animation: 'spin 0.8s linear infinite'
      }} />
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Loading credentials from registry...</p>
    </div>
  );
}

export default function CredentialListPage({ currentUser, onViewDetail, onRevoke }) {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState('issue_date');
  const [sortDir, setSortDir] = useState('desc');
  const [refreshing, setRefreshing] = useState(false);

  const userRole = currentUser?.role || 'ADMIN';

  const loadCredentials = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await credentialsApi.getCredentials();
      setCredentials(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to fetch credentials from registry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCredentials(); }, [loadCredentials]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const filtered = credentials
    .filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          (c.recipient_name || '').toLowerCase().includes(q) ||
          (c.recipient_identifier || '').toLowerCase().includes(q) ||
          (c.schema_name || c.schema_id || '').toLowerCase().includes(q) ||
          (c.sunbird_osid || c.id || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (sortField === 'issue_date' || sortField === 'created_at') {
        av = new Date(av || 0); bv = new Date(bv || 0);
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const stats = {
    total: credentials.length,
    issued: credentials.filter(c => c.status === 'ISSUED').length,
    revoked: credentials.filter(c => c.status === 'REVOKED').length,
    pending: credentials.filter(c => c.status === 'PENDING_AI').length,
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <SortAsc size={12} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc' ? <SortAsc size={12} style={{ color: '#2563eb' }} /> : <SortDesc size={12} style={{ color: '#2563eb' }} />;
  };

  const canRevoke = ['ADMIN', 'ISSUER'].includes(userRole);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const exportToCSV = () => {
    const rows = [['OSID', 'Recipient', 'Identifier', 'Schema', 'Status', 'Issued At']];
    filtered.forEach(c => rows.push([
      c.sunbird_osid || c.id,
      c.recipient_name || '—',
      c.recipient_identifier || '—',
      c.schema_name || c.schema_id || '—',
      c.status,
      c.issue_date || c.issued_at || '—'
    ]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `credentials_export_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
        {[
          { label: 'Total Credentials', value: stats.total, icon: Award, grad: 'linear-gradient(135deg,#2563eb,#7c3aed)', shadow: 'rgba(37,99,235,0.25)' },
          { label: 'Active / Issued', value: stats.issued, icon: CheckCircle2, grad: 'linear-gradient(135deg,#059669,#10b981)', shadow: 'rgba(5,150,105,0.25)' },
          { label: 'Revoked', value: stats.revoked, icon: XCircle, grad: 'linear-gradient(135deg,#dc2626,#f43f5e)', shadow: 'rgba(220,38,38,0.25)' },
          { label: 'Pending Review', value: stats.pending, icon: Clock, grad: 'linear-gradient(135deg,#d97706,#f59e0b)', shadow: 'rgba(217,119,6,0.25)' },
        ].map(({ label, value, icon: Icon, grad, shadow }) => (
          <div key={label} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', animation: 'fadeIn 0.4s ease' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${shadow}`, flexShrink: 0 }}>
              <Icon size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{loading ? '—' : value}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input-field"
              placeholder="Search by name, email, schema, OSID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '36px', marginBottom: 0 }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', 'ISSUED', 'REVOKED', 'PENDING_AI'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="btn"
                style={{
                  fontSize: '12px', padding: '8px 14px', fontWeight: 600,
                  background: statusFilter === s ? 'var(--gradient-primary)' : '#f8fafc',
                  color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
                  border: statusFilter === s ? 'none' : '1px solid var(--border-color)',
                  boxShadow: statusFilter === s ? '0 4px 12px rgba(37,99,235,0.25)' : 'none'
                }}
              >
                {s === 'ALL' ? 'All' : s === 'PENDING_AI' ? 'Pending' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <button onClick={() => loadCredentials(true)} className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 14px' }} disabled={refreshing}>
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {['ADMIN', 'AUDITOR', 'ISSUER'].includes(userRole) && (
            <button onClick={exportToCSV} className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 14px' }}>
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
        {search && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {filtered.length} of {credentials.length} credentials matching &ldquo;<strong>{search}</strong>&rdquo;
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '14px 16px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={16} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Credential Registry</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {userRole === 'EMPLOYEE' ? 'Your issued credentials' : `${filtered.length} credential${filtered.length !== 1 ? 's' : ''} found`}
              </p>
            </div>
          </div>
          {userRole === 'EMPLOYEE' && (
            <div className="badge badge-warning" style={{ fontSize: '11px' }}>
              <Shield size={12} /> Scoped to your account
            </div>
          )}
        </div>

        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Award size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontSize: '15px', fontWeight: 600 }}>No credentials found</p>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>
              {search || statusFilter !== 'ALL' ? 'Try adjusting your filters.' : 'No credentials have been issued yet.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('recipient_name')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} /> Recipient <SortIcon field="recipient_name" /></div>
                  </th>
                  <th>Schema / Type</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('issue_date')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> Issued At <SortIcon field="issue_date" /></div>
                  </th>
                  <th><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={12} /> OSID / ID</div></th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Status <SortIcon field="status" /></div>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cred, i) => (
                  <tr key={cred.id || cred.sunbird_osid || i} style={{ animation: `fadeIn 0.3s ease ${i * 0.03}s both` }}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{cred.recipient_name || '—'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{cred.recipient_identifier || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cred.schema_name || cred.schema_id || '—'}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(cred.issue_date || cred.issued_at)}
                    </td>
                    <td>
                      <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#475569', display: 'block', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cred.sunbird_osid || cred.id || '—'}
                      </code>
                    </td>
                    <td><StatusBadge status={cred.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => onViewDetail && onViewDetail(cred)}
                          title="View credential details"
                        >
                          <Eye size={13} /> View
                        </button>
                        {canRevoke && cred.status === 'ISSUED' && (
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                            onClick={() => onRevoke && onRevoke(cred)}
                            title="Revoke this credential"
                          >
                            <XCircle size={13} /> Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
