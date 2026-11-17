import React from 'react';
import { Cpu, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function Header({ title, subtitle }) {
  return (
    <div className="top-header">
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="badge badge-success">
          <CheckCircle2 size={14} /> Sunbird RC Adapter Active
        </div>
        <div className="badge badge-warning">
          <Cpu size={14} /> LangChain AI Engine Online
        </div>
      </div>
    </div>
  );
}
