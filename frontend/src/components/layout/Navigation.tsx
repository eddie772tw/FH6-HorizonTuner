import React from 'react';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: { id: string; label: string }[];
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, tabs }) => {
  return (
    <nav style={{ display: 'flex', gap: '0.5rem', background: 'var(--glass-bg)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: 'none',
              fontWeight: isActive ? 'bold' : 'normal',
              background: isActive ? 'var(--primary)' : 'transparent',
              color: isActive ? '#000' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
};

export default Navigation;
