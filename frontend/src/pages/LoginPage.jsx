import React, { useState } from 'react';
import { authApi } from '../services/api';
import { Shield, Lock, Mail, ArrowRight, UserPlus, LogIn, CheckCircle } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('ADMIN');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (isSignUp) {
        await authApi.register(email, password, fullName || email.split('@')[0], role);
        setSuccessMsg('Account registered successfully! Authenticating...');
        setTimeout(async () => {
          const data = await authApi.login(email, password);
          onLoginSuccess(data.user);
        }, 800);
      } else {
        const data = await authApi.login(email, password);
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Authentication failed. Please verify your Email ID and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        background: 'radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 50%), var(--bg-primary)',
        padding: '20px'
      }}
    >
      <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div className="brand-icon" style={{ margin: '0 auto 16px auto', width: '56px', height: '56px' }}>
            <Shield size={32} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>Sunbird VC AI Platform</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Realtime Email ID Authentication Portal
          </p>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
          <button 
            type="button" 
            className="btn" 
            style={{ flex: 1, fontSize: '13px', background: !isSignUp ? 'var(--accent-blue)' : 'transparent', color: !isSignUp ? '#ffffff' : 'var(--text-secondary)' }}
            onClick={() => { setIsSignUp(false); setErrorMsg(''); setSuccessMsg(''); }}
          >
            <LogIn size={15} /> Sign In
          </button>
          <button 
            type="button" 
            className="btn" 
            style={{ flex: 1, fontSize: '13px', background: isSignUp ? 'var(--accent-blue)' : 'transparent', color: isSignUp ? '#ffffff' : 'var(--text-secondary)' }}
            onClick={() => { setIsSignUp(true); setErrorMsg(''); setSuccessMsg(''); }}
          >
            <UserPlus size={15} /> Sign Up
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '12px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-md)', color: '#f87171', fontSize: '12px', marginBottom: '20px' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', color: '#34d399', fontSize: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={16} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Alex Rivera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role Access Level</label>
                <select 
                  className="select-field" 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="ADMIN">ADMIN - Full Platform Management & Users</option>
                  <option value="ISSUER">ISSUER - Credential Creation & Ingestion</option>
                  <option value="VERIFIER">VERIFIER - Cryptographic & AI Scan</option>
                  <option value="EMPLOYEE">EMPLOYEE - View Personal Credentials & Profile</option>
                  <option value="AUDITOR">AUDITOR - Compliance Logs & Reporting</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email ID</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="email" 
                className="input-field" 
                placeholder="your.email@organization.com"
                style={{ paddingLeft: '40px' }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Mail size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Password</label>
              {isSignUp && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Min. 8 characters</span>}
            </div>
            <div style={{ position: 'relative' }}>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Enter password"
                style={{ paddingLeft: '40px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={isSignUp ? 8 : undefined}
                required
              />
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px', padding: '12px' }} disabled={loading}>
            {loading ? (isSignUp ? 'Registering Account...' : 'Authenticating...') : (isSignUp ? 'Create Account with Email ID' : 'Sign In with Email ID')} <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Fast Login Selector */}
        {!isSignUp && (
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', textAlign: 'center', fontWeight: 600 }}>
              Quick Demo Access (Select Role):
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {[
                { role: 'ADMIN', email: 'admin@example.com', pwd: 'admin123' },
                { role: 'ISSUER', email: 'issuer@example.com', pwd: 'issuer123' },
                { role: 'VERIFIER', email: 'verifier@example.com', pwd: 'verifier123' },
                { role: 'EMPLOYEE', email: 'employee@example.com', pwd: 'employee123' },
                { role: 'AUDITOR', email: 'auditor@example.com', pwd: 'auditor123' },
              ].map((item) => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => {
                    setEmail(item.email);
                    setPassword(item.pwd);
                  }}
                  className="btn"
                  style={{
                    fontSize: '11px',
                    padding: '6px 8px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700
                  }}
                  title={`Fill credentials for ${item.role}`}
                >
                  {item.role}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


