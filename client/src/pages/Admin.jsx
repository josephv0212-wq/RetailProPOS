import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, itemsAPI, zohoAPI } from '../services/api';
import TopNavigation from '../components/TopNavigation';
import { showToast } from '../components/ToastContainer';

const Admin = () => {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingTaxes, setLoadingTaxes] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingLocation, setEditingLocation] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    loadAllUsers();
    loadItems();
    loadTaxRates();
  }, [user]);

  const loadTaxRates = async () => {
    try {
      setLoadingTaxes(true);
      const response = await zohoAPI.getTaxRates();
      if (response.data.success) {
        setTaxRates(response.data.data?.taxes || []);
      }
    } catch (error) {
      // Failed to fetch tax rates silently
    } finally {
      setLoadingTaxes(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await authAPI.getAllUsers();
      const list = res.data.data?.users || res.data.users || [];
      // Filter out the current admin user
      const filteredList = list.filter(u => u.id !== user.id);
      setAllUsers(filteredList);
    } catch (err) {
      const msg = err.formattedMessage || err.response?.data?.message || 'Failed to load users';
      showToast(msg, 'error', 4000);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadItems = async () => {
    try {
      setLoadingItems(true);
      const res = await itemsAPI.getAll({ isActive: true });
      const list = res.data.data?.items || res.data.items || [];
      setItems(list);
    } catch (err) {
      const msg = err.formattedMessage || err.response?.data?.message || 'Failed to load items';
      showToast(msg, 'error', 4000);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    try {
      await authAPI.updateUser(userId, updates);
      showToast('User updated successfully', 'success', 3000);
      setEditingUser(null);
      setEditingLocation('');
      await loadAllUsers();
    } catch (err) {
      const msg = err.formattedMessage || err.response?.data?.message || 'Failed to update user';
      showToast(msg, 'error', 4000);
    }
  };

  const handleApproveUser = async (id) => {
    await handleUpdateUser(id, { isActive: true });
  };

  const handleRejectUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    try {
      await authAPI.rejectUser(id);
      showToast('User deleted', 'success', 3000);
      await loadAllUsers();
    } catch (err) {
      const msg = err.formattedMessage || err.response?.data?.message || 'Failed to delete user';
      showToast(msg, 'error', 4000);
    }
  };

  const handleStartEditLocation = (user) => {
    setEditingUser(user.id);
    // Set the current locationId as the selected value (for dropdown)
    setEditingLocation(user.locationId || '');
  };

  const handleLocationChange = (selectedTaxId) => {
    setEditingLocation(selectedTaxId);
  };

  const handleSaveLocation = (userId) => {
    // Find the selected tax rate
    const selectedTax = taxRates.find(t => t.taxId === editingLocation);
    if (!selectedTax) {
      showToast('Please select a valid location', 'error', 3000);
      return;
    }

    // Auto-set locationId (taxId), locationName, and taxPercentage from the selected tax
    handleUpdateUser(userId, {
      locationId: selectedTax.taxId,
      locationName: `${selectedTax.taxName} (${selectedTax.taxPercentage}%)`,
      taxPercentage: selectedTax.taxPercentage
    });
  };

  const handleSyncZoho = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const response = await zohoAPI.syncAll();
      await loadItems();
      await loadTaxRates();
      
      const syncData = response.data.data || response.data;
      const itemsTotal = syncData?.items?.total || syncData?.items?.length || 0;
      const customersTotal = syncData?.customers?.total || syncData?.customers?.length || 0;
      
      showToast(
        `Synced: ${itemsTotal} items, ${customersTotal} customers`,
        'success',
        4000
      );
    } catch (error) {
      const errorMsg = error.formattedMessage || error.response?.data?.message || 'Sync failed';
      showToast(errorMsg, 'error', 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImageChange = async (itemId, file) => {
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        try {
          await itemsAPI.updateImage(itemId, base64);
          showToast('Item image updated', 'success', 3000);
          setItems(prev =>
            prev.map(i => (i.id === itemId ? { ...i, imageData: base64 } : i))
          );
        } catch (err) {
          const msg = err.formattedMessage || err.response?.data?.message || 'Failed to update item image';
          showToast(msg, 'error', 4000);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      const msg = err.message || 'Failed to read image file';
      showToast(msg, 'error', 4000);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Admin access required</h2>
        <p>You must be logged in as an admin to view this page.</p>
      </div>
    );
  }

  const pendingUsers = allUsers.filter(u => !u.isActive);
  const activeUsers = allUsers.filter(u => u.isActive);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <TopNavigation />

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
            Admin Dashboard
          </h2>
          <button
            onClick={handleSyncZoho}
            disabled={isSyncing}
            style={{
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              background: isSyncing ? '#9ca3af' : '#667eea',
              color: 'white',
              fontSize: '15px',
              fontWeight: '600',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              if (!isSyncing) {
                e.currentTarget.style.background = '#5568d3';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSyncing) {
                e.currentTarget.style.background = '#667eea';
              }
            }}
          >
            {isSyncing ? (
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

        {/* All Users Management */}
        <section
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ fontSize: '20px', fontWeight: '700' }}>All Users</h3>
            {loadingUsers && <span style={{ fontSize: '13px', color: '#6b7280' }}>Loading...</span>}
            {!loadingUsers && (
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                Total: {allUsers.length} | Active: {activeUsers.length} | Pending: {pendingUsers.length}
              </span>
            )}
          </div>
          
          {allUsers.length === 0 && !loadingUsers ? (
            <p style={{ fontSize: '14px', color: '#6b7280' }}>No users found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600' }}>Username</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600' }}>Location</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600' }}>Role</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: '600' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', fontWeight: '600' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((u) => {
                    const isEditing = editingUser === u.id;
                    
                    return (
                      <tr 
                        key={u.id} 
                        style={{ 
                          borderTop: '1px solid #e5e7eb',
                          background: !u.isActive ? '#fef2f2' : 'white'
                        }}
                      >
                        <td style={{ padding: '12px 8px', fontWeight: '400' }}>
                          {u.username}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {isEditing ? (
                            <select
                              value={editingLocation}
                              onChange={(e) => handleLocationChange(e.target.value)}
                              disabled={loadingTaxes}
                              style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                fontSize: '13px',
                                minWidth: '250px',
                                cursor: loadingTaxes ? 'not-allowed' : 'pointer',
                                background: 'white'
                              }}
                            >
                              <option value="">
                                {loadingTaxes ? 'Loading locations...' : 'Select a location'}
                              </option>
                              {taxRates.map(tax => (
                                <option key={tax.taxId} value={tax.taxId}>
                                  {tax.taxName} ({tax.taxPercentage}%)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{u.locationName || u.locationId || '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: u.role === 'admin' ? '#dbeafe' : '#f3f4f6',
                            color: u.role === 'admin' ? '#1e40af' : '#374151',
                            fontWeight: '600',
                            fontSize: '12px'
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: u.isActive ? '#d1fae5' : '#fee2e2',
                            color: u.isActive ? '#065f46' : '#991b1b',
                            fontWeight: '600',
                            fontSize: '12px'
                          }}>
                            {u.isActive ? 'Active' : 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {!u.isActive && (
                              <button
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#10b981',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
                                onClick={() => handleApproveUser(u.id)}
                              >
                                Approve
                              </button>
                            )}
                            {u.isActive && (
                              <button
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#f59e0b',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#d97706'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#f59e0b'}
                                onClick={() => handleUpdateUser(u.id, { isActive: false })}
                              >
                                Deactivate
                              </button>
                            )}
                            {!u.isActive && (
                              <button
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#ef4444',
                                  color: 'white',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#ef4444'}
                                onClick={() => handleRejectUser(u.id)}
                              >
                                Delete
                              </button>
                            )}
                            {!isEditing ? (
                              <button
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid #d1d5db',
                                  background: 'white',
                                  color: '#374151',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f9fafb';
                                  e.currentTarget.style.borderColor = '#9ca3af';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'white';
                                  e.currentTarget.style.borderColor = '#d1d5db';
                                }}
                                onClick={() => handleStartEditLocation(u)}
                              >
                                Edit Location
                              </button>
                            ) : (
                              <>
                                <button
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#10b981',
                                    color: 'white',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
                                  onClick={() => handleSaveLocation(u.id)}
                                >
                                  Save
                                </button>
                                <button
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    background: '#f9fafb',
                                    color: '#6b7280',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    setEditingUser(null);
                                    setEditingLocation({ locationId: '', locationName: '' });
                                  }}
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Item Images */}
        <section
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Item Images</h3>
            {loadingItems && <span style={{ fontSize: '13px', color: '#6b7280' }}>Loading...</span>}
          </div>
          {items.length === 0 && !loadingItems ? (
            <p style={{ fontSize: '14px', color: '#6b7280' }}>No items found.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '10px',
                    background: '#f9fafb',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    SKU: {item.sku || '—'}
                  </div>
                  {item.imageData ? (
                    <img
                      src={item.imageData}
                      alt={item.name}
                      style={{
                        width: '100%',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        marginBottom: '8px',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '120px',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        background: '#e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        color: '#6b7280',
                      }}
                    >
                      No image
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageChange(item.id, e.target.files?.[0])}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Admin;
