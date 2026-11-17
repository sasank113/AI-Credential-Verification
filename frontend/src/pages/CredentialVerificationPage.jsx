import React, { useState } from 'react';
import { credentialsApi } from '../services/api';
import {
  ShieldCheck, ShieldOff, Search, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, Hash, FileCode, X, ChevronDown,
  ChevronUp, Info, Shield, Clock
} from 'lucide-react';

const METHOD_TABS = [
  { id: 'osid', label: 'Verify by OSID', icon: Hash },
  { id: 'payload', label: 'Paste VC JSON', icon: FileCode },
];

function ResultCard({ result }) {
  if (!result) return null;
  const ok = result.is_valid;
  return (
    <div style={{
      marginTop: '20px', padding: '20px', borderRadius: '14px', animation: 'slideIn 0.3s ease',
      background: ok ? 'rgba(5,150,105,0.07)' : 'rgba(220,38,38,0.07)',
      border: `1px solid ${ok ? 'rgba(5,150,105,0.3)' : 'rgba(220,38,38,0.3)'}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        {ok ? <ShieldCheck size={28} color="#059669" /> : <ShieldOff size={28} color="#dc2626" />}
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: ok ? '#059669' : '#dc2626' }}>
            {ok ? 'Credential Verified & Valid' : 'Verification Failed'}
          </div>
          <div style={{ fontSize: '12px', color: ok ? '#047857' : '#991b1b', marginTop: '2px' }}>
            Registry Status: <strong>{result.status || (ok ? 'ISSUED' : 'INVALID')}</strong>
          </div>
        </div>
      </div>

      <p style={{ fontSize: '13px', lineHeight: 1.7, color: ok ? '#047857' : '#991b1b', marginBottom: '12px' }}>
        {result.message}
      </p>

      {result.verification_details && Object.keys(result.verification_details).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {Object.entries(result.verification_details).map(([k, v]) => (
            <div key={k} style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--text-primary)' }}>{String(v)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CredentialVerificationPage({ currentUser }) {
  const [activeMethod, setActiveMethod] = useState('osid');
  const [osidInput, setOsidInput] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const userRole = currentUser?.role || 'ADMIN';
  const canVerify = ['ADMIN', 'ISSUER', 'VERIFIER', 'AUDITOR'].includes(userRole);

  const handleVerify = async (e) => {
    e.preventDefault();
    setResult(null);
    setError('');
    setJsonError('');

    let payload = null;
    let osid = null;

    if (activeMethod === 'osid') {
      if (!osidInput.trim()) { setError('Please enter a Sunbird OSID to verify.'); return; }
      osid = osidInput.trim();
    } else {
      if (!jsonInput.trim()) { setError('Please paste a credential JSON payload.'); return; }
      try {
        payload = JSON.parse(jsonInput.trim());
      } catch {
        setJsonError('Invalid JSON format. Please check the credential payload syntax.');
        return;
      }
    }

    setLoading(true);
    try {
      let res;
      if (payload) {
        res = await credentialsApi.verifyCredential(payload);
      } else {
        // Verify via OSID — backend accepts sunbird_osid
        res = await credentialsApi.verifyCredential({ sunbird_osid: osid });
      }
      setResult(res);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Verification request failed. Please check the credential and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError('');
    setJsonError('');
    setOsidInput('');
    setJsonInput('');
  };

  if (!canVerify) {
    return (
      <div className="glass-card" style={{ maxWidth: '560px', margin: '40px auto', padding: '40px', textAlign: 'center' }}>
        <Shield size={40} color="#dc2626" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Your role <strong>{userRole}</strong> is not authorized to verify credentials.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Intro */}
      <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(5,150,105,0.05), rgba(16,185,129,0.05))', border: '1px solid rgba(5,150,105,0.15)', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--gradient-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(5,150,105,0.3)' }}>
          <ShieldCheck size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Credential Verification Portal</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.6 }}>
            Verify a W3C Verifiable Credential against the Sunbird RC registry — check cryptographic proof integrity and active revocation status.
            Provide a Sunbird OSID or paste the full credential JSON payload.
          </p>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="glass-card" style={{ padding: '6px', display: 'flex', gap: '4px' }}>
        {METHOD_TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeMethod === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setActiveMethod(tab.id); setResult(null); setError(''); setJsonError(''); }}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: active ? 'var(--gradient-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                boxShadow: active ? '0 4px 14px rgba(37,99,235,0.25)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <Icon size={15} /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Verification Form */}
      <div className="glass-card" style={{ padding: '28px' }}>
        <form onSubmit={handleVerify} noValidate>
          {activeMethod === 'osid' ? (
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Sunbird OSID</label>
              <div style={{ position: 'relative' }}>
                <Hash size={16} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. osid-sb-demo-001 or a UUID"
                  value={osidInput}
                  onChange={e => { setOsidInput(e.target.value); setResult(null); setError(''); }}
                  style={{ paddingLeft: '38px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                />
              </div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Info size={11} /> The backend will fetch the credential from the registry using this OSID and verify it.
              </div>
            </div>
          ) : (
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Credential JSON Payload (W3C VC Format)</label>
              <textarea
                className="textarea-field"
                rows={10}
                placeholder={'{\n  "@context": ["https://www.w3.org/2018/credentials/v1"],\n  "id": "urn:uuid:...",\n  "type": ["VerifiableCredential", "..."],\n  ...\n}'}
                value={jsonInput}
                onChange={e => { setJsonInput(e.target.value); setResult(null); setJsonError(''); setError(''); }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.7, borderColor: jsonError ? '#dc2626' : undefined }}
              />
              {jsonError && (
                <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <AlertTriangle size={12} /> {jsonError}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            {(result || error) && (
              <button type="button" onClick={handleReset} className="btn btn-secondary" style={{ fontSize: '13px' }}>
                <X size={14} /> Clear
              </button>
            )}
            <button
              type="submit"
              className="btn btn-success"
              style={{ padding: '12px 28px', fontSize: '14px', background: 'var(--gradient-emerald)' }}
              disabled={loading}
            >
              {loading
                ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Verifying...</>
                : <><ShieldCheck size={15} /> Verify Credential</>
              }
            </button>
          </div>

          <ResultCard result={result} />
        </form>
      </div>

      {/* Info Card */}
      <div className="glass-card" style={{ padding: '18px 22px', background: 'rgba(37,99,235,0.03)', border: '1px solid rgba(37,99,235,0.12)' }}>
        <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>What is verified?</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            { icon: FileCode, title: 'W3C VC Compliance', desc: 'Validates @context, type, issuer, and credentialSubject fields per W3C standard.' },
            { icon: Shield, title: 'Cryptographic Proof', desc: 'Verifies Ed25519 JWS signature and verificationMethod linkage.' },
            { icon: CheckCircle2, title: 'Registry Status', desc: 'Checks Sunbird RC for revocation status and OSID record existence.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{ padding: '14px', background: '#fff', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
              <Icon size={16} color="#2563eb" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
