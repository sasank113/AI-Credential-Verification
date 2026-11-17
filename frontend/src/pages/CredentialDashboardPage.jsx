import React, { useState, useEffect, useCallback } from 'react';
import { credentialsApi, analyticsApi } from '../services/api';
import {
  Award, Plus, ShieldCheck, XCircle, List, LayoutGrid,
  TrendingUp, CheckCircle2, Clock, AlertTriangle, ArrowRight,
  RefreshCw, Activity, Database, Zap
} from 'lucide-react';
import CredentialListPage from './CredentialListPage';
import CredentialIssuancePage from './CredentialIssuancePage';
import CredentialVerificationPage from './CredentialVerificationPage';
import CredentialRevocationPage from './CredentialRevocationPage';
import CredentialDetailPage from './CredentialDetailPage';

const VIEWS = {
  DASHBOARD: 'dashboard',
  LIST: 'list',
  ISSUE: 'issue',
  VERIFY: 'verify',
  REVOKE: 'revoke',
};

function QuickActionCard({ icon: Icon, title, description, color, grad, shadow, onClick, allowed }) {
  if (!allowed) return null;
  return (
    <button
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px',
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.22s ease', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', gap: '12px'
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 16px 40px ${shadow}`; e.currentTarget.style.borderColor = color; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
    >
      <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${shadow}` }}>
        <Icon size={24} color="#fff" />
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color }}>
        Open <ArrowRight size={12} />
      </div>
    </button>
  );
}

export default function CredentialDashboardPage({ currentUser }) {
  const [view, setView] = useState(VIEWS.DASHBOARD);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const userRole = currentUser?.role || 'ADMIN';
  const canIssue = ['ADMIN', 'ISSUER'].includes(userRole);
  const canRevoke = ['ADMIN', 'ISSUER'].includes(userRole);
  const canVerify = ['ADMIN', 'ISSUER', 'VERIFIER', 'AUDITOR'].includes(userRole);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const data = await analyticsApi.getDashboard();
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics, refreshKey]);

  const handleViewDetail = (cred) => setSelectedCredential(cred);

  const handleRevokeRequest = (cred) => {
    setSelectedCredential(null);
    setRevokeTarget(cred);
  };

  const handleRevoked = () => {
    setRevokeTarget(null);
    setRefreshKey(k => k + 1);
    loadAnalytics();
  };

  const NAV_TABS = [
    { id: VIEWS.DASHBOARD, label: 'Overview', icon: LayoutGrid, allowed: true },
    { id: VIEWS.LIST, label: 'All Credentials', icon: List, allowed: true },
    { id: VIEWS.ISSUE, label: 'Issue New', icon: Plus, allowed: canIssue },
    { id: VIEWS.VERIFY, label: 'Verify', icon: ShieldCheck, allowed: canVerify },
    { id: VIEWS.REVOKE, label: 'Revoke', icon: XCircle, allowed: canRevoke },
  ].filter(t => t.allowed);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', padding: '6px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', flexWrap: 'wrap' }}>
        {NAV_TABS.map(tab => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px',
                borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '13px', fontWeight: 600, transition: 'all 0.2s ease',
                background: active ? 'var(--gradient-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                boxShadow: active ? '0 4px 14px rgba(37,99,235,0.25)' : 'none'
              }}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Overview Dashboard */}
      {view === VIEWS.DASHBOARD && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', animation: 'fadeIn 0.35s ease' }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              {
                label: 'Total Issued', icon: Award,
                value: loadingAnalytics ? '—' : analytics?.total_credentials_issued ?? '—',
                grad: 'linear-gradient(135deg,#2563eb,#7c3aed)', shadow: 'rgba(37,99,235,0.25)'
              },
              {
                label: 'Verifications Run', icon: ShieldCheck,
                value: loadingAnalytics ? '—' : analytics?.total_verifications_conducted ?? '—',
                grad: 'linear-gradient(135deg,#059669,#10b981)', shadow: 'rgba(5,150,105,0.25)'
              },
              {
                label: 'AI Anomalies Flagged', icon: AlertTriangle,
                value: loadingAnalytics ? '—' : analytics?.total_flagged_ai_anomalies ?? '—',
                grad: 'linear-gradient(135deg,#dc2626,#f43f5e)', shadow: 'rgba(220,38,38,0.25)'
              },
              {
                label: 'Active Schemas', icon: Database,
                value: loadingAnalytics ? '—' : analytics?.active_schemas_count ?? '—',
                grad: 'linear-gradient(135deg,#d97706,#f59e0b)', shadow: 'rgba(217,119,6,0.25)'
              },
            ].map(({ label, icon: Icon, value, grad, shadow }) => (
              <div key={label} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${shadow}`, flexShrink: 0 }}>
                  <Icon size={24} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {loadingAnalytics
                      ? <div style={{ width: '40px', height: '28px', background: '#f1f5f9', borderRadius: '6px', animation: 'pulse 1s ease infinite' }} />
                      : value
                    }
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>Quick Actions</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <QuickActionCard
                icon={List} title="Browse Credentials" description="Search, filter, and inspect all issued credentials in the registry."
                color="#2563eb" grad="linear-gradient(135deg,#2563eb,#7c3aed)" shadow="rgba(37,99,235,0.2)"
                onClick={() => setView(VIEWS.LIST)} allowed={true}
              />
              <QuickActionCard
                icon={Plus} title="Issue Credential" description="Generate a new W3C verifiable credential using a registered schema."
                color="#059669" grad="linear-gradient(135deg,#059669,#10b981)" shadow="rgba(5,150,105,0.2)"
                onClick={() => setView(VIEWS.ISSUE)} allowed={canIssue}
              />
              <QuickActionCard
                icon={ShieldCheck} title="Verify Credential" description="Validate cryptographic proofs and check registry revocation status."
                color="#0284c7" grad="linear-gradient(135deg,#0284c7,#2563eb)" shadow="rgba(2,132,199,0.2)"
                onClick={() => setView(VIEWS.VERIFY)} allowed={canVerify}
              />
              <QuickActionCard
                icon={XCircle} title="Revoke Credential" description="Permanently invalidate a credential in the Sunbird RC registry."
                color="#dc2626" grad="linear-gradient(135deg,#dc2626,#f43f5e)" shadow="rgba(220,38,38,0.2)"
                onClick={() => setView(VIEWS.REVOKE)} allowed={canRevoke}
              />
            </div>
          </div>

          {/* Recent Activity */}
          {analytics?.recent_activity && analytics.recent_activity.length > 0 && (
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={16} color="#2563eb" />
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Recent Registry Activity</h3>
              </div>
              <div>
                {analytics.recent_activity.slice(0, 6).map((log, i) => (
                  <div key={log.id || i} style={{ padding: '12px 24px', borderBottom: i < 5 ? '1px solid #f8fafc' : 'none', display: 'flex', alignItems: 'center', gap: '12px', animation: `fadeIn 0.3s ease ${i * 0.05}s both` }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Zap size={14} color="#2563eb" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{log.action?.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{log.user_email || 'System'} · {log.resource_type}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Role notice for limited roles */}
          {['EMPLOYEE'].includes(userRole) && (
            <div style={{ padding: '16px 20px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <CheckCircle2 size={18} color="#2563eb" />
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                As an <strong style={{ color: 'var(--text-primary)' }}>Employee</strong>, you can view and verify credentials issued to your account. Contact an ISSUER or ADMIN to request new credentials.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-views */}
      {view === VIEWS.LIST && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <CredentialListPage
            currentUser={currentUser}
            onViewDetail={handleViewDetail}
            onRevoke={handleRevokeRequest}
          />
        </div>
      )}

      {view === VIEWS.ISSUE && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <CredentialIssuancePage currentUser={currentUser} />
        </div>
      )}

      {view === VIEWS.VERIFY && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <CredentialVerificationPage currentUser={currentUser} />
        </div>
      )}

      {view === VIEWS.REVOKE && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <CredentialRevocationPage currentUser={currentUser} onRevoked={handleRevoked} />
        </div>
      )}

      {/* Detail Modal */}
      {selectedCredential && (
        <CredentialDetailPage
          credential={selectedCredential}
          currentUser={currentUser}
          onClose={() => setSelectedCredential(null)}
          onRevoke={handleRevokeRequest}
        />
      )}

      {/* Revocation Modal */}
      {revokeTarget && (
        <CredentialRevocationPage
          currentUser={currentUser}
          prefilledCredential={revokeTarget}
          onRevoked={handleRevoked}
          onClose={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}
