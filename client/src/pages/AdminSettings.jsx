import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import QRCardPrintModal from '../components/QRCardPrintModal';
import AuditLogs from './AuditLogs';
import MasterPhotosAdmin from '../components/MasterPhotosAdmin';
import WhatsAppAlertsSettings from '../components/WhatsAppAlertsSettings';
import ToiletReferencePhotos from '../components/ToiletReferencePhotos';
import ToiletMasterModal, { ToiletMasterFields, emptyMaster, masterPayload } from '../components/ToiletMasterModal';
import {
  MessageCircle,
  Settings,
  Building2,
  QrCode,
  Users,
  Clock,
  ShieldCheck,
  History,
  Printer,
  RefreshCw,
  Plus,
  Check,
  Lock,
  Search,
  Filter,
  Edit,
  UserCheck,
  UserX,
  X,
  Sparkles,
  MapPin,
  Layers,
  ChevronRight,
  ShieldAlert,
  Trash2,
  Camera
} from 'lucide-react';

export default function AdminSettings({ initialTab = 'qr_master' }) {
  const { activePlantId, plants, refreshPlants, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab); // 'qr_master' | 'plants' | 'users' | 'shifts' | 'audit_logs'
  const isITAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'IT_ADMIN' || currentUser?.role === 'MANAGEMENT';

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Data State
  const [qrMasterList, setQrMasterList] = useState([]);
  const [plantsList, setPlantsList] = useState([]);
  const [users, setUsers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Plant Modal State
  const [plantModalOpen, setPlantModalOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState(null);
  const [plantLocation, setPlantLocation] = useState('');
  const [plantCode, setPlantCode] = useState('');
  const [plantName, setPlantName] = useState('');
  const [plantSubmitting, setPlantSubmitting] = useState(false);

  // Filters & Search
  const [filterPlant, setFilterPlant] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [selectedToiletForPrint, setSelectedToiletForPrint] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = new user, or user object

  // Cascading Hierarchy for New Facility Form
  const [formPlantId, setFormPlantId] = useState('');
  const [formBuildings, setFormBuildings] = useState([]);
  const [formBuildingId, setFormBuildingId] = useState('');
  const [formBlocks, setFormBlocks] = useState([]);
  const [formBlockId, setFormBlockId] = useState('');
  const [formFloors, setFormFloors] = useState([]);
  const [formFloorId, setFormFloorId] = useState('');
  const [formAreas, setFormAreas] = useState([]);
  const [formAreaId, setFormAreaId] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formNameTouched, setFormNameTouched] = useState(false);
  const [formGender, setFormGender] = useState('MALE');
  const [formMaster, setFormMaster] = useState(emptyMaster);
  const [editingMasterToilet, setEditingMasterToilet] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  // Quick Add Hierarchy in Facility Modal
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newBuildingCode, setNewBuildingCode] = useState('');
  const [addingBuilding, setAddingBuilding] = useState(false);

  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockCode, setNewBlockCode] = useState('');
  const [addingBlock, setAddingBlock] = useState(false);

  const [showAddFloor, setShowAddFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorCode, setNewFloorCode] = useState('');
  const [addingFloor, setAddingFloor] = useState(false);

  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaCode, setNewAreaCode] = useState('');
  const [addingArea, setAddingArea] = useState(false);

  // User Form State
  const [userEmpId, setUserEmpId] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userRole, setUserRole] = useState('HOUSEKEEPING'); // IT ADMIN, HOUSEKEEPING, MANAGEMENT, SUPERVISOR
  const [userLocation, setUserLocation] = useState('all');
  const [userPlantId, setUserPlantId] = useState('all');
  const [userSubmitting, setUserSubmitting] = useState(false);

  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (text, type = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg(null);
    }, 2800);
  };

  // Unique list of plant locations for location dropdown
  const uniqueLocations = Array.from(new Set(plantsList.map(p => p.location).filter(Boolean)));

  // Filtered plants for User Modal based on selected location
  const filteredPlantsForUser = userLocation === 'all'
    ? plantsList
    : plantsList.filter(p => p.location === userLocation);

  useEffect(() => {
    loadAdminData();
  }, [activePlantId, activeTab]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // Always keep plantsList and users list up to date so Housekeeping dropdown is always populated
      const [plantRes, usersRes] = await Promise.all([
        api.get('/admin/plants'),
        api.get('/admin/users')
      ]);
      setPlantsList(plantRes.plants || []);
      setUsers(usersRes.users || []);

      if (activeTab === 'qr_master') {
        const res = await api.get('/admin/qr-master');
        setQrMasterList(res.qrList || []);
      } else if (activeTab === 'shifts') {
        const res = await api.get('/admin/shifts');
        setShifts(res.shifts || []);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load cascading buildings when plant changes in modal
  useEffect(() => {
    if (facilityModalOpen && formPlantId) {
      api.get(`/admin/buildings?plantId=${formPlantId}`)
        .then(res => {
          setFormBuildings(res.buildings || []);
          setFormBuildingId(res.buildings?.[0]?.id ? String(res.buildings[0].id) : '');
        })
        .catch(() => { });
    }
  }, [facilityModalOpen, formPlantId]);

  // Load blocks when building changes
  useEffect(() => {
    if (facilityModalOpen && formBuildingId && formBuildingId !== '__NEW__') {
      api.get(`/admin/blocks?buildingId=${formBuildingId}`)
        .then(res => {
          setFormBlocks(res.blocks || []);
          setFormBlockId(res.blocks?.[0]?.id ? String(res.blocks[0].id) : '');
        })
        .catch(() => { });
    }
  }, [facilityModalOpen, formBuildingId]);

  // Load floors when building or block changes (no block selected = all floors of the building)
  useEffect(() => {
    if (!facilityModalOpen || !formBuildingId || formBuildingId === '__NEW__') return;
    let stale = false;
    api.get('/admin/floors', formBlockId ? { buildingId: formBuildingId, blockId: formBlockId } : { buildingId: formBuildingId })
      .then(res => {
        if (stale) return;
        setFormFloors(res.floors || []);
        setFormFloorId(res.floors?.[0]?.id ? String(res.floors[0].id) : '');
      })
      .catch(() => { });
    return () => { stale = true; };
  }, [facilityModalOpen, formBuildingId, formBlockId]);

  // Load areas when floor changes
  useEffect(() => {
    if (facilityModalOpen && formFloorId) {
      api.get(`/admin/areas?floorId=${formFloorId}`)
        .then(res => {
          setFormAreas(res.areas || []);
          setFormAreaId(res.areas?.[0]?.id ? String(res.areas[0].id) : '');
        })
        .catch(() => { });
    }
  }, [facilityModalOpen, formFloorId]);

  // Suggest a readable toilet name from the selected area + type until the admin types their own
  useEffect(() => {
    if (!facilityModalOpen || formNameTouched) return;
    const area = formAreas.find(a => String(a.id) === String(formAreaId));
    if (!area) return;
    const typeLabel = formGender === 'FEMALE' ? 'Female' : 'Male';
    setFormName(`${area.name} - ${typeLabel}`);
  }, [facilityModalOpen, formAreaId, formAreas, formGender, formNameTouched]);

  // Handler to Regenerate / Re-assign QR
  const handleRegenerateQR = async (toiletId, toiletCode) => {
    if (!window.confirm(`Are you sure you want to regenerate and re-assign the QR code for ${toiletCode}?\n\nThe previous QR placard will be immediately invalidated and cannot be scanned.`)) {
      return;
    }
    setRegeneratingId(toiletId);
    try {
      const res = await api.post('/admin/qr-master/generate-qr', { toiletId });
      alert(res.message);
      loadAdminData();
    } catch (err) {
      alert(err.message);
    } finally {
      setRegeneratingId(null);
    }
  };

  // Handler to Open Facility Modal
  const handleOpenFacilityModal = () => {
    setShowAddBuilding(false);
    setShowAddBlock(false);
    setShowAddFloor(false);
    setShowAddArea(false);
    setNewBlockName('');
    setNewBlockCode('');
    setFormMaster(emptyMaster());
    setNewBuildingName('');
    setNewBuildingCode('');
    setNewFloorName('');
    setNewFloorCode('');
    setNewAreaName('');
    setNewAreaCode('');
    setFormCode('');
    setFormName('');
    setFormNameTouched(false);
    setFormGender('MALE');
    const pId = (filterPlant !== 'all' && filterPlant) ? String(filterPlant) : (plants?.[0]?.id ? String(plants[0].id) : '');
    setFormPlantId(pId);
    setFacilityModalOpen(true);
  };

  // Quick Add Building Handler
  const handleQuickAddBuilding = async (e) => {
    e?.preventDefault();
    if (!formPlantId) {
      showToast('Please select a manufacturing plant first', 'error');
      return;
    }
    if (!newBuildingName.trim()) {
      showToast('Building name is required', 'error');
      return;
    }
    const code = newBuildingCode.trim()
      ? newBuildingCode.trim().toUpperCase()
      : `BLD-${newBuildingName.trim().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || '01'}`;

    setAddingBuilding(true);
    try {
      const res = await api.post('/admin/buildings', {
        plantId: Number(formPlantId),
        code,
        name: newBuildingName.trim()
      });
      showToast('Building created successfully');
      const bRes = await api.get(`/admin/buildings?plantId=${formPlantId}`);
      setFormBuildings(bRes.buildings || []);
      setFormBuildingId(String(res.buildingId));
      setShowAddBuilding(false);
      setNewBuildingName('');
      setNewBuildingCode('');
    } catch (err) {
      showToast(err.message || 'Failed to create building', 'error');
    } finally {
      setAddingBuilding(false);
    }
  };

  // Quick Add Block Handler
  const handleQuickAddBlock = async (e) => {
    e?.preventDefault();
    if (!formBuildingId || formBuildingId === '__NEW__') {
      showToast('Please select a building first', 'error');
      return;
    }
    if (!newBlockName.trim()) {
      showToast('Block name is required', 'error');
      return;
    }
    const code = newBlockCode.trim()
      ? newBlockCode.trim().toUpperCase()
      : newBlockName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'BLOCK';

    setAddingBlock(true);
    try {
      const res = await api.post('/admin/blocks', { buildingId: Number(formBuildingId), code, name: newBlockName.trim() });
      showToast('Block created successfully');
      const blRes = await api.get(`/admin/blocks?buildingId=${formBuildingId}`);
      setFormBlocks(blRes.blocks || []);
      setFormBlockId(String(res.blockId));
      setShowAddBlock(false);
      setNewBlockName('');
      setNewBlockCode('');
    } catch (err) {
      showToast(err.message || 'Failed to create block', 'error');
    } finally {
      setAddingBlock(false);
    }
  };

  // Quick Add Floor Handler
  const handleQuickAddFloor = async (e) => {
    e?.preventDefault();
    if (!formBuildingId || formBuildingId === '__NEW__') {
      showToast('Please select a building first', 'error');
      return;
    }
    if (!newFloorName.trim()) {
      showToast('Floor name is required', 'error');
      return;
    }
    const code = newFloorCode.trim()
      ? newFloorCode.trim().toUpperCase()
      : `FL-${newFloorName.trim().slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || '01'}`;

    setAddingFloor(true);
    try {
      const res = await api.post('/admin/floors', {
        buildingId: Number(formBuildingId),
        blockId: formBlockId ? Number(formBlockId) : null,
        code,
        name: newFloorName.trim(),
        floorNumber: 0
      });
      showToast('Floor created successfully');
      const fRes = await api.get('/admin/floors', formBlockId ? { buildingId: formBuildingId, blockId: formBlockId } : { buildingId: formBuildingId });
      setFormFloors(fRes.floors || []);
      setFormFloorId(String(res.floorId));
      setShowAddFloor(false);
      setNewFloorName('');
      setNewFloorCode('');
    } catch (err) {
      showToast(err.message || 'Failed to create floor', 'error');
    } finally {
      setAddingFloor(false);
    }
  };

  // Quick Add Area Handler
  const handleQuickAddArea = async (e) => {
    e?.preventDefault();
    if (!formFloorId || formFloorId === '__NEW__') {
      showToast('Please select a floor first', 'error');
      return;
    }
    if (!newAreaName.trim()) {
      showToast('Area name is required', 'error');
      return;
    }
    const code = newAreaCode.trim()
      ? newAreaCode.trim().toUpperCase()
      : `AREA-${newAreaName.trim().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || '01'}`;

    setAddingArea(true);
    try {
      const res = await api.post('/admin/areas', {
        floorId: Number(formFloorId),
        code,
        name: newAreaName.trim()
      });
      showToast('Specific Area created successfully');
      const aRes = await api.get(`/admin/areas?floorId=${formFloorId}`);
      setFormAreas(aRes.areas || []);
      setFormAreaId(String(res.areaId));
      setShowAddArea(false);
      setNewAreaName('');
      setNewAreaCode('');
    } catch (err) {
      showToast(err.message || 'Failed to create area', 'error');
    } finally {
      setAddingArea(false);
    }
  };

  // Handler to Create New Facility & Generate QR
  const handleCreateFacility = async (e) => {
    e.preventDefault();
    if (!formPlantId || !formAreaId || !formCode || !formName) {
      showToast('Please fill all required hierarchy and facility fields.', 'error');
      return;
    }
    setFormSubmitting(true);
    try {
      const res = await api.post('/admin/qr-master/create-facility', {
        ...masterPayload(formMaster),
        plantId: Number(formPlantId),
        areaId: Number(formAreaId),
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        gender: formGender
      });
      showToast(`Success! ${res.message || 'Facility QR placard generated.'}`);
      setFacilityModalOpen(false);
      setFormCode('');
      setFormName('');
      setFormNameTouched(false);
      loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to create facility QR', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handler for User Management (Create or Update)
  const handleOpenUserModal = (user = null) => {
    setEditingUser(user);
    if (user) {
      setUserEmpId(user.employee_id || '');
      setUserName(user.name || '');
      setUserEmail(user.email || '');
      setUserPassword('');
      setUserPhone(user.phone || '');
      let r = user.role;
      if (r === 'SUPER_ADMIN') r = 'IT ADMIN';
      if (r === 'HOUSEKEEPING_AGENT') r = 'HOUSEKEEPING';
      setUserRole(r);

      if (r === 'IT ADMIN' || !user.plant_id) {
        setUserLocation('all');
        setUserPlantId('all');
      } else {
        const found = plantsList.find(p => p.id === user.plant_id);
        if (found) {
          setUserLocation(found.location || 'all');
          setUserPlantId(String(found.id));
        } else {
          setUserLocation('all');
          setUserPlantId(String(user.plant_id));
        }
      }
    } else {
      setUserEmpId('');
      setUserName('');
      setUserEmail('');
      setUserPassword('password123');
      setUserPhone('');
      setUserRole('HOUSEKEEPING');
      const defaultPlant = plantsList?.[0] || plants?.[0];
      if (defaultPlant) {
        setUserLocation(defaultPlant.location || 'all');
        setUserPlantId(String(defaultPlant.id));
      } else {
        setUserLocation('all');
        setUserPlantId('all');
      }
    }
    setUserModalOpen(true);
  };

  const handleLocationChange = (newLoc) => {
    setUserLocation(newLoc);
    if (newLoc === 'all') {
      setUserPlantId('all');
    } else {
      const matching = plantsList.filter(p => p.location === newLoc);
      if (matching.length > 0) {
        const stillValid = matching.some(p => String(p.id) === String(userPlantId));
        if (!stillValid) {
          setUserPlantId(String(matching[0].id));
        }
      } else {
        setUserPlantId('all');
      }
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userEmpId || !userName || !userEmail) {
      alert('Employee ID, Name, and Email are required.');
      return;
    }
    if (userPhone && userPhone.length !== 10) {
      alert('Contact Phone must be exactly 10 digits.');
      return;
    }
    setUserSubmitting(true);
    try {
      let mappedRole = userRole;
      if (userRole === 'IT ADMIN') mappedRole = 'SUPER_ADMIN';
      if (userRole === 'HOUSEKEEPING') mappedRole = 'HOUSEKEEPING_AGENT';

      const payload = {
        employeeId: userEmpId.trim().toUpperCase(),
        name: userName.trim(),
        email: userEmail.trim().toLowerCase(),
        role: mappedRole,
        plantId: (userRole === 'IT ADMIN' || userPlantId === 'all') ? null : Number(userPlantId),
        phone: userPhone.trim()
      };

      if (editingUser) {
        await api.put(`/admin/users/${editingUser.id}`, payload);
        alert('User access and role updated successfully.');
      } else {
        await api.post('/admin/users', payload);
        alert('New user created successfully.');
      }
      setUserModalOpen(false);
      loadAdminData();
    } catch (err) {
      alert(err.message);
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (userId) => {
    try {
      const res = await api.post(`/admin/users/${userId}/toggle-status`);
      alert(res.message);
      loadAdminData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (userItem) => {
    if (currentUser && (currentUser.id === userItem.id || currentUser.employee_id === userItem.employee_id)) {
      showToast('You cannot delete your own logged-in user account.', 'error');
      return;
    }
    try {
      await api.delete(`/admin/users/${userItem.id}`);
      showToast(`User "${userItem.name}" successfully deleted.`);
      loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to delete user.', 'error');
    }
  };

  // Plant & Location Handlers
  const handleOpenPlantModal = (plant = null) => {
    if (plant) {
      setEditingPlant(plant);
      setPlantCode(plant.code || '');
      setPlantName(plant.name || '');
      setPlantLocation(plant.location || '');
    } else {
      setEditingPlant(null);
      setPlantCode('');
      setPlantName('');
      setPlantLocation('');
    }
    setPlantModalOpen(true);
  };

  const handleSavePlant = async (e) => {
    e.preventDefault();
    if (!plantCode.trim() || !plantName.trim()) {
      alert('Please enter Plant Code and Plant Name.');
      return;
    }
    setPlantSubmitting(true);
    try {
      if (editingPlant) {
        const res = await api.put(`/admin/plants/${editingPlant.id}`, {
          code: plantCode.trim().toUpperCase(),
          name: plantName.trim(),
          location: plantLocation.trim()
        });
        showToast(res.message || 'Plant updated successfully.');
      } else {
        const res = await api.post('/admin/plants', {
          code: plantCode.trim().toUpperCase(),
          name: plantName.trim(),
          location: plantLocation.trim()
        });
        showToast(res.message || 'Plant created successfully.');
      }
      setPlantModalOpen(false);
      await refreshPlants?.();
      await loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to save plant', 'error');
    } finally {
      setPlantSubmitting(false);
    }
  };

  const handleDeletePlant = async (plant) => {
    try {
      await api.delete(`/admin/plants/${plant.id}`);
      showToast(`Plant "${plant.name}" successfully deleted.`);
      await refreshPlants?.();
      await loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to delete plant', 'error');
    }
  };

  // Delete Facility QR (IT Admin only)
  const handleDeleteToilet = async (toiletId, toiletCode, toiletName) => {
    try {
      await api.delete(`/admin/toilets/${toiletId}`);
      showToast(`Facility QR "${toiletCode}" successfully deleted.`);
      await loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to delete facility QR', 'error');
    }
  };

  // Filtered QR Master List
  const filteredQRs = qrMasterList.filter(item => {
    const matchesPlant = filterPlant === 'all' || String(item.plant_id) === String(filterPlant);
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      item.code?.toLowerCase().includes(q) ||
      item.name?.toLowerCase().includes(q) ||
      item.toilet_uid?.toLowerCase().includes(q) ||
      item.block_name?.toLowerCase().includes(q) ||
      item.building_name?.toLowerCase().includes(q) ||
      item.floor_name?.toLowerCase().includes(q) ||
      item.area_name?.toLowerCase().includes(q) ||
      item.qr_token?.toLowerCase().includes(q);
    return matchesPlant && matchesSearch;
  });

  return (
    <div className="page-wrapper" style={{ padding: '12px 18px', maxWidth: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: 'var(--color-primary-950)' }}>Settings</h1>
          <span className="badge badge-primary" style={{ fontSize: '10px', padding: '2px 8px' }}>MASTER CONSOLE</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '2px solid var(--color-border)', marginBottom: '10px', overflowX: 'auto' }}>
        {[
          { id: 'qr_master', label: `QR Master (${qrMasterList.length})`, icon: QrCode },
          { id: 'plants', label: `Plants & Locations (${plantsList.length})`, icon: Building2 },
          { id: 'users', label: `User Management (${users.length})`, icon: Users },
          { id: 'shifts', label: 'Shifts & Checkpoints', icon: Clock },
          { id: 'audit_logs', label: 'Audit Trail & Logs', icon: History },
          { id: 'whatsapp', label: 'WhatsApp Alerts', icon: MessageCircle },
          ...(isITAdmin ? [
            { id: 'toilet_refs', label: 'Toilet Reference Photos', icon: Camera },
            { id: 'master_photos', label: 'Master Reference Clean Photos', icon: Camera }
          ] : [])
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '3px solid var(--color-brand-600)' : '3px solid transparent',
                color: isActive ? 'var(--color-primary-950)' : 'var(--color-primary-500)',
                fontSize: '12.5px',
                fontWeight: isActive ? '800' : '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} color={isActive ? 'var(--color-brand-600)' : 'var(--color-primary-400)'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* TAB: MASTER CLEAN REFERENCE PHOTOS (IT ADMIN EXCLUSIVE)        */}
      {/* ============================================================== */}
      {activeTab === 'master_photos' && isITAdmin && (
        <MasterPhotosAdmin plants={plantsList} />
      )}

      {activeTab === 'toilet_refs' && isITAdmin && <ToiletReferencePhotos plants={plantsList} />}

      {activeTab === 'whatsapp' && <WhatsAppAlertsSettings plants={plantsList} />}

      {/* ============================================================== */}
      {/* TAB 1: QR MASTER MODULE                                        */}
      {/* ============================================================== */}
      {activeTab === 'qr_master' && (
        <div className="card" style={{ padding: '12px 16px' }}>

          {/* Top Actions & Filters Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>

            {/* Left: Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

              {/* Plant Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Building2 size={14} color="var(--color-primary-600)" />
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-900)' }}>Plant:</span>
                <select
                  value={filterPlant}
                  onChange={(e) => setFilterPlant(e.target.value)}
                  className="form-control"
                  style={{ padding: '3px 8px', fontSize: '12px', height: '30px', width: 'auto', minWidth: '180px' }}
                >
                  <option value="all">All Manufacturing Plants ({qrMasterList.length})</option>
                  {plants.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Search Input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Search Code, Area, Building..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ padding: '3px 8px 3px 26px', fontSize: '12px', height: '30px', width: '210px' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', position: 'absolute', right: '6px' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Right: Generate QR & Reload Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={handleOpenFacilityModal}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', height: '30px', padding: '0 10px' }}
              >
                <Plus size={13} />
                <span>Generate New Location QR</span>
              </button>
              <button
                onClick={loadAdminData}
                className="btn btn-outline btn-sm"
                style={{ height: '30px', padding: '0 8px' }}
                title="Reload QR Master list"
              >
                <RefreshCw size={12} />
              </button>
            </div>

          </div>

          {/* Table (Responsive with NO horizontal scroll) */}
          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table className="enterprise-table compact-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '105px' }}>Facility Code</th>
                  <th>Facility & Location Hierarchy</th>
                  <th style={{ width: '190px' }}>QR Token</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Status</th>
                  <th style={{ width: '210px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQRs.map(item => (
                  <tr key={item.id}>
                    <td style={{ verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '12.5px', color: 'var(--color-primary-950)', fontFamily: 'var(--font-mono)' }}>
                          {item.code}
                        </strong>
                        <span className={`badge ${item.gender === 'MALE' ? 'badge-primary' : (item.gender === 'FEMALE' ? 'badge-warning' : 'badge-neutral')}`} style={{ fontSize: '9px', padding: '1px 5px', lineHeight: '1.2' }}>
                          {item.gender}
                        </span>
                      </div>
                      {item.toilet_uid && (
                        <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: '#0369a1', fontWeight: 700, marginTop: '3px', wordBreak: 'break-all' }} title="Toilet ID printed on the QR">
                          {item.toilet_uid}
                        </div>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: '700', color: 'var(--color-primary-900)', fontSize: '13px' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--color-primary-700)', fontWeight: '600' }}>{item.plant_name}</span>
                        <span>•</span>
                        <span>{item.building_name}</span>
                        {item.block_name && (
                          <>
                            <span style={{ color: '#94a3b8' }}>›</span>
                            <span>{item.block_name}</span>
                          </>
                        )}
                        <span style={{ color: '#94a3b8' }}>›</span>
                        <span>{item.floor_name}</span>
                        <span style={{ color: '#94a3b8' }}>›</span>
                        <span style={{ fontWeight: '600', color: 'var(--color-primary-800)' }}>{item.area_name}</span>
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                        {item.gender !== 'FEMALE' && <>Urinals {item.urinal_count || 0} • </>}WC {item.wc_count || 0} • Basins {item.basin_count || 0}
                        {item.drinking_water_nearby ? ' • Drinking water nearby' : ''}
                        {item.supervisor_name ? ` • Supervisor: ${item.supervisor_name}` : ''}
                        {item.cleaning_frequency ? ` • ${item.cleaning_frequency.replace(/_/g, ' ').toLowerCase()}` : ''}
                      </div>
                    </td>
                    <td style={{ verticalAlign: 'middle' }}>
                      <div
                        title={`${item.qr_token} (Click to copy)`}
                        onClick={() => {
                          if (navigator?.clipboard?.writeText) {
                            navigator.clipboard.writeText(item.qr_token);
                          }
                        }}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: '#0369a1',
                          backgroundColor: '#f0f9ff',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid #bae6fd',
                          cursor: 'pointer',
                          display: 'inline-block',
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.qr_token}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9.5px', padding: '2px 6px' }}>
                        {item.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setEditingMasterToilet(item)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 7px', whiteSpace: 'nowrap' }}
                          title="Edit Toilet ID, fixtures, responsible person, supervisor and cleaning frequency"
                        >
                          <Edit size={12} />
                          <span>Master</span>
                        </button>
                        <button
                          onClick={() => setSelectedToiletForPrint(item)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 7px', whiteSpace: 'nowrap' }}
                          title="Generate and print physical door placard with brand watermark"
                        >
                          <Printer size={12} />
                          <span>Print</span>
                        </button>
                        <button
                          onClick={() => handleRegenerateQR(item.id, item.code)}
                          disabled={regeneratingId === item.id}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 7px', color: '#b45309', borderColor: '#fde68a', whiteSpace: 'nowrap' }}
                          title="Re-assign and regenerate new cryptographic QR token"
                        >
                          <RefreshCw size={12} />
                          <span>{regeneratingId === item.id ? '...' : 'Re-assign'}</span>
                        </button>
                        {isITAdmin && (
                          <button
                            onClick={() => handleDeleteToilet(item.id, item.code, item.name)}
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '11px', padding: '3px 7px', color: '#dc2626', borderColor: '#fecaca', whiteSpace: 'nowrap' }}
                            title="Delete facility and QR token (IT Admin only)"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredQRs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      No facilities found matching your plant or search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ============================================================== */}
      {/* TAB: PLANTS & LOCATIONS MASTER MODULE                          */}
      {/* ============================================================== */}
      {activeTab === 'plants' && (
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--color-primary-950)' }}>
                Enterprise Manufacturing Plants & Locations ({plantsList.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
                Add industrial plant locations, assign plant codes, and configure facility boundaries for QR generation.
              </p>
            </div>
            {isITAdmin && (
              <button
                onClick={() => handleOpenPlantModal()}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={14} />
                <span>Add Location / Plant</span>
              </button>
            )}
          </div>

          <div className="table-responsive">
            <table className="enterprise-table compact-table">
              <thead>
                <tr>
                  <th>Plant Code</th>
                  <th>Plant Name</th>
                  <th>Location Name / Address</th>
                  <th>Configured Facilities (Toilets)</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plantsList.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ color: 'var(--color-primary-950)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        {p.code}
                      </strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--color-primary-900)' }}>{p.name}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '12px' }}>
                        <MapPin size={13} color="#0284c7" />
                        <span>{p.location || 'Location not specified'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-primary" style={{ fontSize: '10.5px' }}>
                        {p.toilet_count || 0} Facilities
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-success" style={{ fontSize: '10px' }}>
                        ACTIVE
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenPlantModal(p)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          title="Edit Location Name, Plant Code, or Plant Name"
                        >
                          <Edit size={12} />
                          <span>Edit Plant</span>
                        </button>
                        {isITAdmin && (
                          <button
                            onClick={() => handleDeletePlant(p)}
                            className="btn btn-outline btn-sm"
                            style={{ fontSize: '11px', padding: '3px 8px', color: '#dc2626', borderColor: '#fecaca' }}
                            title="Delete this plant and all its facilities (IT Admin only)"
                          >
                            <Trash2 size={12} />
                            <span>Delete Plant</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {plantsList.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No manufacturing plants found. Click "Add Location / Plant" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: USER MANAGEMENT & ROLE ASSIGNMENT MODULE                */}
      {/* ============================================================== */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--color-primary-950)' }}>
                User Directory & Location Scope ({users.length})
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--color-primary-500)' }}>
                Assign user roles and location boundaries. Users can only scan and access facilities within their assigned plant.
              </p>
            </div>
            <button
              onClick={() => handleOpenUserModal(null)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '6px 14px' }}
            >
              <Plus size={15} />
              <span>Add New User</span>
            </button>
          </div>

          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table className="enterprise-table compact-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>User & Credentials</th>
                  <th>Assigned Role</th>
                  <th>Location / Plant Access</th>
                  <th>Phone</th>
                  <th style={{ textAlign: 'center' }}>Account Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--color-primary-900)', fontSize: '13px' }}>{u.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--color-primary-950)' }}>{u.employee_id}</span>
                        <span>•</span>
                        <span>{u.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'SUPER_ADMIN' || u.role === 'IT_ADMIN' ? 'badge-primary' : (u.role === 'HOUSEKEEPING_AGENT' || u.role === 'HOUSEKEEPING' ? 'badge-success' : (u.role === 'SUPERVISOR' ? 'badge-warning' : 'badge-neutral'))}`} style={{ fontSize: '10px' }}>
                        {u.role === 'SUPER_ADMIN' ? 'IT ADMIN' : (u.role === 'HOUSEKEEPING_AGENT' ? 'HOUSEKEEPING' : (u.role === 'PLANT_ADMIN' ? 'ADMIN' : u.role.replace(/_/g, ' ')))}
                      </span>
                    </td>
                    <td>
                      {u.plant_name ? (
                        <div>
                          <div style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--color-primary-900)' }}>
                            {u.plant_code ? `[${u.plant_code}] ` : ''}{u.plant_name}
                          </div>
                          {u.plant_location && (
                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              <MapPin size={11} color="#0284c7" />
                              <span>{u.plant_location}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <ShieldCheck size={13} color="#0284c7" />
                          <span>Universal (All Plants & Locations)</span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>{u.phone || 'N/A'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px' }}>
                        {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenUserModal(u)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          title="Edit user details, role assignment, or plant scope"
                        >
                          <Edit size={12} />
                          <span>Edit Access</span>
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(u.id)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '3px 8px', color: u.is_active ? '#dc2626' : '#16a34a' }}
                          title={u.is_active ? 'Deactivate user access' : 'Activate user access'}
                        >
                          {u.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                          <span>{u.is_active ? 'Deactivate' : 'Activate'}</span>
                        </button>
                        {isITAdmin && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="btn btn-outline btn-sm"
                            style={{
                              fontSize: '11px',
                              padding: '3px 8px',
                              color: currentUser?.id === u.id ? '#94a3b8' : '#dc2626',
                              borderColor: currentUser?.id === u.id ? '#e2e8f0' : '#fecaca',
                              cursor: currentUser?.id === u.id ? 'not-allowed' : 'pointer'
                            }}
                            disabled={currentUser?.id === u.id}
                            title={currentUser?.id === u.id ? 'Cannot delete your own logged-in account' : 'Delete user account'}
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: SHIFTS MODULE                                           */}
      {/* ============================================================== */}
      {activeTab === 'shifts' && (
        <div className="card" style={{ padding: '16px' }}>
          <div className="card-title">
            <span>Plant Shift Timings & Checkpoint Schedules ({shifts.length})</span>
          </div>
          <div className="table-responsive">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Plant</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Checkpoint Alert Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.plant_name}</td>
                    <td><span className="badge badge-neutral">{s.start_time}</span></td>
                    <td><span className="badge badge-neutral">{s.end_time}</span></td>
                    <td><span className="badge badge-warning">{s.checkpoint_time}</span></td>
                    <td><span className="badge badge-success">ACTIVE</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: IMMUTABLE AUDIT TRAIL MODULE                            */}
      {/* ============================================================== */}
      {activeTab === 'audit_logs' && (
        <div style={{ marginTop: '2px' }}>
          <AuditLogs embedded={true} />
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: CREATE NEW FACILITY & GENERATE QR                     */}
      {/* ============================================================== */}
      {facilityModalOpen && (
        <div className="modal-overlay" onClick={() => setFacilityModalOpen(false)}>
          <div
            className="modal-content"
            style={{
              maxWidth: '580px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ flexShrink: 0, padding: '16px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} color="var(--color-brand-600)" />
                <h3 className="modal-title">Generate Location QR Master</h3>
              </div>
              <button onClick={() => setFacilityModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateFacility} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '9px 13px', borderRadius: '6px' }}>
                  Select or add the location (Plant &gt; Building &gt; Block &gt; Floor &gt; Area), then fill the toilet master information. The QR placard carries the Toilet ID.
                </div>

                {/* 1. Plant */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Manufacturing Plant *</label>
                  <select
                    value={formPlantId}
                    onChange={e => {
                      setFormPlantId(e.target.value);
                      setShowAddBuilding(false);
                      setShowAddFloor(false);
                      setShowAddArea(false);
                    }}
                    className="form-control"
                    style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                    required
                  >
                    <option value="" disabled>-- Select Plant --</option>
                    {plants.map(p => (
                      <option key={p.id} value={String(p.id)}>[{p.code}] {p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Building */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700', margin: 0 }}>Building *</label>
                    <button
                      type="button"
                      onClick={() => setShowAddBuilding(!showAddBuilding)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-brand-600)',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Plus size={12} />
                      <span>{showAddBuilding ? 'Cancel' : '+ Add New Building'}</span>
                    </button>
                  </div>
                  <select
                    value={formBuildingId}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setShowAddBuilding(true);
                      } else {
                        setFormBuildingId(e.target.value);
                        setShowAddBuilding(false);
                      }
                    }}
                    className="form-control"
                    style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                    required={!showAddBuilding}
                  >
                    <option value="" disabled>-- Select Building --</option>
                    <option value="__NEW__" style={{ fontWeight: '700', color: 'var(--color-brand-600)' }}>
                      + Add New Building...
                    </option>
                    {formBuildings.map(b => (
                      <option key={b.id} value={String(b.id)}>{b.name} ({b.code})</option>
                    ))}
                  </select>

                  {/* Inline Add Building Card */}
                  {showAddBuilding && (
                    <div style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      marginTop: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-950)' }}>
                          ➕ Add New Building
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddBuilding(false)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Building Name (e.g. Block B)"
                          value={newBuildingName}
                          onChange={e => setNewBuildingName(e.target.value)}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px' }}
                        />
                        <input
                          type="text"
                          placeholder="Code (e.g. BLD-02)"
                          value={newBuildingCode}
                          onChange={e => setNewBuildingCode(e.target.value.toUpperCase())}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setShowAddBuilding(false)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={addingBuilding}
                          onClick={handleQuickAddBuilding}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '11.5px', padding: '4px 14px' }}
                        >
                          {addingBuilding ? 'Saving...' : 'Save & Select Building'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2b. Block */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700', margin: 0 }}>Block</label>
                    <button
                      type="button"
                      disabled={!formBuildingId || formBuildingId === '__NEW__'}
                      onClick={() => setShowAddBlock(!showAddBlock)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: (!formBuildingId || formBuildingId === '__NEW__') ? '#94a3b8' : 'var(--color-brand-600)',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: (!formBuildingId || formBuildingId === '__NEW__') ? 'not-allowed' : 'pointer',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Plus size={12} />
                      <span>{showAddBlock ? 'Cancel' : '+ Add New Block'}</span>
                    </button>
                  </div>
                  <select
                    value={formBlockId}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setShowAddBlock(true);
                      } else {
                        setFormBlockId(e.target.value);
                        setShowAddBlock(false);
                      }
                    }}
                    className="form-control"
                    style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                  >
                    <option value="">No block (all floors of the building)</option>
                    <option value="__NEW__" style={{ fontWeight: '700', color: 'var(--color-brand-600)' }}>
                      + Add New Block...
                    </option>
                    {formBlocks.map(bl => (
                      <option key={bl.id} value={String(bl.id)}>{bl.name} ({bl.code})</option>
                    ))}
                  </select>

                  {showAddBlock && (
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-950)' }}>Add New Block</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Block Name (e.g. Block A)"
                          value={newBlockName}
                          onChange={e => setNewBlockName(e.target.value)}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px' }}
                        />
                        <input
                          type="text"
                          placeholder="Code (e.g. BLOCK-A)"
                          value={newBlockCode}
                          onChange={e => setNewBlockCode(e.target.value.toUpperCase())}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button type="button" onClick={() => setShowAddBlock(false)} className="btn btn-outline btn-sm" style={{ fontSize: '11px', padding: '4px 10px' }}>
                          Cancel
                        </button>
                        <button type="button" disabled={addingBlock} onClick={handleQuickAddBlock} className="btn btn-primary btn-sm" style={{ fontSize: '11.5px', padding: '4px 14px' }}>
                          {addingBlock ? 'Saving...' : 'Save & Select Block'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Floor */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700', margin: 0 }}>Floor *</label>
                    <button
                      type="button"
                      disabled={!formBuildingId || formBuildingId === '__NEW__'}
                      onClick={() => setShowAddFloor(!showAddFloor)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: (!formBuildingId || formBuildingId === '__NEW__') ? '#94a3b8' : 'var(--color-brand-600)',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: (!formBuildingId || formBuildingId === '__NEW__') ? 'not-allowed' : 'pointer',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Plus size={12} />
                      <span>{showAddFloor ? 'Cancel' : '+ Add New Floor'}</span>
                    </button>
                  </div>
                  <select
                    value={formFloorId}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setShowAddFloor(true);
                      } else {
                        setFormFloorId(e.target.value);
                        setShowAddFloor(false);
                      }
                    }}
                    className="form-control"
                    style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                    required={!showAddFloor}
                  >
                    <option value="" disabled>-- Select Floor --</option>
                    <option value="__NEW__" style={{ fontWeight: '700', color: 'var(--color-brand-600)' }}>
                      + Add New Floor...
                    </option>
                    {formFloors.map(f => (
                      <option key={f.id} value={String(f.id)}>{f.name} ({f.code})</option>
                    ))}
                  </select>

                  {/* Inline Add Floor Card */}
                  {showAddFloor && (
                    <div style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      marginTop: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-950)' }}>
                          ➕ Add New Floor
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddFloor(false)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Floor Name (e.g. 1st Floor)"
                          value={newFloorName}
                          onChange={e => setNewFloorName(e.target.value)}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px' }}
                        />
                        <input
                          type="text"
                          placeholder="Code (e.g. FL-01)"
                          value={newFloorCode}
                          onChange={e => setNewFloorCode(e.target.value.toUpperCase())}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setShowAddFloor(false)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={addingFloor}
                          onClick={handleQuickAddFloor}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '11.5px', padding: '4px 14px' }}
                        >
                          {addingFloor ? 'Saving...' : 'Save & Select Floor'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Area */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700', margin: 0 }}>Specific Area *</label>
                    <button
                      type="button"
                      disabled={!formFloorId || formFloorId === '__NEW__'}
                      onClick={() => setShowAddArea(!showAddArea)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: (!formFloorId || formFloorId === '__NEW__') ? '#94a3b8' : 'var(--color-brand-600)',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        cursor: (!formFloorId || formFloorId === '__NEW__') ? 'not-allowed' : 'pointer',
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Plus size={12} />
                      <span>{showAddArea ? 'Cancel' : '+ Add New Area'}</span>
                    </button>
                  </div>
                  <select
                    value={formAreaId}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setShowAddArea(true);
                      } else {
                        setFormAreaId(e.target.value);
                        setShowAddArea(false);
                      }
                    }}
                    className="form-control"
                    style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                    required={!showAddArea}
                  >
                    <option value="" disabled>-- Select Area --</option>
                    <option value="__NEW__" style={{ fontWeight: '700', color: 'var(--color-brand-600)' }}>
                      + Add New Area...
                    </option>
                    {formAreas.map(a => (
                      <option key={a.id} value={String(a.id)}>{a.name} ({a.code})</option>
                    ))}
                  </select>

                  {/* Inline Add Area Card */}
                  {showAddArea && (
                    <div style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      marginTop: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-950)' }}>
                          ➕ Add New Specific Area
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddArea(false)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Area Name (e.g. Assembly Bay 2)"
                          value={newAreaName}
                          onChange={e => setNewAreaName(e.target.value)}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px' }}
                        />
                        <input
                          type="text"
                          placeholder="Code (e.g. AREA-02)"
                          value={newAreaCode}
                          onChange={e => setNewAreaCode(e.target.value.toUpperCase())}
                          className="form-control"
                          style={{ height: '36px', minHeight: '36px', fontSize: '12.5px', padding: '6px 10px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setShowAddArea(false)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={addingArea}
                          onClick={handleQuickAddArea}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '11.5px', padding: '4px 14px' }}
                        >
                          {addingArea ? 'Saving...' : 'Save & Select Area'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 5. Toilet Code & Name */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Toilet Code *</label>
                    <input
                      type="text"
                      placeholder="e.g. TLT-17"
                      value={formCode}
                      onChange={e => setFormCode(e.target.value.toUpperCase())}
                      className="form-control"
                      style={{
                        height: '38px',
                        minHeight: '38px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: '700'
                      }}
                      required
                    />
                    <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                      Auto-capitalized code
                    </div>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Toilet Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Office Toilet - Male"
                      value={formName}
                      onChange={e => { setFormName(e.target.value); setFormNameTouched(true); }}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                      required
                    />
                    <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                      Auto-filled from Area + Male/Female. This name appears on the QR placard, complaints and the housekeeper's screen.
                    </div>
                  </div>
                </div>

                {/* 7. Toilet Type */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Toilet Type *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { id: 'MALE', label: '👨 Male' },
                      { id: 'FEMALE', label: '👩 Female' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFormGender(opt.id)}
                        className={`btn btn-sm ${formGender === opt.id ? 'btn-primary' : 'btn-outline'}`}
                        style={{ height: '38px', fontSize: '13px', fontWeight: '700' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 8. Master Information */}
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--color-primary-900)', marginBottom: '8px' }}>Master Information</div>
                  <ToiletMasterFields
                    value={formMaster}
                    onChange={setFormMaster}
                    users={users}
                    gender={formGender}
                    showResponsible={false}
                  />
                </div>

              </div>

              <div className="modal-footer" style={{ flexShrink: 0, padding: '14px 22px' }}>
                <button type="button" onClick={() => setFacilityModalOpen(false)} className="btn btn-outline btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={formSubmitting} className="btn btn-primary btn-sm">
                  {formSubmitting ? 'Generating...' : 'Generate & Assign QR Placard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: ADD / EDIT USER & ROLE ASSIGNMENT                     */}
      {/* ============================================================== */}
      {userModalOpen && (
        <div className="modal-overlay" onClick={() => setUserModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '620px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ flexShrink: 0, padding: '16px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} color="var(--color-brand-600)" />
                <h3 className="modal-title">{editingUser ? 'Edit User Role & Location Access' : 'Create New System User'}</h3>
              </div>
              <button onClick={() => setUserModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Row 1: Employee ID & Role */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Employee ID *</label>
                    <input
                      type="text"
                      placeholder="e.g. HK-301 or IT-105"
                      value={userEmpId}
                      onChange={e => setUserEmpId(e.target.value)}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px', lineHeight: '1.4' }}
                      required
                      disabled={!!editingUser}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Assigned System Role *</label>
                    <select
                      value={userRole}
                      onChange={e => {
                        const nextRole = e.target.value;
                        setUserRole(nextRole);
                        if (nextRole === 'IT ADMIN') {
                          setUserLocation('all');
                          setUserPlantId('all');
                        } else if (userLocation === 'all' && plantsList.length > 0) {
                          const defaultPlant = plantsList[0];
                          setUserLocation(defaultPlant.location || 'all');
                          setUserPlantId(String(defaultPlant.id));
                        }
                      }}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '12.5px', lineHeight: '1.4', fontWeight: '700' }}
                    >
                      <option value="HOUSEKEEPING">HOUSEKEEPING (Cleaning Staff)</option>
                      <option value="EMPLOYEE">EMPLOYEE (General Staff)</option>
                      <option value="MANAGEMENT">MANAGEMENT (Audits & Reports)</option>
                      <option value="PLANT_ADMIN">ADMIN (Plant Admin — Admin Module)</option>
                      <option value="PLANT_HEAD">PLANT HEAD (Dashboard view + WhatsApp alerts)</option>
                      <option value="IT ADMIN">IT ADMIN (Full Access)</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Full Name & Phone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      value={userName}
                      onChange={e => setUserName(e.target.value)}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px', lineHeight: '1.4' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Contact Phone (10 Digits)</label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={userPhone}
                      onChange={e => setUserPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px', lineHeight: '1.4', fontFamily: 'var(--font-mono)' }}
                    />
                    <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                      {userPhone ? `${userPhone.length}/10 digits` : '10-digit mobile number'}
                    </div>
                  </div>
                </div>

                {/* Row 3: Email Address (Login via Email OTP - No Password Required) */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>Corporate Email Address *</label>
                  <input
                    type="email"
                    placeholder="user@pgel.com"
                    value={userEmail}
                    onChange={e => setUserEmail(e.target.value)}
                    className="form-control"
                    style={{ height: '38px', minHeight: '38px', padding: '6px 12px', fontSize: '13px', lineHeight: '1.4' }}
                    required
                  />
                  <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                    The user logs in to the mobile app with Email and OTP. No password is needed.
                  </div>
                </div>

                {/* Row 4: Dependent Location & Plant Dropdowns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Dropdown 1: Location */}
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={13} color="var(--color-brand-600)" />
                      <span>Location Boundary *</span>
                    </label>
                    <select
                      value={userLocation}
                      onChange={e => handleLocationChange(e.target.value)}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 10px', fontSize: '12px', lineHeight: '1.4' }}
                      disabled={userRole === 'IT ADMIN'}
                    >
                      {userRole === 'IT ADMIN' ? (
                        <option value="all">Universal (All Locations)</option>
                      ) : (
                        <>
                          <option value="all">Universal / All Locations</option>
                          {uniqueLocations.map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </>
                      )}
                    </select>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                      Select geographical zone / city
                    </div>
                  </div>

                  {/* Dropdown 2: Plant (Dependent on selected Location) */}
                  <div>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Building2 size={13} color="var(--color-brand-600)" />
                      <span>Manufacturing Plant *</span>
                    </label>
                    <select
                      value={userPlantId}
                      onChange={e => setUserPlantId(e.target.value)}
                      className="form-control"
                      style={{ height: '38px', minHeight: '38px', padding: '6px 10px', fontSize: '12px', lineHeight: '1.4', fontWeight: '600' }}
                      disabled={userRole === 'IT ADMIN'}
                    >
                      {userRole === 'IT ADMIN' ? (
                        <option value="all">Universal (All Manufacturing Plants)</option>
                      ) : (
                        <>
                          {userLocation === 'all' && (
                            <option value="all">All Manufacturing Plants (Universal Scope)</option>
                          )}
                          {filteredPlantsForUser.map(p => (
                            <option key={p.id} value={String(p.id)}>
                              [{p.code}] {p.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                      {userRole === 'IT ADMIN'
                        ? 'IT Admins automatically have unrestricted multi-plant access.'
                        : (userRole === 'HOUSEKEEPING'
                          ? 'Staff can only scan and clean inside this plant.'
                          : `${filteredPlantsForUser.length} plant(s) available in this location.`)}
                    </div>
                  </div>
                </div>

              </div>

              <div className="modal-footer" style={{ flexShrink: 0, padding: '14px 22px' }}>
                <button type="button" onClick={() => setUserModalOpen(false)} className="btn btn-outline btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={userSubmitting} className="btn btn-primary btn-sm">
                  {userSubmitting ? 'Saving...' : (editingUser ? 'Update User Access' : 'Create User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD / EDIT LOCATION & PLANT                             */}
      {/* ============================================================== */}
      {plantModalOpen && (
        <div className="modal-overlay" onClick={() => setPlantModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={18} color="var(--color-brand-600)" />
                <h3 className="modal-title">{editingPlant ? 'Edit Plant & Location' : 'Add New Plant & Location'}</h3>
              </div>
              <button onClick={() => setPlantModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePlant}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '8px 12px', borderRadius: '6px' }}>
                  Define the industrial plant and its physical geographical location. This location will be available immediately for generating facility QR codes.
                </div>

                {/* 1. Location Name */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>
                    Location Name (City / Area / Zone) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. RIICO Industrial Area, Bhiwadi, Rajasthan"
                    value={plantLocation}
                    onChange={e => setPlantLocation(e.target.value)}
                    className="form-control"
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Physical location, city, state, or industrial sector.
                  </div>
                </div>

                {/* 2. Plant Code */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>
                    Plant Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BHIWADI or PLT-01"
                    value={plantCode}
                    onChange={e => setPlantCode(e.target.value.toUpperCase())}
                    className="form-control"
                    style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Unique identifier code used for plant boundaries and tokens.
                  </div>
                </div>

                {/* 3. Plant Name */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: '700' }}>
                    Plant Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bhiwadi Manufacturing Plant"
                    value={plantName}
                    onChange={e => setPlantName(e.target.value)}
                    className="form-control"
                    required
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                    Official enterprise facility title.
                  </div>
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setPlantModalOpen(false)} className="btn btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={plantSubmitting} className="btn btn-primary">
                  {plantSubmitting ? 'Saving...' : (editingPlant ? 'Update Plant' : 'Save Plant')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Placard Print Modal */}
      {selectedToiletForPrint && (
        <QRCardPrintModal
          isOpen={!!selectedToiletForPrint}
          onClose={() => setSelectedToiletForPrint(null)}
          toilet={selectedToiletForPrint}
        />
      )}

      {editingMasterToilet && (
        <ToiletMasterModal
          toilet={editingMasterToilet}
          users={users}
          onClose={() => setEditingMasterToilet(null)}
          onSaved={(res) => {
            setEditingMasterToilet(null);
            showToast(res?.message || 'Master details saved');
            loadAdminData();
          }}
        />
      )}

      {/* Non-blocking Floating Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: toastMsg.type === 'error' ? '#ef4444' : '#0f172a',
          color: '#ffffff',
          padding: '11px 18px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: '600',
          zIndex: 99999
        }}>
          {toastMsg.type === 'error' ? (
            <ShieldAlert size={16} color="#fca5a5" />
          ) : (
            <Check size={16} color="#34d399" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

    </div>
  );
}

