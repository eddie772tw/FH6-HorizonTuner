import React from 'react';

export const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem'
};

export const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  background: 'var(--input-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--input-text)',
  borderRadius: '4px',
  width: '180px',
  textAlign: 'right'
};

export const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--primary)',
  color: 'black',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

export const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
  fontSize: '0.85rem'
};

export const inactiveTabStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.85rem'
};
