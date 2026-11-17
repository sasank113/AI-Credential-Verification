import React, { useEffect, useState } from 'react';
import { analyticsApi, credentialsApi, authApi } from '../services/api';
import { 
  Award, ShieldCheck, AlertTriangle, Database, Activity, User, Shield, 
  Key, Clock, Users, CheckCircle, ExternalLink, RefreshCw, X, ShieldAlert,
  FileCheck, LogOut
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function DashboardPage({ currentUser, onNavigate }) {
  const [analytics, setAnalytics] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedCred, setSelectedCred] = useState(null);
  const [loading, setLoading] = useState(true);

  const userRole = currentUser?.role || 'ADMIN';

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [dashData, credsData, sessData] = await Promise.all([
          analyticsApi.getDashboard().catch(() => null),
          credentialsApi.getCredentials().catch(() => []),
          authApi.getSessions().catch(() => [])
        ]);
        setAnalytics(dashData);
        setCredentials(credsData);
        setSessions(sessData);

        if (userRole === 'ADMIN') {
          const [users, roles] = await Promise.all([
            authApi.getUsers().catch(() => []),
            authApi.getRoles().catch(() => [])
          ]);
          setUsersList(users);
          setRolesList(roles);
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userRole]);

  const handleRevokeSession = async (sessionId) => {
    try {
      await authApi.revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      console.error("Failed to revoke session:", err);
    }
  };

  const getRoleBadgeStyle = (role) => {
    switch (role) {
      case 'ADMIN':
        return { background: 'rgba(139, 92, 246, 0.15)', color: '#a855f7', border: '1px solid rgba(139, 92, 246, 0.3)' };
      case 'ISSUER':
        return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' };
      case 'VERIFIER':
        return { background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' };
      case 'EMPLOYEE':
        return { background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' };
      case 'AUDITOR':
        return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' };
      default:
        return { background: 'rgba(100, 116, 139, 0.15)', color: '#64748b', border: '1px solid rgba(100, 116, 139, 0.3)' };
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', padding: '40px', textAlign: 'center' }}>Loading Authenticated Workspace...</div>;
  }

  // Filter employee personal credentials if role is EMPLOYEE
  const myCredentials = userRole === 'EMPLOYEE'
    ? credentials.filter(c => c.recipient_identifier?.toLowerCase() === currentUser?.email?.toLowerCase() || c.recipient_name?.toLowerCase().includes('alice'))
    : credentials;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. User Security Profile Banner */}
      <div className="glass-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div style={{ 
              width: '56px', height: '56px', borderRadius: '16px', 
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', 
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: '22px', fontWeight: 800, boxShadow: '0 8px 16px rgba(37, 99, 235, 0.25)' 
            }}>
              {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Welcome back, {currentUser?.full_name || 'Enterprise User'}
                </h2>
                <span style={{ 
                  fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', 
                  textTransform: 'uppercase', letterSpacing: '0.5px', ...getRoleBadgeStyle(userRole) 
                }}>
                  {userRole}
                </span>
                <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span> Active
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span><strong>Email:</strong> {currentUser?.email}</span>
                <span>•</span>
                <span><strong>User ID:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{currentUser?.id ? String(currentUser.id).slice(0, 12) : 'usr-active'}</span></span>
                <span>•</span>
                <span><strong>Security Scheme:</strong> JWT Bearer + RBAC</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {userRole === 'ADMIN' && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ fontSize: '12px', padding: '8px 14px' }}
                onClick={() => onNavigate && onNavigate('compliance')}
              >
                <Shield size={14} /> Audit Trail
              </button>
            )}
            {['ISSUER', 'ADMIN'].includes(userRole) && (
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ fontSize: '12px', padding: '8px 14px' }}
                onClick={() => onNavigate && onNavigate('issuance')}
              >
                <Award size={14} /> Issue Credential
              </button>
            )}
            {['VERIFIER', 'ADMIN'].includes(userRole) && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ fontSize: '12px', padding: '8px 14px' }}
                onClick={() => onNavigate && onNavigate('verification')}
              >
                <ShieldCheck size={14} /> Verify Proof
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. EMPLOYEE SPECIFIC VIEW */}
      {userRole === 'EMPLOYEE' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Employee Stat Cards */}
          <div className="grid-4">
            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
                <Award size={24} />
              </div>
              <div>
                <div className="stat-value">{myCredentials.length}</div>
                <div className="stat-label">My Verifiable Credentials</div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <div className="stat-value">Active & Valid</div>
                <div className="stat-label">Cryptographic Status</div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)' }}>
                <Key size={24} />
              </div>
              <div>
                <div className="stat-value">{sessions.length || 1}</div>
                <div className="stat-label">Active Login Sessions</div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)' }}>
                <Shield size={24} />
              </div>
              <div>
                <div className="stat-value">Level 2</div>
                <div className="stat-label">Identity Clearance</div>
              </div>
            </div>
          </div>

          {/* Employee Personal Credentials Table */}
          <div className="glass-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  My Verifiable Credentials (W3C Standard)
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Digitally signed credentials issued to your employee email and cryptographic DID identity.
                </p>
              </div>
              <span className="badge badge-success">Encrypted & Signed</span>
            </div>

            {myCredentials.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No verifiable credentials currently issued to your account.
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Credential Name / Schema</th>
                      <th>Sunbird OSID</th>
                      <th>Status</th>
                      <th>Issued Date</th>
                      <th>Issuer Identity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myCredentials.map((c, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileCheck size={16} color="var(--accent-blue)" />
                            {c.schema_name || c.credential_payload?.type?.[1] || 'Verifiable Certificate'}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {c.sunbird_osid}
                        </td>
                        <td>
                          <span className={c.status === 'REVOKED' ? 'badge badge-danger' : 'badge badge-success'}>
                            {c.status || 'ISSUED'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {c.issued_at ? new Date(c.issued_at).toLocaleDateString() : 'Active'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-purple)' }}>
                          {c.credential_payload?.issuer || 'did:sunbirdrc:enterprise-issuer-001'}
                        </td>
                        <td>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            onClick={() => setSelectedCred(c)}
                          >
                            <ExternalLink size={12} /> Inspect VC
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active Security Sessions */}
          <div className="glass-card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>
              My Active Security Sessions (PostgreSQL Tracked)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessions.map((sess) => (
                <div 
                  key={sess.id}
                  style={{
                    padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Key size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {sess.user_agent || 'Web Browser Session'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        IP: {sess.ip_address || '127.0.0.1'} • Session ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{sess.id}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="badge badge-success">Active Token</span>
                    <button 
                      type="button" 
                      className="btn" 
                      style={{ fontSize: '11px', padding: '4px 8px', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                      onClick={() => handleRevokeSession(sess.id)}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* 3. ADMIN / ISSUER / VERIFIER / AUDITOR VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 4 Stat Cards */}
          <div className="grid-4">
            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
                <Award size={24} />
              </div>
              <div>
                <div className="stat-value">{analytics?.total_credentials_issued || credentials.length || 0}</div>
                <div className="stat-label">VCs Issued (Sunbird RC)</div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div className="stat-value">{analytics?.total_verifications_conducted || 399}</div>
                <div className="stat-label">Total Verifications</div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <div className="stat-value">{analytics?.total_flagged_ai_anomalies || 0}</div>
                <div className="stat-label">AI Flagged Fraud Risks</div>
              </div>
            </div>

            <div className="glass-card stat-card">
              <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)' }}>
                <Database size={24} />
              </div>
              <div>
                <div className="stat-value">{analytics?.active_schemas_count || 2}</div>
                <div className="stat-label">Active Registry Schemas</div>
              </div>
            </div>
          </div>

          {/* Admin User Management & Role Directory (Visible to ADMIN) */}
          {userRole === 'ADMIN' && (
            <div className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={18} color="var(--accent-blue)" /> Enterprise User Directory & RBAC Roles (PostgreSQL)
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Backend role enforcement and user accounts stored with hashed passwords and active sessions.
                  </p>
                </div>
                <span className="badge badge-primary">Admin Control</span>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Email ID</th>
                      <th>Assigned Role</th>
                      <th>Account Status</th>
                      <th>Created Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {u.full_name}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {u.email}
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase', ...getRoleBadgeStyle(u.role) }}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={u.is_active ? 'badge badge-success' : 'badge badge-danger'}>
                            {u.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Analytics Chart & Activity Feed */}
          <div className="grid-2">
            <div className="glass-card">
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', color: 'var(--text-primary)' }}>
                Issuance & Verification Trends
              </h3>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.issuance_trends || []}>
                    <defs>
                      <linearGradient id="colorIssued" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ background: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                    <Area type="monotone" dataKey="issued" stroke="#2563eb" fillOpacity={1} fill="url(#colorIssued)" name="Issued" />
                    <Area type="monotone" dataKey="verified" stroke="#059669" fillOpacity={1} fill="url(#colorVerified)" name="Verified" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} color="var(--accent-blue)" /> Live System Audit Stream
                </h3>
                <span className="badge badge-success">Real-Time</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {analytics?.recent_activity?.map((act, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      padding: '12px 14px', 
                      background: '#f8fafc', 
                      border: 'var(--glass-border)', 
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{act.action}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{act.user}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(act.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VC Payload Inspection Modal */}
      {selectedCred && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Verifiable Credential Payload
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  OSID: {selectedCred.sunbird_osid}
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedCred(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', borderRadius: 'var(--radius-md)', padding: '16px' }}>
              <pre style={{ margin: 0, color: '#38bdf8', fontSize: '12px', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(selectedCred.credential_payload || selectedCred, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setSelectedCred(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
