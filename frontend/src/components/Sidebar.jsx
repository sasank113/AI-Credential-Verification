import React from 'react';
import { 
  LayoutDashboard, 
  Award, 
  ShieldCheck, 
  Bot, 
  FileText, 
  LogOut, 
  Shield,
  BadgeCheck,
  Layers
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, currentUser, onLogout }) {
  const navItems = [
    { id: 'dashboard',     label: 'Dashboard Overview',    icon: LayoutDashboard, roleRequired: null },
    { id: 'credentials',   label: 'Credential Manager',    icon: BadgeCheck,      roleRequired: null },
    { id: 'issuance',      label: 'PDF & Single Issuance', icon: Award,           roleRequired: ['ISSUER', 'ADMIN'] },
    { id: 'bulk-issuance', label: 'Bulk CSV Issuance',     icon: Layers,          roleRequired: ['ISSUER', 'ADMIN'] },
    { id: 'verification',  label: 'Verification & Fraud',  icon: ShieldCheck,     roleRequired: ['VERIFIER', 'ISSUER', 'ADMIN', 'AUDITOR'] },
    { id: 'ai-assistant',  label: 'AI Natural Language',   icon: Bot,             roleRequired: ['ADMIN', 'ISSUER', 'VERIFIER', 'EMPLOYEE', 'AUDITOR'] },
    { id: 'compliance',    label: 'Compliance Audit',      icon: FileText,        roleRequired: ['AUDITOR', 'ADMIN'] },
  ];

  const userRole = currentUser?.role || 'ADMIN';

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Shield size={24} />
        </div>
        <div className="brand-text">
          <h1>Sunbird VC AI</h1>
          <span>Enterprise Platform</span>
        </div>
      </div>

      <div className="nav-group">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isAllowed = !item.roleRequired || item.roleRequired.includes(userRole) || userRole === 'ADMIN';
          if (!isAllowed) return null;

          return (
            <div
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      <div className="user-profile-badge">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {currentUser?.full_name || 'Enterprise Officer'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {currentUser?.email || 'admin@example.com'}
          </div>
        </div>
        <span className="role-tag">{userRole}</span>
        <button 
          onClick={onLogout} 
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          title="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
