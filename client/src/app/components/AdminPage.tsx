import React, { useState, useEffect, ChangeEvent } from 'react';
import { RefreshCw, Trash2, Check, X, Edit3, AlertCircle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../../utils/logger';
import { authAPI, zohoAPI, itemsAPI } from '../../services/api';

interface User {
  id: string;
  useremail: string;
  locationId?: string;
  locationName?: string;
  taxRate?: number;
  zohoTaxId?: string | null;
  role: 'admin' | 'cashier';
  status: 'active' | 'pending';
}

interface Location {
  id: string;
  name: string;
  taxRate: number;
  isPrimary?: boolean;
}

interface Tax {
  taxId: string;
  taxName: string;
  taxPercentage: number;
}

interface Item {
  id: string;
  name: string;
  image?: string;
}

interface AdminPageProps {
  currentUser: {
    useremail: string;
    role: 'admin' | 'cashier';
  };
}

export function AdminPage({ currentUser }: AdminPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isLoadingTaxes, setIsLoadingTaxes] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isSyncingZoho, setIsSyncingZoho] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editLocationId, setEditLocationId] = useState<string>('');
  const [editTaxRate, setEditTaxRate] = useState<number>(0);
  const [editZohoTaxId, setEditZohoTaxId] = useState<string>('');
  
  const { showToast } = useToast();

  // Check if current user is admin
  const isAdmin = currentUser.role === 'admin';

  // Load data from API
  useEffect(() => {
    const loadData = async () => {
      // Load users
      setIsLoadingUsers(true);
      try {
        const [allUsersRes, pendingUsersRes] = await Promise.all([
          authAPI.getAllUsers(),
          authAPI.getPendingUsers(),
        ]);

        if (allUsersRes.success && allUsersRes.data?.users) {
          const allUsers: User[] = allUsersRes.data.users
            .filter((u: any) => u.useremail !== currentUser.useremail)
            .map((u: any) => ({
              id: String(u.id),
              useremail: u.useremail,
              locationId: u.locationId,
              locationName: u.locationName,
              taxRate: u.taxPercentage,
              zohoTaxId: u.zohoTaxId ?? null,
              role: u.role,
              status: u.isActive ? 'active' : 'pending',
            }));

          if (pendingUsersRes.success && pendingUsersRes.data?.users) {
            const pendingUsers: User[] = pendingUsersRes.data.users.map((u: any) => ({
              id: String(u.id),
              useremail: u.useremail,
              role: u.role,
              status: 'pending' as const,
            }));

            // Merge and deduplicate
            const userMap = new Map<string, User>();
            [...allUsers, ...pendingUsers].forEach(u => {
              if (!userMap.has(u.id)) {
                userMap.set(u.id, u);
              }
            });
            setUsers(Array.from(userMap.values()));
          } else {
            setUsers(allUsers);
          }
        }
      } catch (err) {
        logger.error('Failed to load users', err);
        showToast('Failed to load users', 'error');
      } finally {
        setIsLoadingUsers(false);
      }

      // Load locations
      setIsLoadingLocations(true);
      try {
        const response = await zohoAPI.getLocations();
        if (response.success && response.data?.locations) {
          const transformedLocations: Location[] = response.data.locations.map((loc: any) => ({
            id: loc.locationId,
            name: loc.locationName,
            taxRate: 0, // Tax rate would come from user or separate API
            isPrimary: loc.isPrimary,
          }));
          setLocations(transformedLocations);
        }
      } catch (err) {
        console.error('Failed to load locations:', err);
      } finally {
        setIsLoadingLocations(false);
      }

      // Load taxes (Zoho Books settings/taxes)
      setIsLoadingTaxes(true);
      try {
        const response = await zohoAPI.getTaxRates();
        if (response.success && response.data?.taxes) {
          const transformedTaxes: Tax[] = response.data.taxes
            .map((t: any) => ({
              taxId: String(t.taxId ?? t.tax_id ?? ''),
              taxName: String(t.taxName ?? t.tax_name ?? 'Tax'),
              taxPercentage: Number(t.taxPercentage ?? t.tax_percentage ?? 0),
            }))
            .filter(t => t.taxId && Number.isFinite(t.taxPercentage))
            .sort((a, b) => a.taxName.localeCompare(b.taxName));
          setTaxes(transformedTaxes);
        }
      } catch (err) {
        logger.error('Failed to load taxes', err);
      } finally {
        setIsLoadingTaxes(false);
      }

      // Load items
      setIsLoadingItems(true);
      try {
        const response = await itemsAPI.getAll({ isActive: true });
        if (response.success && response.data?.items) {
          const transformedItems: Item[] = response.data.items.map((item: any) => {
            // Handle imageData - could be base64 string or full data URL
            let imageUrl = undefined;
            if (item.imageData) {
              // If it already has data: prefix, use as is, otherwise add it
              imageUrl = item.imageData.startsWith('data:') 
                ? item.imageData 
                : `data:image/png;base64,${item.imageData}`;
            }
            return {
              id: String(item.id),
              name: item.name,
              image: imageUrl,
            };
          });
          setItems(transformedItems);
        }
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setIsLoadingItems(false);
      }
    };

    if (isAdmin) {
      loadData();
    }
  }, [currentUser.useremail, isAdmin]);

  const handleSyncZoho = async () => {
    setIsSyncingZoho(true);
    try {
      const response = await zohoAPI.syncAll();
      if (response.success) {
        showToast('Zoho sync completed successfully!', 'success');
        // Reload data
        window.location.reload(); // Simple reload, could be more elegant
      } else {
        showToast('Zoho sync failed', 'error');
      }
    } catch (err) {
      logger.error('Zoho sync failed', err);
      showToast('Zoho sync failed', 'error');
    } finally {
      setIsSyncingZoho(false);
    }
  };

  const handleApproveUser = async (userId: string) => {
    try {
      const response = await authAPI.approveUser(parseInt(userId));
      if (response.success) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, status: 'active' as const } : u
        ));
        showToast('User approved successfully!', 'success');
      } else {
        showToast('Failed to approve user', 'error');
      }
    } catch (err) {
      console.error('Failed to approve user:', err);
      showToast('Failed to approve user', 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        const response = await authAPI.rejectUser(parseInt(userId));
        if (response.success) {
          setUsers(users.filter(u => u.id !== userId));
          showToast('User deleted successfully!', 'success');
        } else {
          showToast('Failed to delete user', 'error');
        }
      } catch (err) {
        logger.error('Failed to delete user', err);
        showToast('Failed to delete user', 'error');
      }
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    try {
      const response = await authAPI.updateUser(parseInt(userId), { isActive: false });
      if (response.success) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, status: 'pending' as const } : u
        ));
        showToast('User deactivated successfully!', 'success');
      } else {
        showToast('Failed to deactivate user', 'error');
      }
    } catch (err) {
      console.error('Failed to deactivate user:', err);
      showToast('Failed to deactivate user', 'error');
    }
  };

  const handleEditLocation = (userId: string) => {
    const user = users.find(u => u.id === userId);
    setEditingUserId(userId);
    setEditLocationId(user?.locationId || '');
    const userTaxRate = user?.taxRate || 0;
    setEditTaxRate(userTaxRate);

    // Prefer stored zohoTaxId; fallback to first tax matching by percentage.
    const storedId = user?.zohoTaxId ? String(user.zohoTaxId) : '';
    if (storedId) {
      setEditZohoTaxId(storedId);
    } else {
      const match = taxes.find(t => Math.abs(t.taxPercentage - userTaxRate) < 0.0001);
      setEditZohoTaxId(match?.taxId || '');
    }
  };

  const handleLocationChange = (locationId: string) => {
    setEditLocationId(locationId);
    const location = locations.find(l => l.id === locationId);
    if (location) {
      setEditTaxRate(location.taxRate);
    }
  };

  const handleTaxChange = (taxId: string) => {
    setEditZohoTaxId(taxId);
    const tax = taxes.find(t => t.taxId === taxId);
    if (tax) {
      setEditTaxRate(tax.taxPercentage);
    }
  };

  const handleSaveLocation = async (userId: string) => {
    const location = locations.find(l => l.id === editLocationId);
    try {
      const response = await authAPI.updateUser(parseInt(userId), {
        locationId: editLocationId,
        locationName: location?.name,
        taxPercentage: editTaxRate,
        zohoTaxId: editZohoTaxId || null,
      });
      if (response.success) {
        setUsers(users.map(u => 
          u.id === userId 
            ? { 
                ...u, 
                locationId: editLocationId, 
                locationName: location?.name,
                taxRate: editTaxRate,
                zohoTaxId: editZohoTaxId || null,
              } 
            : u
        ));
        setEditingUserId(null);
        showToast('User updated successfully!', 'success');
      } else {
        showToast('Failed to update location', 'error');
      }
    } catch (err) {
      logger.error('Failed to update location', err);
      showToast('Failed to update location', 'error');
    }
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditLocationId('');
    setEditTaxRate(0);
    setEditZohoTaxId('');
  };

  const handleImageUpload = async (itemId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageData = reader.result as string;
      
      try {
        // Call API to save the image
        const response = await itemsAPI.updateImage(parseInt(itemId), imageData);
        
        if (response.success) {
          // Update local state with the saved image
          setItems(items.map(item => 
            item.id === itemId 
              ? { ...item, image: imageData } 
              : item
          ));
          showToast('Image uploaded successfully!', 'success');
        } else {
          showToast(response.message || 'Failed to upload image', 'error');
        }
      } catch (err) {
        console.error('Failed to upload image:', err);
        showToast('Failed to upload image', 'error');
      }
    };
    
    reader.onerror = () => {
      showToast('Failed to read image file', 'error');
    };
    
    reader.readAsDataURL(file);
  };

  const activeUsers = users.filter(u => u.status === 'active').length;
  const pendingUsers = users.filter(u => u.status === 'pending').length;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 px-6">
        <div className="max-w-7xl mx-auto py-16 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Admin access required</h2>
          <p className="text-gray-600 dark:text-gray-400">You must be logged in as an admin to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        </div>

        {/* All Users Management Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">All Users</h2>
            {isLoadingUsers ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Total: {users.length} | Active: {activeUsers} | Pending: {pendingUsers}
              </span>
            )}
          </div>

          {isLoadingUsers ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 dark:text-gray-300">Username</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 dark:text-gray-300">Location</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 dark:text-gray-300">Tax Rate</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 dark:text-gray-300">Role</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-700 dark:text-gray-300">Status</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr 
                      key={user.id} 
                      className={user.status === 'pending' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'}
                    >
                      <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white">{user.useremail}</td>
                      
                      <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                        {editingUserId === user.id ? (
                          <select
                            value={editLocationId}
                            onChange={(e) => handleLocationChange(e.target.value)}
                            disabled={isLoadingLocations}
                            className="min-w-[250px] px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                          >
                            <option value="">
                              {isLoadingLocations ? 'Loading locations...' : 'Select a location'}
                            </option>
                            {locations.map(loc => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} {loc.isPrimary ? '(Primary)' : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-900 dark:text-white">{user.locationName || user.locationId || '—'}</span>
                        )}
                      </td>
                      
                      <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                        {editingUserId === user.id ? (
                          <select
                            value={editZohoTaxId}
                            onChange={(e) => handleTaxChange(e.target.value)}
                            disabled={isLoadingTaxes}
                            className="min-w-[220px] px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                          >
                            <option value="">
                              {isLoadingTaxes ? 'Loading taxes...' : 'Select tax rate'}
                            </option>
                            {taxes.map(t => (
                              <option key={t.taxId} value={t.taxId}>
                                {t.taxName} ({t.taxPercentage.toFixed(2)}%)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-900 dark:text-white">{user.taxRate ? `${user.taxRate.toFixed(2)}%` : '—'}</span>
                        )}
                      </td>
                      
                      <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                        <span 
                          className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            user.role === 'admin' 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' 
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      
                      <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                        <span 
                          className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            user.status === 'active' 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}
                        >
                          {user.status === 'active' ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      
                      <td className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingUserId === user.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveLocation(user.id)}
                                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-700"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {user.status === 'pending' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleApproveUser(user.id)}
                                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivateUser(user.id)}
                                  className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 transition-colors"
                                >
                                  Deactivate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEditLocation(user.id)}
                                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1 bg-white dark:bg-gray-700"
                              >
                                <Edit3 className="w-3 h-3" />
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Item Images Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Item Images</h2>
            <div className="flex items-center gap-3">
              {isLoadingItems && (
                <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
              )}
              <button
                type="button"
                onClick={handleSyncZoho}
                disabled={isSyncingZoho}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingZoho ? 'animate-spin' : ''}`} />
                <span>{isSyncingZoho ? 'Syncing...' : 'Sync Zoho'}</span>
              </button>
            </div>
          </div>

          {isLoadingItems ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No items found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {items.map(item => (
                <div 
                  key={item.id} 
                  className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 p-2.5"
                >
                  <div className="font-bold text-sm mb-1 text-gray-900 dark:text-white">{item.name}</div>
                  
                  <div className="h-30 mb-2 rounded overflow-hidden mt-2">
                    {item.image ? (
                      <img 
                        src={item.image} 
                        alt={item.name}
                        className="w-full h-30 object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-30 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400">No image</span>
                      </div>
                    )}
                  </div>
                  
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(item.id, e)}
                    className="text-xs w-full text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-600 dark:file:text-white dark:hover:file:bg-gray-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}