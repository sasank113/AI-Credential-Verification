import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardPage from './pages/DashboardPage';
import IssuancePage from './pages/IssuancePage';
import VerificationPage from './pages/VerificationPage';
import AiAssistantPage from './pages/AiAssistantPage';
import CompliancePage from './pages/CompliancePage';
import LoginPage from './pages/LoginPage';
import CredentialDashboardPage from './pages/CredentialDashboardPage';
import BulkIssuancePage from './pages/BulkIssuancePage';
import { authApi } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authenticating, setAuthenticating] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const user = await authApi.getMe();
          setCurrentUser(user);
        } catch (err) {
          localStorage.removeItem('access_token');
        }
      }
      setAuthenticating(false);
    }
    checkAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setCurrentUser(null);
  };

  if (authenticating) {
    return (
      <div style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Initializing Security Environment...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  const getPageInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return { title: 'Enterprise Dashboard', subtitle: 'Overview of Sunbird RC issuance metrics, verifications, and live security telemetry.' };
      case 'credentials':
        return { title: 'Credential Management', subtitle: 'Issue, verify, revoke, and inspect W3C verifiable credentials — full lifecycle management via Sunbird RC.' };
      case 'issuance':
        return { title: 'Direct PDF Certificate & Credential Generator', subtitle: 'Upload certificate PDFs to auto-extract metadata & generate cryptographically signed W3C credentials, or batch stream CSVs.' };
      case 'verification':
        return { title: 'Signature Verifier & AI Fraud Portal', subtitle: 'Validate cryptographic proofs against Sunbird RC registry and execute AI anomaly scans.' };
      case 'ai-assistant':
        return { title: 'AI Natural Language Query Interface', subtitle: 'Search credentials and system records in natural human language.' };
      case 'compliance':
        return { title: 'Compliance Audit & Governance Logs', subtitle: 'Inspect immutable system event trails and download compliance reports.' };
      case 'bulk-issuance':
        return { title: 'Bulk CSV Credential Issuance', subtitle: 'Upload a CSV to issue W3C Verifiable Credentials at scale. Validates format, detects duplicates, issues via Sunbird RC, and stores in PostgreSQL.' };
      default:
        return { title: 'Dashboard', subtitle: '' };
    }
  };

  const { title, subtitle } = getPageInfo();

  const isTabAllowed = (tab) => {
    const userRole = currentUser?.role || 'ADMIN';
    if (userRole === 'ADMIN') return true;
    switch (tab) {
      case 'issuance':
        return ['ISSUER', 'ADMIN'].includes(userRole);
      case 'bulk-issuance':
        return ['ISSUER', 'ADMIN'].includes(userRole);
      case 'verification':
        return ['VERIFIER', 'ISSUER', 'ADMIN', 'AUDITOR'].includes(userRole);
      case 'compliance':
        return ['AUDITOR', 'ADMIN'].includes(userRole);
      default:
        return true;
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser} 
        onLogout={handleLogout} 
      />

      <div className="main-wrapper">
        <Header title={title} subtitle={subtitle} />

        <div className="page-content">
          {!isTabAllowed(activeTab) ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', fontSize: '28px' }}>
                🛡️
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
                403 - Access Restricted (RBAC)
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
                Your current account role <span className="role-tag" style={{ margin: '0 4px' }}>{currentUser?.role}</span> is not authorized to access the <strong>{activeTab.toUpperCase()}</strong> module.
              </p>
              <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'left' }}>
                <div>• Backend RBAC APIs reject unauthorized requests with HTTP 403 Forbidden.</div>
                <div>• Contact your platform administrator if you require elevated privileges.</div>
              </div>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={() => setActiveTab('dashboard')}
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && <DashboardPage currentUser={currentUser} onNavigate={setActiveTab} />}
              {activeTab === 'credentials' && <CredentialDashboardPage currentUser={currentUser} />}
              {activeTab === 'issuance' && <IssuancePage />}
              {activeTab === 'bulk-issuance' && <BulkIssuancePage />}
              {activeTab === 'verification' && <VerificationPage />}
              {activeTab === 'ai-assistant' && <AiAssistantPage />}
              {activeTab === 'compliance' && <CompliancePage />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
