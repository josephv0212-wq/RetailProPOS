import React, { useState, useEffect, ChangeEvent } from 'react';
import { RefreshCw, Trash2, Check, X, Edit3, AlertCircle, Upload, Plus, Search } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../../utils/logger';
import { authAPI, zohoAPI, itemsAPI, unitsAPI, itemUnitsAPI } from '../../services/api';

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
  unit?: string;
  unitOfMeasures?: Array<{
    id: number;
    unitName: string;
    symbol: string;
    unitPrecision: number;
    ItemUnitOfMeasure?: {
      isDefault: boolean;
    };
  }>;
}

interface UnitOfMeasure {
  id: number;
  unitName: string;
  symbol: string;
  unitPrecision: number;
  basicUM?: string | null;
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
  const [activeTab, setActiveTab] = useState<'users' | 'items' | 'units'>('users');
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [newUnit, setNewUnit] = useState({
    unitName: '',
    symbol: '',
    unitPrecision: 0 as number,
    basicUM: ''
  });
  const [showItemUnitModal, setShowItemUnitModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemUnits, setItemUnits] = useState<UnitOfMeasure[]>([]);
  const [isLoadingItemUnits, setIsLoadingItemUnits] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  
  const { showToast } = useToast();

  // Check if current user is admin
  const isAdmin = currentUser.role === 'admin';

  // Load items function
  const loadItems = async () => {
    setIsLoadingItems(true);
    try {
      const response = await itemsAPI.getAll({ isActive: true });
      if (response.success && response.data?.items) {
        const transformedItems: Item[] = await Promise.all(
          response.data.items.map(async (item: any) => {
            // Handle imageData - could be base64 string or full data URL
            let imageUrl = undefined;
            if (item.imageData) {
              // If it already has data: prefix, use as is, otherwise add it
              imageUrl = item.imageData.startsWith('data:') 
                ? item.imageData 
                : `data:image/png;base64,${item.imageData}`;
            }
            
            // Load units for this item
            let unitOfMeasures = undefined;
            try {
              const unitsResponse = await itemUnitsAPI.getItemUnits(item.id);
              if (unitsResponse.success && unitsResponse.data?.units) {
                unitOfMeasures = unitsResponse.data.units;
              }
            } catch (err) {
              // Silently fail - units are optional
            }
            
            return {
              id: String(item.id),
              name: item.name,
              image: imageUrl,
              unit: item.unit || undefined,
              unitOfMeasures,
            };
          })
        );
        setItems(transformedItems);
      }
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setIsLoadingItems(false);
    }
  };

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
      await loadItems();

      // Load units
      await loadUnits();
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

    // Clear the input so the same file can be selected again
    event.target.value = '';

    // Read file as base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageData = reader.result as string;
      
      try {
        // Call API to save the image
        const response = await itemsAPI.updateImage(parseInt(itemId), imageData);
        
        if (response.success) {
          showToast('Image uploaded successfully!', 'success');
          // Reload items to get the latest data from server
          await loadItems();
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

  const handleRemoveImage = async (itemId: string) => {
    if (!confirm('Are you sure you want to remove this image?')) {
      return;
    }

    try {
      const response = await itemsAPI.updateImage(parseInt(itemId), null);
      
      if (response.success) {
        showToast('Image removed successfully!', 'success');
        // Reload items to get the latest data from server for real-time update
        await loadItems();
      } else {
        showToast(response.message || 'Failed to remove image', 'error');
      }
    } catch (err) {
      console.error('Failed to remove image:', err);
      showToast('Failed to remove image', 'error');
    }
  };

  const loadUnits = async () => {
    setIsLoadingUnits(true);
    try {
      const response = await unitsAPI.getAll();
      if (response.success && response.data?.units) {
        setUnits(response.data.units);
      }
    } catch (err) {
      console.error('Failed to load units:', err);
      showToast('Failed to load units', 'error');
    } finally {
      setIsLoadingUnits(false);
    }
  };

  const handleAddUnit = () => {
    setNewUnit({ unitName: '', symbol: '', unitPrecision: 0, basicUM: '' });
    setShowUnitModal(true);
  };

  const handleSaveUnit = async () => {
    if (!newUnit.unitName.trim() || !newUnit.symbol.trim()) {
      showToast('Unit name and symbol are required', 'error');
      return;
    }

    try {
      const response = await unitsAPI.create({
        unitName: newUnit.unitName.trim(),
        symbol: newUnit.symbol.trim(),
        unitPrecision: parseInt(String(newUnit.unitPrecision)) || 0,
        basicUM: newUnit.basicUM.trim() || null
      });

      if (response.success) {
        showToast('Unit of measure created successfully!', 'success');
        setShowUnitModal(false);
        await loadUnits();
      } else {
        showToast(response.message || 'Failed to create unit', 'error');
      }
    } catch (err) {
      console.error('Failed to create unit:', err);
      showToast('Failed to create unit', 'error');
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    if (!confirm('Are you sure you want to delete this unit of measure?')) {
      return;
    }

    try {
      const response = await unitsAPI.delete(unitId);
      
      if (response.success) {
        showToast('Unit of measure deleted successfully!', 'success');
        await loadUnits();
      } else {
        showToast(response.message || 'Failed to delete unit', 'error');
      }
    } catch (err) {
      console.error('Failed to delete unit:', err);
      showToast('Failed to delete unit', 'error');
    }
  };

  const handleManageItemUnits = async (item: Item) => {
    setSelectedItem(item);
    setIsLoadingItemUnits(true);
    try {
      const response = await itemUnitsAPI.getItemUnits(parseInt(item.id));
      if (response.success && response.data?.units) {
        setItemUnits(response.data.units);
      }
    } catch (err) {
      console.error('Failed to load item units:', err);
      showToast('Failed to load item units', 'error');
    } finally {
      setIsLoadingItemUnits(false);
      setShowItemUnitModal(true);
    }
  };

  const handleAddItemUnit = async (unitId: number) => {
    if (!selectedItem) return;

    try {
      const response = await itemUnitsAPI.addItemUnit(parseInt(selectedItem.id), {
        unitOfMeasureId: unitId
      });

      if (response.success) {
        showToast('Unit added to item successfully!', 'success');
        // Reload item units to update the modal UI
        setIsLoadingItemUnits(true);
        try {
          const unitsResponse = await itemUnitsAPI.getItemUnits(parseInt(selectedItem.id));
          if (unitsResponse.success && unitsResponse.data?.units) {
            const updatedUnits = unitsResponse.data.units;
            setItemUnits(updatedUnits);
            
            // Also update the item in the main items list - create a new array to ensure React detects the change
            setItems(prevItems => {
              const itemIdToUpdate = String(selectedItem.id);
              const updatedItems = prevItems.map(item => {
                if (String(item.id) === itemIdToUpdate) {
                  // Create a new object with updated unitOfMeasures
                  return {
                    ...item,
                    unitOfMeasures: [...updatedUnits] // Create new array reference
                  };
                }
                return item;
              });
              return updatedItems;
            });
          }
        } catch (err) {
          console.error('Failed to reload item units:', err);
        } finally {
          setIsLoadingItemUnits(false);
        }
      } else {
        // Show backend validation error message
        const errorMessage = response.message || response.error || 'Failed to add unit to item';
        showToast(errorMessage, 'error');
      }
    } catch (err: any) {
      console.error('Failed to add unit to item:', err);
      // Extract error message from API response
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to add unit to item';
      showToast(errorMessage, 'error');
    }
  };

  const handleRemoveItemUnit = async (unitId: number) => {
    if (!selectedItem) return;

    if (!confirm('Are you sure you want to remove this unit from the item?')) {
      return;
    }

    try {
      const response = await itemUnitsAPI.removeItemUnit(parseInt(selectedItem.id), unitId);

      if (response.success) {
        showToast('Unit removed from item successfully!', 'success');
        // Reload item units to update the modal UI
        setIsLoadingItemUnits(true);
        try {
          const unitsResponse = await itemUnitsAPI.getItemUnits(parseInt(selectedItem.id));
          if (unitsResponse.success && unitsResponse.data?.units) {
            setItemUnits(unitsResponse.data.units);
            
            // Also update the item in the main items list
            setItems(prevItems => 
              prevItems.map(item => 
                String(item.id) === String(selectedItem.id)
                  ? { ...item, unitOfMeasures: unitsResponse.data.units }
                  : item
              )
            );
          }
        } catch (err) {
          console.error('Failed to reload item units:', err);
        } finally {
          setIsLoadingItemUnits(false);
        }
      } else {
        showToast(response.message || 'Failed to remove unit from item', 'error');
      }
    } catch (err) {
      console.error('Failed to remove unit from item:', err);
      showToast('Failed to remove unit from item', 'error');
    }
  };

  // Removed handleSetDefaultUnit - default UM comes from Zoho and cannot be changed by admins

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

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-sm flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'items'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Item Settings
          </button>
          <button
            onClick={() => setActiveTab('units')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'units'
                ? 'bg-blue-600 text-white'
                : 'bg-transparent text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            UM
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">All Users</h2>
            {isLoadingUsers ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Total: {users.length} | Active: {activeUsers} | Pending: {pendingUsers}
              </span>
            )}
          </div>
          
          <div className="p-6">

            {isLoadingUsers ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No users found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                      <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Username</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Location</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Tax Rate</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Role</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Status</th>
                      <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr 
                        key={user.id} 
                        className={`border-b border-gray-200 dark:border-gray-600 ${user.status === 'pending' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'}`}
                      >
                        <td className="px-6 py-3 text-gray-900 dark:text-white">{user.useremail}</td>
                        
                        <td className="px-6 py-3">
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
                        
                        <td className="px-6 py-3">
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
                        
                        <td className="px-6 py-3">
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
                        
                        <td className="px-6 py-3">
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
                        
                        <td className="px-6 py-3 text-right">
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
          </div>
        )}

        {/* Item Images Tab */}
        {activeTab === 'items' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 dark:text-white">Item Settings</h2>
                <div className="flex items-center gap-3">
                  {isLoadingItems && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
                  )}
                  <button
                    type="button"
                    onClick={handleSyncZoho}
                    disabled={isSyncingZoho}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingZoho ? 'animate-spin' : ''}`} />
                    {isSyncingZoho ? 'Syncing...' : 'Sync Zoho'}
                  </button>
                </div>
              </div>
              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search items by name..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 pl-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                {itemSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setItemSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="p-6">
            {(() => {
              // Filter items based on search query
              const filteredItems = itemSearchQuery
                ? items.filter(item => 
                    item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                    (item.sku && item.sku.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                  )
                : items;

              return (
                <>
                  {isLoadingItems ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
                  ) : filteredItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      {itemSearchQuery ? `No items found matching "${itemSearchQuery}"` : 'No items found.'}
                    </div>
                  ) : (
                    <>
                      {itemSearchQuery && (
                        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                          Showing {filteredItems.length} of {items.length} items
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                              <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Item Name</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Image</th>
                              <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">UM</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredItems.map(item => (
                      <tr 
                        key={item.id} 
                        className="border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                      >
                        <td className="px-6 py-3 text-gray-900 dark:text-white font-medium">
                          {item.name}
                        </td>
                        
                        <td className="px-6 py-3">
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/*"
                            id={`file-input-${item.id}`}
                            onChange={(e) => handleImageUpload(item.id, e)}
                            className="hidden"
                          />
                          {item.image ? (
                            <div 
                              onClick={() => handleRemoveImage(item.id)}
                              className="w-24 h-24 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative group"
                              title="Click to remove image"
                            >
                              <img 
                                src={item.image} 
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                                <Trash2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ) : (
                            <div 
                              onClick={() => document.getElementById(`file-input-${item.id}`)?.click()}
                              className="w-24 h-24 rounded overflow-hidden cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors bg-gray-200 dark:bg-gray-600 flex flex-col items-center justify-center gap-1"
                              title="Click to upload image"
                            >
                              <Upload className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                              <span className="text-xs text-gray-500 dark:text-gray-400">Upload</span>
                            </div>
                          )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-3 text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            {item.unitOfMeasures && item.unitOfMeasures.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {item.unitOfMeasures.map((um) => (
                                  <span
                                    key={um.id}
                                    className={`px-2 py-1 text-xs rounded ${
                                      um.ItemUnitOfMeasure?.isDefault
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    {um.symbol}
                                    {um.ItemUnitOfMeasure?.isDefault && ' (Default)'}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span>{item.unit || '—'}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleManageItemUnits(item)}
                              className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              Manage
                            </button>
                          </div>
                        </td>
                      </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
            </div>
          </div>
        )}

        {/* Units Tab */}
        {activeTab === 'units' && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">Unit of Measure</h2>
              <button
                type="button"
                onClick={handleAddUnit}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add UM
              </button>
            </div>
            
            <div className="p-6">
              {isLoadingUnits ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
              ) : units.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">No units found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Unit Name</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Symbol</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Unit Rate</th>
                        <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">Basic UM</th>
                        <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map(unit => (
                        <tr 
                          key={unit.id} 
                          className="border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                        >
                          <td className="px-6 py-3 text-gray-900 dark:text-white">{unit.unitName}</td>
                          <td className="px-6 py-3 text-gray-900 dark:text-white">{unit.symbol}</td>
                          <td className="px-6 py-3 text-gray-900 dark:text-white">{unit.unitPrecision}</td>
                          <td className="px-6 py-3 text-gray-900 dark:text-white">{unit.basicUM || '—'}</td>
                          <td className="px-6 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteUnit(unit.id)}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Unit Modal */}
        {showUnitModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add Unit of Measure</h3>
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Unit Name *
                  </label>
                  <input
                    type="text"
                    value={newUnit.unitName}
                    onChange={(e) => setNewUnit({ ...newUnit, unitName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Kilogram"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Symbol *
                  </label>
                  <input
                    type="text"
                    value={newUnit.symbol}
                    onChange={(e) => setNewUnit({ ...newUnit, symbol: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., kg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Unit Rate *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newUnit.unitPrecision}
                    onChange={(e) => setNewUnit({ ...newUnit, unitPrecision: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Basic UM
                  </label>
                  <input
                    type="text"
                    value={newUnit.basicUM}
                    onChange={(e) => setNewUnit({ ...newUnit, basicUM: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., lb"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowUnitModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveUnit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manage Item Units Modal */}
        {showItemUnitModal && selectedItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Manage Units for: {selectedItem.name}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowItemUnitModal(false);
                    setSelectedItem(null);
                    setItemUnits([]);
                  }}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Assigned Units */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Assigned Units
                  </h4>
                  {isLoadingItemUnits ? (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading...</div>
                  ) : itemUnits.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">No units assigned</div>
                  ) : (
                    <div className="space-y-2">
                      {itemUnits.map((unit: any) => {
                        const isDefault = unit.ItemUnitOfMeasure?.isDefault || unit.isDefault;
                        return (
                          <div
                            key={unit.id}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {unit.unitName} ({unit.symbol})
                              </span>
                              {isDefault && (
                                <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                  Default
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {isDefault && (
                                <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                  Default (from Zoho - cannot be removed)
                                </span>
                              )}
                              {!isDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemUnit(unit.id)}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Available Units to Add */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Available Units
                  </h4>
                  {units.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">No units available</div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {units
                        .filter(unit => !itemUnits.some(itemUnit => itemUnit.id === unit.id))
                        .map((unit) => {
                          // Get item's default UM
                          const defaultUnit = itemUnits.find(u => u.ItemUnitOfMeasure?.isDefault);
                          const itemDefaultUM = selectedItem?.unit || (defaultUnit ? (defaultUnit.symbol || defaultUnit.unitName) : null);
                          const canAdd = unit.basicUM && itemDefaultUM && unit.basicUM === itemDefaultUM;
                          
                          return (
                            <div
                              key={unit.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                canAdd 
                                  ? 'bg-gray-50 dark:bg-gray-700' 
                                  : 'bg-gray-100 dark:bg-gray-800 opacity-60'
                              }`}
                            >
                              <div className="flex flex-col gap-1">
                                <span className="text-gray-900 dark:text-white font-medium">
                                  {unit.unitName} ({unit.symbol})
                                </span>
                                <div className="flex flex-col gap-0.5 text-xs">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    Unit Rate: {unit.unitPrecision}
                                  </span>
                                  {unit.basicUM && (
                                    <span className="text-gray-600 dark:text-gray-400">
                                      Basic UM: {unit.basicUM}
                                    </span>
                                  )}
                                </div>
                                {!canAdd && unit.basicUM && (
                                  <span className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                                    {!itemDefaultUM 
                                      ? 'Item has no default UM'
                                      : `Cannot add: Item's default UM (${itemDefaultUM}) doesn't match this unit's basic UM (${unit.basicUM})`
                                    }
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddItemUnit(unit.id)}
                                disabled={!canAdd}
                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                  canAdd
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                }`}
                              >
                                Add
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}