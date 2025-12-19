// Site Inspector - Professional Field Documentation App
// Version 1.0

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    immich: {
        url: 'https://immich.wilkerson-labs.com',
        apiKey: 'h8t6TNFpxrIgsQj5r8DWbSDgWEPkVFDJ7gCBbOC7KyA'
    },
    cloudinary: {
        cloudName: 'dybes2vsp',
        apiKey: '883195784837585',
        apiSecret: 'fTPVqcw-WJUbJFHtNLLuhjzHMUY',
        uploadPreset: 'site-inspector' // We'll create this
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

let inspections = [];
let currentInspection = null;
let currentPhotoId = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadInspections();
    renderInspections();
    setupEventListeners();
    checkStorageStatus();
});

// ============================================
// STORAGE - LOCAL
// ============================================

function loadInspections() {
    const stored = localStorage.getItem('siteInspections');
    inspections = stored ? JSON.parse(stored) : [];
}

function saveInspections() {
    localStorage.setItem('siteInspections', JSON.stringify(inspections));
}

// ============================================
// STORAGE - IMMICH (PRIMARY)
// ============================================

async function uploadToImmich(photoBlob, caption) {
    try {
        const formData = new FormData();
        formData.append('assetData', photoBlob, `photo-${Date.now()}.jpg`);
        formData.append('deviceAssetId', `site-inspector-${Date.now()}`);
        formData.append('deviceId', 'site-inspector-pwa');
        formData.append('fileCreatedAt', new Date().toISOString());
        formData.append('fileModifiedAt', new Date().toISOString());

        const response = await fetch(`${CONFIG.immich.url}/api/asset/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': CONFIG.immich.apiKey
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Immich upload failed: ${response.status}`);
        }

        const result = await response.json();
        
        return {
            storage: 'immich',
            assetId: result.id,
            url: `${CONFIG.immich.url}/api/asset/thumbnail/${result.id}?x-api-key=${CONFIG.immich.apiKey}`,
            fullUrl: `${CONFIG.immich.url}/api/asset/file/${result.id}?x-api-key=${CONFIG.immich.apiKey}`,
            caption: caption || '',
            timestamp: new Date().toISOString(),
            needsSync: false
        };

    } catch (error) {
        console.error('Immich upload failed:', error);
        throw error;
    }
}

// ============================================
// STORAGE - CLOUDINARY (BACKUP)
// ============================================

async function uploadToCloudinary(photoBlob, caption) {
    try {
        const formData = new FormData();
        formData.append('file', photoBlob);
        formData.append('upload_preset', 'ml_default'); // Using default preset
        formData.append('folder', 'site-inspector');

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            throw new Error(`Cloudinary upload failed: ${response.status}`);
        }

        const result = await response.json();

        return {
            storage: 'cloudinary',
            cloudinaryId: result.public_id,
            url: result.secure_url,
            thumbnail: result.secure_url.replace('/upload/', '/upload/w_400,h_400,c_fill/'),
            caption: caption || '',
            timestamp: new Date().toISOString(),
            needsSync: true  // Will sync to Immich later
        };

    } catch (error) {
        console.error('Cloudinary upload failed:', error);
        throw error;
    }
}

// ============================================
// STORAGE - HYBRID LOGIC
// ============================================

async function uploadPhoto(photoBlob, caption) {
    showLoading('Uploading to Immich...');

    try {
        // TRY IMMICH FIRST (PRIMARY)
        const result = await uploadToImmich(photoBlob, caption);
        hideLoading();
        showNotification('✅ Uploaded to Immich', 'success');
        return result;

    } catch (immichError) {
        console.log('Immich unavailable, trying Cloudinary backup...');
        
        try {
            // FALLBACK TO CLOUDINARY
            updateLoadingText('Immich offline, using Cloudinary backup...');
            const result = await uploadToCloudinary(photoBlob, caption);
            hideLoading();
            showNotification('✅ Uploaded to Cloudinary (will sync to Immich later)', 'warning');
            return result;

        } catch (cloudinaryError) {
            // BOTH FAILED - Store locally
            hideLoading();
            showNotification('⚠️ Both storage systems offline. Photo saved locally.', 'error');
            
            return {
                storage: 'local',
                localBlob: await blobToBase64(photoBlob),
                caption: caption || '',
                timestamp: new Date().toISOString(),
                needsSync: true
            };
        }
    }
}

// ============================================
// PHOTO MANAGEMENT
// ============================================

async function handlePhotoCapture(file) {
    if (!currentInspection) return;

    const photoId = `photo_${Date.now()}`;
    
    try {
        const result = await uploadPhoto(file, '');
        
        const photo = {
            id: photoId,
            ...result
        };

        currentInspection.photos.push(photo);
        saveInspections();
        renderPhotos();

    } catch (error) {
        console.error('Photo capture error:', error);
        showNotification('❌ Failed to save photo', 'error');
    }
}

function renderPhotos() {
    if (!currentInspection) return;

    const grid = document.getElementById('photoGrid');
    const count = document.getElementById('photoCount');
    
    count.textContent = currentInspection.photos.length;

    if (currentInspection.photos.length === 0) {
        grid.innerHTML = '<p class="empty-state">No photos yet. Add your first photo!</p>';
        return;
    }

    grid.innerHTML = currentInspection.photos.map(photo => {
        const thumbnailUrl = photo.storage === 'local' 
            ? photo.localBlob 
            : (photo.thumbnail || photo.url);

        const storageIcon = {
            'immich': '🏠',
            'cloudinary': '☁️',
            'local': '📱'
        }[photo.storage];

        return `
            <div class="photo-card" onclick="viewPhoto('${photo.id}')">
                <img src="${thumbnailUrl}" alt="Photo" loading="lazy">
                <div class="photo-overlay">
                    <span class="storage-badge">${storageIcon}</span>
                    ${photo.needsSync ? '<span class="sync-badge">⏳</span>' : ''}
                </div>
                ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
            </div>
        `;
    }).join('');
}

function viewPhoto(photoId) {
    currentPhotoId = photoId;
    const photo = currentInspection.photos.find(p => p.id === photoId);
    if (!photo) return;

    const modal = document.getElementById('photoViewerModal');
    const img = document.getElementById('viewerImage');
    const captionInput = document.getElementById('photoCaptionInput');

    const fullUrl = photo.storage === 'local' 
        ? photo.localBlob 
        : (photo.fullUrl || photo.url);

    img.src = fullUrl;
    captionInput.value = photo.caption || '';
    
    modal.classList.remove('hidden');
}

function closePhotoViewer() {
    document.getElementById('photoViewerModal').classList.add('hidden');
    currentPhotoId = null;
}

function saveCaption() {
    if (!currentPhotoId || !currentInspection) return;

    const photo = currentInspection.photos.find(p => p.id === currentPhotoId);
    if (!photo) return;

    const caption = document.getElementById('photoCaptionInput').value.trim();
    photo.caption = caption;
    
    saveInspections();
    renderPhotos();
    showNotification('✅ Caption saved', 'success');
}

function deleteCurrentPhoto() {
    if (!currentPhotoId || !currentInspection) return;

    if (!confirm('Delete this photo?')) return;

    currentInspection.photos = currentInspection.photos.filter(p => p.id !== currentPhotoId);
    saveInspections();
    renderPhotos();
    closePhotoViewer();
    showNotification('🗑️ Photo deleted', 'success');
}

// ============================================
// INSPECTION MANAGEMENT
// ============================================

function renderInspections() {
    const list = document.getElementById('inspectionsList');
    
    if (inspections.length === 0) {
        list.innerHTML = '<p class="empty-state">No inspections yet. Create your first one!</p>';
        return;
    }

    const sorted = [...inspections].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    );

    list.innerHTML = sorted.map(inspection => `
        <div class="inspection-card" onclick="viewInspection('${inspection.id}')">
            <div class="inspection-header">
                <h3>${inspection.location}</h3>
                <span class="photo-count">📷 ${inspection.photos.length}</span>
            </div>
            ${inspection.workOrder ? `<div class="work-order-badge">WO #${inspection.workOrder}</div>` : ''}
            <div class="inspection-date">${formatDate(inspection.date)}</div>
        </div>
    `).join('');
}

function showNewInspectionScreen() {
    document.getElementById('inspectionsScreen').classList.add('hidden');
    document.getElementById('newInspectionScreen').classList.remove('hidden');
}

function createInspection() {
    const location = document.getElementById('locationInput').value.trim();
    const workOrder = document.getElementById('workOrderInput').value.trim();
    const notes = document.getElementById('inspectionNotes').value.trim();

    if (!location) {
        showNotification('⚠️ Location name required', 'error');
        return;
    }

    const inspection = {
        id: `inspection_${Date.now()}`,
        location: location,
        workOrder: workOrder,
        notes: notes,
        date: new Date().toISOString(),
        photos: []
    };

    inspections.push(inspection);
    saveInspections();
    
    // Clear form
    document.getElementById('locationInput').value = '';
    document.getElementById('workOrderInput').value = '';
    document.getElementById('inspectionNotes').value = '';

    // View the new inspection
    viewInspection(inspection.id);
}

function viewInspection(inspectionId) {
    currentInspection = inspections.find(i => i.id === inspectionId);
    if (!currentInspection) return;

    document.getElementById('inspectionsScreen').classList.add('hidden');
    document.getElementById('newInspectionScreen').classList.add('hidden');
    document.getElementById('inspectionDetailScreen').classList.remove('hidden');

    // Update header
    document.getElementById('detailLocation').textContent = currentInspection.location;
    document.getElementById('detailDate').textContent = formatDate(currentInspection.date);
    
    const workOrderBadge = document.getElementById('detailWorkOrder');
    if (currentInspection.workOrder) {
        workOrderBadge.textContent = `WO #${currentInspection.workOrder}`;
        workOrderBadge.style.display = 'inline-block';
    } else {
        workOrderBadge.style.display = 'none';
    }

    renderPhotos();
}

function deleteInspection() {
    if (!currentInspection) return;

    if (!confirm(`Delete inspection for ${currentInspection.location}? This cannot be undone.`)) return;

    inspections = inspections.filter(i => i.id !== currentInspection.id);
    saveInspections();
    currentInspection = null;
    backToMain();
    showNotification('🗑️ Inspection deleted', 'success');
}

function backToMain() {
    document.getElementById('inspectionsScreen').classList.remove('hidden');
    document.getElementById('newInspectionScreen').classList.add('hidden');
    document.getElementById('inspectionDetailScreen').classList.add('hidden');
    currentInspection = null;
    renderInspections();
}

// ============================================
// SYNC MANAGEMENT
// ============================================

async function syncToImmich() {
    const photosToSync = [];
    
    inspections.forEach(inspection => {
        inspection.photos.forEach(photo => {
            if (photo.needsSync && (photo.storage === 'cloudinary' || photo.storage === 'local')) {
                photosToSync.push({ inspection, photo });
            }
        });
    });

    if (photosToSync.length === 0) {
        showNotification('✅ All photos synced!', 'success');
        return;
    }

    showLoading(`Syncing ${photosToSync.length} photos to Immich...`);

    let synced = 0;
    for (const { inspection, photo } of photosToSync) {
        try {
            // Download from Cloudinary or get local blob
            let blob;
            if (photo.storage === 'cloudinary') {
                const response = await fetch(photo.url);
                blob = await response.blob();
            } else {
                blob = await base64ToBlob(photo.localBlob);
            }

            // Upload to Immich
            const result = await uploadToImmich(blob, photo.caption);
            
            // Update photo record
            Object.assign(photo, result);
            photo.needsSync = false;
            
            synced++;
            updateLoadingText(`Synced ${synced}/${photosToSync.length} photos...`);
            
        } catch (error) {
            console.error('Sync failed for photo:', error);
        }
    }

    saveInspections();
    renderPhotos();
    hideLoading();
    
    if (synced === photosToSync.length) {
        showNotification(`✅ Synced ${synced} photos to Immich!`, 'success');
    } else {
        showNotification(`⚠️ Synced ${synced}/${photosToSync.length} photos`, 'warning');
    }
}

// ============================================
// STORAGE STATUS
// ============================================

async function checkStorageStatus() {
    // Check Immich
    try {
        const response = await fetch(`${CONFIG.immich.url}/api/server-info/ping`, {
            headers: { 'x-api-key': CONFIG.immich.apiKey }
        });
        
        const immichStatus = document.getElementById('immichStatus');
        const immichText = document.getElementById('immichStatusText');
        
        if (response.ok) {
            immichStatus.className = 'status-dot status-online';
            immichText.textContent = 'Connected';
        } else {
            immichStatus.className = 'status-dot status-offline';
            immichText.textContent = 'Offline';
        }
    } catch (error) {
        const immichStatus = document.getElementById('immichStatus');
        const immichText = document.getElementById('immichStatusText');
        immichStatus.className = 'status-dot status-offline';
        immichText.textContent = 'Offline';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // New inspection
    document.getElementById('newInspectionBtn').addEventListener('click', showNewInspectionScreen);
    document.getElementById('createInspectionBtn').addEventListener('click', createInspection);

    // Photo capture
    document.getElementById('takePhotoBtn').addEventListener('click', () => {
        document.getElementById('photoFileInput').click();
    });

    document.getElementById('uploadPhotoBtn').addEventListener('click', () => {
        document.getElementById('uploadFileInput').click();
    });

    document.getElementById('photoFileInput').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            handlePhotoCapture(e.target.files[0]);
            e.target.value = '';
        }
    });

    document.getElementById('uploadFileInput').addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            for (const file of e.target.files) {
                await handlePhotoCapture(file);
            }
            e.target.value = '';
        }
    });

    // Photo viewer
    document.getElementById('saveCaptionBtn').addEventListener('click', saveCaption);
    document.getElementById('deletePhotoBtn').addEventListener('click', deleteCurrentPhoto);

    // Inspection actions
    document.getElementById('deleteInspectionBtn').addEventListener('click', deleteInspection);
    document.getElementById('generateReportBtn').addEventListener('click', generateReport);

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    document.getElementById('manualSyncBtn').addEventListener('click', syncToImmich);
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });
    document.getElementById('importFileInput').addEventListener('change', importData);

    // Search
    document.getElementById('searchBox').addEventListener('input', (e) => {
        filterInspections(e.target.value);
    });
}

// ============================================
// SETTINGS
// ============================================

function showSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
    checkStorageStatus();
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// ============================================
// DATA EXPORT/IMPORT
// ============================================

function exportData() {
    const dataStr = JSON.stringify(inspections, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `site-inspector-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('💾 Data exported', 'success');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (confirm(`Import ${imported.length} inspections? This will merge with existing data.`)) {
                inspections = [...inspections, ...imported];
                saveInspections();
                renderInspections();
                showNotification('✅ Data imported', 'success');
            }
        } catch (error) {
            showNotification('❌ Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport() {
    if (!currentInspection) return;
    
    showNotification('📄 Report generation coming in Phase 3!', 'info');
    // TODO: Implement PDF/email report generation
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading(text) {
    const indicator = document.getElementById('loadingIndicator');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    indicator.classList.remove('hidden');
}

function updateLoadingText(text) {
    document.getElementById('loadingText').textContent = text;
}

function hideLoading() {
    document.getElementById('loadingIndicator').classList.add('hidden');
}

function showNotification(message, type = 'info') {
    // Simple notification - can enhance later
    alert(message);
}

function filterInspections(query) {
    if (!query) {
        renderInspections();
        return;
    }

    const filtered = inspections.filter(i => 
        i.location.toLowerCase().includes(query.toLowerCase()) ||
        (i.workOrder && i.workOrder.toLowerCase().includes(query.toLowerCase()))
    );

    const list = document.getElementById('inspectionsList');
    list.innerHTML = filtered.map(inspection => `
        <div class="inspection-card" onclick="viewInspection('${inspection.id}')">
            <div class="inspection-header">
                <h3>${inspection.location}</h3>
                <span class="photo-count">📷 ${inspection.photos.length}</span>
            </div>
            ${inspection.workOrder ? `<div class="work-order-badge">WO #${inspection.workOrder}</div>` : ''}
            <div class="inspection-date">${formatDate(inspection.date)}</div>
        </div>
    `).join('');
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function base64ToBlob(base64) {
    const response = await fetch(base64);
    return response.blob();
}
