import React, { useState, useMemo, useCallback } from 'react';
import { zohoAPI } from '../services/api';
import { showToast } from './ToastContainer';

const CATEGORY_OPTIONS = ['All', 'Regular items', 'Custom items', 'Others'];

const ItemSelector = ({ items, onSelectItem, onRefresh, disabled = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [syncing, setSyncing] = useState(false);

  const categories = CATEGORY_OPTIONS;

  const resolveCategory = useCallback((item) => {
    const price = parseFloat(item.price) || 0;
    if (price <= 0) return 'Others';
    if (item.fromPricebook) return 'Custom items';
    return 'Regular items';
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = {
      All: items.length,
      'Regular items': 0,
      'Custom items': 0,
      Others: 0
    };

    items.forEach(item => {
      const category = resolveCategory(item);
      if (counts[category] !== undefined) {
        counts[category] += 1;
      }
    });

    return counts;
  }, [items, resolveCategory]);

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Category filter
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(item => resolveCategory(item) === selectedCategory);
    }

    // Search filter (searches by name or SKU)
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    return filtered;
  }, [items, searchTerm, selectedCategory]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await zohoAPI.syncAll();
      await onRefresh();
      showToast('Data synced successfully from Zoho Books!', 'success', 4000);
    } catch (error) {
      const errorMsg = error.formattedMessage || 
                      error.response?.data?.message || 
                      error.message || 
                      'Failed to sync data';
      showToast(errorMsg, 'error', 5000);
    } finally {
      setSyncing(false);
    }
  };


  return (
    <div className="card" style={{ 
      opacity: disabled ? 0.6 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div className="flex-between mb-2">
        <h2 style={{ 
          fontSize: 'var(--font-size-2xl)', 
          fontWeight: '700', 
          color: 'var(--dark)',
          margin: 0,
          fontFamily: 'var(--font-family)',
          lineHeight: 'var(--line-height-tight)',
          letterSpacing: 'var(--letter-spacing-tight)'
        }}>
          Products
        </h2>
        <button 
          onClick={handleSync} 
          className="btn btn-secondary"
          disabled={syncing || disabled}
          style={{
            fontSize: 'var(--font-size-base)',
            fontWeight: '600',
            padding: '12px 20px'
          }}
        >
          {syncing ? (
            <>
              <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: 'white' }}></span>
              Syncing...
            </>
          ) : (
            <>
              <span>🔄</span>
              Sync Zoho
            </>
          )}
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-2">
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute',
            left: '18px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '18px',
            color: 'var(--gray-400)',
            zIndex: 1
          }}>🔍</span>
          <input
            type="text"
            className="input"
            placeholder="Search items by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={disabled}
            style={{
              fontSize: 'var(--font-size-base)',
              padding: '16px 16px 16px 50px',
              borderRadius: '14px',
              border: '2px solid var(--border)',
              background: 'white',
              boxShadow: searchTerm ? '0 0 0 3px rgba(102, 126, 234, 0.05)' : 'none',
              fontFamily: 'var(--font-family)',
              lineHeight: 'var(--line-height-normal)'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'var(--gray-200)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '16px',
                color: 'var(--gray-600)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--gray-300)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--gray-200)';
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Category Chips */}
      {categories.length > 1 && (
        <div className="mb-2" style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          paddingBottom: '10px',
          borderBottom: '2px solid var(--border)'
        }}>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`chip ${selectedCategory === category ? 'chip-active' : ''}`}
              disabled={disabled}
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: '600',
                padding: '10px 22px',
                minHeight: '42px',
                borderRadius: '22px',
                transition: 'all 0.2s',
                boxShadow: selectedCategory === category ? 'var(--shadow-md)' : 'none',
                fontFamily: 'var(--font-family)',
                lineHeight: 'var(--line-height-tight)'
              }}
            >
              {category} ({categoryCounts[category] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* Product Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gridAutoRows: '240px', // lock card height independent of viewport
        gap: '10px',
        flex: 1,
        minHeight: 'calc(3 * 240px + 20px)', // keep 3-row viewport height even when filtered
        maxHeight: 'calc(3 * 240px + 20px)',
        overflowY: 'auto',
        paddingRight: '8px'
      }}>
        {filteredItems.length === 0 ? (
          <div style={{ 
            gridColumn: '1 / -1', 
            textAlign: 'center', 
            padding: '80px 20px', 
            color: 'var(--gray-600)'
          }}>
            {items.length === 0 ? (
              <>
                <div style={{ 
                  fontSize: '80px', 
                  marginBottom: '24px',
                  opacity: 0.5
                }}>
                  📦
                </div>
                <p style={{ 
                  fontSize: 'var(--font-size-2xl)', 
                  fontWeight: '700', 
                  marginBottom: '12px', 
                  color: 'var(--dark)',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-tight)',
                  letterSpacing: 'var(--letter-spacing-tight)'
                }}>
                  No items found
                </p>
                <p style={{ 
                  fontSize: 'var(--font-size-base)', 
                  color: 'var(--gray-500)',
                  maxWidth: '400px',
                  margin: '0 auto',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-relaxed)'
                }}>
                  Click "Sync Zoho" to import items from Zoho Books.
                </p>
              </>
            ) : (
              <>
                <div style={{ 
                  fontSize: '80px', 
                  marginBottom: '24px',
                  opacity: 0.5
                }}>
                  🔍
                </div>
                <p style={{ 
                  fontSize: 'var(--font-size-2xl)', 
                  fontWeight: '700', 
                  marginBottom: '12px', 
                  color: 'var(--dark)',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-tight)',
                  letterSpacing: 'var(--letter-spacing-tight)'
                }}>
                  No items match your search
                </p>
                <p style={{ 
                  fontSize: 'var(--font-size-base)', 
                  color: 'var(--gray-500)',
                  maxWidth: '400px',
                  margin: '0 auto',
                  fontFamily: 'var(--font-family)',
                  lineHeight: 'var(--line-height-relaxed)'
                }}>
                  Try a different search term or category
                </p>
              </>
            )}
          </div>
        ) : (
          filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => !disabled && onSelectItem(item)}
              style={{
                height: '100%',
                padding: '10px',
                border: '2px solid var(--border)',
                borderRadius: '12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                background: 'white',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-sm)',
                opacity: disabled ? 0.6 : 1,
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                if (!disabled) {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.background = '#fafbff';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled) {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              {/* Item Image Placeholder */}
              <div style={{
                width: '100%',
                aspectRatio: '1',
                background: 'var(--gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Simple icon placeholder */}
                <div style={{
                  fontSize: '48px',
                  color: 'var(--gray-400)',
                  opacity: 0.6
                }}>
                  {item.name ? item.name.charAt(0).toUpperCase() : '📦'}
                </div>
              </div>

              {/* Item Details */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flex: 1,
                alignItems: 'center',
                textAlign: 'center'
              }}>
                {/* Item Name */}
                <div style={{ 
                  fontWeight: '600', 
                  fontSize: 'var(--font-size-base)',
                  color: 'var(--dark)',
                  lineHeight: 'var(--line-height-relaxed)',
                  minHeight: '44px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontFamily: 'var(--font-family)',
                  letterSpacing: 'var(--letter-spacing-normal)'
                }}>
                  {item.name}
                </div>
                
                {/* Price */}
                <div style={{ 
                  fontSize: 'var(--font-size-xl)', 
                  fontWeight: '700', 
                  color: 'var(--primary)',
                  lineHeight: 'var(--line-height-tight)',
                  fontFamily: 'var(--font-family)',
                  letterSpacing: 'var(--letter-spacing-tight)'
                }}>
                  ${parseFloat(item.price || 0).toFixed(2)}
                </div>
                
                {/* Stock Information */}
                {item.stock !== undefined && item.stock !== null && (
                  <div style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: '600',
                    color: item.stock > 10 ? 'var(--gray-600)' : item.stock > 0 ? 'var(--warning-dark)' : 'var(--danger)',
                    fontFamily: 'var(--font-family)',
                    lineHeight: 'var(--line-height-normal)'
                  }}>
                    Stock: <span style={{ 
                      color: item.stock <= 10 && item.stock > 0 ? 'var(--warning-dark)' : item.stock === 0 ? 'var(--danger)' : 'var(--gray-700)',
                      fontWeight: item.stock <= 10 ? '700' : '600'
                    }}>
                      {item.stock}
                    </span>
                  </div>
                )}
                
                {/* Tax Info */}
                {item.taxPercentage > 0 && (
                  <div style={{ 
                    fontSize: 'var(--font-size-xs)', 
                    color: 'var(--gray-500)', 
                    display: 'inline-block',
                    padding: '2px 6px',
                    background: 'var(--gray-100)',
                    borderRadius: '4px',
                    fontWeight: '500',
                    width: 'fit-content',
                    fontFamily: 'var(--font-family)',
                    lineHeight: 'var(--line-height-normal)'
                  }}>
                    +{item.taxPercentage}% tax
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ItemSelector;


